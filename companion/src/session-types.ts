// Types for the WebSocket bridge between Claude Code CLI and the browser
// Adapted from vibe-companion reference, simplified for MyTrend

// ─── CLI Message Types (NDJSON from Claude Code CLI) ─────────────────────────

export interface CLISystemInitMessage {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: string;
  claude_code_version: string;
  slash_commands: string[];
  uuid: string;
}

export interface CLISystemStatusMessage {
  type: "system";
  subtype: "status";
  status: "compacting" | null;
  permissionMode?: string;
  uuid: string;
  session_id: string;
}

export interface CLIAssistantMessage {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
    usage: TokenUsage;
  };
  parent_tool_use_id: string | null;
  error?: string;
  uuid: string;
  session_id: string;
}

export interface CLIResultMessage {
  type: "result";
  subtype:
    | "success"
    | "error_during_execution"
    | "error_max_turns"
    | "error_max_budget_usd";
  is_error: boolean;
  result?: string;
  errors?: string[];
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  stop_reason: string | null;
  usage: TokenUsage;
  total_lines_added?: number;
  total_lines_removed?: number;
  uuid: string;
  session_id: string;
}

export interface CLIStreamEventMessage {
  type: "stream_event";
  event: unknown;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

export interface CLIToolProgressMessage {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  uuid: string;
  session_id: string;
}

export interface CLIControlRequestMessage {
  type: "control_request";
  request_id: string;
  request: {
    subtype: "can_use_tool";
    tool_name: string;
    input: Record<string, unknown>;
    permission_suggestions?: PermissionUpdate[];
    description?: string;
    tool_use_id: string;
  };
}

export interface CLIKeepAliveMessage {
  type: "keep_alive";
}

export type CLIMessage =
  | CLISystemInitMessage
  | CLISystemStatusMessage
  | CLIAssistantMessage
  | CLIResultMessage
  | CLIStreamEventMessage
  | CLIToolProgressMessage
  | CLIControlRequestMessage
  | CLIKeepAliveMessage;

// ─── Content Block Types ─────────────────────────────────────────────────────

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | ContentBlock[];
      is_error?: boolean;
    }
  | { type: "thinking"; thinking: string; budget_tokens?: number };

// ─── Token Usage ─────────────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

// ─── Browser Messages (browser <-> bridge) ───────────────────────────────────

/** Messages the browser sends TO the bridge */
export type BrowserOutgoingMessage =
  | {
      type: "user_message";
      content: string;
      session_id?: string;
    }
  | {
      type: "permission_response";
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: PermissionUpdate[];
    }
  | { type: "interrupt" }
  | { type: "set_model"; model: string }
  | { type: "set_auto_approve"; config: AutoApproveConfig };

/** Messages the bridge sends TO the browser */
export type BrowserIncomingMessage =
  | { type: "session_init"; session: SessionState }
  | { type: "session_update"; session: Partial<SessionState> }
  | {
      type: "assistant";
      message: CLIAssistantMessage["message"];
      parent_tool_use_id: string | null;
      timestamp: number;
    }
  | {
      type: "stream_event";
      event: unknown;
      parent_tool_use_id: string | null;
    }
  | { type: "result"; data: CLIResultMessage }
  | { type: "permission_request"; request: PermissionRequest }
  | { type: "permission_cancelled"; request_id: string }
  | {
      type: "tool_progress";
      tool_use_id: string;
      tool_name: string;
      elapsed_time_seconds: number;
    }
  | {
      type: "status_change";
      status: "compacting" | "idle" | "running" | null;
    }
  | { type: "error"; message: string }
  | { type: "cli_disconnected" }
  | { type: "cli_connected" }
  | {
      type: "user_message";
      content: string;
      timestamp: number;
    }
  | { type: "message_history"; messages: BrowserIncomingMessage[] };

// ─── Session State ───────────────────────────────────────────────────────────

export type SessionStatus =
  | "starting"
  | "connected"
  | "idle"
  | "busy"
  | "compacting"
  | "ended"
  | "error";

export interface SessionState {
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
  status: SessionStatus;
}

// ─── Permission Types ────────────────────────────────────────────────────────

export type PermissionDestination =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "session";

export type PermissionUpdate =
  | {
      type: "addRules";
      rules: { toolName: string; ruleContent?: string }[];
      behavior: "allow" | "deny" | "ask";
      destination: PermissionDestination;
    }
  | {
      type: "replaceRules";
      rules: { toolName: string; ruleContent?: string }[];
      behavior: "allow" | "deny" | "ask";
      destination: PermissionDestination;
    }
  | { type: "setMode"; mode: string; destination: PermissionDestination };

export interface PermissionRequest {
  request_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  permission_suggestions?: PermissionUpdate[];
  description?: string;
  tool_use_id: string;
  timestamp: number;
}

// ─── Auto-Approve Config ─────────────────────────────────────────────────

export interface AutoApproveConfig {
  enabled: boolean;
  timeoutSeconds: number; // 0 = disabled, 15/30/60
  allowBash: boolean; // if false, Bash tools require manual approval
}

// ─── Project Profile ─────────────────────────────────────────────────────────

export interface ProjectProfile {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
  envVars?: Record<string, string>;
}

// ─── Persisted Session ───────────────────────────────────────────────────────

export interface PersistedSession {
  id: string;
  projectSlug?: string;
  state: SessionState;
  messageHistory: BrowserIncomingMessage[];
  pendingPermissions: [string, PermissionRequest][];
  pid?: number;
  startedAt: number;
  endedAt?: number;
}

// ─── REST API Types ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  projectDir: string;
  model?: string;
  permissionMode?: string;
  prompt?: string;
  resume?: boolean;
}

export interface SessionListItem {
  id: string;
  projectSlug?: string;
  model: string;
  status: SessionStatus;
  cwd: string;
  total_cost_usd: number;
  num_turns: number;
  startedAt: number;
  endedAt?: number;
}
