import pb from '$lib/config/pocketbase';
import type { Project, PBListResult } from '$lib/types';

const ITEMS_PER_PAGE = 50;

export async function fetchProjects(
  page = 1,
  status?: string,
): Promise<PBListResult<Project>> {
  const filter = status ? `status = "${status}"` : '';
  return pb.collection('projects').getList<Project>(page, ITEMS_PER_PAGE, {
    sort: '-last_activity',
    filter,
  });
}

export async function fetchProjectBySlug(slug: string): Promise<Project | null> {
  try {
    return await pb.collection('projects').getFirstListItem<Project>(`slug = "${slug}"`);
  } catch {
    return null;
  }
}

export async function createProject(data: {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  tech_stack: string[];
  status: string;
}): Promise<Project> {
  return pb.collection('projects').create<Project>({
    ...data,
    user: pb.authStore.model?.id,
    dna: { vision: '', stack: data.tech_stack, phase: '', challenges: [], decisions: [] },
    total_conversations: 0,
    total_ideas: 0,
    total_minutes: 0,
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return pb.collection('projects').update<Project>(id, data);
}

export async function deleteProject(id: string): Promise<boolean> {
  return pb.collection('projects').delete(id);
}
