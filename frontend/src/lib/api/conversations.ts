import pb from '$lib/config/pocketbase';
import type { Conversation, PBListResult } from '$lib/types';

const ITEMS_PER_PAGE = 50;

export async function fetchConversations(
  page = 1,
  projectId?: string,
): Promise<PBListResult<Conversation>> {
  const filter = projectId ? `project = "${projectId}"` : '';
  return pb.collection('conversations').getList<Conversation>(page, ITEMS_PER_PAGE, {
    sort: '-started_at',
    filter,
    fields:
      'id,title,summary,source,device_name,message_count,total_tokens,topics,tags,started_at,ended_at,duration_min,project,created',
  });
}

export async function fetchConversation(id: string): Promise<Conversation | null> {
  try {
    return await pb.collection('conversations').getOne<Conversation>(id);
  } catch {
    return null;
  }
}

export async function createConversation(
  data: Partial<Conversation>,
): Promise<Conversation> {
  return pb.collection('conversations').create<Conversation>({
    ...data,
    user: pb.authStore.model?.id,
  });
}

export async function updateConversation(
  id: string,
  data: Partial<Conversation>,
): Promise<Conversation> {
  return pb.collection('conversations').update<Conversation>(id, data);
}

export async function deleteConversation(id: string): Promise<boolean> {
  return pb.collection('conversations').delete(id);
}
