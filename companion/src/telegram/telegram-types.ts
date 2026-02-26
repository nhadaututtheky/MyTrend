// Types for the Telegram Bot API bridge

// ─── Telegram Bot API Types ─────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
  /** Bot API 9.3: forum topic thread ID (private chat topics) */
  message_thread_id?: number;
  /** Bot API 9.3: true if message belongs to a forum topic */
  is_topic_message?: boolean;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  /** Bot API 9.4: colored button style */
  style?: "primary" | "success" | "danger";
}

export interface TelegramBotCommand {
  command: string;
  description: string;
}

export interface TelegramReactionType {
  type: "emoji";
  emoji: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

// ─── Bridge Config ──────────────────────────────────────────────────────────

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: Set<number>;
  pollingTimeout?: number;
}

// ─── Session Mapping ────────────────────────────────────────────────────────

export interface TelegramSessionMapping {
  chatId: number;
  sessionId: string;
  projectSlug: string;
  model: string;
  createdAt: number;
  lastActivityAt: number;
  pinnedMessageId?: number;
  /** Forum topic thread ID for this project's topic (0 = General/no topic) */
  topicId?: number;
  /** Whether idle timeout auto-close is enabled (default true) */
  idleTimeoutEnabled?: boolean;
  /** Idle timeout duration in ms (default 60min = 3_600_000) */
  idleTimeoutMs?: number;
}

export interface IdleTimeoutConfig {
  enabled: boolean;
  timeoutMs: number;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 min

// ─── Forum Topics (Bot API 9.3/9.4) ─────────────────────────────────────────

export interface TelegramForumTopic {
  message_thread_id: number;
  name: string;
  icon_color?: number;
  icon_custom_emoji_id?: string;
}

// ─── Notification Config ─────────────────────────────────────────────────────

export interface TelegramNotificationConfig {
  /** Telegram group chat ID for aggregated notifications */
  groupChatId?: number;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  notifyOnPermission: boolean;
}
