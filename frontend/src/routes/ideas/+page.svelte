<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchIdeas } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type { Idea } from '$lib/types';

  let ideas = $state<Idea[]>([]);
  let isLoading = $state(true);
  let statusFilter = $state('all');
  let unsubscribe: (() => void) | undefined;

  const statusTabs = [
    { id: 'all', label: 'All' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'considering', label: 'Considering' },
    { id: 'planned', label: 'Planned' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ];

  const PRIORITY_COLORS: Record<string, 'green' | 'yellow' | 'orange' | 'red'> = {
    low: 'green', medium: 'yellow', high: 'orange', critical: 'red',
  };

  const TYPE_COLORS: Record<string, 'blue' | 'red' | 'purple' | 'green' | 'orange' | 'yellow'> = {
    feature: 'green', bug: 'red', design: 'purple', architecture: 'blue', optimization: 'orange', question: 'yellow',
  };

  const filtered = $derived(
    statusFilter === 'all' ? ideas : ideas.filter((i) => i.status === statusFilter),
  );

  onMount(async () => {
    try {
      const result = await fetchIdeas();
      ideas = result.items;
    } catch (err: unknown) { console.error('[Ideas]', err); }
    finally { isLoading = false; }

    unsubscribe = await pb.collection('ideas').subscribe('*', (e) => {
      if (e.action === 'create') ideas = [e.record as unknown as Idea, ...ideas];
      else if (e.action === 'update') ideas = ideas.map((i) => i.id === e.record.id ? (e.record as unknown as Idea) : i);
      else if (e.action === 'delete') ideas = ideas.filter((i) => i.id !== e.record.id);
    });
  });

  onDestroy(() => { unsubscribe?.(); });
</script>

<svelte:head><title>Ideas - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <h1 class="comic-heading">Ideas</h1>
    <a href="/ideas/new"><ComicButton variant="primary">New Idea</ComicButton></a>
  </div>

  <ComicTabs tabs={statusTabs} bind:active={statusFilter} />

  {#if isLoading}
    <p class="loading">Loading...</p>
  {:else if filtered.length === 0}
    <p class="empty">No ideas yet. <a href="/ideas/new">Add one!</a></p>
  {:else}
    <div class="ideas-list">
      {#each filtered as idea (idea.id)}
        <a href="/ideas/{idea.id}" class="idea-link">
          <ComicCard variant="standard">
            <div class="idea-header">
              <h3 class="idea-title">{idea.title}</h3>
              <div class="badges">
                <ComicBadge color={TYPE_COLORS[idea.type] ?? 'blue'} size="sm">{idea.type}</ComicBadge>
                <ComicBadge color={PRIORITY_COLORS[idea.priority] ?? 'green'} size="sm">{idea.priority}</ComicBadge>
              </div>
            </div>
            {#if idea.tags.length > 0}
              <div class="tags">{#each idea.tags.slice(0, 3) as tag (tag)}<ComicBadge color="purple" size="sm">{tag}</ComicBadge>{/each}</div>
            {/if}
          </ComicCard>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--spacing-lg); }
  .page-header { display: flex; align-items: center; justify-content: space-between; }
  .ideas-list { display: flex; flex-direction: column; gap: var(--spacing-sm); margin-top: var(--spacing-md); }
  .idea-link { text-decoration: none; color: inherit; }
  .idea-header { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
  .idea-title { font-size: 0.95rem; font-weight: 700; margin: 0; }
  .badges { display: flex; gap: 4px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--spacing-xs); }
  .loading, .empty { text-align: center; color: var(--text-muted); padding: var(--spacing-2xl); }
</style>
