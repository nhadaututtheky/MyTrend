import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SessionListItem, CreateSessionRequest } from "./session-types.js";
import type { CLILauncher } from "./cli-launcher.js";
import type { WsBridge } from "./ws-bridge.js";
import type { SessionStore } from "./session-store.js";
import type { ProjectProfileStore } from "./project-profiles.js";

interface AppContext {
  launcher: CLILauncher;
  bridge: WsBridge;
  store: SessionStore;
  profiles: ProjectProfileStore;
}

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  // CORS for browser access
  app.use(
    "*",
    cors({
      origin: ["http://localhost:3000", "http://localhost:80", "http://localhost"],
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type"],
    })
  );

  // ── Health check ───────────────────────────────────────────────────────

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
      sessions: ctx.bridge.getAllSessions().length,
    });
  });

  // ── Sessions ───────────────────────────────────────────────────────────

  app.get("/api/sessions", (c) => {
    const sessions = ctx.bridge.getAllSessions();
    const persisted = ctx.store.loadAll();

    // Merge active + ended sessions
    const activeIds = new Set(sessions.map((s) => s.id));
    const items: SessionListItem[] = [];

    for (const s of sessions) {
      const p = ctx.store.load(s.id);
      items.push({
        id: s.id,
        projectSlug: p?.projectSlug,
        model: s.state.model,
        status: s.state.status,
        cwd: s.state.cwd,
        total_cost_usd: s.state.total_cost_usd,
        num_turns: s.state.num_turns,
        startedAt: p?.startedAt ?? Date.now(),
        endedAt: p?.endedAt,
      });
    }

    // Add ended sessions not in active list
    for (const p of persisted) {
      if (!activeIds.has(p.id)) {
        items.push({
          id: p.id,
          projectSlug: p.projectSlug,
          model: p.state.model,
          status: p.state.status,
          cwd: p.state.cwd,
          total_cost_usd: p.state.total_cost_usd,
          num_turns: p.state.num_turns,
          startedAt: p.startedAt,
          endedAt: p.endedAt,
        });
      }
    }

    // Sort by startedAt descending
    items.sort((a, b) => b.startedAt - a.startedAt);

    return c.json(items);
  });

  app.post("/api/sessions/create", async (c) => {
    const body = await c.req.json<CreateSessionRequest>();

    if (!body.projectDir) {
      return c.json({ error: "projectDir is required" }, 400);
    }

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Find project profile for metadata
    const profiles = ctx.profiles.getAll();
    const profile = profiles.find(
      (p) => body.projectDir.includes(p.dir) || p.dir.includes(body.projectDir)
    );

    // Ensure session in bridge
    const session = ctx.bridge.ensureSession(sessionId);
    session.state.cwd = body.projectDir;
    session.state.model = body.model ?? profile?.defaultModel ?? "sonnet";

    // Persist initial state
    ctx.store.saveSync({
      id: sessionId,
      projectSlug: profile?.slug,
      state: session.state,
      messageHistory: [],
      pendingPermissions: [],
      startedAt: Date.now(),
    });

    // Launch CLI
    const result = await ctx.launcher.launch(sessionId, {
      projectDir: body.projectDir,
      model: body.model ?? profile?.defaultModel,
      permissionMode: body.permissionMode ?? profile?.permissionMode,
      prompt: body.prompt,
      resume: body.resume,
    });

    if (!result.ok) {
      return c.json({ error: result.error }, 500);
    }

    return c.json({
      session_id: sessionId,
      pid: result.pid,
      ws_url: `/ws/browser/${sessionId}`,
    });
  });

  app.get("/api/sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = ctx.bridge.getSession(id);
    const persisted = ctx.store.load(id);

    if (!session && !persisted) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({
      id,
      state: session?.state ?? persisted?.state,
      messageCount: session?.messageHistory.length ?? persisted?.messageHistory.length ?? 0,
      pendingPermissions: session
        ? [...session.pendingPermissions.keys()]
        : [],
      isAlive: ctx.launcher.isAlive(id),
      pid: ctx.launcher.getPid(id),
      startedAt: persisted?.startedAt,
      endedAt: persisted?.endedAt,
    });
  });

  app.post("/api/sessions/:id/kill", async (c) => {
    const id = c.req.param("id");
    const killed = await ctx.launcher.kill(id);
    return c.json({ ok: killed });
  });

  app.post("/api/sessions/:id/resume", async (c) => {
    const id = c.req.param("id");
    const persisted = ctx.store.load(id);
    if (!persisted) {
      return c.json({ error: "Session not found" }, 404);
    }

    const result = await ctx.launcher.launch(id, {
      projectDir: persisted.state.cwd,
      model: persisted.state.model,
      permissionMode: persisted.state.permissionMode,
      resume: true,
    });

    return c.json({
      ok: result.ok,
      error: result.error,
      pid: result.pid,
    });
  });

  // ── Project profiles ───────────────────────────────────────────────────

  app.get("/api/projects", (c) => {
    return c.json(ctx.profiles.getAll());
  });

  app.put("/api/projects/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json();
    ctx.profiles.upsert({ slug, ...body });
    return c.json({ ok: true });
  });

  return app;
}
