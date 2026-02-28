import pb from '$lib/config/pocketbase';
import type { Idea, Research, PBListResult } from '$lib/types';

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

export async function promoteIdeaToPlan(id: string): Promise<Idea> {
  return pb.collection('ideas').update<Idea>(id, { status: 'planned' });
}

/**
 * Create an idea pre-filled from a research item.
 * Resolves project name → ID from applicable_projects[0].
 */
export async function createIdeaFromResearch(research: Research): Promise<Idea> {
  let projectId: string | null = null;
  const projectName = research.applicable_projects[0];
  if (projectName) {
    try {
      const safe = projectName.replace(/['"\\]/g, '');
      const proj = await pb.collection('projects').getFirstListItem(`name = "${safe}"`);
      projectId = proj.id;
    } catch {
      // Project not found — create without linking
    }
  }

  const patterns =
    research.patterns_extracted.length > 0
      ? `\n\nPatterns: ${research.patterns_extracted.join(', ')}`
      : '';

  return createIdea({
    title: research.title,
    content: `From research: ${research.url}\n\n${research.ai_summary}${patterns}`,
    type: 'feature',
    status: 'inbox',
    priority: research.verdict === 'fit' ? 'medium' : 'low',
    tags: [...research.tech_tags],
    project: projectId,
  });
}
