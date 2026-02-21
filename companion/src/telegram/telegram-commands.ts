// Telegram command handlers

import type { TelegramMessage } from "./telegram-types.js";
import type { TelegramBridge } from "./telegram-bridge.js";
import {
  formatHelp,
  formatProjectList,
  formatStatus,
  formatPinnedStatus,
  formatWelcome,
  formatConnected,
  formatAutoApproveStatus,
  buildProjectKeyboard,
  buildModelKeyboard,
  buildStopConfirmKeyboard,
  buildNewConfirmKeyboard,
  buildSessionActionsKeyboard,
  buildAutoApproveKeyboard,
} from "./telegram-formatter.js";

type CommandHandler = (bridge: TelegramBridge, msg: TelegramMessage, args: string) => Promise<void>;

const commands: Record<string, CommandHandler> = {
  start: handleStart,
  help: handleHelp,
  projects: handleProjects,
  project: handleProject,
  switch: handleSwitch,
  stop: handleStop,
  cancel: handleCancel,
  status: handleStatus,
  model: handleModel,
  new: handleNew,
  autoapprove: handleAutoApprove,
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
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  // Smart /start: if session active, show status + actions instead of onboarding
  if (mapping) {
    const session = bridge.getSessionState(mapping.sessionId);
    const statusText = formatPinnedStatus(mapping, session);
    await bridge.sendToChatWithKeyboard(
      chatId,
      statusText,
      buildSessionActionsKeyboard(mapping.model)
    );
    return;
  }

  // No session: onboarding + project selection
  const botName = bridge.getBotName() ?? "Claude Bridge";
  const profiles = bridge.getProfiles();

  if (profiles.length > 0) {
    // Single combined message: welcome + project keyboard
    await bridge.sendToChatWithKeyboard(
      chatId,
      formatWelcome(botName),
      buildProjectKeyboard(profiles)
    );
  } else {
    await bridge.sendToChat(chatId, formatWelcome(botName));
  }
}

async function handleHelp(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  await bridge.sendToChat(msg.chat.id, formatHelp());
}

async function handleProjects(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const profiles = bridge.getProfiles();
  if (profiles.length > 0) {
    await bridge.sendToChatWithKeyboard(
      msg.chat.id,
      formatProjectList(profiles),
      buildProjectKeyboard(profiles)
    );
  } else {
    await bridge.sendToChat(msg.chat.id, "No projects configured.");
  }
}

async function handleSwitch(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const profiles = bridge.getProfiles();
  if (profiles.length === 0) {
    await bridge.sendToChat(chatId, "No projects configured.");
    return;
  }

  const mapping = bridge.getMapping(chatId);
  const current = mapping ? ` (current: <code>${mapping.projectSlug}</code>)` : "";
  await bridge.sendToChatWithKeyboard(
    chatId,
    `Switch project${current}:`,
    buildProjectKeyboard(profiles)
  );
}

async function handleProject(bridge: TelegramBridge, msg: TelegramMessage, args: string): Promise<void> {
  const slug = args.trim().toLowerCase();
  if (!slug) {
    // No args: show project keyboard
    const profiles = bridge.getProfiles();
    if (profiles.length > 0) {
      await bridge.sendToChatWithKeyboard(
        msg.chat.id,
        "Select a project:",
        buildProjectKeyboard(profiles)
      );
    } else {
      await bridge.sendToChat(msg.chat.id, "No projects configured.");
    }
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

  const mapping = bridge.getMapping(chatId);
  await bridge.sendToChatWithKeyboard(
    chatId,
    formatConnected(profile, profile.defaultModel),
    buildSessionActionsKeyboard(mapping?.model ?? profile.defaultModel)
  );
}

async function handleStop(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const mapping = bridge.getMapping(chatId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session. Use <code>/project</code> to start one.");
    return;
  }

  await bridge.sendToChatWithKeyboard(
    chatId,
    `Stop session <code>${mapping.projectSlug}</code>?`,
    buildStopConfirmKeyboard()
  );
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

  // No args: show model keyboard
  if (!model) {
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Current model: <code>${mapping.model}</code>`,
      buildModelKeyboard(mapping.model)
    );
    return;
  }

  if (!valid.includes(model)) {
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Invalid model. Current: <code>${mapping.model}</code>`,
      buildModelKeyboard(mapping.model)
    );
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

  await bridge.sendToChatWithKeyboard(
    chatId,
    `Restart session <code>${mapping.projectSlug}</code>? Current session will be destroyed.`,
    buildNewConfirmKeyboard()
  );
}

async function handleAutoApprove(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const config = bridge.getAutoApproveConfig(chatId);

  await bridge.sendToChatWithKeyboard(
    chatId,
    formatAutoApproveStatus(config),
    buildAutoApproveKeyboard(config)
  );
}
