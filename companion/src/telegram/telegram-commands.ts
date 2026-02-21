// Telegram command handlers

import type { TelegramMessage } from "./telegram-types.js";
import type { TelegramBridge } from "./telegram-bridge.js";
import {
  formatHelp,
  formatProjectList,
  formatStatus,
  formatWelcome,
  formatConnected,
} from "./telegram-formatter.js";

type CommandHandler = (bridge: TelegramBridge, msg: TelegramMessage, args: string) => Promise<void>;

const commands: Record<string, CommandHandler> = {
  start: handleStart,
  help: handleHelp,
  projects: handleProjects,
  project: handleProject,
  stop: handleStop,
  cancel: handleCancel,
  status: handleStatus,
  model: handleModel,
  new: handleNew,
};

/** Dispatch a /command to its handler. Returns true if handled. */
export async function dispatchCommand(
  bridge: TelegramBridge,
  msg: TelegramMessage,
  command: string,
  args: string
): Promise<boolean> {
  const handler = commands[command];
  if (!handler) return false;

  try {
    await handler(bridge, msg, args);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error(`[telegram] Command /${command} error:`, error);
    await bridge.sendToChat(msg.chat.id, `Error: ${error}`);
  }

  return true;
}

// ── Command implementations ───────────────────────────────────────────────

async function handleStart(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const botName = bridge.getBotName() ?? "Claude Bridge";
  await bridge.sendToChat(msg.chat.id, formatWelcome(botName));

  const profiles = bridge.getProfiles();
  if (profiles.length > 0) {
    await bridge.sendToChat(msg.chat.id, formatProjectList(profiles));
  }
}

async function handleHelp(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  await bridge.sendToChat(msg.chat.id, formatHelp());
}

async function handleProjects(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const profiles = bridge.getProfiles();
  await bridge.sendToChat(msg.chat.id, formatProjectList(profiles));
}

async function handleProject(bridge: TelegramBridge, msg: TelegramMessage, args: string): Promise<void> {
  const slug = args.trim().toLowerCase();
  if (!slug) {
    await bridge.sendToChat(msg.chat.id, "Usage: <code>/project &lt;slug&gt;</code>\nSee <code>/projects</code> for available options.");
    return;
  }

  const chatId = msg.chat.id;

  // Check if already connected
  const existing = bridge.getMapping(chatId);
  if (existing) {
    await bridge.sendToChat(chatId, `Already connected to <code>${existing.projectSlug}</code>.\nUse <code>/stop</code> first, or <code>/new</code> to restart.`);
    return;
  }

  const profile = bridge.getProfiles().find((p) => p.slug === slug);
  if (!profile) {
    await bridge.sendToChat(chatId, `Project <code>${slug}</code> not found.\nUse <code>/projects</code> to see available options.`);
    return;
  }

  await bridge.sendToChat(chatId, `Connecting to ${profile.name}...`);

  const result = await bridge.createSession(chatId, profile);
  if (!result.ok) {
    await bridge.sendToChat(chatId, `Failed to connect: ${result.error}`);
    return;
  }

  await bridge.sendToChat(chatId, formatConnected(profile, profile.defaultModel));
}

async function handleStop(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session. Use <code>/project</code> to start one.");
    return;
  }

  await bridge.destroySession(chatId);
  await bridge.sendToChat(chatId, `Session stopped. (<code>${mapping.projectSlug}</code>)`);
}

async function handleCancel(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session.");
    return;
  }

  bridge.interruptSession(chatId);
  await bridge.sendToChat(chatId, "Interrupt sent.");
}

async function handleStatus(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session. Use <code>/project</code> to start one.");
    return;
  }

  const session = bridge.getSessionState(mapping.sessionId);
  const status = session?.status ?? "unknown";

  const lines = [
    formatStatus(mapping, status),
  ];

  if (session) {
    lines.push(`Cost: <code>$${session.total_cost_usd.toFixed(3)}</code> | Turns: <code>${session.num_turns}</code>`);
    if (session.total_lines_added || session.total_lines_removed) {
      lines.push(`Lines: <code>+${session.total_lines_added}/-${session.total_lines_removed}</code>`);
    }
  }

  await bridge.sendToChat(chatId, lines.join("\n"));
}

async function handleModel(bridge: TelegramBridge, msg: TelegramMessage, args: string): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session.");
    return;
  }

  const model = args.trim().toLowerCase();
  const valid = ["sonnet", "opus", "haiku"];
  if (!model || !valid.includes(model)) {
    await bridge.sendToChat(chatId, `Usage: <code>/model &lt;${valid.join("|")}&gt;</code>\nCurrent: <code>${mapping.model}</code>`);
    return;
  }

  bridge.setModel(chatId, model);
  await bridge.sendToChat(chatId, `Model switched to <code>${model}</code>`);
}

async function handleNew(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session. Use <code>/project</code> to start one.");
    return;
  }

  const slug = mapping.projectSlug;
  const profile = bridge.getProfiles().find((p) => p.slug === slug);

  if (!profile) {
    await bridge.sendToChat(chatId, `Project <code>${slug}</code> no longer exists.`);
    return;
  }

  await bridge.destroySession(chatId);
  await bridge.sendToChat(chatId, "Restarting session...");

  const result = await bridge.createSession(chatId, profile);
  if (!result.ok) {
    await bridge.sendToChat(chatId, `Failed: ${result.error}`);
    return;
  }

  await bridge.sendToChat(chatId, formatConnected(profile, profile.defaultModel));
}
