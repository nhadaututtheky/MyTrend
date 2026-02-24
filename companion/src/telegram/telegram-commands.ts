// Telegram command handlers — topic-aware for multi-session support

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
  stopall: handleStopAll,
  cancel: handleCancel,
  status: handleStatus,
  model: handleModel,
  new: handleNew,
  autoapprove: handleAutoApprove,
  translate: handleTranslate,
};

/** Extract topicId from message (0 = General/no topic) */
function getTopicId(msg: TelegramMessage): number {
  return msg.message_thread_id ?? 0;
}

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
    await bridge.sendToChat(msg.chat.id, `Error: ${error}`, getTopicId(msg));
  }

  return true;
}

// ── Command implementations ───────────────────────────────────────────────

async function handleStart(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);

  // In a project topic: show that topic's session status
  if (topicId > 0) {
    const mapping = bridge.getMapping(chatId, topicId);
    if (mapping) {
      const session = bridge.getSessionState(mapping.sessionId);
      const statusText = formatPinnedStatus(mapping, session);
      await bridge.sendToChatWithKeyboard(
        chatId,
        statusText,
        buildSessionActionsKeyboard(mapping.model),
        topicId
      );
      return;
    }
    await bridge.sendToChat(chatId, "No active session in this topic.", topicId);
    return;
  }

  // General topic: show all active sessions overview + project keyboard
  const allMappings = bridge.getMappings(chatId);
  if (allMappings && allMappings.size > 0) {
    const lines: string[] = ["<b>Active sessions:</b>"];
    for (const [tid, m] of allMappings) {
      const session = bridge.getSessionState(m.sessionId);
      const status = session?.status ?? "unknown";
      const topicLabel = tid > 0 ? ` (topic)` : " (general)";
      lines.push(`  ${m.projectSlug}${topicLabel} — ${status} | $${session?.total_cost_usd.toFixed(3) ?? "0.000"}`);
    }
    lines.push("\nUse /project &lt;slug&gt; to open another project.");
    await bridge.sendToChatWithKeyboard(
      chatId,
      lines.join("\n"),
      buildProjectKeyboard(bridge.getProfiles())
    );
    return;
  }

  // No sessions: onboarding + project selection
  const botName = bridge.getBotName() ?? "Vibe Bot";
  const profiles = bridge.getProfiles();

  if (profiles.length > 0) {
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
  await bridge.sendToChat(msg.chat.id, formatHelp(), getTopicId(msg));
}

async function handleProjects(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const topicId = getTopicId(msg);
  const profiles = bridge.getProfiles();
  if (profiles.length > 0) {
    await bridge.sendToChatWithKeyboard(
      msg.chat.id,
      formatProjectList(profiles),
      buildProjectKeyboard(profiles),
      topicId
    );
  } else {
    await bridge.sendToChat(msg.chat.id, "No projects configured.", topicId);
  }
}

async function handleSwitch(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const profiles = bridge.getProfiles();
  if (profiles.length === 0) {
    await bridge.sendToChat(chatId, "No projects configured.", topicId);
    return;
  }

  // Show project keyboard — selecting opens a new topic
  await bridge.sendToChatWithKeyboard(
    chatId,
    "Open a project (each gets its own topic):",
    buildProjectKeyboard(profiles),
    topicId
  );
}

async function handleProject(bridge: TelegramBridge, msg: TelegramMessage, args: string): Promise<void> {
  const slug = args.trim().toLowerCase();
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);

  if (!slug) {
    const profiles = bridge.getProfiles();
    if (profiles.length > 0) {
      await bridge.sendToChatWithKeyboard(
        chatId,
        "Select a project:",
        buildProjectKeyboard(profiles),
        topicId
      );
    } else {
      await bridge.sendToChat(chatId, "No projects configured.", topicId);
    }
    return;
  }

  // In a project topic: don't allow /project — use /new instead
  if (topicId > 0) {
    const existing = bridge.getMapping(chatId, topicId);
    if (existing) {
      await bridge.sendToChat(chatId, `Already in <code>${existing.projectSlug}</code> topic. Use <code>/new</code> to restart.`, topicId);
      return;
    }
  }

  // Check if this project already has an active topic
  const allMappings = bridge.getMappings(chatId);
  if (allMappings) {
    for (const [, m] of allMappings) {
      if (m.projectSlug === slug) {
        await bridge.sendToChat(chatId, `<code>${slug}</code> is already active in another topic.`, topicId);
        return;
      }
    }
  }

  const profile = bridge.getProfiles().find((p) => p.slug === slug);
  if (!profile) {
    await bridge.sendToChat(chatId, `Project <code>${slug}</code> not found.\nUse <code>/projects</code> to see available options.`, topicId);
    return;
  }

  // Create session — bridge will auto-create forum topic
  const progressMsgId = await bridge.getAPI().sendMessage(chatId, `Connecting to ${profile.name}...`, {
    messageThreadId: topicId > 0 ? topicId : undefined,
  });

  const result = await bridge.createSession(chatId, profile);
  if (!result.ok) {
    await bridge.getAPI().editMessageText(chatId, progressMsgId, `Failed to connect: ${result.error}`);
    return;
  }

  // Find the newly created mapping to get its topicId
  const newMapping = findMappingBySlug(bridge, chatId, slug);
  if (newMapping) {
    const newTopicId = newMapping.topicId ?? 0;
    try {
      await bridge.getAPI().editMessageText(chatId, progressMsgId, formatConnected(profile, profile.defaultModel), {
        replyMarkup: buildSessionActionsKeyboard(newMapping.model ?? profile.defaultModel),
      });
      newMapping.pinnedMessageId = progressMsgId;
      if (newTopicId > 0) {
        // Pin in the topic
        await bridge.getAPI().pinChatMessage(chatId, progressMsgId).catch(() => {});
      }
    } catch {
      await bridge.sendToChat(chatId, formatConnected(profile, profile.defaultModel), newTopicId);
    }
  }
}

async function handleStop(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);

  // In a project topic: stop THIS session
  if (topicId > 0) {
    const mapping = bridge.getMapping(chatId, topicId);
    if (!mapping) {
      await bridge.sendToChat(chatId, "No active session in this topic.", topicId);
      return;
    }
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Stop session <code>${mapping.projectSlug}</code>?`,
      buildStopConfirmKeyboard(),
      topicId
    );
    return;
  }

  // General topic: if only one session, confirm that one; otherwise list
  const allMappings = bridge.getMappings(chatId);
  if (!allMappings || allMappings.size === 0) {
    await bridge.sendToChat(chatId, "No active sessions. Use <code>/project</code> to start one.");
    return;
  }

  if (allMappings.size === 1) {
    const [, mapping] = [...allMappings.entries()][0];
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Stop session <code>${mapping.projectSlug}</code>?`,
      buildStopConfirmKeyboard()
    );
  } else {
    const lines = ["Which session to stop?"];
    const buttons: Array<{ text: string; callback_data: string }> = [];
    for (const [tid, m] of allMappings) {
      lines.push(`  <code>${m.projectSlug}</code> (topic ${tid})`);
      buttons.push({ text: m.projectSlug, callback_data: `stop_topic:${tid}` });
    }
    await bridge.sendToChatWithKeyboard(
      chatId,
      lines.join("\n"),
      { inline_keyboard: [buttons] }
    );
  }
}

async function handleStopAll(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const allMappings = bridge.getMappings(chatId);

  if (!allMappings || allMappings.size === 0) {
    await bridge.sendToChat(chatId, "No active sessions.", topicId);
    return;
  }

  const count = allMappings.size;
  // Destroy all sessions
  const topicIds = [...allMappings.keys()];
  for (const tid of topicIds) {
    await bridge.destroySession(chatId, tid);
  }

  await bridge.sendToChat(chatId, `Stopped ${count} session(s).`, topicId);
}

async function handleCancel(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const mapping = bridge.getMapping(chatId, topicId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session.", topicId);
    return;
  }

  bridge.interruptSession(chatId, topicId);
  await bridge.sendToChat(chatId, "Interrupt sent.", topicId);
}

async function handleStatus(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);

  // In a project topic: show this session
  if (topicId > 0) {
    const mapping = bridge.getMapping(chatId, topicId);
    if (!mapping) {
      await bridge.sendToChat(chatId, "No active session in this topic.", topicId);
      return;
    }
    await sendSessionStatus(bridge, chatId, mapping, topicId);
    return;
  }

  // General topic: show all sessions
  const allMappings = bridge.getMappings(chatId);
  if (!allMappings || allMappings.size === 0) {
    await bridge.sendToChat(chatId, "No active sessions. Use <code>/project</code> to start one.");
    return;
  }

  if (allMappings.size === 1) {
    const [, mapping] = [...allMappings.entries()][0];
    await sendSessionStatus(bridge, chatId, mapping, 0);
  } else {
    const lines: string[] = ["<b>All sessions:</b>"];
    for (const [tid, m] of allMappings) {
      const session = bridge.getSessionState(m.sessionId);
      const status = session?.status ?? "unknown";
      const cost = session?.total_cost_usd.toFixed(3) ?? "0.000";
      const turns = session?.num_turns ?? 0;
      const topicLabel = tid > 0 ? `topic` : `general`;
      lines.push(`<b>${m.projectSlug}</b> (${topicLabel}) — ${status}`);
      lines.push(`  Model: <code>${m.model}</code> | Cost: <code>$${cost}</code> | Turns: <code>${turns}</code>`);
    }
    await bridge.sendToChat(chatId, lines.join("\n"));
  }
}

async function sendSessionStatus(
  bridge: TelegramBridge, chatId: number, mapping: { sessionId: string; projectSlug: string; model: string }, topicId: number
): Promise<void> {
  const session = bridge.getSessionState(mapping.sessionId);
  const status = session?.status ?? "unknown";
  const lines = [formatStatus(mapping as import("./telegram-types.js").TelegramSessionMapping, status)];
  if (session) {
    lines.push(`Cost: <code>$${session.total_cost_usd.toFixed(3)}</code> | Turns: <code>${session.num_turns}</code>`);
    if (session.total_lines_added || session.total_lines_removed) {
      lines.push(`Lines: <code>+${session.total_lines_added}/-${session.total_lines_removed}</code>`);
    }
  }
  await bridge.sendToChat(chatId, lines.join("\n"), topicId);
}

async function handleModel(bridge: TelegramBridge, msg: TelegramMessage, args: string): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const mapping = bridge.getMapping(chatId, topicId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session.", topicId);
    return;
  }

  const model = args.trim().toLowerCase();
  const valid = ["sonnet", "opus", "haiku", "opus-1m", "sonnet-1m"];

  if (!model) {
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Current model: <code>${mapping.model}</code>`,
      buildModelKeyboard(mapping.model),
      topicId
    );
    return;
  }

  if (!valid.includes(model)) {
    await bridge.sendToChatWithKeyboard(
      chatId,
      `Invalid model. Current: <code>${mapping.model}</code>`,
      buildModelKeyboard(mapping.model),
      topicId
    );
    return;
  }

  bridge.setModel(chatId, model, topicId);
  await bridge.sendToChat(chatId, `Model switched to <code>${model}</code>`, topicId);
}

async function handleNew(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const mapping = bridge.getMapping(chatId, topicId);

  if (!mapping) {
    await bridge.sendToChat(chatId, "No active session. Use <code>/project</code> to start one.", topicId);
    return;
  }

  await bridge.sendToChatWithKeyboard(
    chatId,
    `Restart session <code>${mapping.projectSlug}</code>? Current session will be destroyed.`,
    buildNewConfirmKeyboard(),
    topicId
  );
}

async function handleAutoApprove(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const config = bridge.getAutoApproveConfig(chatId);

  await bridge.sendToChatWithKeyboard(
    chatId,
    formatAutoApproveStatus(config),
    buildAutoApproveKeyboard(config),
    topicId
  );
}

async function handleTranslate(bridge: TelegramBridge, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const topicId = getTopicId(msg);
  const current = bridge.isTranslateEnabled(chatId);
  const next = !current;
  bridge.setTranslateEnabled(chatId, next);

  const status = next
    ? "Auto-translate: <b>ON</b>\nVietnamese messages will be translated to English before sending to Claude."
    : "Auto-translate: <b>OFF</b>\nMessages sent as-is.";
  await bridge.sendToChat(chatId, status, topicId);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function findMappingBySlug(
  bridge: TelegramBridge,
  chatId: number,
  slug: string
): import("./telegram-types.js").TelegramSessionMapping | undefined {
  const allMappings = bridge.getMappings(chatId);
  if (!allMappings) return undefined;
  for (const m of allMappings.values()) {
    if (m.projectSlug === slug) return m;
  }
  return undefined;
}
