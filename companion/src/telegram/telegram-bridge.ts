// Core Telegram Bridge - polling loop, chat-session mapping, CLI response routing

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TelegramConfig,
  TelegramSessionMapping,
  TelegramUpdate,
  TelegramMessage,
} from "./telegram-types.js";
import type {
  BrowserIncomingMessage,
  CLIResultMessage,
  ProjectProfile,
  SessionState,
} from "../session-types.js";
import type { WsBridge } from "../ws-bridge.js";
import type { CLILauncher } from "../cli-launcher.js";
import type { SessionStore } from "../session-store.js";
import type { ProjectProfileStore } from "../project-profiles.js";
import { TelegramAPI } from "./telegram-api.js";
import { dispatchCommand } from "./telegram-commands.js";
import {
  toTelegramHTML,
  extractText,
  extractToolActions,
  formatResult,
} from "./telegram-formatter.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30min
const TYPING_INTERVAL_MS = 4_000;
const POLLING_TIMEOUT = 30; // seconds
const DATA_DIR = join(import.meta.dir, "..", "..", "data");
const MAPPINGS_FILE = join(DATA_DIR, "telegram-sessions.json");

interface BridgeDeps {
  bridge: WsBridge;
  launcher: CLILauncher;
  store: SessionStore;
  profiles: ProjectProfileStore;
}

export class TelegramBridge {
  private api: TelegramAPI;
  private config: TelegramConfig;
  private deps: BridgeDeps;

  private chatSessions = new Map<number, TelegramSessionMapping>();
  private pendingCreations = new Set<number>();
  private typingIntervals = new Map<number, ReturnType<typeof setInterval>>();
  private idleTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private pollingAbort: AbortController | null = null;
  private running = false;
  private offset = 0;
  private botName: string | null = null;
  private botUsername: string | null = null;

  constructor(config: TelegramConfig, deps: BridgeDeps) {
    this.config = config;
    this.deps = deps;
    this.api = new TelegramAPI(config);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;

    try {
      // Verify token + get bot info
      const me = await this.api.getMe();
      this.botName = me.first_name;
      this.botUsername = me.username ?? null;
      console.log(`[telegram] Bot: @${me.username} (${me.first_name})`);

      // Remove any existing webhook so we can poll
      await this.api.deleteWebhook();
      console.log("[telegram] Webhook deleted, starting long polling...");

      // Load persisted mappings
      this.loadMappings();

      this.running = true;
      this.pollingLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[telegram] Failed to start: ${msg}`);
    }
  }

  stop(): void {
    this.running = false;
    this.pollingAbort?.abort();

    // Clear all typing indicators
    for (const [chatId] of this.typingIntervals) {
      this.stopTyping(chatId);
    }

    // Clear idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }

    this.saveMappings();
    console.log("[telegram] Bridge stopped");
  }

  // ── Polling loop ────────────────────────────────────────────────────────

  private async pollingLoop(): Promise<void> {
    while (this.running) {
      try {
        this.pollingAbort = new AbortController();
        const updates = await this.api.getUpdates(
          this.offset,
          POLLING_TIMEOUT,
          this.pollingAbort.signal
        );

        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.processUpdate(update).catch((err) => {
            console.error("[telegram] Update processing error:", err);
          });
        }
      } catch (err) {
        if (!this.running) break;
        const msg = err instanceof Error ? err.message : "Unknown";
        if (!msg.includes("aborted")) {
          console.error(`[telegram] Polling error: ${msg}`);
          // Back off on error
          await new Promise((r) => setTimeout(r, 5_000));
        }
      }
    }
  }

  // ── Update processing ─────────────────────────────────────────────────

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat.id;

    // Security: whitelist is always populated (startup enforces this)
    if (!this.config.allowedChatIds.has(chatId)) {
      console.log(`[telegram] Rejected message from unauthorized chat: ${chatId}`);
      return;
    }

    // In groups, only respond to commands and @mentions
    if (msg.chat.type !== "private") {
      const text = msg.text ?? "";
      const isCommand = text.startsWith("/");
      const isMention = this.botUsername && text.includes(`@${this.botUsername}`);
      if (!isCommand && !isMention) return;
    }

    // Check for commands
    if (msg.text?.startsWith("/")) {
      const [cmdRaw, ...argParts] = msg.text.split(" ");
      // Strip @botname from command (e.g. /project@mybot → project)
      const command = cmdRaw.slice(1).split("@")[0].toLowerCase();
      const args = argParts.join(" ");

      const handled = await dispatchCommand(this, msg, command, args);

      // Also allow /slug as shorthand for /project slug
      if (!handled) {
        const profile = this.deps.profiles.get(command);
        if (profile) {
          await dispatchCommand(this, msg, "project", command);
          return;
        }
      }
      return;
    }

    // Text message → send to Claude
    await this.handleTextMessage(msg);
  }

  private async handleTextMessage(msg: TelegramMessage): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    const mapping = this.chatSessions.get(chatId);
    if (!mapping) {
      await this.sendToChat(chatId, "No active session. Use <code>/project &lt;slug&gt;</code> to connect.");
      return;
    }

    // Strip @botname from message in groups
    let cleanText = text;
    if (this.botUsername) {
      cleanText = cleanText.replace(new RegExp(`@${this.botUsername}\\s*`, "gi"), "").trim();
    }
    if (!cleanText) return;

    // Reset idle timer
    this.resetIdleTimer(chatId);

    // Start typing indicator
    this.startTyping(chatId);

    // Inject message to CLI
    this.deps.bridge.injectUserMessage(mapping.sessionId, cleanText);

    // Update activity
    mapping.lastActivityAt = Date.now();
    this.saveMappings();
  }

  // ── Session management ────────────────────────────────────────────────

  async createSession(
    chatId: number,
    profile: ProjectProfile
  ): Promise<{ ok: boolean; error?: string }> {
    // Prevent concurrent creation for same chat
    if (this.pendingCreations.has(chatId)) {
      return { ok: false, error: "Session creation already in progress" };
    }
    this.pendingCreations.add(chatId);

    try {
      return await this.doCreateSession(chatId, profile);
    } finally {
      this.pendingCreations.delete(chatId);
    }
  }

  private async doCreateSession(
    chatId: number,
    profile: ProjectProfile
  ): Promise<{ ok: boolean; error?: string }> {
    const sessionId = crypto.randomUUID();
    const model = profile.defaultModel ?? "sonnet";

    // Ensure session in bridge
    const session = this.deps.bridge.ensureSession(sessionId);
    session.state.cwd = profile.dir;
    session.state.model = model;

    // Persist initial state
    this.deps.store.saveSync({
      id: sessionId,
      projectSlug: profile.slug,
      state: session.state,
      messageHistory: [],
      pendingPermissions: [],
      startedAt: Date.now(),
    });

    // Launch CLI
    const result = await this.deps.launcher.launch(sessionId, {
      projectDir: profile.dir,
      model,
      permissionMode: profile.permissionMode ?? "bypassPermissions",
    });

    if (!result.ok) {
      this.deps.store.remove(sessionId);
      return { ok: false, error: result.error };
    }

    // Create mapping
    const mapping: TelegramSessionMapping = {
      chatId,
      sessionId,
      projectSlug: profile.slug,
      model,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.chatSessions.set(chatId, mapping);

    // Subscribe to CLI messages
    this.subscribeToSession(chatId, sessionId);

    // Start idle timer
    this.resetIdleTimer(chatId);

    this.saveMappings();
    return { ok: true };
  }

  async destroySession(chatId: number): Promise<void> {
    const mapping = this.chatSessions.get(chatId);
    if (!mapping) return;

    // Unsubscribe
    this.deps.bridge.unsubscribe(mapping.sessionId, `telegram:${chatId}`);

    // Kill CLI
    await this.deps.launcher.kill(mapping.sessionId);

    // Clean up
    this.chatSessions.delete(chatId);
    this.stopTyping(chatId);
    this.clearIdleTimer(chatId);
    this.saveMappings();
  }

  private subscribeToSession(chatId: number, sessionId: string): void {
    const subscriberId = `telegram:${chatId}`;

    this.deps.bridge.subscribe(sessionId, subscriberId, (msg: BrowserIncomingMessage) => {
      this.handleCLIResponse(chatId, msg).catch((err) => {
        console.error(`[telegram] CLI response handler error (chat=${chatId}):`, err);
      });
    });
  }

  // ── CLI response handling ─────────────────────────────────────────────

  private async handleCLIResponse(chatId: number, msg: BrowserIncomingMessage): Promise<void> {
    switch (msg.type) {
      case "assistant": {
        const content = msg.message.content;
        if (!Array.isArray(content)) break;

        // Show tool actions as short status lines
        const toolActions = extractToolActions(content);
        for (const action of toolActions) {
          await this.sendToChat(chatId, action);
        }

        // Show text content
        const text = extractText(content);
        if (text) {
          const html = toTelegramHTML(text);
          await this.api.sendLongMessage(chatId, html);
          this.stopTyping(chatId);
        }
        break;
      }

      case "result": {
        this.stopTyping(chatId);
        const resultMsg = msg.data as CLIResultMessage;
        await this.sendToChat(chatId, formatResult(resultMsg));
        break;
      }

      case "tool_progress": {
        // Refresh typing indicator - Claude is working
        this.startTyping(chatId);
        break;
      }

      case "status_change": {
        if (msg.status === "idle") {
          this.stopTyping(chatId);
        }
        break;
      }

      case "cli_disconnected": {
        this.stopTyping(chatId);
        await this.sendToChat(chatId, "Claude CLI disconnected.");
        const disconnectedMapping = this.chatSessions.get(chatId);
        if (disconnectedMapping) {
          this.deps.bridge.unsubscribe(disconnectedMapping.sessionId, `telegram:${chatId}`);
        }
        this.chatSessions.delete(chatId);
        this.clearIdleTimer(chatId);
        this.saveMappings();
        break;
      }

      case "stream_event":
      case "cli_connected":
      case "session_init":
      case "user_message":
      case "message_history":
      case "permission_request":
      case "permission_cancelled":
        // Silently ignore these for Telegram
        break;
    }
  }

  // ── Typing indicator ──────────────────────────────────────────────────

  private startTyping(chatId: number): void {
    // Already typing? Don't restart
    if (this.typingIntervals.has(chatId)) return;

    // Send immediately
    this.api.sendChatAction(chatId, "typing").catch(() => {});

    // Refresh every 4 seconds (Telegram typing expires after ~5s)
    const interval = setInterval(() => {
      this.api.sendChatAction(chatId, "typing").catch(() => {});
    }, TYPING_INTERVAL_MS);
    this.typingIntervals.set(chatId, interval);
  }

  private stopTyping(chatId: number): void {
    const interval = this.typingIntervals.get(chatId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(chatId);
    }
  }

  // ── Idle timeout ──────────────────────────────────────────────────────

  private resetIdleTimer(chatId: number): void {
    this.clearIdleTimer(chatId);
    const timer = setTimeout(() => {
      console.log(`[telegram] Chat ${chatId} idle timeout, destroying session`);
      this.destroySession(chatId).then(() => {
        this.sendToChat(chatId, "Session timed out after 30 minutes of inactivity.").catch(() => {});
      });
    }, IDLE_TIMEOUT_MS);
    this.idleTimers.set(chatId, timer);
  }

  private clearIdleTimer(chatId: number): void {
    const timer = this.idleTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(chatId);
    }
  }

  // ── Public API (for commands) ─────────────────────────────────────────

  async sendToChat(chatId: number, text: string): Promise<void> {
    try {
      await this.api.sendMessage(chatId, text);
    } catch (err) {
      console.error(`[telegram] sendToChat(${chatId}) HTML error:`, err);
      // Retry as plain text (strip HTML tags, no parse_mode)
      try {
        const plain = text.replace(/<[^>]+>/g, "");
        await this.api.sendMessage(chatId, plain, { parseMode: null });
      } catch {
        // give up
      }
    }
  }

  getBotName(): string | null {
    return this.botName;
  }

  getProfiles(): ProjectProfile[] {
    return this.deps.profiles.getAll();
  }

  getMapping(chatId: number): TelegramSessionMapping | undefined {
    return this.chatSessions.get(chatId);
  }

  getSessionState(sessionId: string): SessionState | undefined {
    return this.deps.bridge.getSessionState(sessionId);
  }

  interruptSession(chatId: number): void {
    const mapping = this.chatSessions.get(chatId);
    if (!mapping) return;
    this.deps.bridge.injectInterrupt(mapping.sessionId);
  }

  setModel(chatId: number, model: string): void {
    const mapping = this.chatSessions.get(chatId);
    if (!mapping) return;

    mapping.model = model;
    this.deps.bridge.injectSetModel(mapping.sessionId, model);
    this.saveMappings();
  }

  getActiveChatCount(): number {
    return this.chatSessions.size;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private saveMappings(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const data = [...this.chatSessions.values()];
      writeFileSync(MAPPINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[telegram] Failed to save mappings:", err);
    }
  }

  private loadMappings(): void {
    try {
      const raw = readFileSync(MAPPINGS_FILE, "utf-8");
      const data = JSON.parse(raw) as TelegramSessionMapping[];
      // Only restore mappings where the session is still alive
      for (const m of data) {
        if (this.deps.launcher.isAlive(m.sessionId)) {
          this.chatSessions.set(m.chatId, m);
          this.subscribeToSession(m.chatId, m.sessionId);
          this.resetIdleTimer(m.chatId);
          console.log(`[telegram] Restored mapping: chat=${m.chatId} → session=${m.sessionId.slice(0, 8)}`);
        }
      }
    } catch {
      // No file or parse error - fresh start
    }
  }
}
