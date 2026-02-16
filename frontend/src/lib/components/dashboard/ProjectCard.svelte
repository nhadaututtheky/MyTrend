<script lang="ts">
  import type { Project } from '$lib/types';
  import { formatRelative } from '$lib/utils/date';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    project: Project;
  }

  const { project }: Props = $props();

  const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'blue' | 'red'> = {
    active: 'green',
    paused: 'yellow',
    archived: 'blue',
    completed: 'purple' as 'blue',
  };
</script>

<a href="/projects/{project.slug}" class="project-link" data-testid="project-card">
  <ComicCard variant="skewed">
    <div class="project-header">
      <span class="icon" style:background={project.color}>{project.icon}</span>
      <div class="info">
        <h3 class="name">{project.name}</h3>
        <ComicBadge color={STATUS_COLORS[project.status] ?? 'blue'} size="sm">
          {project.status}
        </ComicBadge>
      </div>
    </div>
    {#if project.description}
      <p class="description">{project.description}</p>
    {/if}
    <div class="stats">
      <span>{project.total_conversations} chats</span>
      <span>{project.total_ideas} ideas</span>
      {#if project.last_activity}
        <span class="last-activity">{formatRelative(project.last_activity)}</span>
      {/if}
    </div>
  </ComicCard>
</a>

<style>
  .project-link {
    text-decoration: none;
    color: inherit;
    display: block;
  }

  .project-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-family: var(--font-comic);
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .description {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-sm);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .stats {
    display: flex;
    gap: var(--spacing-md);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .last-activity {
    margin-left: auto;
  }
</style>
