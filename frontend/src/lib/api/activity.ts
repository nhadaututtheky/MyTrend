import pb from '$lib/config/pocketbase';
import type { Activity, ActivityAggregate, PBListResult, HeatmapDay } from '$lib/types';
import { getDateKey, getDaysAgo } from '$lib/utils/date';

const ITEMS_PER_PAGE = 50;
const HEATMAP_DAYS = 365;

export async function fetchActivities(
  page = 1,
  projectId?: string,
): Promise<PBListResult<Activity>> {
  const filter = projectId ? `project = "${projectId}"` : '';
  return pb.collection('activities').getList<Activity>(page, ITEMS_PER_PAGE, {
    sort: '-timestamp',
    filter,
  });
}

export async function fetchAggregates(
  period: string,
  projectId?: string,
): Promise<ActivityAggregate[]> {
  const filters: string[] = [`period = "${period}"`];
  if (projectId) filters.push(`project = "${projectId}"`);

  const result = await pb
    .collection('activity_aggregates')
    .getList<ActivityAggregate>(1, ITEMS_PER_PAGE, {
      sort: '-period_start',
      filter: filters.join(' && '),
    });
  return result.items;
}

export async function createActivity(data: Partial<Activity>): Promise<Activity> {
  return pb.collection('activities').create<Activity>({
    ...data,
    user: pb.authStore.model?.id,
  });
}

export async function fetchHeatmapData(): Promise<HeatmapDay[]> {
  const startDate = getDaysAgo(HEATMAP_DAYS);
  const filter = `period = "day" && period_start >= "${startDate.toISOString()}"`;

  const result = await pb
    .collection('activity_aggregates')
    .getList<ActivityAggregate>(1, HEATMAP_DAYS, {
      sort: 'period_start',
      filter,
      fields: 'period_start,total_count',
    });

  // Build heatmap with all days, filling in zeros
  const activityMap = new Map<string, number>();
  for (const agg of result.items) {
    const key = getDateKey(new Date(agg.period_start));
    activityMap.set(key, agg.total_count);
  }

  const days: HeatmapDay[] = [];
  for (let i = HEATMAP_DAYS; i >= 0; i--) {
    const date = getDaysAgo(i);
    const key = getDateKey(date);
    const count = activityMap.get(key) ?? 0;
    const level = countToLevel(count);
    days.push({ date: key, count, level });
  }

  return days;
}

function countToLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 10) return 3;
  return 4;
}
