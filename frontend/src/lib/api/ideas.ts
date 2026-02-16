import pb from '$lib/config/pocketbase';
import type { Idea, PBListResult } from '$lib/types';

const ITEMS_PER_PAGE = 50;

export async function fetchIdeas(
  page = 1,
  projectId?: string,
  status?: string,
): Promise<PBListResult<Idea>> {
  const filters: string[] = [];
  if (projectId) filters.push(`project = "${projectId}"`);
  if (status) filters.push(`status = "${status}"`);
  const filter = filters.join(' && ');

  return pb.collection('ideas').getList<Idea>(page, ITEMS_PER_PAGE, {
    sort: '-created',
    filter,
  });
}

export async function fetchIdea(id: string): Promise<Idea | null> {
  try {
    return await pb.collection('ideas').getOne<Idea>(id);
  } catch {
    return null;
  }
}

export async function createIdea(data: Partial<Idea>): Promise<Idea> {
  return pb.collection('ideas').create<Idea>({
    ...data,
    user: pb.authStore.model?.id,
  });
}

export async function updateIdea(id: string, data: Partial<Idea>): Promise<Idea> {
  return pb.collection('ideas').update<Idea>(id, data);
}

export async function deleteIdea(id: string): Promise<boolean> {
  return pb.collection('ideas').delete(id);
}
