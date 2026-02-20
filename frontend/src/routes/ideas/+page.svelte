<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchIdeas } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { Idea } from '$lib/types';

  let ideas = $state<Idea[]>([]);
  let isLoading = $state(true);
  let statusFilter = $state('all');
  let viewMode = $state<'grid' | 'list'>('grid');
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

  const inboxCount = $derived(ideas.filter((i) => i.status === 'inbox').length);

  const statusTabsWithCount = $derived(
    statusTabs.map((t) => t.id === 'inbox' && inboxCount > 0
      ? { ...t, label: `Inbox (${inboxCount})` }
      : t,
    ),
  );

  function isAutoExtracted(idea: Idea): boolean {
    return Array.isArray(idea.tags) && idea.tags.includes('auto-extracted');
  }

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  const NEON_MAP: Record<string, 'green' | 'blue' | 'purple' | 'red' | false> = {
    green: 'green', blue: 'blue', purple: 'purple', red: 'red',
  };

  function getNeonForType(type: string): 'green' | 'blue' | 'purple' | 'red' | false {
    const color = TYPE_COLORS[type];
    return color ? (NEON_MAP[color] ?? false) : false;
  }

  onMount(async () => {
    try {
      const result = await fetchIdeas();
      ideas = result.items;
    } catch (err: unknown) { console.error('[Ideas]', err); }
    finally { isLoading = false; }

    try {
      unsubscribe = await pb.collection('ideas').subscribe('*', (e) => {
        if (e.action === 'create') ideas = [e.record as unknown as Idea, ...ideas];
        else if (e.action === 'update') ideas = ideas.map((i) => i.id === e.record.id ? (e.record as unknown as Idea) : i);
        else if (e.action === 'delete') ideas = ideas.filter((i) => i.id !== e.record.id);
      });
    } catch (err: unknown) {
      console.error('[Ideas] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => { unsubscribe?.(); });
</script>

<svelte:head><title>Ideas - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Ideas</h1>
      <p class="subtitle">{ideas.length} ideas captured</p>
    </div>
    <div class="header-actions">
      <div class="view-toggle">
        <button class="toggle-btn" class:active={viewMode === 'grid'} onclick={() => { viewMode = 'grid'; }} aria-label="Grid view">▦</button>
        <button class="toggle-btn" class:active={viewMode === 'list'} onclick={() => { viewMode = 'list'; }} aria-label="List view">☰</button>
      </div>
      <a href="/ideas/new"><ComicButton variant="primary">New Idea</ComicButton></a>
    </div>
  </div>

  <ComicTabs tabs={statusTabsWithCount} bind:active={statusFilter} />

  {#if isLoading}
    <div class="skeleton-grid">
      {#each Array(6) as _}
        <ComicSkeleton variant="card" height="100px" />
      {/each}
    </div>
  {:else if filtered.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No ideas yet"
      description="Capture your next brilliant idea before it slips away."
      actionLabel="New Idea"
      actionHref="/ideas/new"
    />
  {:else}
    <div class="ideas-container" class:grid-view={viewMode === 'grid'} class:list-view={viewMode === 'list'}>
      {#each filtered as idea, i (idea.id)}
        <a href="/ideas/{idea.id}" class="idea-link" style:animation-delay="{i * 30}ms">
          <ComicCard variant="standard" neon={getNeonForType(idea.type)}>
            <div class="idea-header">
              <h3 class="idea-title">{idea.title}</h3>
              <div class="badges">
                {#if isAutoExtracted(idea)}
                  <ComicBadge color="blue" size="sm">auto</ComicBadge>
                {/if}
                <ComicBadge color={TYPE_COLORS[idea.type] ?? 'blue'} size="sm">{idea.type}</ComicBadge>
                <ComicBadge color={PRIORITY_COLORS[idea.priority] ?? 'green'} size="sm">{idea.priority}</ComicBadge>
              </div>
            </div>
            {#if idea.content}
              <p class="idea-preview">{stripHtml(idea.content).slice(0, 120)}{stripHtml(idea.content).length > 120 ? '...' : ''}</p>
            {/if}
            {#if Array.isArray(idea.tags) && idea.tags.length > 0}
              <div class="tags">{#each idea.tags.filter(t => t !== 'auto-extracted').slice(0, 3) as tag (tag)}<ComicBadge color="purple" size="sm">{tag}</ComicBadge>{/each}</div>
            {/if}
          </ComicCard>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--spacing-lg); }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); }
  .page-header a { text-decoration: none; }
  .subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 4px 0 0; }

  .header-actions { display: flex; align-items: center; gap: var(--spacing-sm); }

  .view-toggle {
    display: flex;
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .toggle-btn {
    background: var(--bg-secondary);
    border: none;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-muted);
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .toggle-btn.active {
    background: var(--accent-green);
    color: #1a1a1a;
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-sm);
  }

  .ideas-container.grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-sm);
  }

  .ideas-container.list-view {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .idea-link {
    text-decoration: none;
    color: inherit;
    animation: sketchFadeIn 0.3s ease both;
  }

  .idea-header { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); }
  .idea-title { font-size: 0.95rem; font-weight: 700; margin: 0; }
  .badges { display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap; }
  .idea-preview {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: var(--spacing-xs) 0 0;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--spacing-xs); }

  @media (max-width: 768px) {
    .page-header { flex-direction: column; }
    .ideas-container.grid-view { grid-template-columns: 1fr; }
  }
</style>
