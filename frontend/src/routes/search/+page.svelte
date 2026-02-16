<script lang="ts">
  import { hybridSearch } from '$lib/api/search';
  import { debounce, highlightMatch } from '$lib/utils/search';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { SearchResult } from '$lib/types';

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let hasSearched = $state(false);

  const TYPE_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'purple'> = {
    project: 'green',
    conversation: 'blue',
    idea: 'yellow',
    topic: 'purple',
  };

  const TYPE_LINKS: Record<string, string> = {
    project: '/projects',     // id = slug (backend returns slug)
    conversation: '/conversations',
    idea: '/ideas',
    topic: '/trends/topics',
  };

  // For topics, link to the topics page (no detail page per topic)
  function getLink(result: SearchResult): string {
    if (result.type === 'topic') return '/trends/topics';
    const base = TYPE_LINKS[result.type] ?? '/';
    return `${base}/${result.id}`;
  }

  const resultCount = $derived(results.length);

  const doSearch = debounce(async (q: string) => {
    if (q.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }
    isSearching = true;
    hasSearched = true;
    try {
      results = await hybridSearch(q);
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

</script>

<svelte:head>
  <title>Search - MyTrend</title>
</svelte:head>

<div class="search-page">
  <h1 class="comic-heading">Search Everything</h1>

  <div class="search-bar">
    <ComicInput
      bind:value={query}
      type="search"
      placeholder="Search projects, conversations, ideas, topics..."
      oninput={handleInput}
      icon="🔍"
    />
  </div>

  {#if isSearching}
    <div class="skeleton-results">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="90px" />
      {/each}
    </div>
  {:else if hasSearched && results.length === 0}
    <ComicEmptyState
      illustration="search"
      message="No results found"
      description="Try different keywords or check your spelling."
    />
  {:else if results.length > 0}
    <p class="result-count">{resultCount} result{resultCount !== 1 ? 's' : ''} found</p>
    <div class="results">
      {#each results as result, i (result.type + result.id)}
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
    <div class="search-hints">
      <ComicCard>
        <h3 class="section-title">Search Tips</h3>
        <ul class="hints-list">
          <li>Search across all projects, conversations, ideas, and topics</li>
          <li>Results are ranked by relevance using FTS5 + Neural Memory</li>
          <li>Type at least 2 characters to start searching</li>
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

  .search-bar {
    margin-bottom: var(--spacing-sm);
  }

  .skeleton-results {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .result-count {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

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

  .score {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .result-title {
    font-size: 1rem;
    font-weight: 700;
    margin: 0 0 4px;
  }

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

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-sm);
  }

  .hints-list {
    font-size: 0.875rem;
    color: var(--text-secondary);
    padding-left: var(--spacing-lg);
  }

  .hints-list li {
    margin-bottom: var(--spacing-xs);
  }
</style>
