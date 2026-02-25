/**
 * Context Snapshot — fetches daily context from PocketBase for CLI injection.
 * Caches for 5 minutes to avoid repeated network calls during session bursts.
 */

const PB_URL = process.env.PB_URL || "http://localhost:8090";
const COMPANION_INTERNAL_SECRET = process.env.COMPANION_INTERNAL_SECRET || "";

interface ContextCache {
  text: string;
  fetchedAt: number;
}

let cache: ContextCache | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch context snapshot from PocketBase.
 * Returns compact text (~600 tokens max) or null if unavailable/offline.
 */
export async function fetchContextSnapshot(): Promise<string | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.text;
  }

  try {
    const headers: Record<string, string> = {};
    if (COMPANION_INTERNAL_SECRET) {
      headers["X-Internal-Token"] = COMPANION_INTERNAL_SECRET;
    }

    const res = await fetch(`${PB_URL}/api/mytrend/context/snapshot`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { text?: string };
    if (!data.text) return null;

    cache = { text: data.text, fetchedAt: Date.now() };
    return data.text;
  } catch {
    return null;
  }
}

/** Build context-injected prompt from original prompt + snapshot. */
export function buildContextPrompt(originalPrompt: string, snapshot: string): string {
  return `[CONTEXT]\n${snapshot}\n[/CONTEXT]\n\n${originalPrompt}`;
}

/** Invalidate the context cache (call after major data changes). */
export function invalidateContextCache(): void {
  cache = null;
}
