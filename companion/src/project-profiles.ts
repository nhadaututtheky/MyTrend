import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./session-types.js";

const PROFILES_FILE = join(import.meta.dir, "..", "data", "profiles.json");

/** Known slug → local directory mapping for projects that have code dirs. */
const SLUG_DIR_MAP: Record<string, string> = {
  mytrend: "C:\\Users\\X\\Desktop\\Future\\MyTrend",
  "future-bot": "C:\\Users\\X\\Desktop\\Future\\Future",
  "feature-factory": "C:\\Users\\X\\Desktop\\Future\\FeatureFactory",
  "neural-memory": "C:\\Users\\X\\Desktop\\Future\\neural-memory",
};

/**
 * Slug aliases: PB may use different slugs for the same project.
 * Maps PB slug → canonical slug used in profiles.
 * e.g. PB "memory" = our "neural-memory", PB "future" = our "future-bot"
 */
const SLUG_ALIASES: Record<string, string> = {
  memory: "neural-memory",
  future: "future-bot",
  companion: "mytrend",
};

/** Default profiles for all known local projects. */
const DEFAULT_PROFILES: ProjectProfile[] = [
  {
    slug: "mytrend",
    name: "MyTrend",
    dir: "C:\\Users\\X\\Desktop\\Future\\MyTrend",
    defaultModel: "sonnet",
    permissionMode: "bypassPermissions",
  },
  {
    slug: "future-bot",
    name: "Future Bot",
    dir: "C:\\Users\\X\\Desktop\\Future\\Future",
    defaultModel: "sonnet",
    permissionMode: "bypassPermissions",
  },
  {
    slug: "neural-memory",
    name: "Neural Memory",
    dir: "C:\\Users\\X\\Desktop\\Future\\neural-memory",
    defaultModel: "sonnet",
    permissionMode: "bypassPermissions",
  },
  {
    slug: "feature-factory",
    name: "Feature Factory",
    dir: "C:\\Users\\X\\Desktop\\Future\\FeatureFactory",
    defaultModel: "sonnet",
    permissionMode: "bypassPermissions",
  },
];

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
  }

  private load(): void {
    try {
      const raw = readFileSync(PROFILES_FILE, "utf-8");
      const list = JSON.parse(raw) as ProjectProfile[];
      for (const p of list) {
        this.profiles.set(p.slug, p);
      }
      // Ensure all defaults exist (new projects added to code)
      this.mergeDefaults();
    } catch {
      // First run - seed defaults
      for (const p of DEFAULT_PROFILES) {
        this.profiles.set(p.slug, p);
      }
      this.persist();
    }
  }

  /** Merge DEFAULT_PROFILES into loaded profiles (add missing, don't overwrite). */
  private mergeDefaults(): void {
    let changed = false;
    for (const p of DEFAULT_PROFILES) {
      if (!this.profiles.has(p.slug)) {
        this.profiles.set(p.slug, p);
        changed = true;
      }
    }
    if (changed) this.persist();
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
    const deleted = this.profiles.delete(slug);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Sync project profiles from PocketBase via internal companion endpoint.
   * Uses /api/mytrend/companion/projects (no auth required).
   * Preserves existing dir/model/permission settings if already configured.
   */
  async syncFromPocketBase(pbUrl: string): Promise<{
    added: number;
    updated: number;
    total: number;
  }> {
    let added = 0;
    let updated = 0;

    try {
      const res = await fetch(
        `${pbUrl}/api/mytrend/companion/projects`,
      );
      if (!res.ok) {
        console.error(`[profiles] PB sync failed: ${res.status}`);
        return { added: 0, updated: 0, total: this.profiles.size };
      }

      const data = (await res.json()) as { projects: PBProject[] };

      for (const proj of data.projects) {
        // Resolve alias: PB "memory" → canonical "neural-memory"
        const canonicalSlug = SLUG_ALIASES[proj.slug] ?? proj.slug;
        const existing = this.profiles.get(canonicalSlug);

        if (existing) {
          // Update name if changed (prefer PB name for canonical slug)
          if (existing.name !== proj.name && canonicalSlug === proj.slug) {
            existing.name = proj.name;
            this.profiles.set(canonicalSlug, existing);
            updated++;
          }
        } else {
          // New project from PocketBase (use canonical slug)
          const dir = SLUG_DIR_MAP[canonicalSlug] ?? "";
          this.profiles.set(canonicalSlug, {
            slug: canonicalSlug,
            name: proj.name,
            dir,
            defaultModel: "sonnet",
            permissionMode: "bypassPermissions",
          });
          added++;
        }
      }

      if (added > 0 || updated > 0) {
        this.persist();
      }

      console.log(
        `[profiles] PB sync: ${added} added, ${updated} updated, ${this.profiles.size} total`,
      );
    } catch (err) {
      console.error("[profiles] PB sync error:", err);
    }

    return { added, updated, total: this.profiles.size };
  }
}
