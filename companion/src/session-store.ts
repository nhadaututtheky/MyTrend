import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { PersistedSession } from "./session-types.js";

const DEFAULT_DIR = join(import.meta.dir, "..", "data");

export class SessionStore {
  private dir: string;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
    mkdirSync(this.dir, { recursive: true });
  }

  private filePath(sessionId: string): string {
    return join(this.dir, `${sessionId}.json`);
  }

  /** Debounced write - batches rapid stream events (150ms). */
  save(session: PersistedSession): void {
    const existing = this.debounceTimers.get(session.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(session.id);
      this.saveSync(session);
    }, 150);
    this.debounceTimers.set(session.id, timer);
  }

  /** Immediate write - use for critical state changes (session end, error). */
  saveSync(session: PersistedSession): void {
    try {
      writeFileSync(this.filePath(session.id), JSON.stringify(session, null, 2), "utf-8");
    } catch (err) {
      console.error(`[session-store] Failed to save ${session.id}:`, err);
    }
  }

  /** Load a single session from disk. */
  load(sessionId: string): PersistedSession | null {
    try {
      const raw = readFileSync(this.filePath(sessionId), "utf-8");
      return JSON.parse(raw) as PersistedSession;
    } catch {
      return null;
    }
  }

  /** Load all sessions from disk. */
  loadAll(): PersistedSession[] {
    const sessions: PersistedSession[] = [];
    try {
      const files = readdirSync(this.dir).filter(
        (f) => f.endsWith(".json") && f !== "profiles.json"
      );
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.dir, file), "utf-8");
          const parsed = JSON.parse(raw) as PersistedSession;
          if (parsed.id && parsed.state) {
            sessions.push(parsed);
          }
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // directory doesn't exist yet
    }
    return sessions;
  }

  /** Remove session file from disk. */
  remove(sessionId: string): void {
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }
    try {
      unlinkSync(this.filePath(sessionId));
    } catch {
      // file may not exist
    }
  }

  get directory(): string {
    return this.dir;
  }
}
