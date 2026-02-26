<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchConversations } from '$lib/api/conversations';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { formatRelative } from '$lib/utils/date';
  import type { Conversation } from '$lib/types';

  let conversations = $state<Conversation[]>([]);
  let isLoading = $state(true);
  let sourceFilter = $state('all');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let unsubscribe: (() => void) | undefined;

  function countBySource(source: string): number {
    return conversations.filter((c) => c.source === source).length;
  }

  const sourceTabs = $derived([
    { id: 'all', label: 'All', badge: conversations.length },
    { id: 'cli', label: 'CLI', badge: countBySource('cli') },
    { id: 'desktop', label: 'Desktop', badge: countBySource('desktop') },
    { id: 'web', label: 'Web', badge: countBySource('web') },
    { id: 'hub', label: 'Hub', badge: countBySource('hub') },
    { id: 'imported', label: 'Imported', badge: countBySource('imported') },
  ]);

  const SOURCE_COLORS: Record<string, 'green' | 'blue' | 'purple' | 'orange' | 'yellow'> = {
    cli: 'green',
    desktop: 'blue',
    web: 'purple',
    hub: 'orange',
    imported: 'yellow',
  };

  const filtered = $derived(
    sourceFilter === 'all' ? conversations : conversations.filter((c) => c.source === sourceFilter),
  );

  async function loadConversations(): Promise<void> {
    isLoading = true;
    try {
      const result = await fetchConversations(currentPage);
      conversations = result.items;
      totalPages = result.totalPages;
    } catch (err: unknown) {
      console.error('[Conversations]', err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    await loadConversations();
    try {
      unsubscribe = await pb.collection('conversations').subscribe('*', (e) => {
        if (e.action === 'create')
          conversations = [e.record as unknown as Conversation, ...conversations].slice(0, 100);
        else if (e.action === 'delete')
          conversations = conversations.filter((c) => c.id !== e.record.id);
      });
    } catch (err: unknown) {
      console.error('[Conversations] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<svelte:head><title>Conversations - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Conversations</h1>
      <p class="subtitle">{conversations.length} conversations tracked</p>
    </div>
    <a href="/conversations/import"><ComicButton variant="secondary">Import</ComicButton></a>
  </div>

  <ComicTabs tabs={sourceTabs} bind:active={sourceFilter} />

  {#if isLoading}
    <div class="skeleton-list">
      {#each Array(5) as _}
        <ComicSkeleton variant="card" height="90px" />
      {/each}
    </div>
  {:else if filtered.length === 0}
    <ComicEmptyState
      illustration="inbox"
      message="No conversations found"
      description="Import your Claude conversations or start new ones in the Hub."
      actionLabel="Import"
      actionHref="/conversations/import"
    />
  {:else}
    <div class="list">
      {#each filtered as conv, i (conv.id)}
        <a href="/conversations/{conv.id}" class="list-link" style:animation-delay="{i * 30}ms">
          <ComicCard variant="standard">
            <div class="conv-header">
              <h3 class="conv-title">{conv.title}</h3>
              <ComicBadge color={SOURCE_COLORS[conv.source] ?? 'blue'} size="sm"
                >{conv.source}</ComicBadge
              >
            </div>
            {#if conv.summary}<p class="conv-summary">{conv.summary}</p>{/if}
            <div class="conv-meta">
              <span>{conv.message_count} messages</span>
              <span>{(conv.total_tokens ?? 0).toLocaleString()} tokens</span>
              {#if conv.device_name}<span>{conv.device_name}</span>{/if}
              <span class="time">{formatRelative(conv.started_at)}</span>
            </div>
            {#if (conv.tags ?? []).length > 0}
              <div class="tags">
                {#each (conv.tags ?? []).slice(0, 5) as tag (tag)}<ComicBadge
                    color="purple"
                    size="sm">{tag}</ComicBadge
                  >{/each}
              </div>
            {/if}
          </ComicCard>
        </a>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <ComicButton
          variant="outline"
          disabled={currentPage <= 1}
          onclick={() => {
            currentPage--;
            loadConversations();
          }}>Prev</ComicButton
        >
        <span class="page-info">Page {currentPage} / {totalPages}</span>
        <ComicButton
          variant="outline"
          disabled={currentPage >= totalPages}
          onclick={() => {
            currentPage++;
            loadConversations();
          }}>Next</ComicButton
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
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
  .page-header a {
    text-decoration: none;
  }
  .subtitle {
    font-size: var(--font-size-md);
    color: var(--text-muted);
    margin: var(--spacing-xs) 0 0;
  }
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .list-link {
    text-decoration: none;
    color: inherit;
    animation: sketchFadeIn 0.3s ease both;
  }
  .conv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }
  .conv-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-summary {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .conv-meta {
    display: flex;
    gap: var(--spacing-md);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
  .time {
    margin-left: auto;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: var(--spacing-xs);
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
  }
  .page-info {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
    }
  }
</style>
