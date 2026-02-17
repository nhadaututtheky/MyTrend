<script lang="ts">
  import { onMount } from 'svelte';
  import { hybridSearch } from '$lib/api/search';
  import { debounce, highlightMatch } from '$lib/utils/search';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { SearchResult } from '$lib/types';

  const HISTORY_KEY = 'mytrend-search-history';
  const MAX_HISTORY = 8;

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let hasSearched = $state(false);
  let typeFilter = $state('all');
  let searchHistory = $state<string[]>([]);
  let inputRef = $state<HTMLElement | undefined>(undefined);

  const TYPE_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'purple'> = {
    project: 'green',
    conversation: 'blue',
    idea: 'yellow',
    topic: 'purple',
  };

  const TYPE_LINKS: Record<string, string> = {
    project: '/projects',
    conversation: '/conversations',
    idea: '/ideas',
    topic: '/trends/topics',
  };

  const typeTabs = $derived.by(() => {
    const counts: Record<string, number> = { all: results.length };
    for (const r of results) {
      counts[r.type] = (counts[r.type] ?? 0) + 1;
    }
    return [
      { id: 'all', label: 'All', badge: counts['all'] ?? 0 },
      { id: 'project', label: 'Projects', badge: counts['project'] ?? 0 },
      { id: 'conversation', label: 'Conversations', badge: counts['conversation'] ?? 0 },
      { id: 'idea', label: 'Ideas', badge: counts['idea'] ?? 0 },
      { id: 'topic', label: 'Topics', badge: counts['topic'] ?? 0 },
    ];
  });

  const filteredResults = $derived(
    typeFilter === 'all' ? results : results.filter((r) => r.type === typeFilter),
  );

  function getLink(result: SearchResult): string {
    if (result.type === 'topic') return '/trends/topics';
    const base = TYPE_LINKS[result.type] ?? '/';
    return `${base}/${result.id}`;
  }

  function saveToHistory(q: string): void {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) return;
    searchHistory = [trimmed, ...searchHistory.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
    } catch { /* localStorage unavailable */ }
  }

  function loadHistory(): void {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) searchHistory = JSON.parse(stored) as string[];
    } catch { /* localStorage unavailable */ }
  }

  function clearHistory(): void {
    searchHistory = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* noop */ }
  }

  function useHistoryItem(item: string): void {
    query = item;
    doSearch(item);
  }

  const doSearch = debounce(async (q: string) => {
    if (q.length < 2) {
      results = [];
      hasSearched = false;
      typeFilter = 'all';
      return;
    }
    isSearching = true;
    hasSearched = true;
    try {
      results = await hybridSearch(q);
      saveToHistory(q);
    } catch (err: unknown) {
      console.error('[Search]', err);
      results = [];
    } finally {
      isSearching = false;
    }
  });

  function handleInput(): void {
    doSearch(query);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      inputRef?.querySelector('input')?.focus();
    }
  }

  onMount(() => {
    loadHistory();
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

<svelte:head>
  <title>Search - MyTrend</title>
</svelte:head>

<div class="search-page">
  <div class="search-header">
    <h1 class="comic-heading">Search Everything</h1>
    <kbd class="shortcut">Ctrl+K</kbd>
  </div>

  <div class="search-bar" bind:this={inputRef}>
    <ComicInput
      bind:value={query}
      type="search"
      placeholder="Search projects, conversations, ideas, topics..."
      oninput={handleInput}
      icon="🔍"
    />
  </div>

  {#if hasSearched && results.length > 0}
    <ComicTabs tabs={typeTabs} bind:active={typeFilter} />
  {/if}

  {#if isSearching}
    <div class="skeleton-results">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="90px" />
      {/each}
    </div>
  {:else if hasSearched && filteredResults.length === 0}
    <ComicEmptyState
      illustration="search"
      message="No results found"
      description={typeFilter !== 'all'
        ? `No ${typeFilter}s match your search. Try "All" tab.`
        : 'Try different keywords or check your spelling.'}
    />
  {:else if filteredResults.length > 0}
    <p class="result-count">{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}</p>
    <div class="results">
      {#each filteredResults as result, i (result.type + result.id)}
        <a href={getLink(result)} class="result-link" style:animation-delay="{i * 40}ms">
          <ComicCard variant="standard">
            <div class="result-header">
              <ComicBadge color={TYPE_COLORS[result.type] ?? 'blue'} size="sm">
                {result.type}
              </ComicBadge>
              <span class="score">{Math.round(result.score * 100)}%</span>
            </div>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <h3 class="result-title">{@html highlightMatch(result.title, query)}</h3>
            {#if result.snippet}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <p class="result-snippet">{@html highlightMatch(result.snippet, query)}</p>
            {/if}
          </ComicCard>
        </a>
      {/each}
    </div>
  {:else}
    <div class="search-home">
      {#if searchHistory.length > 0}
        <ComicCard>
          <div class="section-header">
            <h3 class="section-title">Recent Searches</h3>
            <button class="clear-btn" onclick={clearHistory}>Clear</button>
          </div>
          <div class="history-list">
            {#each searchHistory as item (item)}
              <button class="history-item" onclick={() => useHistoryItem(item)}>
                <span class="history-icon" aria-hidden="true">&#128336;</span>
                {item}
              </button>
            {/each}
          </div>
        </ComicCard>
      {/if}

      <ComicCard>
        <h3 class="section-title">Search Tips</h3>
        <ul class="hints-list">
          <li>Search across all projects, conversations, ideas, and topics</li>
          <li>Results ranked by relevance using FTS5 + Neural Memory</li>
          <li>Type at least 2 characters to start</li>
          <li>Use <kbd>Ctrl+K</kbd> to focus search from anywhere</li>
        </ul>
      </ComicCard>
    </div>
  {/if}
</div>

<style>
  .search-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 800px;
    margin: 0 auto;
  }

  .search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .shortcut {
    font-family: var(--font-mono, monospace);
    font-size: 0.7rem;
    padding: 2px 8px;
    border: 1.5px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .search-bar { margin-bottom: var(--spacing-sm); }

  .skeleton-results { display: flex; flex-direction: column; gap: var(--spacing-md); }

  .result-count { font-size: 0.8rem; color: var(--text-muted); margin: 0; }

  .results { display: flex; flex-direction: column; gap: var(--spacing-md); }

  .result-link {
    text-decoration: none;
    color: inherit;
    animation: sketchFadeIn 0.3s ease both;
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-xs);
  }

  .score { font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono, monospace); }

  .result-title { font-size: 1rem; font-weight: 700; margin: 0 0 4px; }

  .result-snippet {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-snippet :global(mark),
  .result-title :global(mark) {
    background: var(--accent-yellow);
    padding: 0 2px;
    border-radius: 2px;
  }

  .search-home { display: flex; flex-direction: column; gap: var(--spacing-md); }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }

  .section-title {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .clear-btn {
    all: unset;
    font-family: var(--font-comic);
    font-size: 0.7rem;
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
  }
  .clear-btn:hover { color: var(--accent-red); }

  .history-list { display: flex; flex-direction: column; gap: 2px; }

  .history-item {
    all: unset;
    font-family: var(--font-comic);
    font-size: 0.85rem;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sketch);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    color: var(--text-secondary);
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .history-item:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .history-icon { font-size: 0.75rem; opacity: 0.6; }

  .hints-list {
    font-size: 0.85rem;
    color: var(--text-secondary);
    padding-left: var(--spacing-lg);
    margin: 0;
  }
  .hints-list li { margin-bottom: var(--spacing-xs); }
  .hints-list kbd {
    font-family: var(--font-mono, monospace);
    font-size: 0.7rem;
    padding: 1px 4px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-secondary);
  }
</style>
