import type { Subprocess } from "bun";
import type { CreateSessionRequest } from "./session-types.js";
import { SessionStore } from "./session-store.js";

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
  private port: number;

  constructor(store: SessionStore, port: number) {
    this.store = store;
    this.port = port;
  }

  /** Spawn a new Claude Code CLI process with --sdk-url. */
  async launch(
    sessionId: string,
    options: CreateSessionRequest
  ): Promise<{ ok: boolean; pid?: number; error?: string }> {
    const sdkUrl = `ws://localhost:${this.port}/ws/cli/${sessionId}`;

    const args: string[] = [
      "--sdk-url",
      sdkUrl,
      "--print",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
    ];

    // Model selection
    const model = options.model ?? "sonnet";
    args.push("--model", model);

    // Permission mode
    const permMode = options.permissionMode ?? "default";
    args.push("--permission-mode", permMode);

    // Resume existing session
    if (options.resume) {
      // Check if there's a CLI session_id we can resume
      const persisted = this.store.load(sessionId);
      if (persisted?.state.session_id) {
        args.push("--resume", persisted.state.session_id);
      }
    }

    // Headless mode - empty prompt triggers interactive SDK mode
    args.push("-p", "");

    console.log(
      `[cli-launcher] Spawning: claude ${args.join(" ")}\n  cwd: ${options.projectDir}`
    );

    try {
      const proc = Bun.spawn(["claude", ...args], {
        cwd: options.projectDir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // Ensure claude finds its config
          HOME: process.env.USERPROFILE ?? process.env.HOME ?? "",
        },
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

      // Log stdout/stderr in background
      this.pipeOutput(sessionId, proc);

      // Track process exit
      proc.exited.then((exitCode) => {
        console.log(
          `[cli-launcher] Session ${sessionId} exited (code=${exitCode})`
        );
        this.processes.delete(sessionId);

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

  /** Pipe stdout/stderr to console for debugging. */
  private pipeOutput(sessionId: string, proc: Subprocess): void {
    const prefix = `[cli:${sessionId.slice(0, 8)}]`;

    const stdout = proc.stdout;
    if (stdout && typeof stdout !== "number") {
      const reader = stdout.getReader();
      const decoder = new TextDecoder();
      const readStdout = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            for (const line of text.split("\n")) {
              if (line.trim() && !line.startsWith("{")) {
                console.log(`${prefix} ${line}`);
              }
            }
          }
        } catch {
          // stream closed
        }
      };
      readStdout();
    }

    const stderr = proc.stderr;
    if (stderr && typeof stderr !== "number") {
      const reader = stderr.getReader();
      const decoder = new TextDecoder();
      const readStderr = async () => {
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
      readStderr();
    }
  }
}
