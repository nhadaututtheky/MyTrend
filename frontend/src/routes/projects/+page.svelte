<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchProjects } from '$lib/api/projects';
  import ProjectCard from '$lib/components/dashboard/ProjectCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
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
    <h1 class="comic-heading">Projects</h1>
    <a href="/projects/new">
      <ComicButton variant="primary">New Project</ComicButton>
    </a>
  </div>

  <ComicTabs tabs={filterTabs} bind:active={activeFilter} />

  {#if isLoading}
    <p class="loading">Loading projects...</p>
  {:else if filtered.length === 0}
    <p class="empty">No {activeFilter === 'all' ? '' : activeFilter} projects. <a href="/projects/new">Create one!</a></p>
  {:else}
    <div class="projects-grid">
      {#each filtered as project (project.id)}
        <ProjectCard {project} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .projects-page { display: flex; flex-direction: column; gap: var(--spacing-lg); }
  .page-header { display: flex; align-items: center; justify-content: space-between; }
  .projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--spacing-md); margin-top: var(--spacing-md); }
  .loading, .empty { text-align: center; color: var(--text-muted); padding: var(--spacing-2xl); }
</style>
