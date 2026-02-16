<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchProjects } from '$lib/api/projects';
  import ProjectCard from '$lib/components/dashboard/ProjectCard.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import type { Project } from '$lib/types';

  let projects = $state<Project[]>([]);
  let isLoading = $state(true);
  let activeFilter = $state('all');
  let unsubscribe: (() => void) | undefined;

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'paused', label: 'Paused' },
    { id: 'archived', label: 'Archived' },
    { id: 'completed', label: 'Completed' },
  ];

  const filtered = $derived(
    activeFilter === 'all' ? projects : projects.filter((p) => p.status === activeFilter),
  );

  const statusCounts = $derived({
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    paused: projects.filter((p) => p.status === 'paused').length,
    archived: projects.filter((p) => p.status === 'archived').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  });

  onMount(async () => {
    try {
      const result = await fetchProjects();
      projects = result.items;
    } catch (err: unknown) {
      console.error('[Projects]', err);
    } finally {
      isLoading = false;
    }

    unsubscribe = await pb.collection('projects').subscribe('*', (e) => {
      if (e.action === 'create') {
        projects = [e.record as unknown as Project, ...projects].slice(0, 100);
      } else if (e.action === 'update') {
        projects = projects.map((p) =>
          p.id === e.record.id ? (e.record as unknown as Project) : p,
        );
      } else if (e.action === 'delete') {
        projects = projects.filter((p) => p.id !== e.record.id);
      }
    });
  });

  onDestroy(() => { unsubscribe?.(); });
</script>

<svelte:head>
  <title>Projects - MyTrend</title>
</svelte:head>

<div class="projects-page">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Projects</h1>
      <p class="subtitle">
        <ComicBadge color="green" size="sm">{statusCounts.active} active</ComicBadge>
        <ComicBadge color="blue" size="sm">{statusCounts.all} total</ComicBadge>
      </p>
    </div>
    <a href="/projects/new">
      <ComicButton variant="primary">New Project</ComicButton>
    </a>
  </div>

  <ComicTabs tabs={filterTabs} bind:active={activeFilter} />

  {#if isLoading}
    <BentoGrid columns={3} gap="md">
      {#each Array(6) as _}
        <ComicSkeleton variant="card" height="160px" />
      {/each}
    </BentoGrid>
  {:else if filtered.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No {activeFilter === 'all' ? '' : activeFilter + ' '}projects"
      description="Create your first project to start tracking conversations and ideas."
      actionLabel="New Project"
      actionHref="/projects/new"
    />
  {:else}
    <div class="projects-grid">
      {#each filtered as project, i (project.id)}
        <div class="project-item" style:animation-delay="{i * 40}ms">
          <ProjectCard {project} />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .projects-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .page-header a { text-decoration: none; }

  .subtitle {
    display: flex;
    gap: var(--spacing-xs);
    margin: 4px 0 0;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--spacing-md);
  }

  .project-item {
    animation: sketchFadeIn 0.3s ease both;
  }

  @media (max-width: 768px) {
    .page-header { flex-direction: column; }
    .projects-grid { grid-template-columns: 1fr; }
  }
</style>
