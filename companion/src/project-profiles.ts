import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./session-types.js";

const PROFILES_FILE = join(import.meta.dir, "..", "data", "profiles.json");

/** Default profiles for local projects. */
const DEFAULT_PROFILES: ProjectProfile[] = [
  {
    slug: "mytrend",
    name: "MyTrend",
    dir: "C:\\Users\\X\\Desktop\\Future\\MyTrend",
    defaultModel: "sonnet",
    permissionMode: "bypasstool",
  },
  {
    slug: "future-bot",
    name: "Future Bot",
    dir: "C:\\Users\\X\\Desktop\\Future\\Future",
    defaultModel: "sonnet",
    permissionMode: "bypasstool",
  },
];

export class ProjectProfileStore {
  private profiles: Map<string, ProjectProfile>;

  constructor() {
    this.profiles = new Map();
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(PROFILES_FILE, "utf-8");
      const list = JSON.parse(raw) as ProjectProfile[];
      for (const p of list) {
        this.profiles.set(p.slug, p);
      }
    } catch {
      // First run - seed defaults
      for (const p of DEFAULT_PROFILES) {
        this.profiles.set(p.slug, p);
      }
      this.persist();
    }
  }

  private persist(): void {
    try {
      mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true });
      writeFileSync(PROFILES_FILE, JSON.stringify([...this.profiles.values()], null, 2), "utf-8");
    } catch (err) {
      console.error("[profiles] Failed to persist:", err);
    }
  }

  getAll(): ProjectProfile[] {
    return [...this.profiles.values()];
  }

  get(slug: string): ProjectProfile | undefined {
    return this.profiles.get(slug);
  }

  upsert(profile: ProjectProfile): void {
    this.profiles.set(profile.slug, profile);
    this.persist();
  }

  remove(slug: string): boolean {
    const deleted = this.profiles.delete(slug);
    if (deleted) this.persist();
    return deleted;
  }
}
