import type { ServerWebSocket } from "bun";
import { SessionStore } from "./session-store.js";
import { ProjectProfileStore } from "./project-profiles.js";
import { CLILauncher } from "./cli-launcher.js";
import { WsBridge, type SocketData } from "./ws-bridge.js";
import { createApp } from "./routes.js";

const PORT = 3457;

// ── Initialize services ──────────────────────────────────────────────────────

const store = new SessionStore();
const profiles = new ProjectProfileStore();
const bridge = new WsBridge(store);
const launcher = new CLILauncher(store, PORT);

const app = createApp({ launcher, bridge, store, profiles });

// ── Bun.serve with WebSocket upgrade ─────────────────────────────────────────

Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws/cli/:sessionId and /ws/browser/:sessionId
    const wsMatch = url.pathname.match(
      /^\/ws\/(cli|browser)\/([a-f0-9-]+)$/
    );
    if (wsMatch) {
      const [, role, sessionId] = wsMatch;
      const upgraded = server.upgrade(req, {
        data: { role, sessionId } as SocketData,
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
      if (data.role === "cli") {
        bridge.handleCLIOpen(ws, data.sessionId);
      } else {
        bridge.handleBrowserOpen(ws, data.sessionId);
      }
    },

    message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      const data = ws.data;
      if (data.role === "cli") {
        bridge.handleCLIMessage(ws, raw);
      } else {
        bridge.handleBrowserMessage(ws, raw);
      }
    },

    close(ws: ServerWebSocket<SocketData>) {
      const data = ws.data;
      if (data.role === "cli") {
        bridge.handleCLIClose(ws);
      } else {
        bridge.handleBrowserClose(ws);
      }
    },
  },
});

console.log(`[companion] MyTrend Companion Service`);
console.log(`[companion] REST API:  http://localhost:${PORT}/api/health`);
console.log(`[companion] WS CLI:    ws://localhost:${PORT}/ws/cli/{sessionId}`);
console.log(`[companion] WS Browser: ws://localhost:${PORT}/ws/browser/{sessionId}`);
console.log(`[companion] Projects:  ${profiles.getAll().length} profile(s) loaded`);
console.log(`[companion] Data dir:  ${store.directory}`);
