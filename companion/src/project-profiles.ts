import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./session-types.js";

const PROFILES_FILE = join(import.meta.dir, "..", "data", "profiles.json");

/**
 * Slug aliases: PB may use different slugs for the same project.
 * Maps PB slug → canonical slug used in profiles.
 */
const SLUG_ALIASES: Record<string, string> = {
  memory: "neural-memory",
  future: "future-bot",
  companion: "mytrend",
};

/** Hub is a built-in cross-project profile — always present. */
const DEFAULT_HUB: ProjectProfile = {
  slug: "hub",
  name: "HQ — Cross-Project",
  dir: process.platform === "win32" ? "D:\\Project" : "/home/project",
  defaultModel: "opus",
  permissionMode: "bypassPermissions",
};

/** PocketBase project record from companion endpoint. */
interface PBProject {
  slug: string;
  name: string;
}

export class ProjectProfileStore {
  private profiles: Map<string, ProjectProfile>;

  constructor() {
    this.profiles = new Map();
    this.load();
    this.ensureHub();
  }

  private load(): void {
    try {
      const raw = readFileSync(PROFILES_FILE, "utf-8");
      const list = JSON.parse(raw) as ProjectProfile[];
      for (const p of list) {
        this.profiles.set(p.slug, p);
      }
    } catch {
      // First run - no profiles yet, will be populated from PB sync
      this.persist();
    }
  }

  /** Ensure hub profile always exists. */
  private ensureHub(): void {
    if (!this.profiles.has("hub")) {
      this.profiles.set("hub", DEFAULT_HUB);
      this.persist();
    }
  }

  private persist(): void {
    try {
      mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true });
      writeFileSync(
        PROFILES_FILE,
        JSON.stringify([...this.profiles.values()], null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("[profiles] Failed to persist:", err);
    }
  }

  getAll(): ProjectProfile[] {
    return [...this.profiles.values()];
  }

  get(slug: string): ProjectProfile | undefined {
    return this.profiles.get(slug) ?? this.profiles.get(SLUG_ALIASES[slug] ?? "");
  }

  upsert(profile: ProjectProfile): void {
    this.profiles.set(profile.slug, profile);
    this.persist();
  }

  remove(slug: string): boolean {
    if (slug === "hub") return false; // Hub is built-in, cannot be deleted
    const deleted = this.profiles.delete(slug);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Sync project names from PocketBase (update existing profiles only).
   * Settings UI is the source of truth for companion profiles.
   * PB sync only updates names of profiles that already exist.
   */
  async syncFromPocketBase(pbUrl: string): Promise<{
    updated: number;
    total: number;
  }> {
    let updated = 0;

    try {
      const res = await fetch(
        `${pbUrl}/api/mytrend/companion/projects`,
      );
      if (!res.ok) {
        console.error(`[profiles] PB sync failed: ${res.status}`);
        return { updated: 0, total: this.profiles.size };
      }

      const data = (await res.json()) as { projects: PBProject[] };

      for (const proj of data.projects) {
        const canonicalSlug = SLUG_ALIASES[proj.slug] ?? proj.slug;
        const existing = this.profiles.get(canonicalSlug);

        // Only update existing profiles — never create new ones from PB
        if (!existing) continue;

        const newName = proj.name || existing.name;
        if (existing.name !== newName) {
          this.profiles.set(canonicalSlug, { ...existing, name: newName });
          updated++;
        }
      }

      if (updated > 0) {
        this.persist();
      }

      console.log(
        `[profiles] PB sync: ${updated} updated, ${this.profiles.size} total`,
      );

      return { updated, total: this.profiles.size };
    } catch (err) {
      console.error("[profiles] PB sync error:", err);
      return { updated: 0, total: this.profiles.size };
    }
  }
}
