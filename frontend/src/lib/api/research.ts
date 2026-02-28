import pb from '$lib/config/pocketbase';
import type {
  Research,
  ResearchSource,
  ResearchVerdict,
  ResearchStats,
  PBListResult,
} from '$lib/types';

const ITEMS_PER_PAGE = 50;

const VALID_SOURCES: ReadonlySet<string> = new Set<ResearchSource>([
  'github',
  'npm',
  'blog',
  'docs',
  'other',
]);
const VALID_VERDICTS: ReadonlySet<string> = new Set<ResearchVerdict>([
  'fit',
  'partial',
  'concept-only',
  'irrelevant',
]);

/** Sanitize a string for use in PocketBase filter values (strip quotes). */
function sanitize(val: string): string {
  return val.replace(/['"\\]/g, '');
}

export async function fetchResearch(
  page = 1,
  source?: string,
  verdict?: string,
): Promise<PBListResult<Research>> {
  const filters: string[] = [];
  if (source && VALID_SOURCES.has(source)) filters.push(`source = "${source}"`);
  if (verdict && VALID_VERDICTS.has(verdict)) filters.push(`verdict = "${verdict}"`);
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

export async function fetchResearchByProject(
  projectName: string,
  page = 1,
  verdict?: string,
): Promise<PBListResult<Research>> {
  const safe = sanitize(projectName);
  const filters = [`applicable_projects ~ "${safe}"`];
  if (verdict && VALID_VERDICTS.has(verdict)) filters.push(`verdict = "${verdict}"`);
  return pb.collection('research').getList<Research>(page, 20, {
    sort: '-created',
    filter: filters.join(' && '),
  });
}

export interface ResearchTrends {
  tag_trends: Array<{ month: string; tags: Record<string, number> }>;
  source_trends: Array<{ month: string; sources: Record<string, number> }>;
  rising: string[];
  top_patterns: Array<{ pattern: string; count: number }>;
}

export async function fetchResearchTrends(): Promise<ResearchTrends> {
  const res = await fetch('/api/mytrend/research/trends', {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error(`Trends fetch failed: ${res.status}`);
  return res.json() as Promise<ResearchTrends>;
}

export async function deleteResearch(id: string): Promise<boolean> {
  return pb.collection('research').delete(id);
}
