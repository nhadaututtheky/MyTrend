import pb from '$lib/config/pocketbase';
import { nmQuery } from '$lib/config/neural-memory';
import type { SearchResult } from '$lib/types';

const MAX_RESULTS = 20;

export async function hybridSearch(query: string, brain?: string): Promise<SearchResult[]> {
  // Run FTS5 and Neural Memory in parallel, merge results
  const [ftsResults, nmResults] = await Promise.allSettled([
    fts5Search(query),
    nmQuery(query, brain),
  ]);

  const results: SearchResult[] = [];

  if (ftsResults.status === 'fulfilled') {
    results.push(...ftsResults.value);
  }

  if (nmResults.status === 'fulfilled') {
    for (const nm of nmResults.value) {
      // Avoid duplicates
      const exists = results.some((r) => r.id === nm.id);
      if (!exists) {
        results.push({
          type: (nm.metadata['type'] as SearchResult['type']) ?? 'conversation',
          id: nm.id,
          title: (nm.metadata['title'] as string) ?? '',
          snippet: nm.content.slice(0, 200),
          score: nm.score,
          highlight: nm.content.slice(0, 200),
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

async function fts5Search(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Search conversations
  try {
    const convs = await pb.collection('conversations').getList(1, 10, {
      filter: `title ~ "${query}" || summary ~ "${query}"`,
      fields: 'id,title,summary',
    });
    for (const item of convs.items) {
      results.push({
        type: 'conversation',
        id: item['id'] as string,
        title: item['title'] as string,
        snippet: (item['summary'] as string) ?? '',
        score: 0.8,
        highlight: '',
      });
    }
  } catch {
    // FTS5 search failed, skip
  }

  // Search ideas
  try {
    const ideas = await pb.collection('ideas').getList(1, 10, {
      filter: `title ~ "${query}" || content ~ "${query}"`,
      fields: 'id,title,content',
    });
    for (const item of ideas.items) {
      results.push({
        type: 'idea',
        id: item['id'] as string,
        title: item['title'] as string,
        snippet: ((item['content'] as string) ?? '').slice(0, 200),
        score: 0.7,
        highlight: '',
      });
    }
  } catch {
    // FTS5 search failed, skip
  }

  // Search projects
  try {
    const projects = await pb.collection('projects').getList(1, 10, {
      filter: `name ~ "${query}" || description ~ "${query}"`,
      fields: 'id,name,description',
    });
    for (const item of projects.items) {
      results.push({
        type: 'project',
        id: item['id'] as string,
        title: item['name'] as string,
        snippet: (item['description'] as string) ?? '',
        score: 0.9,
        highlight: '',
      });
    }
  } catch {
    // FTS5 search failed, skip
  }

  return results;
}
