<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import pb from '$lib/config/pocketbase';
  import { fetchConversations } from '$lib/api/conversations';
  import ComicDataTable from '$lib/components/comic/ComicDataTable.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { formatRelative } from '$lib/utils/date';
  import type { Conversation } from '$lib/types';

  let conversations = $state<Conversation[]>([]);
  let isLoading = $state(true);
  let sourceFilter = $state('all');
  let searchQuery = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let sortKey = $state('started_at');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let unsubscribe: (() => void) | undefined;

  const sourceTabs = [
    { id: 'all', label: 'All' },
    { id: 'cli', label: 'CLI' },
    { id: 'desktop', label: 'Desktop' },
    { id: 'web', label: 'Web' },
    { id: 'hub', label: 'Hub' },
    { id: 'imported', label: 'Imported' },
  ];

  const SOURCE_COLORS: Record<string, 'green' | 'blue' | 'purple' | 'orange' | 'yellow'> = {
    cli: 'green', desktop: 'blue', web: 'purple', hub: 'orange', imported: 'yellow',
  };

  const columns = [
    { key: 'title', label: 'Title', sortable: true },
    { key: 'source', label: 'Source', sortable: true, width: '90px' },
    { key: 'message_count', label: 'Messages', sortable: true, width: '90px' },
    { key: 'total_tokens', label: 'Tokens', sortable: true, width: '100px' },
    { key: 'duration_min', label: 'Duration', sortable: true, width: '90px' },
    { key: 'started_at', label: 'Date', sortable: true, width: '120px' },
  ];

  const filtered = $derived.by(() => {
    let result = conversations;
    if (sourceFilter !== 'all') {
      result = result.filter((c) => c.source === sourceFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  });

  const sorted = $derived.by(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const aVal = a[sortKey as keyof Conversation];
      const bVal = b[sortKey as keyof Conversation];
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
      if (typeof aVal === 'string' && typeof bVal === 'string') return aVal.localeCompare(bVal) * dir;
      return 0;
    });
    return list;
  });

  const tableRows = $derived(
    sorted.map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source,
      message_count: c.message_count,
      total_tokens: c.total_tokens,
      duration_min: c.duration_min,
      started_at: c.started_at,
      summary: c.summary,
      tags: [...c.tags],
    })),
  );

  const sourceCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const c of conversations) {
      counts[c.source] = (counts[c.source] ?? 0) + 1;
    }
    return counts;
  });

  const tabsWithBadge = $derived(
    sourceTabs.map((t) => ({
      ...t,
      badge: t.id === 'all' ? conversations.length : (sourceCounts[t.id] ?? 0),
    })),
  );

  const totalTokens = $derived(filtered.reduce((s, c) => s + c.total_tokens, 0));

  function handleSort(key: string): void {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'started_at' ? 'desc' : 'asc';
    }
  }

  function handleRowClick(row: Record<string, unknown>): void {
    goto(`/conversations/${row['id'] as string}`);
  }

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

  function handlePageChange(page: number): void {
    currentPage = page;
    loadConversations();
  }

  onMount(async () => {
    await loadConversations();
    unsubscribe = await pb.collection('conversations').subscribe('*', (e) => {
      if (e.action === 'create') conversations = [e.record as unknown as Conversation, ...conversations].slice(0, 100);
      else if (e.action === 'delete') conversations = conversations.filter((c) => c.id !== e.record.id);
    });
  });

  onDestroy(() => { unsubscribe?.(); });
</script>

<svelte:head><title>Conversations - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Conversations</h1>
      <p class="subtitle">
        {filtered.length} conversations &middot; {totalTokens.toLocaleString()} tokens
      </p>
    </div>
    <a href="/conversations/import"><ComicButton variant="secondary">Import</ComicButton></a>
  </div>

  <div class="controls">
    <div class="search-box">
      <ComicInput
        bind:value={searchQuery}
        type="search"
        placeholder="Filter by title, summary, tags..."
        icon="🔍"
      />
    </div>
    <ComicTabs tabs={tabsWithBadge} bind:active={sourceFilter} />
  </div>

  {#if isLoading}
    <div class="skeleton-list">
      {#each Array(5) as _}
        <ComicSkeleton variant="card" height="48px" />
      {/each}
    </div>
  {:else if filtered.length === 0}
    <ComicEmptyState
      illustration="inbox"
      message={searchQuery ? 'No matching conversations' : 'No conversations found'}
      description={searchQuery
        ? `No results for "${searchQuery}". Try different keywords.`
        : 'Import your Claude conversations or start new ones in the Hub.'}
      actionLabel={searchQuery ? undefined : 'Import'}
      actionHref={searchQuery ? undefined : '/conversations/import'}
    />
  {:else}
    <ComicDataTable
      {columns}
      rows={tableRows}
      page={currentPage}
      {totalPages}
      {sortKey}
      {sortDir}
      onSort={handleSort}
      onPageChange={handlePageChange}
      onRowClick={handleRowClick}
    >
      {#snippet renderCell({ row, column, value })}
        {#if column.key === 'title'}
          <div class="cell-title">
            <span class="title-text">{value}</span>
            {#if row['summary']}
              <span class="title-summary">{row['summary']}</span>
            {/if}
          </div>
        {:else if column.key === 'source'}
          <ComicBadge color={SOURCE_COLORS[String(value)] ?? 'blue'} size="sm">{value}</ComicBadge>
        {:else if column.key === 'total_tokens'}
          <span class="mono">{(value as number).toLocaleString()}</span>
        {:else if column.key === 'duration_min'}
          <span class="mono">{value ? `${value}m` : '-'}</span>
        {:else if column.key === 'started_at'}
          <span class="time">{formatRelative(String(value))}</span>
        {:else}
          {String(value ?? '')}
        {/if}
      {/snippet}
    </ComicDataTable>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--spacing-lg); }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--spacing-md); }
  .page-header a { text-decoration: none; }
  .subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 4px 0 0; }

  .controls { display: flex; flex-direction: column; gap: var(--spacing-sm); }
  .search-box { max-width: 400px; }

  .skeleton-list { display: flex; flex-direction: column; gap: var(--spacing-xs); }

  .cell-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title-text {
    font-weight: 700;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 400px;
  }
  .title-summary {
    font-size: 0.7rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 400px;
  }

  .mono { font-family: var(--font-mono, monospace); font-weight: 700; font-size: 0.8rem; }
  .time { font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; }

  @media (max-width: 768px) {
    .page-header { flex-direction: column; }
    .search-box { max-width: 100%; }
    .title-text, .title-summary { max-width: 200px; }
  }
</style>
