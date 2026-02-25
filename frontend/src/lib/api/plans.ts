import pb from '$lib/config/pocketbase';
import type {
  Plan,
  PlanMilestone,
  PlanStatus,
  PlanType,
  PlanTimelineResponse,
  PlanStats,
  PBListResult,
} from '$lib/types';

const ITEMS_PER_PAGE = 50;

function getPbUrl(): string {
  return typeof window !== 'undefined'
    ? pb.baseUrl
    : import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
}

export async function fetchPlans(
  page = 1,
  options?: {
    projectId?: string;
    status?: PlanStatus;
    planType?: PlanType;
    sort?: string;
  },
): Promise<PBListResult<Plan>> {
  const filters: string[] = [];
  if (options?.projectId) filters.push(`project = "${options.projectId}"`);
  if (options?.status) filters.push(`status = "${options.status}"`);
  if (options?.planType) filters.push(`plan_type = "${options.planType}"`);
  const filter = filters.join(' && ');

  return pb.collection('plans').getList<Plan>(page, ITEMS_PER_PAGE, {
    sort: options?.sort || '-created',
    filter,
  });
}

export async function fetchPlan(id: string): Promise<Plan | null> {
  try {
    return await pb.collection('plans').getOne<Plan>(id);
  } catch {
    return null;
  }
}

export async function createPlan(data: Partial<Plan>): Promise<Plan> {
  return pb.collection('plans').create<Plan>({
    ...data,
    user: pb.authStore.model?.id,
    status: data.status || 'draft',
    stage_history: JSON.stringify(
      data.stage_history || [
        {
          from: 'none',
          to: 'draft',
          timestamp: new Date().toISOString(),
          note: 'Created manually',
        },
      ],
    ),
    source_conversations: JSON.stringify(data.source_conversations || []),
    source_ideas: JSON.stringify(data.source_ideas || []),
    tags: JSON.stringify(data.tags || []),
  });
}

export async function updatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
  const payload: Record<string, unknown> = { ...data };
  if (data.tags) payload.tags = JSON.stringify(data.tags);
  if (data.source_conversations)
    payload.source_conversations = JSON.stringify(data.source_conversations);
  if (data.source_ideas) payload.source_ideas = JSON.stringify(data.source_ideas);
  if (data.stage_history) payload.stage_history = JSON.stringify(data.stage_history);
  return pb.collection('plans').update<Plan>(id, payload);
}

export async function deletePlan(id: string): Promise<boolean> {
  return pb.collection('plans').delete(id);
}

export async function updatePlanMilestones(id: string, milestones: PlanMilestone[]): Promise<Plan> {
  return pb.collection('plans').update<Plan>(id, { milestones: JSON.stringify(milestones) });
}

export async function fetchAllPlans(): Promise<Plan[]> {
  const result = await pb.collection('plans').getList<Plan>(1, 200, { sort: '-created' });
  return result.items;
}

export async function transitionPlan(
  id: string,
  to: PlanStatus,
  note: string,
): Promise<{ success: boolean; status: PlanStatus; history: unknown[] }> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/plans/${id}/transition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ to, note }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Transition failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchPlanTimeline(id: string): Promise<PlanTimelineResponse> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/plans/${id}/timeline`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Failed to fetch plan timeline: ${response.status}`);
  return response.json() as Promise<PlanTimelineResponse>;
}

export async function fetchPlanStats(): Promise<PlanStats> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/plans/stats`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Failed to fetch plan stats: ${response.status}`);
  return response.json() as Promise<PlanStats>;
}

export async function backfillPlans(): Promise<{
  conversations_scanned: number;
  plans_created: number;
  plans_skipped: number;
  errors: string[];
}> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/backfill-plans`, {
    method: 'POST',
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Backfill failed: ${response.status}`);
  return response.json();
}

export async function syncPlanFiles(force = false): Promise<{
  files_found: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const url = `${getPbUrl()}/api/mytrend/sync-plans${force ? '?force=true' : ''}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Plan sync failed: ${response.status}`);
  return response.json();
}

export async function syncPlanFilesStatus(): Promise<{
  total_files: number;
  imported: number;
  pending: number;
  files: Array<{ filename: string; slug: string; imported: boolean; plan_id: string }>;
}> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/sync-plans/status`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Plan sync status failed: ${response.status}`);
  return response.json();
}
