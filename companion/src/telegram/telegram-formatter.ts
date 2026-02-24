// Claude markdown → Telegram HTML converter + formatting helpers

import type { AutoApproveConfig, CLIResultMessage, ContentBlock, PermissionRequest, SessionState } from "../session-types.js";
import type {
  TelegramSessionMapping,
  TelegramInlineKeyboardMarkup,
  TelegramInlineKeyboardButton,
} from "./telegram-types.js";
import type { ProjectProfile } from "../session-types.js";

// ─── Markdown to Telegram HTML ──────────────────────────────────────────────

/** Convert Claude's markdown output to Telegram-safe HTML. */
export function toTelegramHTML(markdown: string): string {
  // Extract code blocks first (before escaping) to preserve raw content
  const codeBlocks: string[] = [];
  let text = markdown.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const langAttr = lang ? ` class="language-${lang}"` : "";
      const escaped = escapeHTML(code.trimEnd());
      const placeholder = `\x00CB${codeBlocks.length}\x00`;
      codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
      return placeholder;
    }
  );

  // Extract inline code before escaping
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const placeholder = `\x00IC${inlineCodes.length}\x00`;
    inlineCodes.push(`<code>${escapeHTML(code)}</code>`);
    return placeholder;
  });

  // Now escape the prose text
  text = escapeHTML(text);

  // Bold: **text** or __text__ → <b>text</b>
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ → <i>text</i>
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<i>$1</i>");
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<i>$1</i>");

  // Strikethrough: ~~text~~ → <s>text</s>
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Headings: # text → <b>text</b> (Telegram has no heading tags)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Links: [text](url) → <a href="url">text</a>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes: > text → (just indent with bar)
  text = text.replace(/^&gt;\s?(.*)$/gm, "| $1");

  // Restore code blocks and inline codes
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`\x00CB${i}\x00`, codeBlocks[i]);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    text = text.replace(`\x00IC${i}\x00`, inlineCodes[i]);
  }

  // Clean up excessive newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Content block extraction ───────────────────────────────────────────────

/** Extract text from assistant message content blocks. */
export function extractText(content: ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === "text" && block.text?.trim()) {
      parts.push(block.text);
    }
  }

  return parts.join("\n\n");
}

/** Extract tool_use actions from content blocks. */
export function extractToolActions(content: ContentBlock[]): string[] {
  const actions: string[] = [];

  for (const block of content) {
    if (block.type === "tool_use") {
      actions.push(formatToolAction(block.name, block.input));
    }
  }

  return actions;
}

/** Extract tool_use actions as a single compact feed message. Returns null if no tools. */
export function formatToolFeed(content: ContentBlock[]): string | null {
  const actions: string[] = [];
  for (const block of content) {
    if (block.type === "tool_use") {
      actions.push(formatToolAction(block.name, block.input));
    }
  }
  if (actions.length === 0) return null;
  return actions.join("\n");
}

// ─── Tool action formatting ─────────────────────────────────────────────────

const TOOL_EMOJI: Record<string, string> = {
  Read: "📖",
  Write: "📝",
  Edit: "✏️",
  Bash: "💻",
  Glob: "🔍",
  Grep: "🔎",
  Task: "🤖",
  WebFetch: "🌐",
  WebSearch: "🌐",
  NotebookEdit: "📓",
  AskUserQuestion: "❓",
  EnterPlanMode: "📋",
  ExitPlanMode: "🏁",
};

export function formatToolAction(name: string, input: Record<string, unknown>): string {
  const emoji = TOOL_EMOJI[name] ?? "🔧";

  switch (name) {
    case "Read":
      return `${emoji} Reading <code>${shortenPath(input.file_path as string)}</code>`;
    case "Write":
      return `${emoji} Writing <code>${shortenPath(input.file_path as string)}</code>`;
    case "Edit":
      return `${emoji} Editing <code>${shortenPath(input.file_path as string)}</code>`;
    case "Bash":
      return `${emoji} Running <code>${truncate(input.command as string, 60)}</code>`;
    case "Glob":
      return `${emoji} Searching <code>${input.pattern}</code>`;
    case "Grep":
      return `${emoji} Searching for <code>${truncate(input.pattern as string, 40)}</code>`;
    case "Task":
      return `${emoji} Spawning sub-agent: ${escapeHTML(truncate(input.description as string ?? input.prompt as string, 50))}`;
    case "WebFetch":
    case "WebSearch":
      return `${emoji} ${name === "WebSearch" ? "Searching" : "Fetching"} web...`;
    case "AskUserQuestion":
      return `${emoji} Asking question...`;
    case "EnterPlanMode":
      return `${emoji} Entering plan mode...`;
    case "ExitPlanMode":
      return `${emoji} Exiting plan mode...`;
    default:
      return `${emoji} ${name}`;
  }
}

// ─── Result formatting ──────────────────────────────────────────────────────

export function formatResult(msg: CLIResultMessage): string {
  const cost = `$${msg.total_cost_usd.toFixed(3)}`;
  const turns = `${msg.num_turns} turn${msg.num_turns !== 1 ? "s" : ""}`;
  const duration = `${(msg.duration_ms / 1000).toFixed(1)}s`;

  const parts = [cost, turns];

  if (msg.total_lines_added || msg.total_lines_removed) {
    const lines = `+${msg.total_lines_added ?? 0}/-${msg.total_lines_removed ?? 0} lines`;
    parts.push(lines);
  }

  parts.push(duration);

  const icon = msg.is_error ? "⚠️" : "✅";
  let text = `${icon} Done! ${parts.join(" | ")}`;

  // Add error details when present
  if (msg.is_error) {
    if (msg.subtype === "error_max_turns") {
      text += "\nMax turns reached. Break into smaller tasks or /new.";
    } else if (msg.subtype === "error_max_budget_usd") {
      text += "\nBudget limit reached.";
    } else if (msg.errors?.length) {
      text += `\n${escapeHTML(truncate(msg.errors[0], 200))}`;
    }
  }

  return text;
}

// ─── Status formatting ──────────────────────────────────────────────────────

export function formatStatus(mapping: TelegramSessionMapping, sessionStatus: string): string {
  return [
    "<b>Session Status</b>",
    `Project: <code>${mapping.projectSlug}</code>`,
    `Model: <code>${mapping.model}</code> | Status: <code>${sessionStatus}</code>`,
    `Session: <code>${mapping.sessionId.slice(0, 8)}</code>`,
  ].join("\n");
}

/** Compact pinned status message — updated in-place as session progresses. */
export function formatPinnedStatus(
  mapping: TelegramSessionMapping,
  session?: SessionState
): string {
  const status = session?.status ?? "starting";
  const statusEmoji =
    status === "busy" ? "🔵" :
    status === "idle" ? "🟢" :
    status === "compacting" ? "🟡" :
    status === "ended" ? "⚫" : "⚪";

  const lines = [
    `<b>${mapping.projectSlug}</b> · ${mapping.model} · ${statusEmoji} ${status}`,
  ];

  if (session) {
    const parts: string[] = [`$${session.total_cost_usd.toFixed(3)}`];
    parts.push(`${session.num_turns} turns`);
    if (session.total_lines_added || session.total_lines_removed) {
      parts.push(`+${session.total_lines_added}/-${session.total_lines_removed}`);
    }
    lines.push(parts.join(" · "));
  }

  return lines.join("\n");
}

export function formatProjectList(profiles: ProjectProfile[]): string {
  if (profiles.length === 0) return "No projects configured.";

  const lines = ["<b>Available Projects</b>", ""];
  for (const p of profiles) {
    lines.push(`/<code>${p.slug}</code> - ${p.name}`);
    lines.push(`  <code>${p.dir}</code>`);
  }
  lines.push("");
  lines.push("Use <code>/project &lt;slug&gt;</code> to connect.");
  return lines.join("\n");
}

export function formatHelp(): string {
  return [
    "<b>Commands</b>",
    "",
    "/start - Projects &amp; quick start",
    "/project &lt;slug&gt; - Open project (creates topic)",
    "/switch - Open another project",
    "/model - Change model",
    "/status - Session info (all sessions in General)",
    "/autoapprove - Auto-approve settings",
    "/translate - Toggle Vi→En auto-translate",
    "/cancel - Interrupt Claude",
    "/stop - End session (this topic)",
    "/stopall - End all sessions",
    "/new - Restart session",
    "/help - This message",
    "",
    "Each project runs in its own topic.",
    "Just type to chat. Buttons for everything else.",
  ].join("\n");
}

export function formatWelcome(botName: string): string {
  return [
    `<b>${escapeHTML(botName)}</b>`,
    "",
    "Control Claude Code from Telegram.",
    "Select a project, then type your request.",
    "",
    "Models: <code>sonnet</code> · <code>opus</code> · <code>haiku</code> · <code>sonnet 1M</code> · <code>opus 1M</code> · <code>opusplan</code>",
  ].join("\n");
}

export function formatConnected(profile: ProjectProfile, model: string): string {
  return [
    `<b>Connected to ${escapeHTML(profile.name)}</b>`,
    `<code>${escapeHTML(profile.dir)}</code>`,
    `${model} | ${profile.permissionMode ?? "bypassPermissions"}`,
    "",
    "Send any message to chat with Claude.",
  ].join("\n");
}

// ─── Inline Keyboard Builders ────────────────────────────────────────────────

/** Project selection keyboard — 2 per row, primary style. HQ at bottom. */
export function buildProjectKeyboard(profiles: ProjectProfile[]): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardButton[][] = [];
  const regular = profiles.filter((p) => p.slug !== "hub");
  const hub = profiles.find((p) => p.slug === "hub");

  for (let i = 0; i < regular.length; i += 2) {
    const row: TelegramInlineKeyboardButton[] = [
      { text: regular[i].name, callback_data: `proj:${regular[i].slug}`, style: "primary" },
    ];
    if (regular[i + 1]) {
      row.push({
        text: regular[i + 1].name,
        callback_data: `proj:${regular[i + 1].slug}`,
        style: "primary",
      });
    }
    rows.push(row);
  }

  if (hub) {
    rows.push([{ text: "\u{1F3E0} HQ \u2014 Cross-Project", callback_data: "proj:hub" }]);
  }

  return { inline_keyboard: rows };
}

/** Model selection keyboard — checkmark on current model. */
export function buildModelKeyboard(currentModel?: string): TelegramInlineKeyboardMarkup {
  const btn = (m: string, label?: string): TelegramInlineKeyboardButton => ({
    text: m === currentModel ? `${label ?? m} ✓` : (label ?? m),
    callback_data: `model:${m}`,
    style: m === currentModel ? "success" : undefined,
  });
  return {
    inline_keyboard: [
      [btn("sonnet"), btn("opus"), btn("haiku")],
      [btn("sonnet-1m", "sonnet 1M"), btn("opus-1m", "opus 1M"), btn("opusplan")],
    ],
  };
}

/** Permission mode selection keyboard. */
export function buildModeKeyboard(currentMode?: string): TelegramInlineKeyboardMarkup {
  const modes: { label: string; value: string }[] = [
    { label: "Bypass", value: "bypassPermissions" },
    { label: "Plan", value: "plan" },
    { label: "Default", value: "default" },
    { label: "Accept Edits", value: "acceptEdits" },
  ];
  const rows: TelegramInlineKeyboardButton[][] = [];
  for (let i = 0; i < modes.length; i += 2) {
    const row: TelegramInlineKeyboardButton[] = [
      {
        text: modes[i].value === currentMode ? `${modes[i].label} ✓` : modes[i].label,
        callback_data: `mode:${modes[i].value}`,
        style: modes[i].value === currentMode ? "success" : undefined,
      },
    ];
    if (modes[i + 1]) {
      row.push({
        text: modes[i + 1].value === currentMode ? `${modes[i + 1].label} ✓` : modes[i + 1].label,
        callback_data: `mode:${modes[i + 1].value}`,
        style: modes[i + 1].value === currentMode ? "success" : undefined,
      });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

/** Stop confirmation keyboard — danger style. */
export function buildStopConfirmKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Yes, stop", callback_data: "stop:confirm", style: "danger" },
        { text: "Cancel", callback_data: "stop:cancel" },
      ],
    ],
  };
}

/** New session confirmation keyboard — danger style. */
export function buildNewConfirmKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Yes, restart", callback_data: "new:confirm", style: "danger" },
        { text: "Cancel", callback_data: "new:cancel" },
      ],
    ],
  };
}

/** Permission request keyboard — allow/deny with colored styles. */
export function buildPermissionKeyboard(requestId: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Allow", callback_data: `perm:allow:${requestId}`, style: "success" },
        { text: "Deny", callback_data: `perm:deny:${requestId}`, style: "danger" },
      ],
    ],
  };
}

/** Session action bar — quick actions for active session. */
export function buildSessionActionsKeyboard(model: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: `Model: ${model}`, callback_data: "action:model" },
        { text: "Status", callback_data: "action:status" },
      ],
      [
        { text: "Auto ⏱", callback_data: "action:autoapprove" },
        { text: "Cancel", callback_data: "action:cancel" },
        { text: "Stop", callback_data: "action:stop", style: "danger" },
      ],
    ],
  };
}

/** Auto-approve config keyboard — timeout + bash toggle. */
export function buildAutoApproveKeyboard(config: AutoApproveConfig): TelegramInlineKeyboardMarkup {
  const timeouts = [
    { label: "Off", seconds: 0 },
    { label: "15s", seconds: 15 },
    { label: "30s", seconds: 30 },
    { label: "60s", seconds: 60 },
  ];

  const activeSeconds = config.enabled ? config.timeoutSeconds : 0;

  const timeoutRow: TelegramInlineKeyboardButton[] = timeouts.map((t) => ({
    text: t.seconds === activeSeconds ? `${t.label} ✓` : t.label,
    callback_data: `autoapprove:timeout:${t.seconds}`,
    style: t.seconds === activeSeconds ? "success" : undefined,
  }));

  const bashRow: TelegramInlineKeyboardButton[] = [
    {
      text: config.allowBash ? "Bash: ON ✓" : "Bash: OFF",
      callback_data: `autoapprove:bash:${config.allowBash ? "off" : "on"}`,
      style: config.allowBash ? "success" : "danger",
    },
  ];

  return { inline_keyboard: [timeoutRow, bashRow] };
}

/** Format current auto-approve config as status text. */
export function formatAutoApproveStatus(config: AutoApproveConfig): string {
  if (!config.enabled || config.timeoutSeconds <= 0) {
    return "<b>Auto-Approve: OFF</b>\nPermissions require manual approval.";
  }
  const bashStatus = config.allowBash ? "included" : "excluded (manual)";
  return [
    `<b>Auto-Approve: ${config.timeoutSeconds}s</b>`,
    `Bash: ${bashStatus}`,
    "Permissions auto-approve after timeout.",
  ].join("\n");
}

/** Compact single-line summary for a permission request (used in batch view). */
export function formatPermissionLine(perm: PermissionRequest): string {
  const emoji = TOOL_EMOJI[perm.tool_name] ?? "🔧";
  const input = perm.input;

  switch (perm.tool_name) {
    case "Bash":
      return `${emoji} Bash: <code>${truncate(input.command as string, 60)}</code>`;
    case "Write":
    case "Read":
    case "Edit":
      return `${emoji} ${perm.tool_name}: <code>${shortenPath(input.file_path as string)}</code>`;
    case "Glob":
      return `${emoji} Glob: <code>${input.pattern}</code>`;
    case "Grep":
      return `${emoji} Grep: <code>${truncate(input.pattern as string, 40)}</code>`;
    case "Task":
      return `${emoji} Task: ${truncate(input.description as string ?? input.prompt as string, 50)}`;
    default:
      return `${emoji} ${perm.tool_name}`;
  }
}

/** Format a single permission request for Telegram display. */
export function formatPermissionRequest(perm: PermissionRequest): string {
  return formatPermissionLine(perm);
}

/** Format a batch of permission requests as a single message. */
export function formatPermissionBatch(
  perms: PermissionRequest[],
  autoApproveConfig: AutoApproveConfig,
): string {
  const lines: string[] = [];

  // Header with count
  if (perms.length === 1) {
    const isBash = perms[0].tool_name === "Bash";
    const willAutoApprove = autoApproveConfig.enabled && autoApproveConfig.timeoutSeconds > 0
      && (!isBash || autoApproveConfig.allowBash);

    if (willAutoApprove) {
      lines.push(`⏱ <b>Auto-approve in ${autoApproveConfig.timeoutSeconds}s</b>`);
    } else if (isBash && autoApproveConfig.enabled && !autoApproveConfig.allowBash) {
      lines.push("🔒 <b>Manual approval required</b>");
    } else {
      lines.push("🔧 <b>Permission</b>");
    }
    lines.push(formatPermissionLine(perms[0]));
  } else {
    // Multiple permissions — split into auto vs manual
    const autoPerms: PermissionRequest[] = [];
    const manualPerms: PermissionRequest[] = [];

    for (const p of perms) {
      const isBash = p.tool_name === "Bash";
      const willAuto = autoApproveConfig.enabled && autoApproveConfig.timeoutSeconds > 0
        && (!isBash || autoApproveConfig.allowBash);
      if (willAuto) {
        autoPerms.push(p);
      } else {
        manualPerms.push(p);
      }
    }

    if (autoPerms.length > 0) {
      lines.push(`⏱ <b>Auto-approve ${autoPerms.length} tool${autoPerms.length > 1 ? "s" : ""} in ${autoApproveConfig.timeoutSeconds}s</b>`);
      for (const p of autoPerms) {
        lines.push(formatPermissionLine(p));
      }
    }

    if (manualPerms.length > 0) {
      if (autoPerms.length > 0) lines.push("");
      lines.push(`🔒 <b>Manual approval (${manualPerms.length})</b>`);
      for (const p of manualPerms) {
        lines.push(formatPermissionLine(p));
      }
    }
  }

  return lines.join("\n");
}

/** Build keyboard for a batch of permission requests. */
export function buildPermissionBatchKeyboard(requestIds: string[]): TelegramInlineKeyboardMarkup {
  if (requestIds.length === 1) {
    return buildPermissionKeyboard(requestIds[0]);
  }
  // Batch: Allow all / Deny all
  const batchId = requestIds.join(",");
  return {
    inline_keyboard: [
      [
        { text: `Allow all (${requestIds.length})`, callback_data: `perm:allow:${batchId}`, style: "success" },
        { text: "Deny all", callback_data: `perm:deny:${batchId}`, style: "danger" },
      ],
    ],
  };
}

// ─── AskUserQuestion extraction ──────────────────────────────────────────────

interface AskQuestion {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

/** Extract AskUserQuestion tool_use blocks from content. Returns null if none found. */
export function extractAskUserQuestion(content: ContentBlock[]): AskQuestion[] | null {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === "AskUserQuestion") {
      const input = block.input as { questions?: AskQuestion[] };
      if (input.questions && Array.isArray(input.questions) && input.questions.length > 0) {
        return input.questions;
      }
    }
  }
  return null;
}

/** Format AskUserQuestion for Telegram display. */
export function formatAskUserQuestion(questions: AskQuestion[]): string {
  const lines: string[] = ["<b>❓ Claude is asking:</b>", ""];

  for (const q of questions) {
    lines.push(`<b>${escapeHTML(q.question)}</b>`);
    if (q.options && q.options.length > 0) {
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const bullet = `${i + 1}.`;
        const desc = opt.description ? ` — ${escapeHTML(truncate(opt.description, 80))}` : "";
        lines.push(`${bullet} <b>${escapeHTML(opt.label)}</b>${desc}`);
      }
    }
    lines.push("");
  }

  lines.push("<i>Reply with your choice (number or text).</i>");
  return lines.join("\n").trim();
}

// ─── Multi-session & Notification formatting ──────────────────────────────────

/** Format all active sessions for General topic /status overview. */
export function formatAllSessions(
  mappings: Map<number, TelegramSessionMapping>,
  getSessionState: (sessionId: string) => SessionState | undefined
): string {
  if (mappings.size === 0) return "No active sessions.";

  const lines: string[] = [`<b>Active Sessions (${mappings.size})</b>`, ""];
  for (const [topicId, m] of mappings) {
    const session = getSessionState(m.sessionId);
    const status = session?.status ?? "unknown";
    const statusEmoji =
      status === "busy" ? "🔵" :
      status === "idle" ? "🟢" :
      status === "compacting" ? "🟡" :
      status === "ended" ? "⚫" : "⚪";

    const cost = session?.total_cost_usd.toFixed(3) ?? "0.000";
    const turns = session?.num_turns ?? 0;
    const topicLabel = topicId > 0 ? "topic" : "general";

    lines.push(`${statusEmoji} <b>${m.projectSlug}</b> (${topicLabel})`);
    lines.push(`  ${m.model} · $${cost} · ${turns} turns`);
  }

  return lines.join("\n");
}

/** Compact notification format for group alerts. */
export function formatNotification(
  projectName: string,
  event: string,
  details?: string
): string {
  let text = `<b>[${escapeHTML(projectName)}]</b> ${escapeHTML(event)}`;
  if (details) text += `\n${escapeHTML(details)}`;
  return text;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function shortenPath(filepath: string | undefined): string {
  if (!filepath) return "?";
  // Show last 2-3 path segments
  const parts = filepath.replace(/\\/g, "/").split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : filepath;
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\n/g, " ");
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}
