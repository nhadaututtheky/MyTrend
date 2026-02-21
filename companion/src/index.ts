import type { ServerWebSocket } from "bun";
import { SessionStore } from "./session-store.js";
import { ProjectProfileStore } from "./project-profiles.js";
import { CLILauncher } from "./cli-launcher.js";
import { WsBridge, type SocketData, type BrowserSocketData } from "./ws-bridge.js";
import { createApp } from "./routes.js";
import { TelegramBridge } from "./telegram/telegram-bridge.js";
import { loadTelegramConfig } from "./telegram/telegram-config.js";

const PORT = 3457;

// ── Initialize services ──────────────────────────────────────────────────────

const store = new SessionStore();
const profiles = new ProjectProfileStore();
const bridge = new WsBridge(store);
const launcher = new CLILauncher(store, bridge);

// ── Telegram Bridge Manager ──────────────────────────────────────────────────
// Supports dynamic start/stop from Settings UI or env vars on boot.

let telegramBridge: TelegramBridge | null = null;

/** Start or restart the Telegram bridge with given (or saved) config. */
function startTelegramBridge(
  botToken: string,
  allowedChatIds: number[]
): { ok: boolean; error?: string } {
  // Validate
  if (!botToken) return { ok: false, error: "Bot token is required" };
  if (allowedChatIds.length === 0) return { ok: false, error: "At least one allowed chat ID is required" };

  for (const id of allowedChatIds) {
    if (isNaN(id) || !Number.isInteger(id)) {
      return { ok: false, error: `Invalid chat ID: ${id}` };
    }
  }

  // Stop existing bridge
  if (telegramBridge) {
    telegramBridge.stop();
    telegramBridge = null;
  }

  telegramBridge = new TelegramBridge(
    { botToken, allowedChatIds: new Set(allowedChatIds) },
    { bridge, launcher, store, profiles }
  );
  telegramBridge.start();
  return { ok: true };
}

function stopTelegramBridge(): void {
  if (telegramBridge) {
    telegramBridge.stop();
    telegramBridge = null;
  }
}

// Auto-start from config (env vars or saved file)
const initConfig = loadTelegramConfig();
if (initConfig.enabled && initConfig.botToken && initConfig.allowedChatIds.length > 0) {
  const result = startTelegramBridge(initConfig.botToken, initConfig.allowedChatIds);
  if (!result.ok) {
    console.error(`[telegram] Auto-start failed: ${result.error}`);
  }
} else if (!initConfig.botToken) {
  console.log("[telegram] No config found, Telegram bridge disabled");
}

// ── Hono REST App ────────────────────────────────────────────────────────────

const app = createApp({
  launcher,
  bridge,
  store,
  profiles,
  getTelegramBridge: () => telegramBridge,
  startTelegramBridge,
  stopTelegramBridge,
});

// ── Bun.serve with WebSocket upgrade ─────────────────────────────────────────

Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws/browser/:sessionId
    const wsMatch = url.pathname.match(
      /^\/ws\/browser\/([a-f0-9-]+)$/
    );
    if (wsMatch) {
      const [, sessionId] = wsMatch;
      const upgraded = server.upgrade(req, {
        data: { role: "browser", sessionId } as BrowserSocketData,
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Hono handles REST API
    return app.fetch(req, { ip: server.requestIP(req) });
  },

  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      const data = ws.data;
      if (data.role === "browser") {
        bridge.handleBrowserOpen(ws, data.sessionId);
      }
    },

    message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      const data = ws.data;
      if (data.role === "browser") {
        bridge.handleBrowserMessage(ws, raw);
      }
    },

    close(ws: ServerWebSocket<SocketData>) {
      const data = ws.data;
      if (data.role === "browser") {
        bridge.handleBrowserClose(ws);
      }
    },
  },
});

console.log(`[companion] MyTrend Companion Service`);
console.log(`[companion] REST API:  http://localhost:${PORT}/api/health`);
console.log(`[companion] WS Browser: ws://localhost:${PORT}/ws/browser/{sessionId}`);
console.log(`[companion] Projects:  ${profiles.getAll().length} profile(s) loaded`);
console.log(`[companion] Data dir:  ${store.directory}`);
console.log(`[companion] Telegram:  ${telegramBridge ? "enabled" : "disabled"}`);
