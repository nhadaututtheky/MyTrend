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

/** PocketBase project record from companion endpoint. */
interface PBProject {
  slug: string;
  name: string;
  local_dir: string;
  default_model: string;
  permission_mode: string;
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
      // First run - no profiles yet, will be populated from PB sync
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
    const deleted = this.profiles.delete(slug);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Sync project profiles from PocketBase via internal companion endpoint.
   * Uses /api/mytrend/companion/projects (no auth required).
   * Reads local_dir, default_model, permission_mode from PB.
   */
  async syncFromPocketBase(pbUrl: string): Promise<{
    added: number;
    updated: number;
    removed: number;
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
        return { added: 0, updated: 0, removed: 0, total: this.profiles.size };
      }

      const data = (await res.json()) as { projects: PBProject[] };
      const pbSlugs = new Set<string>();

      for (const proj of data.projects) {
        const canonicalSlug = SLUG_ALIASES[proj.slug] ?? proj.slug;
        pbSlugs.add(canonicalSlug);

        const existing = this.profiles.get(canonicalSlug);
        const profile: ProjectProfile = {
          slug: canonicalSlug,
          name: proj.name,
          dir: proj.local_dir || existing?.dir || "",
          defaultModel: proj.default_model || existing?.defaultModel || "sonnet",
          permissionMode: proj.permission_mode || existing?.permissionMode || "bypassPermissions",
        };

        if (!existing) {
          this.profiles.set(canonicalSlug, profile);
          added++;
        } else {
          // Update from PB if changed
          const changed =
            existing.name !== profile.name ||
            (proj.local_dir && existing.dir !== proj.local_dir) ||
            (proj.default_model && existing.defaultModel !== proj.default_model) ||
            (proj.permission_mode && existing.permissionMode !== proj.permission_mode);

          if (changed) {
            this.profiles.set(canonicalSlug, profile);
            updated++;
          }
        }
      }

      // Remove profiles that no longer exist in PB
      const toRemove: string[] = [];
      for (const slug of this.profiles.keys()) {
        if (!pbSlugs.has(slug)) {
          toRemove.push(slug);
        }
      }
      for (const slug of toRemove) {
        this.profiles.delete(slug);
      }

      if (added > 0 || updated > 0 || toRemove.length > 0) {
        this.persist();
      }

      console.log(
        `[profiles] PB sync: ${added} added, ${updated} updated, ${toRemove.length} removed, ${this.profiles.size} total`,
      );

      return { added, updated, removed: toRemove.length, total: this.profiles.size };
    } catch (err) {
      console.error("[profiles] PB sync error:", err);
      return { added: 0, updated: 0, removed: 0, total: this.profiles.size };
    }
  }
}
