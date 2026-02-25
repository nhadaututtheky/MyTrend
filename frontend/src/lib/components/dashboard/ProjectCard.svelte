<script lang="ts">
  import type { Project } from '$lib/types';
  import { formatRelative } from '$lib/utils/date';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import { updateProject, deleteProject } from '$lib/api/projects';
  import { toast } from '$lib/stores/toast';
  import { getHealthStatus } from '$lib/utils/project-health';

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

  const health = $derived(getHealthStatus(project.last_activity ?? null));

  let menuOpen = $state(false);
  let isActing = $state(false);

  function toggleMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  async function handleArchive(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    isActing = true;
    try {
      const newStatus = project.status === 'archived' ? 'active' : 'archived';
      await updateProject(project.id, { status: newStatus });
      toast.success(newStatus === 'archived' ? 'Project archived' : 'Project restored');
    } catch {
      toast.error('Failed to update project');
    } finally {
      isActing = false;
    }
  }

  async function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    isActing = true;
    try {
      await deleteProject(project.id);
      toast.success('Project deleted');
    } catch {
      toast.error('Failed to delete project');
    } finally {
      isActing = false;
    }
  }
</script>

<svelte:window onclick={closeMenu} />

<div class="project-wrapper">
  <a href="/projects/{project.slug}" class="project-link" data-testid="project-card">
    <ComicCard variant="skewed">
      <div class="project-header">
        <span class="icon" style:background={project.color}>{project.icon}</span>
        <div class="info">
          <h3 class="name">
            {project.name}
            <span
              class="health-dot"
              style:background={health.dotColor}
              title={health.label}
              aria-label="Status: {health.label}"
            ></span>
          </h3>
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

  <!-- Quick action menu -->
  <div class="menu-anchor">
    <button
      class="menu-btn"
      onclick={toggleMenu}
      disabled={isActing}
      aria-label="Project actions"
      aria-expanded={menuOpen}
    >⋯</button>

    {#if menuOpen}
      <div class="dropdown" role="menu">
        <button class="dropdown-item" onclick={handleArchive} role="menuitem">
          {project.status === 'archived' ? '↩ Restore' : '📦 Archive'}
        </button>
        <button class="dropdown-item danger" onclick={handleDelete} role="menuitem">
          🗑 Delete
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .project-wrapper {
    position: relative;
  }

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

  /* Health dot */
  .health-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-left: 6px;
    vertical-align: middle;
    flex-shrink: 0;
  }

  /* Menu */
  .menu-anchor {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
  }

  .menu-btn {
    background: var(--bg-card);
    border: 1.5px solid var(--border-color);
    border-radius: 4px;
    width: 28px;
    height: 28px;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 150ms ease;
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .project-wrapper:hover .menu-btn {
    opacity: 1;
  }

  .menu-btn:focus-visible {
    opacity: 1;
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: 6px;
    box-shadow: 4px 4px 0 var(--border-color);
    min-width: 140px;
    overflow: hidden;
    z-index: 20;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
    transition: background 100ms ease;
  }

  .dropdown-item:hover {
    background: var(--bg-secondary);
  }

  .dropdown-item.danger {
    color: var(--accent-red);
  }
</style>
