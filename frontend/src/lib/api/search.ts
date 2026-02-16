import pb from '$lib/config/pocketbase';
import { nmQuery } from '$lib/config/neural-memory';
import type { SearchResult } from '$lib/types';

// Browser: use relative URL (goes through nginx). SSR: use docker internal URL.
const PB_URL = typeof window !== 'undefined'
  ? ''
  : (import.meta.env.VITE_PB_URL || 'http://pocketbase:8090');
const MAX_RESULTS = 20;

/**
 * Hybrid search: PocketBase backend (safe, param-bound) + Neural Memory (optional).
 */
export async function hybridSearch(query: string, brain?: string): Promise<SearchResult[]> {
  const [backendResults, nmResults] = await Promise.allSettled([
    backendSearch(query),
    nmQuery(query, brain),
  ]);

  const results: SearchResult[] = [];

  if (backendResults.status === 'fulfilled') {
    results.push(...backendResults.value);
  }

  if (nmResults.status === 'fulfilled') {
    for (const nm of nmResults.value) {
      const exists = results.some((r) => r.id === nm.id);
      if (!exists) {
        results.push({
          type: (nm.metadata['type'] as SearchResult['type']) ?? 'conversation',
          id: nm.id,
          title: (nm.metadata['title'] as string) ?? '',
          snippet: nm.content.slice(0, 200),
          score: nm.score,
          highlight: nm.content.slice(0, 200),
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

/**
 * Search via PocketBase backend endpoint (safe from SQL injection).
 */
async function backendSearch(query: string): Promise<SearchResult[]> {
  const token = pb.authStore.token;
  const headers: Record<string, string> = token ? { Authorization: token } : {};

  const res = await fetch(
    `${PB_URL}/api/mytrend/search?q=${encodeURIComponent(query)}`,
    { headers },
  );

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    type: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
  }>;

  return data.map((item) => ({
    type: item.type as SearchResult['type'],
    id: item.id,
    title: item.title,
    snippet: item.snippet,
    score: item.score,
    highlight: '',
  }));
}
