import type { Subprocess } from "bun";
import type { CreateSessionRequest } from "./session-types.js";
import { SessionStore } from "./session-store.js";
import type { WsBridge } from "./ws-bridge.js";

const VALID_PERMISSION_MODES = new Set([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "dontAsk",
  "plan",
]);

interface LaunchInfo {
  sessionId: string;
  proc: Subprocess;
  pid: number;
  projectDir: string;
  model: string;
  permissionMode: string;
  spawnedAt: number;
}

export class CLILauncher {
  private processes = new Map<string, LaunchInfo>();
  private store: SessionStore;
  private bridge: WsBridge;

  constructor(store: SessionStore, bridge: WsBridge) {
    this.store = store;
    this.bridge = bridge;
  }

  /** Spawn a new Claude Code CLI process with stdin/stdout piping. */
  async launch(
    sessionId: string,
    options: CreateSessionRequest
  ): Promise<{ ok: boolean; pid?: number; error?: string }> {
    const args: string[] = [
      "--print",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
    ];

    // Model selection
    const model = options.model ?? "sonnet";
    args.push("--model", model);

    // Permission mode - validate before passing to CLI
    const permMode = options.permissionMode ?? "bypassPermissions";
    if (VALID_PERMISSION_MODES.has(permMode)) {
      args.push("--permission-mode", permMode);
    } else {
      console.warn(
        `[cli-launcher] Invalid permission mode "${permMode}", using "bypassPermissions"`
      );
      args.push("--permission-mode", "bypassPermissions");
    }

    // Resume existing session
    if (options.resume) {
      const persisted = this.store.load(sessionId);
      if (persisted?.state.session_id) {
        args.push("--resume", persisted.state.session_id);
      }
    }

    // Initial prompt if provided
    if (options.prompt?.trim()) {
      args.push("-p", options.prompt.trim());
    }

    console.log(
      `[cli-launcher] Spawning: claude ${args.join(" ")}\n  cwd: ${options.projectDir}`
    );

    try {
      // Build clean env: remove all Claude Code env vars to avoid nested session rejection
      const cleanEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
        if (v !== undefined) cleanEnv[k] = v;
      }
      cleanEnv.HOME = process.env.USERPROFILE ?? process.env.HOME ?? "/home/claude";

      // Resolve spawn args per platform
      // On Windows, bypass .cmd wrapper to avoid pipe buffering issues.
      // claude.cmd just calls: node <npm_prefix>/node_modules/@anthropic-ai/claude-code/cli.js
      let spawnArgs: string[];
      if (process.platform === "win32") {
        const { existsSync } = await import("node:fs");
        const { execSync } = await import("node:child_process");

        const npmPrefix = process.env.APPDATA
          ? `${process.env.APPDATA}\\npm`
          : "";
        const cliScript = `${npmPrefix}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`;

        // Resolve full node.exe path — Bun.spawn needs .exe on Windows
        let nodeBin = "node.exe";
        try {
          const resolved = execSync("where node", { encoding: "utf-8" }).trim().split("\n")[0].trim();
          if (resolved) nodeBin = resolved;
        } catch { /* fallback to node.exe in PATH */ }

        if (existsSync(cliScript)) {
          spawnArgs = [nodeBin, cliScript, ...args];
        } else {
          spawnArgs = ["claude.cmd", ...args];
        }
      } else {
        // Linux/Docker: Bun.spawn can't exec symlinks, so resolve the real path
        // and invoke via node directly. "claude" is a symlink → cli.js with shebang.
        const { existsSync, realpathSync } = await import("node:fs");
        const { execSync } = await import("node:child_process");

        let nodeBin = "node";
        try {
          nodeBin = execSync("which node", { encoding: "utf-8" }).trim();
        } catch { /* fallback */ }

        // Find cli.js via symlink resolution or known paths
        let cliScript = "";
        try {
          const claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
          cliScript = realpathSync(claudePath);
        } catch { /* fallback */ }

        if (!cliScript) {
          const knownPaths = [
            "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js",
            "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js",
          ];
          cliScript = knownPaths.find((p) => existsSync(p)) ?? "";
        }

        if (cliScript) {
          spawnArgs = [nodeBin, cliScript, ...args];
        } else {
          // Last resort: wrap in sh -c to let shell handle symlink
          spawnArgs = ["/bin/sh", "-c", `claude ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`];
        }
      }

      // Resolve cwd — Windows paths don't exist in Docker containers
      let cwd = options.projectDir;
      if (process.platform !== "win32") {
        const { existsSync } = await import("node:fs");
        if (!existsSync(cwd)) {
          console.warn(`[cli-launcher] cwd "${cwd}" not found, falling back to HOME`);
          cwd = cleanEnv.HOME || "/home/claude";
        }
      }

      console.log(`[cli-launcher] Spawn command: ${spawnArgs[0]} ${spawnArgs.length > 3 ? spawnArgs.slice(1, 4).join(" ") + "..." : spawnArgs.slice(1).join(" ")}`);

      const proc = Bun.spawn(spawnArgs, {
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: cleanEnv,
      });

      const info: LaunchInfo = {
        sessionId,
        proc,
        pid: proc.pid,
        projectDir: options.projectDir,
        model,
        permissionMode: permMode,
        spawnedAt: Date.now(),
      };

      this.processes.set(sessionId, info);

      // Connect CLI stdin to bridge
      const stdin = proc.stdin;
      this.bridge.connectCLI(sessionId, (data: string) => {
        stdin.write(data);
        stdin.flush();
      });

      // Pipe stdout NDJSON to bridge
      this.pipeStdoutToBridge(sessionId, proc);

      // Pipe stderr to console for debugging
      this.pipeStderr(sessionId, proc);

      // Track process exit
      proc.exited.then((exitCode) => {
        console.log(
          `[cli-launcher] Session ${sessionId} exited (code=${exitCode})`
        );
        this.processes.delete(sessionId);

        // Disconnect from bridge
        this.bridge.disconnectCLI(sessionId);

        // Update persisted session
        const persisted = this.store.load(sessionId);
        if (persisted) {
          persisted.state.status = "ended";
          persisted.endedAt = Date.now();
          this.store.saveSync(persisted);
        }
      });

      console.log(
        `[cli-launcher] Session ${sessionId} spawned (PID=${proc.pid})`
      );

      // Verify process didn't exit immediately (bad args, missing claude binary, etc.)
      const earlyExit = await Promise.race([
        proc.exited.then((code) => code),
        new Promise<null>((r) => setTimeout(() => r(null), 3_000)),
      ]);

      if (earlyExit !== null) {
        this.processes.delete(sessionId);
        return {
          ok: false,
          error: `Claude Code exited immediately with code ${earlyExit}. Check if 'claude' is in PATH and args are valid.`,
        };
      }

      return { ok: true, pid: proc.pid };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown spawn error";
      console.error(`[cli-launcher] Spawn failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  /** Kill a running CLI process. SIGTERM first, SIGKILL after 5s. */
  async kill(sessionId: string): Promise<boolean> {
    const info = this.processes.get(sessionId);
    if (!info) return false;

    console.log(`[cli-launcher] Killing session ${sessionId} (PID=${info.pid})`);

    info.proc.kill("SIGTERM");

    // Wait 5s for graceful exit
    const exited = await Promise.race([
      info.proc.exited.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 5_000)),
    ]);

    if (!exited) {
      console.log(`[cli-launcher] Force-killing session ${sessionId}`);
      info.proc.kill("SIGKILL");
    }

    this.processes.delete(sessionId);
    return true;
  }

  /** Check if a session's CLI process is still alive. */
  isAlive(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  /** Get PID of running process. */
  getPid(sessionId: string): number | undefined {
    return this.processes.get(sessionId)?.pid;
  }

  /** Get all running session IDs. */
  getRunning(): string[] {
    return [...this.processes.keys()];
  }

  /** Read CLI stdout, parse NDJSON lines, and feed to bridge. */
  private pipeStdoutToBridge(sessionId: string, proc: Subprocess): void {
    const prefix = `[cli:${sessionId.slice(0, 8)}]`;
    const stdout = proc.stdout;
    if (!stdout || typeof stdout === "number") return;

    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep incomplete last line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("{")) {
              // JSON line - feed to bridge
              this.bridge.feedCLIData(sessionId, trimmed);
            } else {
              // Non-JSON debug/verbose output
              console.log(`${prefix} ${trimmed}`);
            }
          }
        }
      } catch {
        // stream closed
      }
    };
    read();
  }

  /** Pipe stderr to console for debugging. */
  private pipeStderr(sessionId: string, proc: Subprocess): void {
    const prefix = `[cli:${sessionId.slice(0, 8)}]`;
    const stderr = proc.stderr;
    if (!stderr || typeof stderr === "number") return;

    const reader = stderr.getReader();
    const decoder = new TextDecoder();

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (line.trim()) {
              console.error(`${prefix} ERR: ${line}`);
            }
          }
        }
      } catch {
        // stream closed
      }
    };
    read();
  }
}
