import pb from '$lib/config/pocketbase';

function getPbUrl(): string {
  if (typeof window !== 'undefined') {
    return pb.baseUrl;
  }
  return import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
}

export interface RelatedItem {
  type: 'conversation' | 'idea' | 'project' | 'plan';
  id: string;
  title: string;
  snippet: string;
}

/** Fetch cross-collection related content for a given record. */
export async function fetchRelated(
  collection: string,
  id: string,
  query: string,
  limit = 5,
): Promise<RelatedItem[]> {
  if (!query || query.length < 2) return [];

  const token = pb.authStore.token;
  const headers: Record<string, string> = token ? { Authorization: token } : {};

  const params = new URLSearchParams({
    collection,
    id,
    q: query.slice(0, 100), // cap query length
    limit: String(limit),
  });

  const res = await fetch(`${getPbUrl()}/api/mytrend/related?${params}`, { headers });
  if (!res.ok) return [];

  return (await res.json()) as RelatedItem[];
}

/** Build a search query from common text fields. */
export function buildRelatedQuery(fields: (string | null | undefined)[]): string {
  return fields
    .filter(Boolean)
    .join(' ')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .join(' ');
}

/** Get the href for a related item based on its type. */
export function relatedHref(item: RelatedItem): string {
  switch (item.type) {
    case 'conversation':
      return `/conversations/${item.id}`;
    case 'idea':
      return `/ideas/${item.id}`;
    case 'project':
      return `/projects/${item.id}`;
    case 'plan':
      return `/plans/${item.id}`;
  }
}

/** Icon for each content type. */
export function relatedIcon(type: RelatedItem['type']): string {
  switch (type) {
    case 'conversation':
      return '💬';
    case 'idea':
      return '💡';
    case 'project':
      return '📁';
    case 'plan':
      return '📋';
  }
}
