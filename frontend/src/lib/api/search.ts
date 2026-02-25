import pb from '$lib/config/pocketbase';
import { nmQuery } from '$lib/config/neural-memory';
import type { SearchResult, AskResult } from '$lib/types';

// Use PB SDK's baseUrl so it works regardless of how the frontend is accessed
function getPbUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser: use PB SDK's configured URL (works from any port)
    return pb.baseUrl;
  }
  return import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
}

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
 * Ask a natural language question across the entire knowledge base.
 * Combines FTS5 + Neural Memory for comprehensive answers.
 */
export async function askQuestion(question: string): Promise<AskResult> {
  const token = pb.authStore.token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
  };

  const [backendResult, nmResult] = await Promise.allSettled([
    fetch(`${getPbUrl()}/api/mytrend/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Ask failed: ${r.status}`);
      return r.json() as Promise<AskResult>;
    }),
    nmQuery(question),
  ]);

  if (backendResult.status === 'fulfilled') {
    const result = backendResult.value;

    // Merge NM results as additional sources
    if (nmResult.status === 'fulfilled') {
      const newSources = nmResult.value
        .filter((nm) => !result.sources.some((s) => s.id === nm.id))
        .map((nm) => ({
          type: (nm.metadata['type'] as string) ?? 'conversation',
          id: nm.id,
          title: (nm.metadata['title'] as string) ?? '',
          snippet: nm.content.slice(0, 200),
          relevance: nm.score * 0.9,
        }));
      result.sources.push(...newSources);
      result.sources.sort((a, b) => b.relevance - a.relevance);
    }

    return result;
  }

  // Fallback: build from NM only
  const nmSources =
    nmResult.status === 'fulfilled'
      ? nmResult.value.map((nm) => ({
          type: (nm.metadata['type'] as string) ?? 'conversation',
          id: nm.id,
          title: (nm.metadata['title'] as string) ?? '',
          snippet: nm.content.slice(0, 200),
          relevance: nm.score,
        }))
      : [];

  return {
    answer:
      nmSources.length > 0
        ? 'Found relevant memories from Neural Memory.'
        : 'Could not find an answer. Try rephrasing your question.',
    sources: nmSources,
    query: question,
  };
}

/**
 * Search via PocketBase backend endpoint (safe from SQL injection).
 */
async function backendSearch(query: string): Promise<SearchResult[]> {
  const token = pb.authStore.token;
  const headers: Record<string, string> = token ? { Authorization: token } : {};

  const res = await fetch(`${getPbUrl()}/api/mytrend/search?q=${encodeURIComponent(query)}`, {
    headers,
  });

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
