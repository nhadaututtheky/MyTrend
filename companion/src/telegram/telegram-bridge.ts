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
  IdleTimeoutConfig,
} from "./telegram-types.js";
import { DEFAULT_IDLE_TIMEOUT_MS } from "./telegram-types.js";
import type {
  AutoApproveConfig,
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
import { isVietnamese, translateText } from "../translate.js";
import {
  detectUrls,
  fetchMetadata,
  analyzeWithClaude,
  checkExistingResearch,
  saveResearchToPB,
  saveToNeuralMemory,
  type DetectedUrl,
  type RawMetadata,
  type AIAnalysis,
  type ResearchRecord,
} from "./telegram-research.js";
import {
  toTelegramHTML,
  extractText,
  escapeHTML,
  formatResult,
  formatConnected,
  formatStatus,
  formatToolFeed,
  formatPinnedStatus,
  buildProjectKeyboard,
  buildModelKeyboard,
  buildStopConfirmKeyboard,
  buildPermissionBatchKeyboard,
  buildSessionActionsKeyboard,
  formatPermissionBatch,
  extractAskUserQuestion,
  formatAskUserQuestion,
  buildAskQuestionKeyboard,
  formatDuration,
} from "./telegram-formatter.js";

const IDLE_TIMEOUT_MS = DEFAULT_IDLE_TIMEOUT_MS; // default, overridden per-session
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

  // Outer key: chatId, inner key: topicId (0 = General/no topic)
  private chatSessions = new Map<number, Map<number, TelegramSessionMapping>>();
  private pendingCreations = new Set<string>(); // composite key "chatId:topicId"
  // Session-specific transient state (keyed by composite "chatId:topicId")
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pollingAbort: AbortController | null = null;
  private running = false;
  private offset = 0;
  private botName: string | null = null;
  private botUsername: string | null = null;
  private botHasTopics = false; // Bot API 9.4: private chat forum topics

  // Per-session transient state (composite key, not persisted)
  private lastUserMsgId = new Map<string, number>();
  // Single editable tool-feed message per turn (replaces spammy new messages)
  private toolFeedMsgId = new Map<string, number>();
  private toolFeedLines = new Map<string, string[]>();
  private costAlertsShown = new Map<string, Set<number>>();
  private streamingMsg = new Map<string, { msgId: number; lastText: string; lastEditAt: number }>();
  private readonly STREAM_EDIT_INTERVAL_MS = 1_500; // min interval between edits

  // Lock origin message ID when response starts (prevents race condition with new user messages)
  private responseOriginMsg = new Map<string, number>();

  // Permission batching: collect permissions in a 2s window, then send as single message
  private permissionBatch = new Map<string, { perms: import("../session-types.js").PermissionRequest[]; timer: ReturnType<typeof setTimeout> }>();
  private readonly PERM_BATCH_WINDOW_MS = 2_000;

  // Permission countdown: live-update message text every 5s until auto-approved
  private permCountdownEdits = new Map<string, ReturnType<typeof setInterval>>();

  // Idle warning timers (warn at 55min before destroying at 60min)
  private idleWarningTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Per-session idle timeout config (keyed by "chatId:topicId")
  private idleTimeoutConfigs = new Map<string, IdleTimeoutConfig>();

  // Per-chat settings (keyed by chatId only — shared across topics)
  private lastProjectSlug = new Map<number, string>();
  private autoApproveConfigs = new Map<number, AutoApproveConfig>();
  private translateEnabled = new Map<number, boolean>(); // auto-translate Vi→En, default ON
  private hubFirstMsg = new Set<number>();

  // Notification group for aggregated events
  private notificationGroupId: number | null = null;

  // Track .md files written by Claude per session-key — auto-send on result
  private pendingMdFiles = new Map<string, Array<{ path: string; content: string }>>();

  // Track Bash tool_use_ids so we can show their tool_result output
  private bashToolIds = new Map<string, Set<string>>();

  constructor(config: TelegramConfig, deps: BridgeDeps) {
    this.config = config;
    this.deps = deps;
    this.api = new TelegramAPI(config);
  }

  // ── Composite key helper ──────────────────────────────────────────────

  private key(chatId: number, topicId: number = 0): string {
    return `${chatId}:${topicId}`;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: true };

    try {
      // Verify token + get bot info
      const me = await this.api.getMe();
      this.botName = me.first_name;
      this.botUsername = me.username ?? null;
      this.botHasTopics = me.has_topics_enabled ?? false;
      console.log(`[telegram] Bot: @${me.username} (${me.first_name}), topics=${this.botHasTopics}`);

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
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();

    // Clear idle timers + warnings
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    for (const timer of this.idleWarningTimers.values()) {
      clearTimeout(timer);
    }
    this.idleWarningTimers.clear();

    // Clear permission countdown edits
    for (const interval of this.permCountdownEdits.values()) {
      clearInterval(interval);
    }
    this.permCountdownEdits.clear();

    this.saveMappings();
    console.log("[telegram] Bridge stopped");
  }

  /** Hot-reload allowed chat IDs without restarting the bridge */
  updateAllowedChatIds(ids: number[]): void {
    this.config.allowedChatIds = new Set(ids);
    console.log(`[telegram] Allowed chat IDs updated: [${ids.join(", ")}]`);
  }

  /** Hot-reload notification group ID without restarting */
  updateNotificationGroupId(id: number | null): void {
    if (id) {
      this.setNotificationGroupId(id);
    }
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

    // channel_post: treat as research-URL-only (no Claude session interaction)
    if (update.channel_post) {
      const cpost = update.channel_post;
      const chatId = cpost.chat.id;
      if (this.config.allowedChatIds.has(chatId) && cpost.text) {
        const detectedUrls = detectUrls(cpost.text);
        if (detectedUrls.length > 0) {
          const userId = process.env.MYTREND_SYNC_USER_ID ?? "";
          this.processResearchUrls(chatId, 0, detectedUrls, cpost.text, cpost.message_id, userId)
            .catch((err) => console.error("[research] Channel post processing error:", err));
        }
      }
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

    // In groups: capture research URLs from any message before session filter
    if (msg.chat.type !== "private" && msg.text) {
      const detectedUrls = detectUrls(msg.text);
      if (detectedUrls.length > 0) {
        const userId = process.env.MYTREND_SYNC_USER_ID ?? "";
        const topicIdEarly = msg.message_thread_id ?? 0;
        this.processResearchUrls(chatId, topicIdEarly, detectedUrls, msg.text, msg.message_id, userId)
          .catch((err) => console.error("[research] Processing error:", err));
      }
    }

    // In groups: allow commands, @mentions, AND any message when there's an active session
    if (msg.chat.type !== "private") {
      const text = msg.text ?? "";
      const isCommand = text.startsWith("/");
      const isMention = this.botUsername && text.includes(`@${this.botUsername}`);
      const hasActiveSession = this.chatSessions.has(chatId) && (this.chatSessions.get(chatId)?.size ?? 0) > 0;
      if (!isCommand && !isMention && !hasActiveSession) return;
    }

    const topicId = msg.message_thread_id ?? 0;

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

    // Photo message → download and send as multimodal
    if (msg.photo && msg.photo.length > 0) {
      await this.handlePhotoMessage(msg, topicId);
      return;
    }

    // Text message → send to Claude
    await this.handleTextMessage(msg, topicId);
  }

  /** Auto-connect to Hub if no active session. Returns the mapping or undefined. */
  private async autoConnectHub(chatId: number): Promise<TelegramSessionMapping | undefined> {
    const hubProfile = this.deps.profiles.get("hub");
    if (!hubProfile) return undefined;

    await this.sendToChat(chatId, "🏠 Auto-connecting to <b>HQ</b>...");
    const result = await this.createSession(chatId, hubProfile, 0); // topicId=0 for hub
    if (!result.ok) {
      await this.sendToChat(chatId, `Failed to auto-connect HQ: ${result.error}`);
      return undefined;
    }

    const mapping = this.chatSessions.get(chatId)?.get(0);
    if (mapping) {
      // Send connected notification with session actions
      const msgId = await this.api.sendMessage(
        chatId,
        formatConnected(hubProfile, hubProfile.defaultModel),
        { replyMarkup: buildSessionActionsKeyboard(mapping.model ?? hubProfile.defaultModel) }
      );
      mapping.pinnedMessageId = msgId;
      await this.api.pinChatMessage(chatId, msgId).catch(() => {});
    }
    return mapping;
  }

  private async handleTextMessage(msg: TelegramMessage, topicId: number): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    // Strip @botname from message in groups
    let cleanText = text;
    if (this.botUsername) {
      cleanText = cleanText.replace(new RegExp(`@${this.botUsername}\\s*`, "gi"), "").trim();
    }
    if (!cleanText) return;

    // Research URL detection for private chats (groups handled in processUpdate before session filter)
    if (msg.chat.type === "private") {
      const detectedUrls = detectUrls(cleanText);
      if (detectedUrls.length > 0) {
        const userId = process.env.MYTREND_SYNC_USER_ID ?? "";
        this.processResearchUrls(chatId, topicId, detectedUrls, cleanText, msg.message_id, userId)
          .catch((err) => console.error("[research] Processing error:", err));
      }
    }

    let mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) {
      if (topicId > 0) {
        // Project topic with no active session
        await this.sendToChat(chatId, "No active session in this topic.", topicId);
        return;
      }
      // General topic (topicId=0): try auto-connect Hub or show project selection
      mapping = await this.autoConnectHub(chatId);
      if (!mapping) {
        // Hub not available, fall back to project selection
        const lastSlug = this.lastProjectSlug.get(chatId);
        if (lastSlug) {
          const profile = this.deps.profiles.get(lastSlug);
          if (profile) {
            await this.sendToChatWithKeyboard(
              chatId,
              `No active session. Reconnect to <b>${profile.name}</b>?`,
              { inline_keyboard: [[
                { text: `Connect ${profile.name}`, callback_data: `proj:${lastSlug}`, style: "primary" },
                { text: "Other projects", callback_data: "action:projects" },
              ]] }
            );
            return;
          }
        }
        await this.sendToChat(chatId, "No active session. Use /start to connect.");
        return;
      }
    }

    // Track message ID for reply-to and reaction updates
    this.lastUserMsgId.set(this.key(chatId, topicId), msg.message_id);

    // Acknowledge receipt with reaction
    this.api.react(chatId, msg.message_id, "👀").catch(() => {});

    // Reset idle timer
    this.resetIdleTimer(chatId, topicId);

    // Start typing indicator
    this.startTyping(chatId, topicId);

    // Auto-translate Vietnamese → English before sending to Claude
    // Only translate longer messages (>=30 chars) — short commands like "làm đi bro" Claude understands natively
    if (this.isTranslateEnabled(chatId) && cleanText.length >= 30 && isVietnamese(cleanText)) {
      const { translated, error } = await translateText(cleanText);
      if (translated && !error) {
        // Subtle inline indicator — not a reply (avoids quote block clutter)
        this.api.sendMessage(chatId, `🌐 <i>${translated}</i>`, {
          disablePreview: true,
          messageThreadId: topicId > 0 ? topicId : undefined,
        }).catch(() => {});
        cleanText = translated;
      }
    }

    // Hub mode: enrich message with project context
    if (mapping.projectSlug === "hub") {
      cleanText = this.enrichHubMessage(chatId, cleanText);
    }

    // Inject message to CLI
    this.deps.bridge.injectUserMessage(mapping.sessionId, cleanText);

    // Update activity
    mapping.lastActivityAt = Date.now();
    this.saveMappings();
  }

  private async handlePhotoMessage(msg: TelegramMessage, topicId: number): Promise<void> {
    const chatId = msg.chat.id;
    let mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) {
      if (topicId > 0) {
        await this.sendToChat(chatId, "No active session in this topic.", topicId);
        return;
      }
      mapping = await this.autoConnectHub(chatId);
      if (!mapping) {
        await this.sendToChat(chatId, "No active session. Use /start to connect.");
        return;
      }
    }

    // Get highest resolution photo (last in array)
    const photo = msg.photo![msg.photo!.length - 1];
    const caption = msg.caption ?? "";

    // Acknowledge receipt
    this.lastUserMsgId.set(this.key(chatId, topicId), msg.message_id);
    this.api.react(chatId, msg.message_id, "👀").catch(() => {});
    this.resetIdleTimer(chatId, topicId);
    this.startTyping(chatId, topicId);

    try {
      // Download image from Telegram
      const fileInfo = await this.api.getFile(photo.file_id);
      const buffer = await this.api.downloadFile(fileInfo.file_path);
      const base64 = buffer.toString("base64");

      // Determine media type
      const ext = fileInfo.file_path.split(".").pop()?.toLowerCase() ?? "jpg";
      const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      // Build multimodal content blocks
      const blocks: Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      > = [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      ];

      if (caption.trim()) {
        blocks.push({ type: "text", text: caption.trim() });
      } else {
        blocks.push({ type: "text", text: "What do you see in this image?" });
      }

      this.deps.bridge.injectMultimodalMessage(mapping.sessionId, blocks);
      mapping.lastActivityAt = Date.now();
      this.saveMappings();
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      console.error("[telegram] Photo download error:", error);
      this.stopTyping(chatId, topicId);
      await this.sendToChat(chatId, `Failed to process image: ${error}`, topicId);
    }
  }

  // ── Session management ────────────────────────────────────────────────

  async createSession(
    chatId: number,
    profile: ProjectProfile,
    topicId: number = 0
  ): Promise<{ ok: boolean; error?: string }> {
    const creationKey = this.key(chatId, topicId);
    // Prevent concurrent creation for same chat+topic
    if (this.pendingCreations.has(creationKey)) {
      return { ok: false, error: "Session creation already in progress" };
    }
    this.pendingCreations.add(creationKey);

    try {
      return await this.doCreateSession(chatId, profile, topicId);
    } finally {
      this.pendingCreations.delete(creationKey);
    }
  }

  private async doCreateSession(
    chatId: number,
    profile: ProjectProfile,
    topicId: number
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
      topicId,
      sessionId,
      projectSlug: profile.slug,
      model,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    // Store in nested map: chatId → topicId → mapping
    if (!this.chatSessions.has(chatId)) {
      this.chatSessions.set(chatId, new Map());
    }
    this.chatSessions.get(chatId)!.set(topicId, mapping);

    // Subscribe to CLI messages
    this.subscribeToSession(chatId, topicId, sessionId);

    // Apply auto-approve config if previously set for this chat
    const existingConfig = this.autoApproveConfigs.get(chatId);
    if (existingConfig?.enabled) {
      this.deps.bridge.setAutoApprove(sessionId, existingConfig);
    }

    // Note: pinned status message is created by the caller (onProjectSelected/handleProject)
    // to consolidate into a single message flow.

    // Start idle timer
    this.resetIdleTimer(chatId, topicId);
    const idleConfig = this.getIdleTimeoutConfig(chatId, topicId);
    console.log(`[telegram] Session ${sessionId.slice(0, 8)} idle timeout: ${idleConfig.enabled ? formatDuration(idleConfig.timeoutMs) : "OFF"}`);

    this.saveMappings();

    // Notify group of session start
    await this.notifyGroup(profile.slug, "Session started", `Model: ${model}`, chatId);

    return { ok: true };
  }

  async destroySession(chatId: number, topicId: number = 0): Promise<void> {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) return;

    // Sync conversation to PocketBase before cleanup
    this.syncConversationToPB(mapping);

    // Remember last project for quick reconnect
    this.lastProjectSlug.set(chatId, mapping.projectSlug);

    // Unpin status message
    if (mapping.pinnedMessageId) {
      this.api.unpinChatMessage(chatId, mapping.pinnedMessageId).catch(() => {});
    }

    // Unsubscribe
    const subscriberId = `telegram:${chatId}:${topicId}`;
    this.deps.bridge.unsubscribe(mapping.sessionId, subscriberId);

    // Kill CLI
    await this.deps.launcher.kill(mapping.sessionId);

    // Remove from nested map
    this.chatSessions.get(chatId)?.delete(topicId);
    if ((this.chatSessions.get(chatId)?.size ?? 0) === 0) {
      this.chatSessions.delete(chatId);
    }

    // Close forum topic if it was a named topic (not General)
    if (topicId > 0) {
      this.api.closeForumTopic(chatId, topicId).catch(() => {});
    }

    this.stopTyping(chatId, topicId);
    this.clearIdleTimer(chatId, topicId);
    this.idleTimeoutConfigs.delete(this.key(chatId, topicId));
    this.cleanupChatState(chatId, topicId);

    // Notify group of session end
    await this.notifyGroup(mapping.projectSlug, "Session stopped", undefined, chatId);

    this.saveMappings();
  }

  private subscribeToSession(chatId: number, topicId: number, sessionId: string): void {
    const subscriberId = `telegram:${chatId}:${topicId}`;

    this.deps.bridge.subscribe(sessionId, subscriberId, (msg: BrowserIncomingMessage) => {
      // Guard: ignore stale callbacks from orphaned sessions (e.g. Hub CLI exits
      // after a Project session replaced it at the same topicId in private chat)
      const currentMapping = this.chatSessions.get(chatId)?.get(topicId);
      if (currentMapping && currentMapping.sessionId !== sessionId) {
        // Unsubscribe this stale listener to prevent future ghost events
        this.deps.bridge.unsubscribe(sessionId, subscriberId);
        return;
      }

      this.handleCLIResponse(chatId, topicId, msg).catch((err) => {
        console.error(`[telegram] CLI response handler error (chat=${chatId} topic=${topicId}):`, err);
      });
    });
  }

  // ── CLI response handling ─────────────────────────────────────────────

  private async handleCLIResponse(chatId: number, topicId: number, msg: BrowserIncomingMessage): Promise<void> {
    const k = this.key(chatId, topicId);

    // Reset idle timer on ANY CLI activity — Claude is working, don't timeout
    if (msg.type === "assistant" || msg.type === "tool_progress" || msg.type === "result" || msg.type === "status_change") {
      this.resetIdleTimer(chatId, topicId);
    }

    switch (msg.type) {
      case "assistant": {
        const content = msg.message.content;
        if (!Array.isArray(content)) break;

        // Check for AskUserQuestion — always show prominently
        const askQuestions = extractAskUserQuestion(content);

        // Track Bash tool_use ids so we can show their output later
        const bashIds = this.bashToolIds.get(k) ?? new Set<string>();
        for (const block of content) {
          if (block.type === "tool_use" && block.name === "Bash") {
            bashIds.add(block.id);
            this.bashToolIds.set(k, bashIds);
          }
        }

        // Tool activity feed (throttled, only when no text)
        const text = extractText(content);
        if (!text && !askQuestions) {
          const toolFeed = formatToolFeed(content);
          if (toolFeed) this.upsertToolFeed(chatId, topicId, toolFeed);

          // Show Bash tool_result output so results aren't silently swallowed
          for (const block of content) {
            if (block.type === "tool_result" && bashIds.has(block.tool_use_id)) {
              const output = typeof block.content === "string"
                ? block.content
                : (block.content as Array<{ type: string; text?: string }>)
                    .filter((b) => b.type === "text")
                    .map((b) => b.text ?? "")
                    .join("\n");
              const trimmed = output.trim();
              if (trimmed) {
                const isError = block.is_error === true;
                const threadId = topicId > 0 ? topicId : undefined;

                if (trimmed.length > 3000) {
                  // Large output → send as downloadable .txt file
                  const caption = isError
                    ? "⚠️ <b>Error output</b> (full log attached)"
                    : "📤 <b>Bash output</b> (full log attached)";
                  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                  const fileName = isError ? `error-${ts}.txt` : `output-${ts}.txt`;
                  await this.api.sendDocument(chatId, fileName, trimmed, caption, threadId);
                } else {
                  // Short output → inline code block
                  const header = isError ? "⚠️ <b>Error output:</b>" : "📤 <b>Output:</b>";
                  await this.sendToChat(
                    chatId,
                    `${header}\n<pre>${escapeHTML(trimmed)}</pre>`,
                    topicId,
                  );
                }
              }
            }
          }
          break;
        }

        // Streaming text response via sendMessage + editMessageText
        if (text) {
          const html = toTelegramHTML(text);
          const streaming = this.streamingMsg.get(k);
          const now = Date.now();

          if (!streaming) {
            // First text chunk: lock origin message ID to prevent race condition
            // with new user messages arriving while Claude is still responding
            const replyTo = this.lastUserMsgId.get(k);
            if (replyTo && !this.responseOriginMsg.has(k)) {
              this.responseOriginMsg.set(k, replyTo);
            }
            try {
              const msgId = await this.api.sendMessage(chatId, html + " ▌", {
                replyTo,
                messageThreadId: topicId > 0 ? topicId : undefined,
              });
              this.streamingMsg.set(k, { msgId, lastText: html, lastEditAt: now });
              this.stopTyping(chatId, topicId);
            } catch {
              // Fallback: send without cursor
              await this.api.sendLongMessage(chatId, html, {
                replyTo,
                messageThreadId: topicId > 0 ? topicId : undefined,
              });
            }
          } else if (html !== streaming.lastText) {
            // Text exceeded Telegram limit: finalize current, start new message
            if (html.length > 4000) {
              this.api.editMessageText(chatId, streaming.msgId, streaming.lastText).catch(() => {});
              this.streamingMsg.delete(k);
              // Send remaining text as new message(s)
              await this.api.sendLongMessage(chatId, html, {
                messageThreadId: topicId > 0 ? topicId : undefined,
              });
            } else if (now - streaming.lastEditAt >= this.STREAM_EDIT_INTERVAL_MS) {
              // Normal streaming edit (throttled)
              this.api.editMessageText(chatId, streaming.msgId, html + " ▌").catch(() => {});
              streaming.lastText = html;
              streaming.lastEditAt = now;
            }
          }
        }

        // AskUserQuestion — send as separate prominent message with inline buttons
        if (askQuestions) {
          const askHtml = formatAskUserQuestion(askQuestions);
          const askKeyboard = buildAskQuestionKeyboard(askQuestions);
          if (askKeyboard) {
            await this.sendToChatWithKeyboard(chatId, askHtml, askKeyboard, topicId);
          } else {
            await this.api.sendMessage(chatId, askHtml, {
              messageThreadId: topicId > 0 ? topicId : undefined,
            });
          }
        }

        if (askQuestions) {
          this.lastUserMsgId.delete(k);
          this.stopTyping(chatId, topicId);
        }

        // Detect Write tool calls targeting .md files — queue for auto-send after result
        for (const block of content) {
          if (
            block.type === "tool_use" &&
            block.name === "Write" &&
            typeof block.input === "object" &&
            block.input !== null
          ) {
            const input = block.input as Record<string, unknown>;
            const filePath = typeof input.file_path === "string" ? input.file_path : null;
            const fileContent = typeof input.content === "string" ? input.content : null;
            if (filePath && filePath.toLowerCase().endsWith(".md")) {
              if (fileContent) {
                console.log(`[telegram] Detected .md write: ${filePath} (${fileContent.length} chars)`);
                const list = this.pendingMdFiles.get(k) ?? [];
                // Deduplicate by path (last write wins)
                const idx = list.findIndex((f) => f.path === filePath);
                if (idx >= 0) list[idx] = { path: filePath, content: fileContent };
                else list.push({ path: filePath, content: fileContent });
                this.pendingMdFiles.set(k, list);
              } else {
                console.log(`[telegram] Detected .md write but content is null (partial message?): ${filePath}`);
              }
            }
          }
        }
        break;
      }

      case "result": {
        this.stopTyping(chatId, topicId);

        // Capture last streaming text before cleanup (for group notification)
        const streamState = this.streamingMsg.get(k);
        const lastResponseText = streamState?.lastText ?? null;

        // Finalize streaming: remove cursor, send final text if it changed
        if (streamState) {
          this.api.editMessageText(chatId, streamState.msgId, streamState.lastText).catch(() => {});
          this.streamingMsg.delete(k);
        }

        const resultMsg = msg.data as CLIResultMessage;
        const resultText = formatResult(resultMsg);
        const webUrl = process.env.MYTREND_WEB_URL || "";
        const resultMapping = this.chatSessions.get(chatId)?.get(topicId);
        if (!resultMsg.is_error && resultMapping && webUrl.startsWith("https://")) {
          await this.sendToChatWithKeyboard(chatId, resultText, {
            inline_keyboard: [[
              { text: "🌐 Open in Web", url: `${webUrl}/vibe?session=${resultMapping.sessionId}&tab=terminal` },
            ]],
          }, topicId);
        } else {
          await this.sendToChat(chatId, resultText, topicId);
        }

        // Update reaction on the ORIGINAL user message (locked at response start)
        const originMsgId = this.responseOriginMsg.get(k) ?? this.lastUserMsgId.get(k);
        if (originMsgId) {
          const emoji = resultMsg.is_error ? "❌" : "✅";
          this.api.react(chatId, originMsgId, emoji).catch(() => {});
        }
        // Clean up turn-scoped state
        this.responseOriginMsg.delete(k);
        this.lastUserMsgId.delete(k);
        this.bashToolIds.delete(k); // Clear per-turn; rebuilt fresh on next turn
        this.toolFeedMsgId.delete(k);
        this.toolFeedLines.delete(k);

        // Auto-send any .md files written during this turn
        const mdFiles = this.pendingMdFiles.get(k);
        if (mdFiles && mdFiles.length > 0) {
          this.pendingMdFiles.delete(k);
          for (const { path: filePath, content: fileContent } of mdFiles) {
            const fileName = filePath.split(/[/\\]/).pop() ?? "file.md";
            const caption = `📄 <code>${fileName}</code>`;
            console.log(`[telegram] Sending .md file: ${fileName} (${fileContent.length} chars)`);
            this.api
              .sendDocument(chatId, fileName, fileContent, caption, topicId > 0 ? topicId : undefined)
              .catch((err) => console.error(`[telegram] Failed to send .md file ${fileName}:`, err));
          }
        }

        // Cost budget alert
        this.checkCostAlert(chatId, topicId, resultMsg.total_cost_usd);

        // Update pinned status
        this.updatePinnedStatus(chatId, topicId);

        // Notify group of task completion + forward result summary
        const mapping2 = this.chatSessions.get(chatId)?.get(topicId);
        if (mapping2) {
          // Build group notification with response snippet
          let groupDetails = resultText;
          if (lastResponseText) {
            // Strip HTML tags for a clean snippet, truncate to 500 chars
            const plainSnippet = lastResponseText.replace(/<[^>]+>/g, "").trim();
            const truncated = plainSnippet.length > 500
              ? plainSnippet.slice(0, 497) + "..."
              : plainSnippet;
            groupDetails = `${truncated}\n\n${resultText}`;
          }
          await this.notifyGroup(mapping2.projectSlug, "Task complete", groupDetails, chatId);
        }
        break;
      }

      case "tool_progress": {
        // Refresh typing indicator - Claude is working
        this.startTyping(chatId, topicId);
        break;
      }

      case "status_change": {
        if (msg.status === "idle") {
          this.stopTyping(chatId, topicId);
        } else if (msg.status === "compacting") {
          await this.sendToChat(chatId, "Context compacting... this may take a moment.", topicId);
        }
        this.updatePinnedStatus(chatId, topicId);
        break;
      }

      case "cli_disconnected": {
        this.stopTyping(chatId, topicId);
        const disconnectedMapping = this.chatSessions.get(chatId)?.get(topicId);
        if (disconnectedMapping) {
          // Sync conversation before cleanup
          this.syncConversationToPB(disconnectedMapping);
          this.lastProjectSlug.set(chatId, disconnectedMapping.projectSlug);
          // Unpin status message
          if (disconnectedMapping.pinnedMessageId) {
            this.api.unpinChatMessage(chatId, disconnectedMapping.pinnedMessageId).catch(() => {});
          }
          const subscriberId = `telegram:${chatId}:${topicId}`;
          this.deps.bridge.unsubscribe(disconnectedMapping.sessionId, subscriberId);

          // Notify group of session end
          await this.notifyGroup(disconnectedMapping.projectSlug, "Session ended");
        }
        await this.sendToChat(chatId, "Session ended.", topicId);

        // Remove from nested map
        this.chatSessions.get(chatId)?.delete(topicId);
        if ((this.chatSessions.get(chatId)?.size ?? 0) === 0) {
          this.chatSessions.delete(chatId);
        }

        this.clearIdleTimer(chatId, topicId);
        this.cleanupChatState(chatId, topicId);
        this.saveMappings();
        break;
      }

      case "permission_request": {
        const perm = msg.request;

        // Even in bypassPermissions mode, if a permission_request arrives here
        // something unexpected happened — show UI so user can unblock manually.
        // Batch permissions in a 2s window to reduce message spam.
        this.queuePermission(chatId, topicId, perm);
        break;
      }

      default:
        // Silently ignore: stream_event, cli_connected, session_init,
        // user_message, message_history, permission_cancelled, etc.
        break;
    }
  }

  // ── Typing indicator ──────────────────────────────────────────────────

  private startTyping(chatId: number, topicId: number = 0): void {
    const k = this.key(chatId, topicId);
    // Already typing? Don't restart
    if (this.typingIntervals.has(k)) return;

    // Send immediately
    this.api.sendChatAction(chatId, "typing", topicId > 0 ? topicId : undefined).catch(() => {});

    // Refresh every 4 seconds (Telegram typing expires after ~5s)
    const interval = setInterval(() => {
      this.api.sendChatAction(chatId, "typing", topicId > 0 ? topicId : undefined).catch(() => {});
    }, TYPING_INTERVAL_MS);
    this.typingIntervals.set(k, interval);
  }

  private stopTyping(chatId: number, topicId: number = 0): void {
    const k = this.key(chatId, topicId);
    const interval = this.typingIntervals.get(k);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(k);
    }
  }

  // ── Idle timeout ──────────────────────────────────────────────────────

  private resetIdleTimer(chatId: number, topicId: number = 0): void {
    this.clearIdleTimer(chatId, topicId);
    const k = this.key(chatId, topicId);

    const config = this.getIdleTimeoutConfig(chatId, topicId);

    // If disabled, don't set any timers — session runs indefinitely
    if (!config.enabled) return;

    const timeoutMs = config.timeoutMs;
    const durationLabel = formatDuration(timeoutMs);

    // Warning 5min before timeout (skip if timeout <= 5min)
    if (timeoutMs > 5 * 60 * 1000) {
      const warningTimer = setTimeout(() => {
        const warnMin = Math.round((timeoutMs - 5 * 60 * 1000) / 60_000);
        this.sendToChat(chatId, `⏰ Session idle for ${warnMin}min. Send any message to keep alive.`, topicId).catch(() => {});
      }, timeoutMs - 5 * 60 * 1000);
      this.idleWarningTimers.set(k, warningTimer);
    }

    // Destroy at timeout
    const timer = setTimeout(() => {
      console.log(`[telegram] Chat ${chatId} topic ${topicId} idle timeout (${durationLabel}), destroying session`);
      const mapping = this.chatSessions.get(chatId)?.get(topicId);
      this.destroySession(chatId, topicId).then(async () => {
        await this.sendToChat(chatId, `Session timed out after ${durationLabel} of inactivity.`, topicId).catch(() => {});
        if (mapping) {
          await this.notifyGroup(mapping.projectSlug, `Idle timeout (${durationLabel}) — session destroyed`, undefined, chatId);
        }
      });
    }, timeoutMs);
    this.idleTimers.set(k, timer);
  }

  private clearIdleTimer(chatId: number, topicId: number = 0): void {
    const k = this.key(chatId, topicId);
    const timer = this.idleTimers.get(k);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(k);
    }
    const warningTimer = this.idleWarningTimers.get(k);
    if (warningTimer) {
      clearTimeout(warningTimer);
      this.idleWarningTimers.delete(k);
    }
  }

  // ── Idle timeout config (public) ────────────────────────────────────

  /** Get idle timeout config for a session. */
  getIdleTimeoutConfig(chatId: number, topicId: number = 0): IdleTimeoutConfig {
    const k = this.key(chatId, topicId);
    return this.idleTimeoutConfigs.get(k) ?? { enabled: true, timeoutMs: IDLE_TIMEOUT_MS };
  }

  /** Set idle timeout config and reset/clear timers accordingly. */
  setIdleTimeout(chatId: number, topicId: number = 0, enabled: boolean, timeoutMs?: number): void {
    const k = this.key(chatId, topicId);
    const current = this.getIdleTimeoutConfig(chatId, topicId);
    const config: IdleTimeoutConfig = {
      enabled,
      timeoutMs: timeoutMs ?? current.timeoutMs,
    };
    this.idleTimeoutConfigs.set(k, config);

    // Persist to mapping
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (mapping) {
      mapping.idleTimeoutEnabled = config.enabled;
      mapping.idleTimeoutMs = config.timeoutMs;
      this.saveMappings();
    }

    // Reset or clear timers
    if (config.enabled) {
      this.resetIdleTimer(chatId, topicId);
    } else {
      this.clearIdleTimer(chatId, topicId);
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

    const topicId = query.message?.message_thread_id ?? 0;
    const [prefix, ...rest] = data.split(":");
    const value = rest.join(":");

    try {
      switch (prefix) {
        case "proj":
          await this.onProjectSelected(chatId, messageId!, query.id, value, topicId);
          break;
        case "model":
          await this.onModelSelected(chatId, messageId!, query.id, value, topicId);
          break;
        case "mode":
          await this.onModeSelected(chatId, messageId!, query.id, value);
          break;
        case "perm":
          await this.onPermissionResponse(chatId, messageId!, query.id, value, topicId);
          break;
        case "stop":
          await this.onStopResponse(chatId, messageId!, query.id, value, topicId);
          break;
        case "new":
          await this.onNewResponse(chatId, messageId!, query.id, value, topicId);
          break;
        case "action":
          await this.onActionSelected(chatId, messageId!, query.id, value, topicId);
          break;
        case "autoapprove":
          await this.onAutoApproveSelected(chatId, messageId!, query.id, value, topicId);
          break;
        case "ask":
          await this.onAskResponse(chatId, messageId!, query.id, value, topicId);
          break;
        case "timeout":
          await this.onTimeoutSelected(chatId, messageId!, query.id, value, topicId);
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
    chatId: number, messageId: number, queryId: string, slug: string, topicId: number = 0
  ): Promise<void> {
    const profile = this.deps.profiles.get(slug);
    if (!profile) {
      await this.api.answerCallbackQuery(queryId, "Project not found");
      return;
    }

    // Check if a session already exists for this topic
    const existingForTopic = this.chatSessions.get(chatId)?.get(topicId);
    if (existingForTopic?.projectSlug === slug) {
      await this.api.answerCallbackQuery(queryId, `Already on ${profile.name}`);
      return;
    }

    // Remove keyboard from original message
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
    await this.api.answerCallbackQuery(queryId, `Connecting to ${profile.name}...`);

    // Create new topic for this project (topics allow multiple concurrent sessions)
    let targetTopicId = topicId;
    if (topicId === 0) {
      // Try creating a forum topic (works in supergroups + private chats if bot has topics enabled via BotFather)
      try {
        const forumTopic = await this.api.createForumTopic(chatId, profile.name);
        targetTopicId = forumTopic.message_thread_id;
        console.log(`[telegram] Created topic ${targetTopicId} for ${profile.name} in chat ${chatId}`);
      } catch (topicErr) {
        console.log(`[telegram] Topic creation failed for chat ${chatId}: ${topicErr instanceof Error ? topicErr.message : topicErr}. Bot topics=${this.botHasTopics}`);
        // Forum topics not available — fall back to topicId=0
        // IMPORTANT: destroy existing session first to prevent orphaned CLI processes
        const existingAtZero = this.chatSessions.get(chatId)?.get(0);
        if (existingAtZero && existingAtZero.projectSlug !== slug) {
          const prevProfile = this.deps.profiles.get(existingAtZero.projectSlug);
          await this.sendToChat(chatId, `Switching from <b>${prevProfile?.name ?? existingAtZero.projectSlug}</b> → <b>${profile.name}</b>...`);
          await this.destroySession(chatId, 0);
        }
        targetTopicId = 0;
      }
    }

    // Single progress message — will be edited through stages
    const progressMsgId = await this.api.sendMessage(chatId, `Connecting to ${profile.name}...`, {
      messageThreadId: targetTopicId > 0 ? targetTopicId : undefined,
    });
    const result = await this.createSession(chatId, profile, targetTopicId);

    if (!result.ok) {
      await this.api.editMessageText(chatId, progressMsgId, `Failed to connect: ${result.error}`);
      return;
    }

    // Edit progress message into final "Connected" with details
    const mapping = this.chatSessions.get(chatId)?.get(targetTopicId);
    try {
      await this.api.editMessageText(chatId, progressMsgId, formatConnected(profile, profile.defaultModel), {
        replyMarkup: buildSessionActionsKeyboard(mapping?.model ?? profile.defaultModel),
      });
      // Use this message as pinned status
      if (mapping) {
        mapping.pinnedMessageId = progressMsgId;
        await this.api.pinChatMessage(chatId, progressMsgId);
      }
    } catch {
      // Fallback: send separate message
      await this.sendToChat(chatId, formatConnected(profile, profile.defaultModel), targetTopicId);
    }
  }

  private async onModelSelected(
    chatId: number, _messageId: number, queryId: string, model: string, topicId: number = 0
  ): Promise<void> {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) {
      await this.api.answerCallbackQuery(queryId, "No active session");
      return;
    }

    // setModel() already calls updatePinnedStatus() to restore the pinned message
    this.setModel(chatId, model, topicId);
    await this.api.answerCallbackQuery(queryId, `Model → ${model}`);
  }

  private async onModeSelected(
    chatId: number, messageId: number, queryId: string, mode: string
  ): Promise<void> {
    // Mode changes not supported at runtime via CLI, just acknowledge
    await this.api.answerCallbackQuery(queryId, `Mode: ${mode} (applies to next session)`);
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
  }

  private async onPermissionResponse(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    // value format: "allow:<requestId>" or "deny:<requestId>"
    // Batch format: "allow:<id1>,<id2>,<id3>" (comma-separated)
    const [behavior, ...idParts] = value.split(":");
    const requestIdStr = idParts.join(":");

    if (behavior !== "allow" && behavior !== "deny") {
      await this.api.answerCallbackQuery(queryId, "Invalid response");
      return;
    }

    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) {
      await this.api.answerCallbackQuery(queryId, "No active session");
      return;
    }

    // Support batch: comma-separated request IDs
    const requestIds = requestIdStr.split(",").filter(Boolean);

    for (const requestId of requestIds) {
      this.deps.bridge.injectPermissionResponse(mapping.sessionId, {
        request_id: requestId,
        behavior,
      });
    }

    // Clear any live countdown for this permission batch
    this.clearPermCountdowns(chatId, topicId);

    const emoji = behavior === "allow" ? "✅" : "❌";
    const label = behavior === "allow" ? "Allowed" : "Denied";
    const countLabel = requestIds.length > 1 ? ` ${requestIds.length} tools` : "";
    await this.api.answerCallbackQuery(queryId, `${emoji} ${label}${countLabel}`);

    // Remove the keyboard
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
  }

  private async onStopResponse(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});

    if (value === "confirm") {
      const mapping = this.chatSessions.get(chatId)?.get(topicId);
      if (mapping) {
        await this.destroySession(chatId, topicId);
        await this.api.answerCallbackQuery(queryId, "Session stopped");
        await this.sendToChat(chatId, `Session stopped. (<code>${mapping.projectSlug}</code>)`, topicId);
      } else {
        await this.api.answerCallbackQuery(queryId, "No active session");
      }
    } else {
      await this.api.answerCallbackQuery(queryId, "Cancelled");
    }
  }

  private async onNewResponse(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});

    if (value === "confirm") {
      const mapping = this.chatSessions.get(chatId)?.get(topicId);
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
      await this.destroySession(chatId, topicId);
      await this.sendToChat(chatId, "Restarting session...", topicId);

      const result = await this.createSession(chatId, profile, topicId);
      if (!result.ok) {
        await this.sendToChat(chatId, `Failed: ${result.error}`, topicId);
        return;
      }
      await this.sendToChatWithKeyboard(
        chatId,
        formatConnected(profile, profile.defaultModel),
        buildSessionActionsKeyboard(mapping.model),
        topicId
      );
    } else {
      await this.api.answerCallbackQuery(queryId, "Cancelled");
    }
  }

  private async onActionSelected(
    chatId: number, messageId: number, queryId: string, action: string, topicId: number = 0
  ): Promise<void> {
    switch (action) {
      case "model": {
        const mapping = this.chatSessions.get(chatId)?.get(topicId);
        await this.api.answerCallbackQuery(queryId);
        // Edit the same message inline instead of creating a new one
        await this.api.editMessageText(chatId, messageId, "Select model:", {
          replyMarkup: buildModelKeyboard(mapping?.model),
        }).catch(() => {});
        break;
      }
      case "status": {
        await this.api.answerCallbackQuery(queryId);
        const mapping = this.chatSessions.get(chatId)?.get(topicId);
        if (mapping) {
          const session = this.getSessionState(mapping.sessionId);
          const status = session?.status ?? "unknown";
          const lines = [formatStatus(mapping, status)];
          if (session) {
            lines.push(`Cost: <code>$${session.total_cost_usd.toFixed(3)}</code> | Turns: <code>${session.num_turns}</code>`);
          }
          await this.sendToChat(chatId, lines.join("\n"), topicId);
        }
        break;
      }
      case "cancel": {
        this.interruptSession(chatId, topicId);
        await this.api.answerCallbackQuery(queryId, "Interrupt sent");
        break;
      }
      case "stop": {
        await this.api.answerCallbackQuery(queryId);
        await this.sendToChatWithKeyboard(
          chatId,
          "Stop the current session?",
          buildStopConfirmKeyboard(),
          topicId
        );
        break;
      }
      case "autoapprove": {
        // Expand Auto-Approve + Timeout controls inline on pinned message
        await this.api.answerCallbackQuery(queryId);
        const mapping = this.chatSessions.get(chatId)?.get(topicId);
        if (mapping) {
          const aaConfig = this.getAutoApproveConfig(chatId);
          const toConfig = this.getIdleTimeoutConfig(chatId, topicId);
          const session = this.getSessionState(mapping.sessionId);
          const text = formatPinnedStatus(mapping, session, aaConfig, toConfig);
          await this.api.editMessageText(chatId, messageId, text, {
            replyMarkup: buildSessionActionsKeyboard(mapping.model, "auto", aaConfig, toConfig),
          }).catch(() => {});
        }
        break;
      }
      case "collapse": {
        // Collapse back to default pinned keyboard
        await this.api.answerCallbackQuery(queryId);
        const mapping = this.chatSessions.get(chatId)?.get(topicId);
        if (mapping) {
          const session = this.getSessionState(mapping.sessionId);
          const text = formatPinnedStatus(mapping, session);
          await this.api.editMessageText(chatId, messageId, text, {
            replyMarkup: buildSessionActionsKeyboard(mapping.model),
          }).catch(() => {});
        }
        break;
      }
      case "projects": {
        await this.api.answerCallbackQuery(queryId);
        const profiles = this.deps.profiles.getAll();
        if (profiles.length > 0) {
          await this.sendToChatWithKeyboard(
            chatId,
            "Select a project:",
            buildProjectKeyboard(profiles),
            topicId
          );
        }
        break;
      }
      default:
        await this.api.answerCallbackQuery(queryId, "Unknown action");
    }
  }

  private async onAutoApproveSelected(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    // value format: "timeout:<seconds>" or "bash:<on|off>"
    const [subtype, subvalue] = value.split(":");
    const config = this.getAutoApproveConfig(chatId);

    if (subtype === "timeout") {
      const seconds = parseInt(subvalue, 10);
      config.timeoutSeconds = seconds;
      config.enabled = seconds > 0;
    } else if (subtype === "bash") {
      config.allowBash = subvalue === "on";
    }

    this.autoApproveConfigs.set(chatId, config);

    // Push to ws-bridge for the current topic's session
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (mapping) {
      this.deps.bridge.setAutoApprove(mapping.sessionId, config);
    }

    await this.api.answerCallbackQuery(
      queryId,
      config.enabled ? `Auto-approve: ${config.timeoutSeconds}s` : "Auto-approve: OFF"
    );

    // Refresh expanded pinned message with updated state
    this.refreshExpandedPinned(chatId, topicId, messageId);
  }

  private async onTimeoutSelected(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    // value format: "toggle:<on|off>" or "set:<ms>"
    const [subtype, subvalue] = value.split(":");

    if (subtype === "toggle") {
      const enabled = subvalue === "on";
      this.setIdleTimeout(chatId, topicId, enabled);
    } else if (subtype === "set") {
      const ms = parseInt(subvalue, 10);
      if (!isNaN(ms) && ms > 0) {
        this.setIdleTimeout(chatId, topicId, true, ms);
      }
    }

    const updated = this.getIdleTimeoutConfig(chatId, topicId);
    await this.api.answerCallbackQuery(
      queryId,
      updated.enabled ? `Timeout: ${formatDuration(updated.timeoutMs)}` : "Timeout: OFF"
    );

    // Refresh expanded pinned message with updated state
    this.refreshExpandedPinned(chatId, topicId, messageId);
  }

  /** Refresh the expanded pinned message (Auto-Approve + Timeout inline). */
  private refreshExpandedPinned(chatId: number, topicId: number, messageId: number): void {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) return;
    const aaConfig = this.getAutoApproveConfig(chatId);
    const toConfig = this.getIdleTimeoutConfig(chatId, topicId);
    const session = this.getSessionState(mapping.sessionId);
    const text = formatPinnedStatus(mapping, session, aaConfig, toConfig);
    this.api.editMessageText(chatId, messageId, text, {
      replyMarkup: buildSessionActionsKeyboard(mapping.model, "auto", aaConfig, toConfig),
    }).catch(() => {});
  }

  private async onAskResponse(
    chatId: number, messageId: number, queryId: string, value: string, topicId: number = 0
  ): Promise<void> {
    // value format: "<idx>:<label>"
    const colonIdx = value.indexOf(":");
    const label = colonIdx >= 0 ? value.slice(colonIdx + 1) : value;

    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) {
      await this.api.answerCallbackQuery(queryId, "No active session");
      return;
    }

    // Remove keyboard and show selected option
    await this.api.editMessageReplyMarkup(chatId, messageId).catch(() => {});
    await this.api.answerCallbackQuery(queryId, `Selected: ${label}`);

    // Inject the selected label as user message to CLI
    this.deps.bridge.injectUserMessage(mapping.sessionId, label);
    this.resetIdleTimer(chatId, topicId);
  }

  // ── Bot menu commands ──────────────────────────────────────────────────

  private async registerCommands(): Promise<void> {
    try {
      await this.api.setMyCommands([
        { command: "start", description: "Start bot & show projects" },
        { command: "switch", description: "Quick-switch project" },
        { command: "model", description: "Switch model" },
        { command: "status", description: "Session info" },
        { command: "autoapprove", description: "Auto-approve settings" },
        { command: "timeout", description: "Idle timeout settings" },
        { command: "translate", description: "Toggle Vi→En auto-translate" },
        { command: "cancel", description: "Interrupt Claude" },
        { command: "stop", description: "End session" },
        { command: "stopall", description: "End all sessions" },
        { command: "new", description: "Restart session" },
        { command: "help", description: "All commands" },
      ]);
      console.log("[telegram] Bot menu commands registered");
    } catch (err) {
      console.warn("[telegram] Failed to register commands:", err);
    }
  }

  // ── Public API (for commands) ─────────────────────────────────────────

  async sendToChat(chatId: number, text: string, topicId?: number): Promise<number> {
    try {
      return await this.api.sendMessage(chatId, text, {
        messageThreadId: topicId && topicId > 0 ? topicId : undefined,
      });
    } catch (err) {
      console.error(`[telegram] sendToChat(${chatId}) HTML error:`, err);
      // Retry as plain text (strip HTML tags, no parse_mode)
      try {
        const plain = text.replace(/<[^>]+>/g, "");
        return await this.api.sendMessage(chatId, plain, {
          parseMode: null,
          messageThreadId: topicId && topicId > 0 ? topicId : undefined,
        });
      } catch {
        // give up
        return 0;
      }
    }
  }

  async sendToChatWithKeyboard(
    chatId: number,
    text: string,
    keyboard: TelegramInlineKeyboardMarkup,
    topicId?: number
  ): Promise<number> {
    try {
      return await this.api.sendMessage(chatId, text, {
        replyMarkup: keyboard,
        messageThreadId: topicId && topicId > 0 ? topicId : undefined,
      });
    } catch (err) {
      console.error(`[telegram] sendToChatWithKeyboard(${chatId}) error:`, err);
      // Retry without keyboard as fallback
      return await this.sendToChat(chatId, text, topicId);
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

  getMapping(chatId: number, topicId: number = 0): TelegramSessionMapping | undefined {
    return this.chatSessions.get(chatId)?.get(topicId);
  }

  getMappings(chatId: number): Map<number, TelegramSessionMapping> | undefined {
    return this.chatSessions.get(chatId);
  }

  getSessionState(sessionId: string): SessionState | undefined {
    return this.deps.bridge.getSessionState(sessionId);
  }

  interruptSession(chatId: number, topicId: number = 0): void {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) return;
    this.deps.bridge.injectInterrupt(mapping.sessionId);
  }

  setModel(chatId: number, model: string, topicId: number = 0): void {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping) return;

    mapping.model = model;
    this.deps.bridge.injectSetModel(mapping.sessionId, model);
    this.saveMappings();
    this.updatePinnedStatus(chatId, topicId);
  }

  getAutoApproveConfig(chatId: number): AutoApproveConfig {
    return this.autoApproveConfigs.get(chatId) ?? { enabled: false, timeoutSeconds: 0, allowBash: false };
  }

  setAutoApproveConfig(chatId: number, config: AutoApproveConfig): void {
    this.autoApproveConfigs.set(chatId, config);
    // Apply to all active sessions for this chat
    const topics = this.chatSessions.get(chatId);
    if (topics) {
      for (const mapping of topics.values()) {
        this.deps.bridge.setAutoApprove(mapping.sessionId, config);
      }
    }
  }

  isTranslateEnabled(chatId: number): boolean {
    return this.translateEnabled.get(chatId) ?? true; // ON by default
  }

  setTranslateEnabled(chatId: number, enabled: boolean): void {
    this.translateEnabled.set(chatId, enabled);
  }

  getActiveChatCount(): number {
    let count = 0;
    for (const topics of this.chatSessions.values()) count += topics.size;
    return count;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ── Notification group ────────────────────────────────────────────────

  setNotificationGroupId(groupId: number | null): void {
    this.notificationGroupId = groupId;
  }

  getNotificationGroupId(): number | null {
    return this.notificationGroupId;
  }

  private async notifyGroup(projectSlug: string, event: string, details?: string, chatId?: number): Promise<void> {
    if (!this.notificationGroupId) return;
    // Don't notify the same group that the event originated from
    if (chatId === this.notificationGroupId) return;
    const profile = this.deps.profiles.get(projectSlug);
    const name = profile?.name ?? projectSlug;
    let text = `<b>[${name}]</b> ${event}`;
    if (details) text += `\n${details}`;
    try {
      await this.api.sendMessage(this.notificationGroupId, text);
    } catch (err) {
      console.error(`[telegram] Notification group send failed:`, err);
    }
  }

  // ── Helper methods (tool feed, cost alerts, pinned status) ──────────

  /** Send the initial "Thinking…" message once per turn and save its message ID. */
  private async initToolFeedIfNeeded(chatId: number, topicId: number): Promise<void> {
    const k = this.key(chatId, topicId);
    if (this.toolFeedMsgId.has(k)) return; // Already initialized for this turn

    const replyTo = this.lastUserMsgId.get(k);
    try {
      const msgId = await this.api.sendMessage(chatId, "🤔 <i>Thinking…</i>", {
        replyTo,
        messageThreadId: topicId > 0 ? topicId : undefined,
      });
      this.toolFeedMsgId.set(k, msgId);
      this.toolFeedLines.set(k, ["🤔 <i>Thinking…</i>"]);
    } catch { /* ignore */ }
  }

  /** Append a tool activity line to the single per-turn feed message (edit, not new message). */
  private async upsertToolFeed(chatId: number, topicId: number, newLine: string): Promise<void> {
    const k = this.key(chatId, topicId);
    // Ensure the feed message exists
    await this.initToolFeedIfNeeded(chatId, topicId);

    const lines = this.toolFeedLines.get(k) ?? [];
    lines.push(newLine);
    const trimmed = lines.slice(-15); // Keep last 15 lines to stay under Telegram 4096-char limit
    this.toolFeedLines.set(k, trimmed);

    const existingMsgId = this.toolFeedMsgId.get(k);
    if (!existingMsgId) return;

    this.api.editMessageText(chatId, existingMsgId, trimmed.join("\n")).catch(() => {});
  }

  private checkCostAlert(chatId: number, topicId: number, cost: number): void {
    const k = this.key(chatId, topicId);
    const thresholds = [0.50, 1.00, 2.00, 5.00];
    const shown = this.costAlertsShown.get(k) ?? new Set<number>();

    for (const t of thresholds) {
      if (cost >= t && !shown.has(t)) {
        shown.add(t);
        this.costAlertsShown.set(k, shown);
        const emoji = t >= 5 ? "🔴" : t >= 2 ? "🟠" : "🟡";
        this.sendToChat(chatId, `${emoji} Cost alert: <code>$${cost.toFixed(3)}</code> (crossed $${t.toFixed(2)})`, topicId).catch(() => {});
        break; // Only one alert per result
      }
    }
  }

  private updatePinnedStatus(chatId: number, topicId: number = 0): void {
    const mapping = this.chatSessions.get(chatId)?.get(topicId);
    if (!mapping?.pinnedMessageId) return;

    const session = this.getSessionState(mapping.sessionId);
    const text = formatPinnedStatus(mapping, session);

    this.api.editMessageText(chatId, mapping.pinnedMessageId, text, {
      replyMarkup: buildSessionActionsKeyboard(mapping.model),
    }).catch(() => {
      // Message may have been deleted or is unchanged
    });
  }

  private cleanupChatState(chatId: number, topicId: number = 0): void {
    const k = this.key(chatId, topicId);
    this.toolFeedMsgId.delete(k);
    this.toolFeedLines.delete(k);
    this.lastUserMsgId.delete(k);
    this.responseOriginMsg.delete(k);
    this.costAlertsShown.delete(k);
    this.streamingMsg.delete(k);
    this.bashToolIds.delete(k);
    this.pendingMdFiles.delete(k);
    this.clearPermCountdowns(chatId, topicId); // Stop any running countdown intervals
    // Clear permission batch timer
    const batch = this.permissionBatch.get(k);
    if (batch) {
      clearTimeout(batch.timer);
      this.permissionBatch.delete(k);
    }
    // Only clean chat-level state if no more sessions remain for this chat
    if ((this.chatSessions.get(chatId)?.size ?? 0) === 0) {
      this.autoApproveConfigs.delete(chatId);
      this.translateEnabled.delete(chatId);
      this.hubFirstMsg.delete(chatId);
    }
  }

  // ── Permission batching ─────────────────────────────────────────────────

  /** Queue a permission request — flush after 2s window to batch multiple requests. */
  private queuePermission(chatId: number, topicId: number, perm: import("../session-types.js").PermissionRequest): void {
    const k = this.key(chatId, topicId);
    const existing = this.permissionBatch.get(k);

    if (existing) {
      // Add to existing batch
      existing.perms.push(perm);
    } else {
      // Start new batch with timer
      const timer = setTimeout(() => {
        this.flushPermissionBatch(chatId, topicId);
      }, this.PERM_BATCH_WINDOW_MS);
      this.permissionBatch.set(k, { perms: [perm], timer });
    }
  }

  /** Send batched permissions as a single message, with live countdown if auto-approve is on. */
  private async flushPermissionBatch(chatId: number, topicId: number = 0): Promise<void> {
    const k = this.key(chatId, topicId);
    const batch = this.permissionBatch.get(k);
    this.permissionBatch.delete(k);
    if (!batch || batch.perms.length === 0) return;

    const aaConfig = this.getAutoApproveConfig(chatId);
    const text = formatPermissionBatch(batch.perms, aaConfig);
    const requestIds = batch.perms.map((p) => p.request_id);
    const keyboard = buildPermissionBatchKeyboard(requestIds);

    const msgId = await this.sendToChatWithKeyboard(chatId, text, keyboard, topicId);

    // Live countdown: update message every 5s showing remaining time
    const hasAutoApprove = aaConfig.enabled && aaConfig.timeoutSeconds > 0;
    if (hasAutoApprove && msgId > 0) {
      const countdownKey = `perm:${k}:${requestIds.join(",")}`;
      let remaining = aaConfig.timeoutSeconds;
      const interval = setInterval(() => {
        remaining -= 5;
        if (remaining <= 0) {
          clearInterval(interval);
          this.permCountdownEdits.delete(countdownKey);
          const approvedText = text
            .replace(/Auto-approve.*?<\/b>/, "Auto-approved ✅</b>")
            .replace(/⏱/g, "✅");
          this.api.editMessageText(chatId, msgId, approvedText).catch(() => {});
          return;
        }
        const updatedText = text.replace(/in \d+s/, `in ${remaining}s`);
        this.api.editMessageText(chatId, msgId, updatedText, { replyMarkup: keyboard }).catch(() => {});
      }, 5_000);
      this.permCountdownEdits.set(countdownKey, interval);
    }
  }

  /** Clear permission countdown when manually approved/denied. */
  private clearPermCountdowns(chatId: number, topicId: number): void {
    const k = this.key(chatId, topicId);
    for (const [key, interval] of this.permCountdownEdits) {
      if (key.startsWith(`perm:${k}:`)) {
        clearInterval(interval);
        this.permCountdownEdits.delete(key);
      }
    }
  }

  // ── Hub Mode ───────────────────────────────────────────────────────────

  /** Enrich user message for Hub sessions: @mention → project context, first msg → project list */
  private enrichHubMessage(chatId: number, text: string): string {
    const profiles = this.deps.profiles.getAll().filter((p) => p.slug !== "hub");
    let context = "";

    // Detect @slug mentions and inject project context
    const mentionPattern = /@([\w-]+)/g;
    let match: RegExpExecArray | null;
    const mentioned: string[] = [];

    while ((match = mentionPattern.exec(text)) !== null) {
      const slug = match[1].toLowerCase();
      const profile = this.deps.profiles.get(slug);
      if (profile && profile.slug !== "hub") {
        mentioned.push(`[Project "${profile.name}" → dir: ${profile.dir}]`);
        // Replace @slug with project name in text
        text = text.replace(match[0], profile.name);
      }
    }

    if (mentioned.length > 0) {
      context += mentioned.join("\n") + "\n\n";
    }

    // First message: include project overview
    if (!this.hubFirstMsg.has(chatId)) {
      this.hubFirstMsg.add(chatId);
      const projectList = profiles.map((p) => `- ${p.name} (@${p.slug}): ${p.dir}`).join("\n");
      context = [
        "[Hub Mode — Cross-project discussion]",
        "Available projects:",
        projectList,
        "",
        "Mention @slug to focus on a specific project.",
        "",
        context,
      ].join("\n");
    }

    return context ? `${context}${text}` : text;
  }

  // ── Conversation sync to PocketBase ─────────────────────────────────

  /** Sync conversation transcript to PocketBase on session end. Fire-and-forget. */
  private syncConversationToPB(mapping: TelegramSessionMapping): void {
    const pbUrl = process.env.POCKETBASE_URL || "http://localhost:8090";
    const secret = process.env.COMPANION_INTERNAL_SECRET || "";
    const userId = process.env.MYTREND_SYNC_USER_ID || "";
    if (!secret || !userId) return;

    const history = this.deps.bridge.getMessageHistory(mapping.sessionId);
    if (history.length === 0) return;

    // Build transcript from message history
    const lines: string[] = [];
    let firstUserMsg = "";

    for (const msg of history) {
      if (msg.type === "user_message") {
        const content = (msg as { content: string }).content;
        if (!firstUserMsg) firstUserMsg = content;
        lines.push(`[User] ${content}`);
      } else if (msg.type === "assistant") {
        const assistantMsg = msg as { message: { content: Array<{ type: string; text?: string }> } };
        const texts: string[] = [];
        for (const block of assistantMsg.message.content) {
          if (block.type === "text" && block.text) texts.push(block.text);
        }
        if (texts.length > 0) lines.push(`[Assistant] ${texts.join("\n")}`);
      } else if (msg.type === "result") {
        const result = msg as { data: { total_cost_usd: number; num_turns: number } };
        lines.push(`[Result] Cost: $${result.data.total_cost_usd.toFixed(3)} | Turns: ${result.data.num_turns}`);
      }
    }

    if (lines.length < 2) return; // Need at least 1 exchange

    const title = firstUserMsg.length > 100 ? firstUserMsg.slice(0, 97) + "..." : firstUserMsg;
    const content = lines.join("\n\n");
    const tags = ["vibe-bot", mapping.projectSlug];
    if (mapping.projectSlug === "hub") tags.push("cross-project");

    fetch(`${pbUrl}/api/internal/conversation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        userId,
        title,
        content,
        projectSlug: mapping.projectSlug,
        tags,
        model: mapping.model,
        sessionId: mapping.sessionId,
      }),
    }).catch((err) => {
      console.error("[telegram] Conversation sync failed:", err);
    });
  }

  // ── Research URL Processing ──────────────────────────────────────────

  /** Process detected URLs: fetch metadata, AI analyze, save to PB + NM. Fire-and-forget. */
  private async processResearchUrls(
    chatId: number,
    topicId: number,
    urls: DetectedUrl[],
    fullText: string,
    messageId: number,
    userId: string,
  ): Promise<void> {
    if (!userId) {
      console.warn("[research] MYTREND_SYNC_USER_ID not set — skipping research capture");
      return;
    }

    const knownProjects = this.deps.profiles
      .getAll()
      .filter((p) => p.slug !== "hub")
      .map((p) => ({ slug: p.slug, name: p.name, dir: p.dir }));

    // Process all URLs in parallel — each spawns its own Claude CLI process
    await Promise.allSettled(
      urls.map(async (detected) => {
        try {
          // 1. Dedup check
          const existingId = await checkExistingResearch(detected.url);
          if (existingId) {
            this.api.react(chatId, messageId, "🔖").catch(() => {});
            return;
          }

          // 2. Fetch metadata
          const metadata = await fetchMetadata(detected);

          // 3. AI analysis
          const analysis = await analyzeWithClaude(detected, metadata, fullText, knownProjects);

          // 4. Build record
          const record: ResearchRecord = {
            url: detected.url,
            source: detected.source,
            title: metadata.title,
            description: metadata.description,
            stars: metadata.stars,
            npm_downloads: metadata.npmDownloads,
            tech_tags: analysis.techTags,
            patterns_extracted: analysis.patternsExtracted,
            applicable_projects: analysis.applicableProjects,
            verdict: analysis.verdict,
            ai_summary: analysis.summary,
            user_comment: fullText.replace(detected.url, "").trim().slice(0, 2000),
            raw_metadata: metadata.raw,
            processed_at: new Date().toISOString(),
          };

          // 5. Save to PocketBase
          const recordId = await saveResearchToPB(userId, record);

          // 6. Save to Neural Memory (async, fire-and-forget)
          saveToNeuralMemory(record, analysis).catch(() => {});

          // 7. Send confirmation card to Telegram
          if (recordId) {
            await this.sendResearchCard(chatId, topicId, detected, metadata, analysis);
          }
        } catch (err) {
          console.error(`[research] Failed for ${detected.url}:`, err);
        }
      }),
    );
  }

  /** Send a formatted research card to Telegram. */
  private async sendResearchCard(
    chatId: number,
    topicId: number,
    detected: DetectedUrl,
    metadata: RawMetadata,
    analysis: AIAnalysis,
  ): Promise<void> {
    const VERDICT_EMOJI: Record<string, string> = {
      fit: "✅", partial: "🟡", "concept-only": "💡", irrelevant: "⬜",
    };
    const SOURCE_EMOJI: Record<string, string> = {
      github: "🐙", npm: "📦", blog: "📝", docs: "📖", other: "🔗",
    };

    const lines: string[] = [
      `${SOURCE_EMOJI[detected.source] ?? "🔗"} <b>${this.escapeHtml(metadata.title)}</b>`,
      `${VERDICT_EMOJI[analysis.verdict] ?? "🟡"} <i>${analysis.verdict}</i>`,
    ];

    if (metadata.stars > 0) lines.push(`⭐ ${metadata.stars.toLocaleString()} stars`);
    if (metadata.npmDownloads > 0) lines.push(`📥 ${metadata.npmDownloads.toLocaleString()} downloads/week`);
    if (analysis.techTags.length > 0) lines.push(`🏷 ${analysis.techTags.join(", ")}`);
    if (analysis.applicableProjects.length > 0) lines.push(`📂 ${analysis.applicableProjects.join(", ")}`);
    if (analysis.summary) lines.push(`\n${this.escapeHtml(analysis.summary)}`);

    await this.sendToChat(chatId, lines.join("\n"), topicId);
  }

  /** Escape HTML special characters for Telegram. */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private saveMappings(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const data: TelegramSessionMapping[] = [];
      for (const topics of this.chatSessions.values()) {
        for (const mapping of topics.values()) {
          data.push(mapping);
        }
      }
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
          const topicId = m.topicId ?? 0;
          if (!this.chatSessions.has(m.chatId)) {
            this.chatSessions.set(m.chatId, new Map());
          }
          this.chatSessions.get(m.chatId)!.set(topicId, m);
          // Restore per-session timeout config from persisted mapping
          if (m.idleTimeoutEnabled !== undefined || m.idleTimeoutMs !== undefined) {
            const k = this.key(m.chatId, topicId);
            this.idleTimeoutConfigs.set(k, {
              enabled: m.idleTimeoutEnabled ?? true,
              timeoutMs: m.idleTimeoutMs ?? IDLE_TIMEOUT_MS,
            });
          }
          this.subscribeToSession(m.chatId, topicId, m.sessionId);
          this.resetIdleTimer(m.chatId, topicId);
          console.log(`[telegram] Restored mapping: chat=${m.chatId} topic=${topicId} → session=${m.sessionId.slice(0, 8)}`);
        }
      }
    } catch {
      // No file or parse error - fresh start
    }
  }
}
