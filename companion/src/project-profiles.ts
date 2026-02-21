import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "./session-types.js";

const PROFILES_FILE = join(import.meta.dir, "..", "data", "profiles.json");

/** Known slug → local directory mapping for projects that have code dirs. */
const SLUG_DIR_MAP: Record<string, string> = {
  mytrend: "C:\\Users\\X\\Desktop\\Future\\MyTrend",
  "future-bot": "C:\\Users\\X\\Desktop\\Future\\Future",
  companion: "C:\\Users\\X\\Desktop\\Future\\MyTrend\\companion",
  "feature-factory": "C:\\Users\\X\\Desktop\\Future\\FeatureFactory",
  "neural-memory": "",
};

/** Default profiles for local projects (fallback if PocketBase unavailable). */
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
];

/** PocketBase project record (minimal fields we need). */
interface PBProject {
  id: string;
  slug: string;
  name: string;
  status: string;
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

  /**
   * Sync project profiles from PocketBase.
   * Fetches all active projects and upserts them as profiles.
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
        `${pbUrl}/api/collections/projects/records?perPage=50&filter=(status='active')&fields=id,slug,name,status`,
      );
      if (!res.ok) {
        console.error(`[profiles] PB sync failed: ${res.status}`);
        return { added: 0, updated: 0, total: this.profiles.size };
      }

      const data = (await res.json()) as { items: PBProject[] };
      const pbSlugs = new Set<string>();

      for (const proj of data.items) {
        pbSlugs.add(proj.slug);
        const existing = this.profiles.get(proj.slug);

        if (existing) {
          // Update name if changed
          if (existing.name !== proj.name) {
            existing.name = proj.name;
            this.profiles.set(proj.slug, existing);
            updated++;
          }
        } else {
          // New project from PocketBase
          const dir = SLUG_DIR_MAP[proj.slug] ?? "";
          this.profiles.set(proj.slug, {
            slug: proj.slug,
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
