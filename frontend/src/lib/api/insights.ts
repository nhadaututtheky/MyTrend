import pb from '$lib/config/pocketbase';
import type { WeeklyInsights, InsightPatterns, WeekComparison } from '$lib/types';

export async function fetchWeeklyInsights(): Promise<WeeklyInsights> {
  return pb.send<WeeklyInsights>('/api/mytrend/insights/weekly', { method: 'GET' });
}

export async function fetchPatterns(): Promise<InsightPatterns> {
  return pb.send<InsightPatterns>('/api/mytrend/insights/patterns', { method: 'GET' });
}

export async function fetchWeekComparison(
  period: 'week' | 'month' | 'quarter' = 'week',
): Promise<WeekComparison> {
  return pb.send<WeekComparison>(`/api/mytrend/insights/compare?period=${period}`, {
    method: 'GET',
  });
}
