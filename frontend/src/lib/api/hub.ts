import pb from '$lib/config/pocketbase';
import type { HubSession, HubEnvironment, HubCronJob, PBListResult } from '$lib/types';

const ITEMS_PER_PAGE = 50;

// Sessions
export async function fetchSessions(
  projectId?: string,
): Promise<PBListResult<HubSession>> {
  const filter = projectId ? `project = "${projectId}"` : '';
  return pb.collection('hub_sessions').getList<HubSession>(1, ITEMS_PER_PAGE, {
    sort: '-updated',
    filter,
    fields:
      'id,name,status,model,message_count,total_input_tokens,total_output_tokens,estimated_cost,environment,devices,last_message_at,project,created,updated',
  });
}

export async function fetchSession(id: string): Promise<HubSession | null> {
  try {
    return await pb.collection('hub_sessions').getOne<HubSession>(id);
  } catch {
    return null;
  }
}

export async function createSession(data: {
  name?: string;
  project?: string;
  environment?: string;
  model?: string;
  system_prompt?: string;
}): Promise<HubSession> {
  return pb.collection('hub_sessions').create<HubSession>({
    user: pb.authStore.model?.id,
    name: data.name ?? `Session ${new Date().toLocaleDateString()}`,
    status: 'active',
    model: data.model ?? 'claude-sonnet-4-6',
    system_prompt: data.system_prompt ?? '',
    messages: [],
    message_count: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    estimated_cost: 0,
    environment: data.environment ?? 'default',
    devices: [],
    project: data.project ?? null,
  });
}

export async function updateSession(
  id: string,
  data: Partial<HubSession>,
): Promise<HubSession> {
  return pb.collection('hub_sessions').update<HubSession>(id, data);
}

export async function archiveSession(id: string): Promise<HubSession> {
  return updateSession(id, { status: 'archived' });
}

export async function deleteSession(id: string): Promise<boolean> {
  return pb.collection('hub_sessions').delete(id);
}

// Environments
export async function fetchEnvironments(): Promise<HubEnvironment[]> {
  const result = await pb
    .collection('hub_environments')
    .getList<HubEnvironment>(1, ITEMS_PER_PAGE, {
      sort: 'name',
    });
  return result.items;
}

export async function createEnvironment(
  data: Partial<HubEnvironment>,
): Promise<HubEnvironment> {
  return pb.collection('hub_environments').create<HubEnvironment>({
    ...data,
    user: pb.authStore.model?.id,
  });
}

export async function updateEnvironment(
  id: string,
  data: Partial<HubEnvironment>,
): Promise<HubEnvironment> {
  return pb.collection('hub_environments').update<HubEnvironment>(id, data);
}

// Cron Jobs
export async function fetchCronJobs(): Promise<HubCronJob[]> {
  const result = await pb
    .collection('hub_cron_jobs')
    .getList<HubCronJob>(1, ITEMS_PER_PAGE, {
      sort: '-created',
    });
  return result.items;
}

export async function createCronJob(data: Partial<HubCronJob>): Promise<HubCronJob> {
  return pb.collection('hub_cron_jobs').create<HubCronJob>({
    ...data,
    user: pb.authStore.model?.id,
    run_count: 0,
  });
}

export async function updateCronJob(
  id: string,
  data: Partial<HubCronJob>,
): Promise<HubCronJob> {
  return pb.collection('hub_cron_jobs').update<HubCronJob>(id, data);
}

// Hub Settings (API Key)
export interface HubSettings {
  anthropic_api_key_set: boolean;
  anthropic_api_key_masked: string;
  env_api_key_set: boolean;
}

export async function getHubSettings(): Promise<HubSettings> {
  const pbUrl = import.meta.env.VITE_PB_URL || 'http://localhost:8090';
  const res = await fetch(`${pbUrl}/api/mytrend/settings/hub`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error('Failed to load Hub settings');
  return res.json();
}

export async function saveHubApiKey(apiKey: string): Promise<{ success: boolean }> {
  const pbUrl = import.meta.env.VITE_PB_URL || 'http://localhost:8090';
  const res = await fetch(`${pbUrl}/api/mytrend/settings/hub`, {
    method: 'PUT',
    headers: {
      Authorization: pb.authStore.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ anthropic_api_key: apiKey }),
  });
  if (!res.ok) throw new Error('Failed to save API key');
  return res.json();
}

// Streaming - sends message to Claude API via server route
export async function sendHubMessage(
  sessionId: string,
  content: string,
): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const response = await fetch('/api/hub/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, content }),
    });

    if (!response.ok || !response.body) {
      console.error('[Hub] Stream failed:', response.status);
      return null;
    }

    return response.body;
  } catch (err: unknown) {
    console.error('[Hub] Stream error:', err);
    return null;
  }
}
