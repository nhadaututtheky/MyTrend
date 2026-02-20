// Companion Service API client
// Connects to the Bun+Hono bridge on localhost:3457

const COMPANION_URL = 'http://localhost:3457';
const COMPANION_WS = 'ws://localhost:3457';

// ─── Types (mirrors companion/src/session-types.ts) ──────────────────────────

export type CompanionSessionStatus =
  | 'starting'
  | 'connected'
  | 'idle'
  | 'busy'
  | 'compacting'
  | 'ended'
  | 'error';

export interface CompanionSessionState {
  session_id: string;
  model: string;
  cwd: string;
  tools: string[];
  permissionMode: string;
  claude_code_version: string;
  mcp_servers: { name: string; status: string }[];
  total_cost_usd: number;
  num_turns: number;
  total_lines_added: number;
  total_lines_removed: number;
  status: CompanionSessionStatus;
}

export interface CompanionSessionListItem {
  id: string;
  projectSlug?: string;
  model: string;
  status: CompanionSessionStatus;
  cwd: string;
  total_cost_usd: number;
  num_turns: number;
  startedAt: number;
  endedAt?: number;
}

export interface CompanionProjectProfile {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
}

export interface PermissionRequest {
  request_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  description?: string;
  tool_use_id: string;
  timestamp: number;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
  thinking?: string;
}

export interface AssistantMessageData {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

// Messages received from the bridge
export type BridgeMessage =
  | { type: 'session_init'; session: CompanionSessionState }
  | { type: 'session_update'; session: Partial<CompanionSessionState> }
  | { type: 'assistant'; message: AssistantMessageData; parent_tool_use_id: string | null; timestamp: number }
  | { type: 'stream_event'; event: unknown; parent_tool_use_id: string | null }
  | { type: 'result'; data: { total_cost_usd: number; num_turns: number; duration_ms: number } }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'permission_cancelled'; request_id: string }
  | { type: 'tool_progress'; tool_use_id: string; tool_name: string; elapsed_time_seconds: number }
  | { type: 'status_change'; status: string }
  | { type: 'error'; message: string }
  | { type: 'cli_disconnected' }
  | { type: 'cli_connected' }
  | { type: 'user_message'; content: string; timestamp: number }
  | { type: 'message_history'; messages: BridgeMessage[] };

// ─── REST API ────────────────────────────────────────────────────────────────

export async function checkCompanionHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${COMPANION_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listSessions(): Promise<CompanionSessionListItem[]> {
  const res = await fetch(`${COMPANION_URL}/api/sessions`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return res.json();
}

export async function createSession(opts: {
  projectDir: string;
  model?: string;
  permissionMode?: string;
  prompt?: string;
  resume?: boolean;
}): Promise<{ session_id: string; pid: number; ws_url: string }> {
  const res = await fetch(`${COMPANION_URL}/api/sessions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `Create failed: ${res.status}`);
  }
  return res.json();
}

export async function killSession(sessionId: string): Promise<void> {
  const res = await fetch(`${COMPANION_URL}/api/sessions/${sessionId}/kill`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Kill failed: ${res.status}`);
}

export async function listProjects(): Promise<CompanionProjectProfile[]> {
  const res = await fetch(`${COMPANION_URL}/api/projects`);
  if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
  return res.json();
}

// ─── WebSocket Client ────────────────────────────────────────────────────────

export interface CompanionConnection {
  send: (content: string) => void;
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
  interrupt: () => void;
  setModel: (model: string) => void;
  disconnect: () => void;
  readonly readyState: number;
  readonly isReconnecting: boolean;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = 10;

export function connectToSession(
  sessionId: string,
  onMessage: (msg: BridgeMessage) => void,
  onClose?: () => void,
  onError?: (err: Event) => void,
  onReconnecting?: (attempt: number) => void,
): CompanionConnection {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;
  let isReconnecting = false;

  function createWS(): WebSocket {
    const socket = new WebSocket(`${COMPANION_WS}/ws/browser/${sessionId}`);

    socket.onopen = () => {
      reconnectAttempt = 0;
      isReconnecting = false;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as BridgeMessage;
        onMessage(msg);
      } catch (err) {
        console.error('[companion] Failed to parse WS message:', err);
      }
    };

    socket.onclose = () => {
      if (intentionalClose) {
        onClose?.();
        return;
      }

      // Auto-reconnect with exponential backoff
      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        isReconnecting = true;
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        reconnectAttempt++;
        onReconnecting?.(reconnectAttempt);
        console.log(`[companion] WS closed, reconnecting in ${delay}ms (attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimer = setTimeout(() => {
          ws = createWS();
        }, delay);
      } else {
        isReconnecting = false;
        console.error('[companion] Max reconnect attempts reached');
        onClose?.();
      }
    };

    socket.onerror = (err) => {
      if (!isReconnecting) {
        onError?.(err);
      }
    };

    return socket;
  }

  ws = createWS();

  function sendJSON(data: unknown): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  return {
    send(content: string) {
      sendJSON({ type: 'user_message', content });
    },
    approve(requestId: string) {
      sendJSON({ type: 'permission_response', request_id: requestId, behavior: 'allow' });
    },
    deny(requestId: string) {
      sendJSON({ type: 'permission_response', request_id: requestId, behavior: 'deny' });
    },
    interrupt() {
      sendJSON({ type: 'interrupt' });
    },
    setModel(model: string) {
      sendJSON({ type: 'set_model', model });
    },
    disconnect() {
      intentionalClose = true;
      isReconnecting = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
    get readyState() {
      return ws?.readyState ?? WebSocket.CLOSED;
    },
    get isReconnecting() {
      return isReconnecting;
    },
  };
}
