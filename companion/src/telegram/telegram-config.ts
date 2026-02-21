// Telegram Bridge configuration persistence
// Stores config in companion/data/telegram-config.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "..", "..", "data");
const CONFIG_FILE = join(DATA_DIR, "telegram-config.json");

export interface TelegramBridgeConfig {
  botToken: string;
  allowedChatIds: number[];
  enabled: boolean;
}

const EMPTY_CONFIG: TelegramBridgeConfig = {
  botToken: "",
  allowedChatIds: [],
  enabled: false,
};

export function loadTelegramConfig(): TelegramBridgeConfig {
  // Env vars take priority
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  const envIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS;

  if (envToken && envIds) {
    const ids = envIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = parseInt(s, 10);
        if (isNaN(n)) throw new Error(`Invalid chat ID: "${s}"`);
        return n;
      });

    return {
      botToken: envToken,
      allowedChatIds: ids,
      enabled: ids.length > 0,
    };
  }

  // Fall back to file config
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw) as TelegramBridgeConfig;
    // Validate
    if (!data.botToken || !Array.isArray(data.allowedChatIds)) {
      return EMPTY_CONFIG;
    }
    return data;
  } catch {
    return EMPTY_CONFIG;
  }
}

export function saveTelegramConfig(config: TelegramBridgeConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function isEnvConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALLOWED_CHAT_IDS);
}
