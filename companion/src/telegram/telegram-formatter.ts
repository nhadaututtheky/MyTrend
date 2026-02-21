// Claude markdown → Telegram HTML converter + formatting helpers

import type { CLIResultMessage, ContentBlock } from "../session-types.js";
import type { TelegramSessionMapping } from "./telegram-types.js";
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
      return `${emoji} Spawning sub-agent: ${truncate(input.description as string ?? input.prompt as string, 50)}`;
    case "WebFetch":
    case "WebSearch":
      return `${emoji} ${name === "WebSearch" ? "Searching" : "Fetching"} web...`;
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
  return `${icon} Done! ${parts.join(" | ")}`;
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
    "<b>Claude Bridge Commands</b>",
    "",
    "/project &lt;slug&gt; - Connect to a project",
    "/projects - List available projects",
    "/stop - Kill current session",
    "/cancel - Interrupt Claude",
    "/status - Session info",
    "/model &lt;name&gt; - Switch model (sonnet/opus/haiku)",
    "/new - Restart session (same project)",
    "/help - This message",
    "",
    "In private chat, just type normally to talk to Claude.",
    "In groups, use @bot mentions or /commands.",
  ].join("\n");
}

export function formatWelcome(botName: string): string {
  return [
    `<b>Welcome to ${escapeHTML(botName)}</b>`,
    "",
    "Chat with Claude Code through Telegram.",
    "",
    "Use <code>/projects</code> to see available projects,",
    "then <code>/project &lt;slug&gt;</code> to start a session.",
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
