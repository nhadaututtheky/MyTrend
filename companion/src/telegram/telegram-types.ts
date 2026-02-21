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
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
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
}
