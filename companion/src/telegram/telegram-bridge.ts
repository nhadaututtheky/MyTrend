// Core Telegram Bridge - polling loop, chat-session mapping, CLI response routing

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TelegramConfig,
  TelegramSessionMapping,
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramInlineKeyboardMarkup,
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
  formatResult,
  formatConnected,
  formatStatus,
  buildModelKeyboard,
  buildStopConfirmKeyboard,
  buildPermissionKeyboard,
  buildSessionActionsKeyboard,
  formatPermissionRequest,
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

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: true };

    try {
      // Verify token + get bot info
      const me = await this.api.getMe();
      this.botName = me.first_name;
      this.botUsername = me.username ?? null;
      console.log(`[telegram] Bot: @${me.username} (${me.first_name})`);

      // Remove any existing webhook so we can poll
      await this.api.deleteWebhook();
      console.log("[telegram] Webhook deleted, starting long polling...");

      // Register bot menu commands
      await this.registerCommands();

      // Load persisted mappings
      this.loadMappings();

      this.running = true;
      this.pollingLoop();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[telegram] Failed to start: ${msg}`);
      return { ok: false, error: msg };
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
        if (msg.includes("aborted") || msg.includes("closed unexpectedly")) {
          // Normal: abort on stop, or socket timeout between long polls
          continue;
        }
        console.error(`[telegram] Polling error: ${msg}`);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  // ── Update processing ─────────────────────────────────────────────────

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat.id;

    // Security: whitelist is always populated (startup enforces this)
    if (!this.config.allowedChatIds.has(chatId)) {
      console.log(`[telegram] Rejected message from unauthorized chat: ${chatId} (type=${msg.chat.type}, from=${msg.from?.username ?? msg.from?.first_name ?? "?"})`);
      return;
    }

    // In groups: allow commands, @mentions, AND any message when there's an active session
    if (msg.chat.type !== "private") {
      const text = msg.text ?? "";
      const isCommand = text.startsWith("/");
      const isMention = this.botUsername && text.includes(`@${this.botUsername}`);
      const hasActiveSession = this.chatSessions.has(chatId);
      if (!isCommand && !isMention && !hasActiveSession) return;
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

    // Acknowledge receipt with reaction
    this.api.react(chatId, msg.message_id, "👀").catch(() => {});

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

        // Only show text responses — skip tool actions (no spam)
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
        await this.sendToChat(chatId, "Session ended.");
        const disconnectedMapping = this.chatSessions.get(chatId);
        if (disconnectedMapping) {
          this.deps.bridge.unsubscribe(disconnectedMapping.sessionId, `telegram:${chatId}`);
        }
        this.chatSessions.delete(chatId);
        this.clearIdleTimer(chatId);
        this.saveMappings();
        break;
      }

      case "permission_request": {
        const perm = msg.request;
        const text = formatPermissionRequest(perm);
        const keyboard = buildPermissionKeyboard(perm.request_id);
        await this.sendToChatWithKeyboard(chatId, text, keyboard);
        break;
      }

      default:
        // Silently ignore: stream_event, cli_connected, session_init,
        // user_message, message_history, permission_cancelled, etc.
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

  // ── Callback query handling ──────────────────────────────────────────

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data;
    if (!chatId || !data) {
      await this.api.answerCallbackQuery(query.id);
      return;
    }

    // Security: whitelist check
    if (!this.config.allowedChatIds.has(chatId)) {
      await this.api.answerCallbackQuery(query.id, "Unauthorized");
      return;
    }

    const [prefix, ...rest] = data.split(":");
    const value = rest.join(":");

    try {
      switch (prefix) {
        case "proj":
          await this.onProjectSelected(chatId, messageId!, query.id, value);
          break;
        case "model":
          await this.onModelSelected(chatId, messageId!, query.id, value);
          break;
        case "mode":
          await this.onModeSelected(chatId, messageId!, query.id, value);
          break;
        case "perm":
          await this.onPermissionResponse(chatId, messageId!, query.id, value);
          break;
        case "stop":
          await this.onStopResponse(chatId, messageId!, query.id, value);
          break;
        case "new":
          await this.onNewResponse(chatId, messageId!, query.id, value);
          break;
        case "action":
          await this.onActionSelected(chatId, messageId!, query.id, value);
          break;
        default:
          await this.api.answerCallbackQuery(query.id, "Unknown action");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Error";
      console.error(`[telegram] Callback error (${data}):`, errMsg);
      await this.api.answerCallbackQuery(query.id, "Error occurred").catch(() => {});
    }
  }

  private async onProjectSelected(
    chatId: number, messageId: number, queryId: string, slug: string
  ): Promise<void> {
    // Check if already connected
    const existing = this.chatSessions.get(chatId);
    if (existing) {
      await this.api.answerCallbackQuery(queryId, `Already connected to ${existing.projectSlug}`);
      return;
    }

    const profile = this.deps.profiles.get(slug);
    if (!profile) {
      await this.api.answerCallbackQuery(queryId, "Project not found");
      return;
    }

    // Remove keyboard from original message
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
    await this.api.answerCallbackQuery(queryId, `Connecting to ${profile.name}...`);

    await this.sendToChat(chatId, `Connecting to ${profile.name}...`);
    const result = await this.createSession(chatId, profile);

    if (!result.ok) {
      await this.sendToChat(chatId, `Failed to connect: ${result.error}`);
      return;
    }

    const mapping = this.chatSessions.get(chatId);
    await this.sendToChatWithKeyboard(
      chatId,
      formatConnected(profile, profile.defaultModel),
      buildSessionActionsKeyboard(mapping?.model ?? profile.defaultModel)
    );
  }

  private async onModelSelected(
    chatId: number, messageId: number, queryId: string, model: string
  ): Promise<void> {
    const mapping = this.chatSessions.get(chatId);
    if (!mapping) {
      await this.api.answerCallbackQuery(queryId, "No active session");
      return;
    }

    this.setModel(chatId, model);
    await this.api.answerCallbackQuery(queryId, `Model → ${model}`);

    // Update keyboard to reflect new selection
    await this.api.editMessageReplyMarkup(chatId, messageId, buildModelKeyboard(model)).catch(() => {});
  }

  private async onModeSelected(
    chatId: number, messageId: number, queryId: string, mode: string
  ): Promise<void> {
    // Mode changes not supported at runtime via CLI, just acknowledge
    await this.api.answerCallbackQuery(queryId, `Mode: ${mode} (applies to next session)`);
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
  }

  private async onPermissionResponse(
    chatId: number, messageId: number, queryId: string, value: string
  ): Promise<void> {
    // value format: "allow:<requestId>" or "deny:<requestId>"
    const [behavior, ...idParts] = value.split(":");
    const requestId = idParts.join(":");

    if (behavior !== "allow" && behavior !== "deny") {
      await this.api.answerCallbackQuery(queryId, "Invalid response");
      return;
    }

    const mapping = this.chatSessions.get(chatId);
    if (!mapping) {
      await this.api.answerCallbackQuery(queryId, "No active session");
      return;
    }

    // Send permission response to CLI
    this.deps.bridge.injectPermissionResponse(mapping.sessionId, {
      request_id: requestId,
      behavior,
    });

    const emoji = behavior === "allow" ? "✅" : "❌";
    await this.api.answerCallbackQuery(queryId, `${emoji} ${behavior === "allow" ? "Allowed" : "Denied"}`);

    // Remove the keyboard
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
  }

  private async onStopResponse(
    chatId: number, messageId: number, queryId: string, value: string
  ): Promise<void> {
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});

    if (value === "confirm") {
      const mapping = this.chatSessions.get(chatId);
      if (mapping) {
        await this.destroySession(chatId);
        await this.api.answerCallbackQuery(queryId, "Session stopped");
        await this.sendToChat(chatId, `Session stopped. (<code>${mapping.projectSlug}</code>)`);
      } else {
        await this.api.answerCallbackQuery(queryId, "No active session");
      }
    } else {
      await this.api.answerCallbackQuery(queryId, "Cancelled");
    }
  }

  private async onNewResponse(
    chatId: number, messageId: number, queryId: string, value: string
  ): Promise<void> {
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});

    if (value === "confirm") {
      const mapping = this.chatSessions.get(chatId);
      if (!mapping) {
        await this.api.answerCallbackQuery(queryId, "No active session");
        return;
      }

      const slug = mapping.projectSlug;
      const profile = this.deps.profiles.get(slug);
      if (!profile) {
        await this.api.answerCallbackQuery(queryId, "Project not found");
        return;
      }

      await this.api.answerCallbackQuery(queryId, "Restarting...");
      await this.destroySession(chatId);
      await this.sendToChat(chatId, "Restarting session...");

      const result = await this.createSession(chatId, profile);
      if (!result.ok) {
        await this.sendToChat(chatId, `Failed: ${result.error}`);
        return;
      }
      await this.sendToChatWithKeyboard(
        chatId,
        formatConnected(profile, profile.defaultModel),
        buildSessionActionsKeyboard(mapping.model)
      );
    } else {
      await this.api.answerCallbackQuery(queryId, "Cancelled");
    }
  }

  private async onActionSelected(
    chatId: number, _messageId: number, queryId: string, action: string
  ): Promise<void> {
    switch (action) {
      case "model": {
        const mapping = this.chatSessions.get(chatId);
        await this.api.answerCallbackQuery(queryId);
        await this.sendToChatWithKeyboard(
          chatId,
          "Select model:",
          buildModelKeyboard(mapping?.model)
        );
        break;
      }
      case "status": {
        await this.api.answerCallbackQuery(queryId);
        const mapping = this.chatSessions.get(chatId);
        if (mapping) {
          const session = this.getSessionState(mapping.sessionId);
          const status = session?.status ?? "unknown";
          const lines = [formatStatus(mapping, status)];
          if (session) {
            lines.push(`Cost: <code>$${session.total_cost_usd.toFixed(3)}</code> | Turns: <code>${session.num_turns}</code>`);
          }
          await this.sendToChat(chatId, lines.join("\n"));
        }
        break;
      }
      case "cancel": {
        this.interruptSession(chatId);
        await this.api.answerCallbackQuery(queryId, "Interrupt sent");
        break;
      }
      case "stop": {
        await this.api.answerCallbackQuery(queryId);
        await this.sendToChatWithKeyboard(
          chatId,
          "Stop the current session?",
          buildStopConfirmKeyboard()
        );
        break;
      }
      default:
        await this.api.answerCallbackQuery(queryId, "Unknown action");
    }
  }

  // ── Bot menu commands ──────────────────────────────────────────────────

  private async registerCommands(): Promise<void> {
    try {
      await this.api.setMyCommands([
        { command: "start", description: "Start bot & show projects" },
        { command: "projects", description: "List available projects" },
        { command: "status", description: "Current session info" },
        { command: "model", description: "Switch model (sonnet/opus/haiku)" },
        { command: "cancel", description: "Interrupt Claude" },
        { command: "stop", description: "Kill current session" },
        { command: "new", description: "Restart session (same project)" },
        { command: "help", description: "Show all commands" },
      ]);
      console.log("[telegram] Bot menu commands registered");
    } catch (err) {
      console.warn("[telegram] Failed to register commands:", err);
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

  async sendToChatWithKeyboard(
    chatId: number,
    text: string,
    keyboard: TelegramInlineKeyboardMarkup
  ): Promise<void> {
    try {
      await this.api.sendMessage(chatId, text, { replyMarkup: keyboard });
    } catch (err) {
      console.error(`[telegram] sendToChatWithKeyboard(${chatId}) error:`, err);
      // Retry without keyboard as fallback
      await this.sendToChat(chatId, text);
    }
  }

  getAPI(): TelegramAPI {
    return this.api;
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
