const NM_URL = import.meta.env.VITE_NM_URL || 'http://localhost:8000';

interface NMQueryResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface NMEncodePayload {
  content: string;
  metadata: Record<string, unknown>;
  brain?: string;
}

async function nmFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${NM_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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

export async function nmQuery(query: string, brain?: string): Promise<NMQueryResult[]> {
  const result = await nmFetch<NMQueryResult[]>('/memory/query', {
    method: 'POST',
    body: JSON.stringify({ query, brain, top_k: 10 }),
  });
  return result ?? [];
}

export async function nmEncode(payload: NMEncodePayload): Promise<boolean> {
  const result = await nmFetch('/memory/encode', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result !== null;
}

export async function nmHealthCheck(): Promise<boolean> {
  const result = await nmFetch<{ status: string }>('/health');
  return result?.status === 'ok';
}
