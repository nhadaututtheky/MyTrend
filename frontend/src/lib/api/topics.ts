import pb from '$lib/config/pocketbase';
import type { Topic, TrendingTopic, TopicTrendResponse } from '$lib/types';

const ITEMS_PER_PAGE = 20;

export async function fetchTopicTrends(
  slugs: string[],
  range: '7d' | '30d' | '90d' | '1y' = '30d',
): Promise<TopicTrendResponse> {
  const pbUrl =
    typeof window !== 'undefined'
      ? pb.baseUrl
      : import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
  const params = new URLSearchParams({ topics: slugs.join(','), range });
  const response = await fetch(`${pbUrl}/api/mytrend/topic-trends?${params}`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Failed to fetch topic trends: ${response.status}`);
  return response.json() as Promise<TopicTrendResponse>;
}

export async function fetchTrendingTopics(limit = 20): Promise<TrendingTopic[]> {
  const pbUrl =
    typeof window !== 'undefined'
      ? pb.baseUrl
      : import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
  const response = await fetch(`${pbUrl}/api/mytrend/trending-topics?limit=${limit}`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Failed to fetch trending topics: ${response.status}`);
  const data = await response.json();
  return (data as { topics: TrendingTopic[] }).topics;
}

export async function searchTopics(query: string, page = 1): Promise<Topic[]> {
  const result = await pb.collection('topics').getList<Topic>(page, ITEMS_PER_PAGE, {
    filter: `name ~ "${query.replace(/"/g, '')}"`,
    sort: '-mention_count',
  });
  return result.items;
}

export async function fetchAllTopics(
  page = 1,
  perPage = 20,
  sort = '-mention_count',
): Promise<{ items: Topic[]; totalPages: number; totalItems: number }> {
  const result = await pb.collection('topics').getList<Topic>(page, perPage, { sort });
  return { items: result.items, totalPages: result.totalPages, totalItems: result.totalItems };
}
