import type { ServerWebSocket } from "bun";
import type {
  CLIMessage,
  CLISystemInitMessage,
  CLIAssistantMessage,
  CLIResultMessage,
  CLIStreamEventMessage,
  CLIToolProgressMessage,
  CLIControlRequestMessage,
  BrowserOutgoingMessage,
  BrowserIncomingMessage,
  PermissionRequest,
  PersistedSession,
  SessionState,
  SessionStatus,
  AutoApproveConfig,
} from "./session-types.js";
import { SessionStore } from "./session-store.js";

// ─── Idea extraction (Telegram Claude Bridge → MyTrend) ──────────────────────

const PB_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const INTERNAL_SECRET = process.env.COMPANION_INTERNAL_SECRET || "";
const MYTREND_USER_ID = process.env.MYTREND_SYNC_USER_ID || "";

async function extractIdeaFromMessage(content: string): Promise<void> {
  if (!INTERNAL_SECRET || !MYTREND_USER_ID || content.length < 15) return;
  try {
    await fetch(`${PB_URL}/api/internal/idea`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ content, userId: MYTREND_USER_ID }),
    });
  } catch {
    // Non-fatal: don't block the main message flow
  }
}

// ─── Socket data tags ────────────────────────────────────────────────────────

export interface CLISocketData {
  role: "cli";
  sessionId: string;
}

export interface BrowserSocketData {
  role: "browser";
  sessionId: string;
}

export type SocketData = CLISocketData | BrowserSocketData;

// ─── Active session in memory ────────────────────────────────────────────────

interface ActiveSession {
  id: string;
  state: SessionState;
  /** Function to write NDJSON to CLI stdin (pipe-based transport). */
  cliSend: ((data: string) => void) | null;
  browserSockets: Set<ServerWebSocket<SocketData>>;
  pendingMessages: string[];
  pendingPermissions: Map<string, PermissionRequest>;
  messageHistory: BrowserIncomingMessage[];
  /** External subscribers (e.g. Telegram bridge) notified on CLI messages. */
  subscribers: Map<string, (msg: BrowserIncomingMessage) => void>;
  /** Auto-approve configuration for this session. */
  autoApproveConfig: AutoApproveConfig;
  /** Active auto-approve timers keyed by request_id. */
  autoApproveTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** @deprecated No longer used — ExitPlanMode now shows permission UI instead of auto-approving. */
  pendingPlanApproval?: boolean;
}

// ─── Bridge ──────────────────────────────────────────────────────────────────

export class WsBridge {
  private sessions = new Map<string, ActiveSession>();
  private store: SessionStore;

  /** Callback when session status changes (for REST API/events). */
  onStatusChange?: (sessionId: string, status: SessionStatus) => void;

  constructor(store: SessionStore) {
    this.store = store;
  }

  // ── Session lifecycle ────────────────────────────────────────────────────

  /** Create or restore an active session. */
  ensureSession(sessionId: string): ActiveSession {
    let session = this.sessions.get(sessionId);
    if (session) return session;

    // Try restore from disk
    const persisted = this.store.load(sessionId);
    const state: SessionState = persisted?.state ?? {
      session_id: sessionId,
      model: "",
      cwd: "",
      tools: [],
      permissionMode: "default",
      claude_code_version: "",
      mcp_servers: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      status: "starting",
    };

    session = {
      id: sessionId,
      state,
      cliSend: null,
      browserSockets: new Set(),
      pendingMessages: [],
      pendingPermissions: new Map(persisted?.pendingPermissions ?? []),
      messageHistory: persisted?.messageHistory ?? [],
      subscribers: new Map(),
      autoApproveConfig: { enabled: false, timeoutSeconds: 0, allowBash: false },
      autoApproveTimers: new Map(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Force-end a session that's stuck (process dead but status not ended). */
  forceEndSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Try updating persisted state directly
      const persisted = this.store.load(sessionId);
      if (persisted && persisted.state.status !== "ended") {
        persisted.state.status = "ended";
        persisted.endedAt = Date.now();
        this.store.saveSync(persisted);
        return true;
      }
      return false;
    }

    session.cliSend = null;

    // Cancel auto-approve timers
    for (const [, timer] of session.autoApproveTimers) {
      clearTimeout(timer);
    }
    session.autoApproveTimers.clear();
    session.pendingPermissions.clear();

    this.updateStatus(session, "ended");
    this.broadcastToBrowsers(session, { type: "cli_disconnected" });
    this.persistSession(session);
    return true;
  }

  getAllSessions(): ActiveSession[] {
    return [...this.sessions.values()];
  }

  // ── Subscriber system (for Telegram bridge, etc.) ─────────────────────

  /** Register a callback to receive CLI messages for a session. */
  subscribe(
    sessionId: string,
    subscriberId: string,
    callback: (msg: BrowserIncomingMessage) => void
  ): void {
    // Use ensureSession so subscriber works even if session isn't active yet
    const session = this.ensureSession(sessionId);
    session.subscribers.set(subscriberId, callback);
    console.log(`[ws-bridge] Subscriber "${subscriberId}" added to session ${sessionId.slice(0, 8)}`);
  }

  /** Remove a subscriber from a session. */
  unsubscribe(sessionId: string, subscriberId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.subscribers.delete(subscriberId);
    console.log(`[ws-bridge] Subscriber "${subscriberId}" removed from session ${sessionId.slice(0, 8)}`);
  }

  /** Inject a user message into a session's CLI (from external client). */
  injectUserMessage(sessionId: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.handleUserMessage(session, content);
  }

  /** Inject a multimodal message (text + images) into a session's CLI. */
  injectMultimodalMessage(
    sessionId: string,
    contentBlocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Record text parts in history
    const textParts = contentBlocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text);
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content: textParts.join("\n") || "[image]",
      timestamp: Date.now(),
    };
    session.messageHistory.push(historyMsg);
    this.broadcastToBrowsers(session, historyMsg);

    // Send multimodal content to CLI
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content: contentBlocks },
    });
    this.sendToCLI(session, ndjson);
    this.updateStatus(session, "busy");

    // Idea extraction from text parts only
    for (const text of textParts) {
      extractIdeaFromMessage(text);
    }
  }

  /** Send interrupt to a session's CLI (from external client). */
  injectInterrupt(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.handleInterrupt(session);
  }

  /** Respond to a pending permission request (from external client like Telegram). */
  injectPermissionResponse(
    sessionId: string,
    response: { request_id: string; behavior: "allow" | "deny" }
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.handlePermissionResponse(session, response);
  }

  /** Change model for a session (from external client). */
  injectSetModel(sessionId: string, model: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.handleSetModel(session, model);
  }

  /** Set auto-approve config for a session (from external client like Telegram). */
  setAutoApprove(sessionId: string, config: AutoApproveConfig): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.autoApproveConfig = config;
    console.log(
      `[ws-bridge] Auto-approve updated for session ${sessionId.slice(0, 8)}: enabled=${config.enabled}, timeout=${config.timeoutSeconds}s, bash=${config.allowBash}`
    );
  }

  /** Read session state (for external clients). */
  getSessionState(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)?.state;
  }

  /** Get message history for a session (for conversation sync). */
  getMessageHistory(sessionId: string): BrowserIncomingMessage[] {
    return this.sessions.get(sessionId)?.messageHistory ?? [];
  }

  // ── Pipe-based CLI connection (stdin/stdout) ───────────────────────────

  /** Called by CLILauncher when CLI process starts - connects stdin writer. */
  connectCLI(sessionId: string, sendFn: (data: string) => void): void {
    const session = this.ensureSession(sessionId);
    session.cliSend = sendFn;

    console.log(`[ws-bridge] CLI pipe connected for session ${sessionId}`);

    // Notify browsers
    this.broadcastToBrowsers(session, { type: "cli_connected" });

    // Flush queued messages
    if (session.pendingMessages.length > 0) {
      console.log(
        `[ws-bridge] Flushing ${session.pendingMessages.length} queued message(s)`
      );
      const queued = session.pendingMessages.splice(0);
      for (const ndjson of queued) {
        this.sendToCLI(session, ndjson);
      }
    }
  }

  /** Called by CLILauncher when CLI stdout has data - parse NDJSON and route. */
  feedCLIData(sessionId: string, raw: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(
        `[ws-bridge] CLI data for unknown session: ${sessionId}`
      );
      return;
    }

    // Each call should be a single NDJSON line (launcher splits on newlines)
    let msg: CLIMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      // Not JSON - might be a debug/verbose line, skip
      return;
    }
    this.routeCLIMessage(session, msg);
    this.persistSession(session);
  }

  /** Called by CLILauncher when CLI process exits. */
  disconnectCLI(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cliSend = null;

    console.log(
      `[ws-bridge] CLI pipe disconnected for session ${sessionId}`
    );

    // Notify browsers
    this.broadcastToBrowsers(session, { type: "cli_disconnected" });

    // Cancel auto-approve timers
    for (const [, timer] of session.autoApproveTimers) {
      clearTimeout(timer);
    }
    session.autoApproveTimers.clear();

    // Cancel pending permissions
    for (const [requestId] of session.pendingPermissions) {
      this.broadcastToBrowsers(session, {
        type: "permission_cancelled",
        request_id: requestId,
      });
    }
    session.pendingPermissions.clear();

    this.updateStatus(session, "ended");
    this.persistSession(session);
  }

  // ── Browser WebSocket handlers ───────────────────────────────────────────

  handleBrowserOpen(ws: ServerWebSocket<SocketData>, sessionId: string): void {
    const session = this.ensureSession(sessionId);
    session.browserSockets.add(ws);

    console.log(
      `[ws-bridge] Browser connected to session ${sessionId} (${session.browserSockets.size} viewer(s))`
    );

    // Send session init + message history
    this.sendToBrowser(ws, {
      type: "session_init",
      session: session.state,
    });

    if (session.messageHistory.length > 0) {
      this.sendToBrowser(ws, {
        type: "message_history",
        messages: session.messageHistory,
      });
    }

    // Send pending permissions
    for (const [, perm] of session.pendingPermissions) {
      this.sendToBrowser(ws, {
        type: "permission_request",
        request: perm,
      });
    }
  }

  handleBrowserMessage(
    ws: ServerWebSocket<SocketData>,
    raw: string | Buffer
  ): void {
    const data = typeof raw === "string" ? raw : raw.toString("utf-8");
    const socketData = ws.data as BrowserSocketData;
    const session = this.sessions.get(socketData.sessionId);
    if (!session) return;

    let msg: BrowserOutgoingMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn(`[ws-bridge] Invalid browser message: ${data.substring(0, 200)}`);
      return;
    }

    this.routeBrowserMessage(session, msg);
  }

  handleBrowserClose(ws: ServerWebSocket<SocketData>): void {
    const socketData = ws.data as BrowserSocketData;
    const session = this.sessions.get(socketData.sessionId);
    if (!session) return;

    session.browserSockets.delete(ws);
    console.log(
      `[ws-bridge] Browser disconnected from session ${socketData.sessionId} (${session.browserSockets.size} remaining)`
    );
  }

  // ── CLI message routing ──────────────────────────────────────────────────

  private routeCLIMessage(session: ActiveSession, msg: CLIMessage): void {
    switch (msg.type) {
      case "system":
        if ("subtype" in msg && msg.subtype === "init") {
          this.handleSystemInit(session, msg as CLISystemInitMessage);
        } else if ("subtype" in msg && msg.subtype === "status") {
          this.handleSystemStatus(session, msg);
        }
        break;
      case "assistant":
        this.handleAssistant(session, msg as CLIAssistantMessage);
        break;
      case "result":
        this.handleResult(session, msg as CLIResultMessage);
        break;
      case "stream_event":
        this.handleStreamEvent(session, msg as CLIStreamEventMessage);
        break;
      case "control_request":
        this.handleControlRequest(session, msg as CLIControlRequestMessage);
        break;
      case "tool_progress":
        this.handleToolProgress(session, msg as CLIToolProgressMessage);
        break;
      case "keep_alive":
      case "user":
        // silent — CLI echoes user messages back, ignore them
        break;
      default:
        // Unknown message type - log but don't crash
        console.log(
          `[ws-bridge] Unknown CLI message type: ${(msg as Record<string, unknown>).type}`
        );
    }
  }

  private handleSystemInit(
    session: ActiveSession,
    msg: CLISystemInitMessage
  ): void {
    session.state = {
      ...session.state,
      session_id: msg.session_id,
      model: msg.model,
      cwd: msg.cwd,
      tools: msg.tools,
      permissionMode: msg.permissionMode,
      claude_code_version: msg.claude_code_version,
      mcp_servers: msg.mcp_servers,
      status: "idle",
    };

    console.log(
      `[ws-bridge] Session ${session.id} initialized: model=${msg.model}, cwd=${msg.cwd}`
    );

    this.broadcastToBrowsers(session, {
      type: "session_init",
      session: session.state,
    });

    this.updateStatus(session, "idle");
  }

  private handleSystemStatus(
    session: ActiveSession,
    msg: CLIMessage
  ): void {
    const statusMsg = msg as { status: string | null };
    if (statusMsg.status === "compacting") {
      this.updateStatus(session, "compacting");
    } else {
      this.updateStatus(session, "idle");
    }
  }

  private handleAssistant(
    session: ActiveSession,
    msg: CLIAssistantMessage
  ): void {
    // Skip assistant messages that only contain thinking blocks (no visible content).
    // These are partial messages from --include-partial-messages that render as empty bubbles.
    const content = msg.message.content;
    if (Array.isArray(content)) {
      const hasVisible = content.some(
        (b) =>
          (b.type === "text" && b.text?.trim()) ||
          b.type === "tool_use" ||
          b.type === "tool_result"
      );
      if (!hasVisible) {
        this.updateStatus(session, "busy");
        return;
      }
    }

    const browserMsg: BrowserIncomingMessage = {
      type: "assistant",
      message: msg.message,
      parent_tool_use_id: msg.parent_tool_use_id,
      timestamp: Date.now(),
    };

    session.messageHistory.push(browserMsg);
    this.broadcastToBrowsers(session, browserMsg);
    this.updateStatus(session, "busy");
  }

  private handleResult(
    session: ActiveSession,
    msg: CLIResultMessage
  ): void {
    // Update cumulative stats
    session.state.total_cost_usd = msg.total_cost_usd;
    session.state.num_turns = msg.num_turns;
    if (msg.total_lines_added !== undefined) {
      session.state.total_lines_added = msg.total_lines_added;
    }
    if (msg.total_lines_removed !== undefined) {
      session.state.total_lines_removed = msg.total_lines_removed;
    }

    const browserMsg: BrowserIncomingMessage = {
      type: "result",
      data: msg,
    };

    session.messageHistory.push(browserMsg);
    this.broadcastToBrowsers(session, browserMsg);
    this.updateStatus(session, "idle");

    // Auto-save session summary to Neural Memory (fire-and-forget, only meaningful sessions)
    if (msg.num_turns >= 2 && !msg.is_error) {
      this.saveSessionSummary(session, msg).catch(() => {});
    }

  }

  private handleStreamEvent(
    session: ActiveSession,
    msg: CLIStreamEventMessage
  ): void {
    // Pass through to browsers (real-time streaming text)
    this.broadcastToBrowsers(session, {
      type: "stream_event",
      event: msg.event,
      parent_tool_use_id: msg.parent_tool_use_id,
    });
  }

  // Tools that are safe state transitions and should never require manual approval.
  // NOTE: ExitPlanMode is NOT here — it needs user to see and approve the plan.
  // NOTE: AskUserQuestion is NOT here — it requires the user to see and answer the question.
  private static readonly ALWAYS_APPROVE_TOOLS = new Set([
    "EnterPlanMode",
  ]);

  private handleControlRequest(
    session: ActiveSession,
    msg: CLIControlRequestMessage
  ): void {
    const toolName = msg.request.tool_name ?? "";
    const subtype = msg.request.subtype;

    // Auto-approve safe state transition tools immediately (any subtype)
    if (WsBridge.ALWAYS_APPROVE_TOOLS.has(toolName)) {
      console.log(
        `[ws-bridge] Auto-approving safe tool ${toolName} (subtype=${subtype}, request ${msg.request_id.slice(0, 8)})`
      );
      this.handlePermissionResponse(session, {
        request_id: msg.request_id,
        behavior: "allow",
      });
      return;
    }

    const desc = msg.request.description ?? "";

    // Debug: log control_request for troubleshooting
    console.log(
      `[ws-bridge] control_request: tool_name=${toolName}, subtype=${subtype}, desc=${desc.slice(0, 80)}, request_id=${msg.request_id.slice(0, 8)}, keys=${Object.keys(msg.request).join(",")}`
    );

    // For unrecognized subtypes, still create a permission request so it's not silently dropped
    const perm: PermissionRequest = {
      request_id: msg.request_id,
      tool_name: toolName || subtype || "unknown",
      input: msg.request.input ?? {},
      permission_suggestions: msg.request.permission_suggestions,
      description: msg.request.description,
      tool_use_id: msg.request.tool_use_id ?? "",
      timestamp: Date.now(),
    };

    session.pendingPermissions.set(msg.request_id, perm);

    this.broadcastToBrowsers(session, {
      type: "permission_request",
      request: perm,
    });

    // Auto-approve timer
    this.startAutoApproveTimer(session, perm);
  }

  private handleToolProgress(
    session: ActiveSession,
    msg: CLIToolProgressMessage
  ): void {
    this.broadcastToBrowsers(session, {
      type: "tool_progress",
      tool_use_id: msg.tool_use_id,
      tool_name: msg.tool_name,
      elapsed_time_seconds: msg.elapsed_time_seconds,
    });
  }

  // ── Browser message routing ──────────────────────────────────────────────

  private routeBrowserMessage(
    session: ActiveSession,
    msg: BrowserOutgoingMessage
  ): void {
    switch (msg.type) {
      case "user_message":
        this.handleUserMessage(session, msg.content);
        break;
      case "permission_response":
        this.handlePermissionResponse(session, msg);
        break;
      case "interrupt":
        this.handleInterrupt(session);
        break;
      case "set_model":
        this.handleSetModel(session, msg.model);
        break;
      case "set_auto_approve":
        session.autoApproveConfig = msg.config;
        console.log(
          `[ws-bridge] Auto-approve set via browser: enabled=${msg.config.enabled}, timeout=${msg.config.timeoutSeconds}s`
        );
        break;
    }
  }

  private handleUserMessage(session: ActiveSession, content: string): void {
    // Record in history
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content,
      timestamp: Date.now(),
    };
    session.messageHistory.push(historyMsg);

    // Also broadcast to other browsers
    this.broadcastToBrowsers(session, historyMsg);

    // Send to CLI as NDJSON via stdin pipe
    // Format: {"type":"user","message":{"role":"user","content":"..."}}
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    this.sendToCLI(session, ndjson);
    this.updateStatus(session, "busy");

    // Fire-and-forget: extract idea if message contains signal phrases
    extractIdeaFromMessage(content);
  }

  private handlePermissionResponse(
    session: ActiveSession,
    msg: {
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: unknown[];
    }
  ): void {
    // Clear auto-approve timer if pending
    const timer = session.autoApproveTimers.get(msg.request_id);
    if (timer) {
      clearTimeout(timer);
      session.autoApproveTimers.delete(msg.request_id);
    }

    session.pendingPermissions.delete(msg.request_id);

    let ndjson: string;
    if (msg.behavior === "allow") {
      ndjson = JSON.stringify({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: msg.request_id,
          response: {
            behavior: "allow",
            updatedInput: {},
            ...(msg.updated_permissions
              ? { updatedPermissions: msg.updated_permissions }
              : {}),
          },
        },
      });
    } else {
      ndjson = JSON.stringify({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: msg.request_id,
          response: {
            behavior: "deny",
            message: "Denied by user",
          },
        },
      });
    }

    this.sendToCLI(session, ndjson);

    // Notify other browsers the permission was handled
    this.broadcastToBrowsers(session, {
      type: "permission_cancelled",
      request_id: msg.request_id,
    });
  }

  private handleInterrupt(session: ActiveSession): void {
    const ndjson = JSON.stringify({
      type: "control_request",
      request: { subtype: "interrupt" },
    });
    this.sendToCLI(session, ndjson);
  }

  /** Map display model names to valid Claude Code CLI model identifiers.
   *  See: https://code.claude.com/docs/en/model-config#extended-context */
  private static readonly MODEL_MAP: Record<string, string> = {
    "sonnet": "sonnet",
    "opus": "opus",
    "haiku": "haiku",
    "opus-1m": "opus[1m]",
    "sonnet-1m": "sonnet[1m]",
    "opusplan": "opusplan",
  };

  private handleSetModel(session: ActiveSession, model: string): void {
    const cliModel = WsBridge.MODEL_MAP[model] ?? model;
    const ndjson = JSON.stringify({
      type: "control_request",
      request: { subtype: "set_model", model: cliModel },
    });
    this.sendToCLI(session, ndjson);
    // Store the display name for UI, but CLI uses the mapped name
    session.state.model = model;

    this.broadcastToBrowsers(session, {
      type: "session_update",
      session: { model },
    });
  }

  // ── Auto-approve timer ──────────────────────────────────────────────────

  private startAutoApproveTimer(session: ActiveSession, perm: PermissionRequest): void {
    const config = session.autoApproveConfig;
    if (!config.enabled || config.timeoutSeconds <= 0) return;

    // Skip Bash if allowBash is false
    if (perm.tool_name === "Bash" && !config.allowBash) {
      console.log(
        `[ws-bridge] Auto-approve skipped for Bash (allowBash=false), request ${perm.request_id.slice(0, 8)}`
      );
      return;
    }

    const timer = setTimeout(() => {
      session.autoApproveTimers.delete(perm.request_id);
      // Only auto-approve if still pending
      if (!session.pendingPermissions.has(perm.request_id)) return;

      console.log(
        `[ws-bridge] Auto-approving ${perm.tool_name} after ${config.timeoutSeconds}s (request ${perm.request_id.slice(0, 8)})`
      );
      this.handlePermissionResponse(session, {
        request_id: perm.request_id,
        behavior: "allow",
      });
    }, config.timeoutSeconds * 1000);

    session.autoApproveTimers.set(perm.request_id, timer);
  }

  // ── Transport helpers ────────────────────────────────────────────────────

  private sendToCLI(session: ActiveSession, ndjson: string): void {
    if (!session.cliSend) {
      console.log(
        `[ws-bridge] CLI not connected for ${session.id}, queuing message`
      );
      session.pendingMessages.push(ndjson);
      return;
    }

    try {
      session.cliSend(ndjson + "\n");
    } catch (err) {
      console.error(`[ws-bridge] Failed to send to CLI:`, err);
      session.pendingMessages.push(ndjson);
    }
  }

  private sendToBrowser(
    ws: ServerWebSocket<SocketData>,
    msg: BrowserIncomingMessage
  ): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // browser disconnected
    }
  }

  private broadcastToBrowsers(
    session: ActiveSession,
    msg: BrowserIncomingMessage
  ): void {
    const payload = JSON.stringify(msg);
    for (const ws of session.browserSockets) {
      try {
        ws.send(payload);
      } catch {
        session.browserSockets.delete(ws);
      }
    }

    // Notify external subscribers (Telegram bridge, etc.)
    for (const [id, callback] of session.subscribers) {
      try {
        callback(msg);
      } catch (err) {
        console.error(`[ws-bridge] Subscriber "${id}" callback error:`, err);
      }
    }
  }

  private updateStatus(session: ActiveSession, status: SessionStatus): void {
    if (session.state.status === status) return;
    session.state.status = status;

    this.broadcastToBrowsers(session, {
      type: "status_change",
      status: status === "busy" ? "running" : status === "compacting" ? "compacting" : "idle",
    });

    this.onStatusChange?.(session.id, status);
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async saveSessionSummary(
    session: ActiveSession,
    result: CLIResultMessage
  ): Promise<void> {
    const nmUrl = process.env.NM_URL || "http://localhost:8001";
    // Derive project name from cwd (last path segment)
    const cwd = session.state.cwd ?? "";
    const projectName = cwd.split(/[/\\]/).filter(Boolean).pop() ?? "unknown";

    // Extract last few text exchanges for context (keep lightweight)
    const textPairs: string[] = [];
    for (const msg of session.messageHistory.slice(-20)) {
      if (msg.type === "assistant") {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          const text = content
            .filter((b: { type: string; text?: string }) => b.type === "text" && b.text?.trim())
            .map((b: { type: string; text?: string }) => b.text ?? "")
            .join(" ")
            .slice(0, 300);
          if (text) textPairs.push(`A: ${text}`);
        }
      } else if (msg.type === "result") {
        // skip
      }
    }

    const summary = [
      `[SESSION] Project: ${projectName}`,
      `Turns: ${result.num_turns} | Cost: $${result.total_cost_usd.toFixed(3)} | Duration: ${Math.round((result.duration_ms ?? 0) / 1000)}s`,
      textPairs.length > 0 ? `\nKey exchanges:\n${textPairs.slice(-5).join("\n")}` : "",
    ].filter(Boolean).join("\n");

    await fetch(`${nmUrl}/memory/encode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Brain-ID": "laptop-brain" },
      body: JSON.stringify({
        content: summary,
        tags: ["session", `project:${projectName}`, "auto-summary"],
        metadata: {
          type: "session",
          project: projectName,
          turns: result.num_turns,
          cost_usd: result.total_cost_usd,
          priority: Math.min(10, Math.max(3, result.num_turns)),
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  }

  private persistSession(session: ActiveSession): void {
    const persisted: PersistedSession = {
      id: session.id,
      state: session.state,
      messageHistory: session.messageHistory,
      pendingPermissions: [...session.pendingPermissions.entries()],
      startedAt:
        this.store.load(session.id)?.startedAt ?? Date.now(),
    };
    this.store.save(persisted);
  }
}
