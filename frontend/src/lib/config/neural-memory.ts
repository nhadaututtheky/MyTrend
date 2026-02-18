// In browser: use nginx proxy /nm/. In SSR/server: use docker internal URL.
const NM_URL = typeof window !== 'undefined'
  ? '/nm'
  : (import.meta.env.VITE_NM_URL || 'http://neural-memory:8000');

interface NMQueryResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface NMQueryResponse {
  answer: string;
  confidence: number;
  fibers_matched: string[];
  context: string;
  metadata: Record<string, unknown>;
}

interface NMHealthResponse {
  status: string;
  version: string;
}

async function nmFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${NM_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Brain-ID': 'mytrend',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      console.warn(`[NeuralMemory] ${response.status}: ${response.statusText}`);
      return null;
    }

    return (await response.json()) as T;
  } catch {
    // Neural Memory is optional - silently fail
    return null;
  }
}

/**
 * Query Neural Memory for semantic search results.
 * NM returns: { answer, confidence, fibers_matched: string[], context: string }
 * We parse the context markdown to extract individual memory items.
 */
export async function nmQuery(query: string, _brain?: string): Promise<NMQueryResult[]> {
  const result = await nmFetch<NMQueryResponse>('/memory/query', {
    method: 'POST',
    body: JSON.stringify({
      query,
      depth: 1,
      max_tokens: 500,
    }),
  });

  if (!result || !result.fibers_matched || result.fibers_matched.length === 0) return [];

  // Parse context markdown to extract memory entries
  const memories: NMQueryResult[] = [];
  const contextLines = (result.context || '').split('\n');

  for (const line of contextLines) {
    // Match lines like "- Some memory content" (skip [concept] entries which are just neurons)
    const match = line.match(/^- (?!\[concept\])(.+)$/);
    const matchContent = match?.[1];
    if (matchContent && matchContent.length > 10) {
      memories.push({
        id: `nm-${memories.length}`,
        content: matchContent.trim(),
        score: result.confidence * 0.9,
        metadata: { type: 'conversation', title: matchContent.trim().slice(0, 80) },
      });
    }
  }

  // If no parsed memories but we have an answer, use that
  if (memories.length === 0 && result.answer && result.answer.length > 10) {
    memories.push({
      id: `nm-answer`,
      content: result.answer,
      score: result.confidence,
      metadata: { type: 'conversation', title: result.answer.slice(0, 80) },
    });
  }

  return memories;
}

/**
 * Encode content into Neural Memory.
 * NM EncodeRequest: { content, timestamp?, metadata?, tags? }
 */
export async function nmEncode(payload: {
  content: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}): Promise<boolean> {
  const result = await nmFetch('/memory/encode', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result !== null;
}

/**
 * Check if Neural Memory service is available.
 */
export async function nmHealthCheck(): Promise<boolean> {
  const result = await nmFetch<NMHealthResponse>('/health');
  return result?.status === 'healthy';
}

/**
 * Get graph data from Neural Memory for knowledge visualization.
 */
export async function nmGetGraph(limit = 100): Promise<{
  nodes: Array<{ id: string; label: string; type: string; size: number }>;
  edges: Array<{ source: string; target: string; weight: number }>;
} | null> {
  return nmFetch(`/api/graph?limit=${limit}`);
}
