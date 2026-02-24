import { Hono } from "hono";
import { cors } from "hono/cors";
import type { SessionListItem, CreateSessionRequest } from "./session-types.js";
import type { CLILauncher } from "./cli-launcher.js";
import type { WsBridge } from "./ws-bridge.js";
import type { SessionStore } from "./session-store.js";
import type { ProjectProfileStore } from "./project-profiles.js";
import type { TelegramBridge } from "./telegram/telegram-bridge.js";
import { loadTelegramConfig, saveTelegramConfig, isEnvConfigured } from "./telegram/telegram-config.js";
import type { TelegramBridgeConfig } from "./telegram/telegram-config.js";
import { translateText } from "./translate.js";

interface AppContext {
  launcher: CLILauncher;
  bridge: WsBridge;
  store: SessionStore;
  profiles: ProjectProfileStore;
  getTelegramBridge: () => TelegramBridge | null;
  startTelegramBridge: (token: string, chatIds: number[]) => Promise<{ ok: boolean; error?: string }>;
  stopTelegramBridge: () => void;
}

const PB_URL = process.env.PB_URL || "http://localhost:8090";

/** Sync a project profile to PocketBase projects collection. */
async function syncProjectToPB(slug: string, name: string): Promise<void> {
  try {
    // Check if exists via companion endpoint
    const res = await fetch(`${PB_URL}/api/mytrend/companion/projects`);
    if (!res.ok) return;
    const data = (await res.json()) as { projects: { slug: string; name: string }[] };
    const exists = data.projects.some((p) => p.slug === slug);

    if (!exists) {
      // Create via PB API (projects collection)
      await fetch(`${PB_URL}/api/mytrend/companion/sync-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name }),
      });
    }
  } catch {
    // PB offline or endpoint missing — non-critical
  }
}

/** Remove a project from PocketBase projects collection. */
async function removeProjectFromPB(slug: string): Promise<void> {
  try {
    await fetch(`${PB_URL}/api/mytrend/companion/sync-project?slug=${slug}`, {
      method: "DELETE",
    });
  } catch {
    // PB offline — non-critical
  }
}

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  // CORS for browser access
  app.use(
    "*",
    cors({
      origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:80", "http://localhost"],
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
      // Clean up failed session
      ctx.store.remove(sessionId);
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

    // Try killing the actual process first
    const killed = await ctx.launcher.kill(id);

    // Even if process was already dead, force-end the session state
    if (!killed) {
      const forced = ctx.bridge.forceEndSession(id);
      return c.json({ ok: forced, forced: true });
    }

    // Process was alive and killed — bridge.disconnectCLI will handle cleanup
    return c.json({ ok: true });
  });

  // Bulk cleanup: force-end sessions with dead processes
  app.post("/api/sessions/cleanup", (c) => {
    const running = new Set(ctx.launcher.getRunning());
    const allSessions = ctx.bridge.getAllSessions();
    const persisted = ctx.store.loadAll();
    let cleaned = 0;

    // Force-end active sessions whose process is dead
    for (const s of allSessions) {
      if (s.state.status !== "ended" && !running.has(s.id)) {
        ctx.bridge.forceEndSession(s.id);
        cleaned++;
      }
    }

    // Fix persisted sessions that are stuck
    for (const p of persisted) {
      if (p.state.status !== "ended" && !running.has(p.id)) {
        p.state.status = "ended";
        p.endedAt = p.endedAt ?? Date.now();
        ctx.store.saveSync(p);
        cleaned++;
      }
    }

    return c.json({ ok: true, cleaned });
  });

  // Delete a session's persisted data (only ended sessions)
  app.delete("/api/sessions/:id", (c) => {
    const id = c.req.param("id");

    // Don't allow deleting running sessions
    if (ctx.launcher.isAlive(id)) {
      return c.json({ error: "Cannot delete a running session. Kill it first." }, 400);
    }

    ctx.store.remove(id);
    return c.json({ ok: true });
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

  // ── Translation proxy ──────────────────────────────────────────────────

  app.post("/api/translate", async (c) => {
    const body = await c.req.json<{ text: string; from?: string; to?: string }>();
    const result = await translateText(body.text ?? "", body.from, body.to);
    if (result.error) {
      return c.json(result, 502);
    }
    return c.json(result);
  });

  // ── Project profiles ───────────────────────────────────────────────────

  app.get("/api/projects", (c) => {
    return c.json(ctx.profiles.getAll());
  });

  app.post("/api/projects", async (c) => {
    const body = await c.req.json<{
      name: string;
      dir: string;
      defaultModel?: string;
      permissionMode?: string;
    }>();

    if (!body.name?.trim()) {
      return c.json({ error: "name is required" }, 400);
    }

    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return c.json({ error: "Invalid name" }, 400);
    }

    const existing = ctx.profiles.get(slug);
    if (existing) {
      return c.json({ error: "Project with this name already exists" }, 409);
    }

    const projectName = body.name.trim();
    ctx.profiles.upsert({
      slug,
      name: projectName,
      dir: body.dir?.trim() || "",
      defaultModel: body.defaultModel || "sonnet",
      permissionMode: body.permissionMode || "bypassPermissions",
    });

    // Sync to PocketBase (fire-and-forget)
    syncProjectToPB(slug, projectName).catch(() => {});

    return c.json({ ok: true, slug });
  });

  app.put("/api/projects/:slug", async (c) => {
    const slug = c.req.param("slug");
    const existing = ctx.profiles.get(slug);
    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    const body = await c.req.json<{
      name?: string;
      dir?: string;
      defaultModel?: string;
      permissionMode?: string;
    }>();

    ctx.profiles.upsert({
      ...existing,
      name: body.name?.trim() || existing.name,
      dir: body.dir?.trim() ?? existing.dir,
      defaultModel: body.defaultModel || existing.defaultModel,
      permissionMode: body.permissionMode || existing.permissionMode,
    });

    return c.json({ ok: true });
  });

  app.delete("/api/projects/:slug", (c) => {
    const slug = c.req.param("slug");
    const deleted = ctx.profiles.remove(slug);
    if (!deleted) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Remove from PocketBase (fire-and-forget)
    removeProjectFromPB(slug).catch(() => {});

    return c.json({ ok: true });
  });

  // ── Directory Browser ─────────────────────────────────────────────────

  app.get("/api/browse-dir", async (c) => {
    const requestPath = c.req.query("path") || "";

    try {
      // No path = list drive roots (Windows) or /home (Linux/Mac)
      if (!requestPath) {
        const isWindows = process.platform === "win32";
        if (isWindows) {
          // List available drive letters
          const { execSync } = await import("node:child_process");
          const raw = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
          const drives = raw
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => /^[A-Z]:$/.test(l))
            .map((d) => d + "\\");
          return c.json({ path: "", dirs: drives, isRoot: true });
        }
        return c.json({ path: "/", dirs: ["/home", "/root", "/tmp"], isRoot: true });
      }

      const { readdirSync, statSync } = await import("node:fs");
      const { resolve, join: pathJoin } = await import("node:path");

      const resolved = resolve(requestPath);
      const entries = readdirSync(resolved, { withFileTypes: true });
      const dirs = entries
        .filter((e) => {
          if (!e.isDirectory()) return false;
          // Skip hidden/system dirs
          if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "__pycache__") return false;
          if (e.name === "$Recycle.Bin" || e.name === "System Volume Information") return false;
          return true;
        })
        .map((e) => pathJoin(resolved, e.name))
        .sort();

      // Check if current dir has .git (is a project root)
      let hasGit = false;
      try {
        statSync(pathJoin(resolved, ".git"));
        hasGit = true;
      } catch {
        // no .git
      }

      return c.json({ path: resolved, dirs, hasGit, isRoot: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read directory";
      return c.json({ path: requestPath, dirs: [], error: msg, isRoot: false });
    }
  });

  // ── Telegram Bridge ────────────────────────────────────────────────────

  app.get("/api/telegram-bridge/status", (c) => {
    const tg = ctx.getTelegramBridge();
    const config = loadTelegramConfig();
    return c.json({
      enabled: !!tg,
      running: tg?.isRunning() ?? false,
      activeChats: tg?.getActiveChatCount() ?? 0,
      envConfigured: isEnvConfigured(),
      hasConfig: !!config.botToken,
      botTokenSet: !!config.botToken,
      allowedChatIds: config.allowedChatIds,
      notificationGroupId: config.notificationGroupId ?? null,
    });
  });

  app.get("/api/telegram-bridge/config", (c) => {
    const config = loadTelegramConfig();
    return c.json({
      // Mask bot token for security (show first 8 chars + last 4)
      botToken: config.botToken
        ? `${config.botToken.slice(0, 8)}...${config.botToken.slice(-4)}`
        : "",
      botTokenSet: !!config.botToken,
      allowedChatIds: config.allowedChatIds,
      enabled: config.enabled,
      envConfigured: isEnvConfigured(),
      notificationGroupId: config.notificationGroupId ?? null,
    });
  });

  app.put("/api/telegram-bridge/config", async (c) => {
    if (isEnvConfigured()) {
      return c.json({ error: "Config is managed by environment variables" }, 400);
    }

    const body = await c.req.json<{ botToken?: string; allowedChatIds?: number[]; enabled?: boolean; notificationGroupId?: number | null }>();

    const current = loadTelegramConfig();
    const updated: TelegramBridgeConfig = {
      botToken: body.botToken ?? current.botToken,
      allowedChatIds: body.allowedChatIds ?? current.allowedChatIds,
      enabled: body.enabled ?? current.enabled,
      notificationGroupId: body.notificationGroupId !== undefined
        ? (body.notificationGroupId ?? undefined)
        : current.notificationGroupId,
    };

    // Validate chat IDs
    for (const id of updated.allowedChatIds) {
      if (isNaN(id) || !Number.isInteger(id)) {
        return c.json({ error: `Invalid chat ID: ${id}` }, 400);
      }
    }

    saveTelegramConfig(updated);
    return c.json({ ok: true });
  });

  app.post("/api/telegram-bridge/start", async (c) => {
    const config = loadTelegramConfig();
    if (!config.botToken) {
      return c.json({ error: "Bot token not configured" }, 400);
    }
    if (config.allowedChatIds.length === 0) {
      return c.json({ error: "No allowed chat IDs configured" }, 400);
    }

    const result = await ctx.startTelegramBridge(config.botToken, config.allowedChatIds);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 500);
    }

    // Set notification group if configured
    const tg = ctx.getTelegramBridge();
    if (tg && config.notificationGroupId) {
      tg.setNotificationGroupId(config.notificationGroupId);
    }

    // Mark as enabled in config
    saveTelegramConfig({ ...config, enabled: true });
    return c.json({ ok: true });
  });

  app.post("/api/telegram-bridge/stop", (c) => {
    ctx.stopTelegramBridge();

    // Mark as disabled in config (but keep credentials)
    const config = loadTelegramConfig();
    if (!isEnvConfigured()) {
      saveTelegramConfig({ ...config, enabled: false });
    }

    return c.json({ ok: true });
  });

  // ── NM Doc Training ──────────────────────────────────────────────────

  app.post("/api/nm/train-docs", async (c) => {
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    const { resolve, basename } = await import("node:path");
    const { createHash } = await import("node:crypto");

    const NM_URL = process.env.NM_URL || "http://localhost:8001";
    const PROJECT_DIR = process.env.PROJECT_DIR || "D:\\Project\\MyTrend";

    const docs: { file: string; tag: string; memType: string }[] = [
      { file: "LESSONS.md", tag: "lessons", memType: "insight" },
      { file: "CLAUDE.md", tag: "conventions", memType: "reference" },
      { file: "ROADMAP.md", tag: "roadmap", memType: "fact" },
    ];

    // Load stored checksums
    const checksumFile = resolve("data", "doc-checksums.json");
    let storedChecksums: Record<string, string> = {};
    try {
      const raw = await readFile(checksumFile, "utf-8");
      storedChecksums = JSON.parse(raw) as Record<string, string>;
    } catch {
      // First run or file missing
    }

    const results: { file: string; status: string }[] = [];

    for (const doc of docs) {
      const filePath = resolve(PROJECT_DIR, doc.file);
      try {
        const content = await readFile(filePath, "utf-8");
        const checksum = createHash("md5").update(content).digest("hex");

        if (storedChecksums[doc.file] === checksum) {
          results.push({ file: doc.file, status: "unchanged" });
          continue;
        }

        // Encode to NM
        const res = await fetch(`${NM_URL}/memory/encode`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Brain-ID": "laptop-brain",
          },
          body: JSON.stringify({
            content: `[${doc.tag.toUpperCase()}] ${basename(doc.file)}\n\n${content}`,
            tags: [doc.tag, "doc-training", "project:MyTrend", `source:${doc.file}`],
            metadata: {
              type: doc.memType,
              source: doc.file,
              collection: "doc-training",
              checksum,
            },
          }),
        });

        if (res.ok) {
          storedChecksums[doc.file] = checksum;
          results.push({ file: doc.file, status: "encoded" });
        } else {
          results.push({ file: doc.file, status: `error: ${res.status}` });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ file: doc.file, status: `error: ${msg}` });
      }
    }

    // Persist checksums
    try {
      await mkdir(resolve("data"), { recursive: true });
      await writeFile(checksumFile, JSON.stringify(storedChecksums, null, 2));
    } catch {
      // Non-critical
    }

    return c.json({ ok: true, results });
  });

  return app;
}
