import pb from '$lib/config/pocketbase';
import type { Research, ResearchStats, PBListResult } from '$lib/types';

const ITEMS_PER_PAGE = 50;

export async function fetchResearch(
  page = 1,
  source?: string,
  verdict?: string,
): Promise<PBListResult<Research>> {
  const filters: string[] = [];
  if (source) filters.push(`source = "${source}"`);
  if (verdict) filters.push(`verdict = "${verdict}"`);
  const filter = filters.join(' && ');

  return pb.collection('research').getList<Research>(page, ITEMS_PER_PAGE, {
    sort: '-created',
    filter,
  });
}

export async function fetchResearchItem(id: string): Promise<Research | null> {
  try {
    return await pb.collection('research').getOne<Research>(id);
  } catch {
    return null;
  }
}

export async function fetchResearchStats(): Promise<ResearchStats> {
  const res = await fetch('/api/mytrend/research/stats', {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  return res.json() as Promise<ResearchStats>;
}

export async function deleteResearch(id: string): Promise<boolean> {
  return pb.collection('research').delete(id);
}
