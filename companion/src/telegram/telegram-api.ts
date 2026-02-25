// Telegram Bot API wrapper - raw fetch, no external deps

import type {
  TelegramConfig,
  TelegramUpdate,
  TelegramUser,
  TelegramBotCommand,
  TelegramReactionType,
  TelegramInlineKeyboardMarkup,
  TelegramForumTopic,
} from "./telegram-types.js";

const API_BASE = "https://api.telegram.org";

interface SendMessageOptions {
  /** Set to null to send as plain text (no parse mode). Defaults to "HTML". */
  parseMode?: "HTML" | "MarkdownV2" | null;
  replyTo?: number;
  replyMarkup?: TelegramInlineKeyboardMarkup;
  disablePreview?: boolean;
  /** Forum topic thread ID (Bot API 9.3 private chat topics) */
  messageThreadId?: number;
}

interface ApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

export class TelegramAPI {
  private baseUrl: string;
  private botToken: string;

  constructor(config: TelegramConfig) {
    this.botToken = config.botToken;
    this.baseUrl = `${API_BASE}/bot${config.botToken}`;
  }

  // ── Core API calls ──────────────────────────────────────────────────────

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as ApiResponse<T>;
    if (!data.ok) {
      throw new Error(`Telegram API ${method}: ${data.description ?? "Unknown error"}`);
    }
    return data.result;
  }

  // ── Bot identity & setup ──────────────────────────────────────────────

  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe");
  }

  async deleteWebhook(): Promise<boolean> {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  /** Register bot commands that appear in the chat menu. */
  async setMyCommands(commands: TelegramBotCommand[]): Promise<boolean> {
    return this.call<boolean>("setMyCommands", { commands });
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  async getUpdates(
    offset: number,
    timeout: number,
    signal?: AbortSignal
  ): Promise<TelegramUpdate[]> {
    // Fetch-level timeout: long-poll duration + 15s buffer to prevent infinite hangs
    const fetchTimeout = AbortSignal.timeout((timeout + 15) * 1000);
    const combined = signal
      ? AbortSignal.any([signal, fetchTimeout])
      : fetchTimeout;

    const res = await fetch(`${this.baseUrl}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset,
        timeout,
        allowed_updates: ["message", "callback_query", "channel_post"],
      }),
      signal: combined,
    });

    const data = (await res.json()) as ApiResponse<TelegramUpdate[]>;
    if (!data.ok) {
      throw new Error(`Telegram getUpdates: ${data.description ?? "Unknown error"}`);
    }
    return data.result;
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  async sendMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<number> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options.disablePreview ?? true,
    };

    // Default to HTML; pass null to send as plain text
    const parseMode = options.parseMode === undefined ? "HTML" : options.parseMode;
    if (parseMode) body.parse_mode = parseMode;

    if (options.replyTo) body.reply_to_message_id = options.replyTo;
    if (options.replyMarkup) body.reply_markup = options.replyMarkup;
    if (options.messageThreadId) body.message_thread_id = options.messageThreadId;

    const result = await this.call<{ message_id: number }>("sendMessage", body);
    return result.message_id;
  }

  /** Send long text, auto-split at 4096 chars. Returns message IDs. */
  async sendLongMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<number[]> {
    const chunks = splitMessage(text, 4096);
    const ids: number[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // Rate limit: 1 msg/sec per chat for multi-chunk sends
      if (i > 0) await new Promise((r) => setTimeout(r, 1_000));

      let chunk = chunks[i];
      if (chunks.length > 2) {
        chunk = `[${i + 1}/${chunks.length}]\n${chunk}`;
      }
      // Only reply-to on the first chunk
      const chunkOpts = i === 0 ? options : { ...options, replyTo: undefined };
      const msgId = await this.sendMessage(chatId, chunk, chunkOpts);
      ids.push(msgId);
    }

    return ids;
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: { parseMode?: "HTML" | "MarkdownV2"; replyMarkup?: TelegramInlineKeyboardMarkup } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parseMode ?? "HTML",
      disable_web_page_preview: true,
    };
    if (options.replyMarkup) body.reply_markup = options.replyMarkup;
    await this.call("editMessageText", body);
  }

  /** Remove or replace inline keyboard on an existing message. */
  async editMessageReplyMarkup(
    chatId: number,
    messageId: number,
    replyMarkup?: TelegramInlineKeyboardMarkup
  ): Promise<void> {
    await this.call("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    });
  }

  async sendChatAction(chatId: number, action: "typing" | "upload_photo" = "typing", messageThreadId?: number): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, action };
    if (messageThreadId) body.message_thread_id = messageThreadId;
    await this.call("sendChatAction", body);
  }

  // ── Reactions ─────────────────────────────────────────────────────────

  async setMessageReaction(
    chatId: number,
    messageId: number,
    reaction: TelegramReactionType[]
  ): Promise<void> {
    await this.call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction,
    });
  }

  /** Best-effort reaction — silently catches errors (may lack permissions). */
  async react(chatId: number, messageId: number, emoji: string): Promise<void> {
    try {
      await this.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji }]);
    } catch {
      // Reactions may not be available in all chat types
    }
  }

  // ── File download ────────────────────────────────────────────────────

  /** Get file path for downloading via getFile API. */
  async getFile(fileId: string): Promise<{ file_id: string; file_path: string; file_size?: number }> {
    return this.call("getFile", { file_id: fileId });
  }

  /** Download file content as Buffer via Telegram file API. */
  async downloadFile(filePath: string): Promise<Buffer> {
    const url = `${API_BASE}/file/bot${this.botToken}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`File download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // ── Media ─────────────────────────────────────────────────────────────

  async sendDocument(
    chatId: number,
    fileName: string,
    content: string,
    caption?: string,
    messageThreadId?: number
  ): Promise<number> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", new Blob([content], { type: "text/plain" }), fileName);
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }
    if (messageThreadId) form.append("message_thread_id", String(messageThreadId));
    const res = await fetch(`${this.baseUrl}/sendDocument`, { method: "POST", body: form });
    const data = (await res.json()) as ApiResponse<{ message_id: number }>;
    if (!data.ok) throw new Error(`sendDocument failed: ${data.description}`);
    return data.result.message_id;
  }

  async sendPhoto(
    chatId: number,
    photoUrl: string,
    caption?: string,
    messageThreadId?: number
  ): Promise<number> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrl,
    };
    if (caption) {
      body.caption = caption;
      body.parse_mode = "HTML";
    }
    if (messageThreadId) body.message_thread_id = messageThreadId;
    const result = await this.call<{ message_id: number }>("sendPhoto", body);
    return result.message_id;
  }

  // ── Forum Topics (Bot API 9.3/9.4) ──────────────────────────────────────

  /** Create a forum topic in a private chat or supergroup. */
  async createForumTopic(chatId: number, name: string, iconColor?: number): Promise<TelegramForumTopic> {
    const body: Record<string, unknown> = { chat_id: chatId, name };
    if (iconColor !== undefined) body.icon_color = iconColor;
    return this.call<TelegramForumTopic>("createForumTopic", body);
  }

  async closeForumTopic(chatId: number, messageThreadId: number): Promise<boolean> {
    return this.call<boolean>("closeForumTopic", { chat_id: chatId, message_thread_id: messageThreadId });
  }

  async reopenForumTopic(chatId: number, messageThreadId: number): Promise<boolean> {
    return this.call<boolean>("reopenForumTopic", { chat_id: chatId, message_thread_id: messageThreadId });
  }

  async deleteForumTopic(chatId: number, messageThreadId: number): Promise<boolean> {
    return this.call<boolean>("deleteForumTopic", { chat_id: chatId, message_thread_id: messageThreadId });
  }

  // ── Chat management ─────────────────────────────────────────────────

  async pinChatMessage(chatId: number, messageId: number, disableNotification = true): Promise<void> {
    await this.call("pinChatMessage", {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification,
    });
  }

  async unpinChatMessage(chatId: number, messageId: number): Promise<void> {
    await this.call("unpinChatMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  // ── Callback queries ──────────────────────────────────────────────────

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }
}

// ─── Message splitting utility ────────────────────────────────────────────

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = -1;

    // Try to split at code block boundary
    const codeBlockEnd = remaining.lastIndexOf("</pre>", maxLen);
    if (codeBlockEnd > maxLen * 0.3) {
      splitAt = codeBlockEnd + 6;
    }

    // Try paragraph boundary
    if (splitAt === -1) {
      const para = remaining.lastIndexOf("\n\n", maxLen);
      if (para > maxLen * 0.3) {
        splitAt = para + 2;
      }
    }

    // Try line boundary
    if (splitAt === -1) {
      const line = remaining.lastIndexOf("\n", maxLen);
      if (line > maxLen * 0.3) {
        splitAt = line + 1;
      }
    }

    // Hard split as last resort
    if (splitAt === -1) {
      splitAt = maxLen;
    }

    // Safety: don't split inside an HTML tag (e.g. mid-<code> or mid-<b>)
    // Scan backwards from splitAt to find the last complete tag boundary
    const candidate = remaining.slice(0, splitAt);
    const lastTagOpen = candidate.lastIndexOf("<");
    const lastTagClose = candidate.lastIndexOf(">");
    if (lastTagOpen > lastTagClose) {
      // We're inside an unclosed tag — back up to before the tag
      splitAt = lastTagOpen > maxLen * 0.3 ? lastTagOpen : splitAt;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
