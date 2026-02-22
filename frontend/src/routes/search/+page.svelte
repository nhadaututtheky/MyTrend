<script lang="ts">
  import { hybridSearch, askQuestion } from '$lib/api/search';
  import { debounce, highlightMatch } from '$lib/utils/search';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicCallout from '$lib/components/comic/ComicCallout.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type { SearchResult, AskResult } from '$lib/types';

  type SearchMode = 'search' | 'ask';

  let mode = $state<SearchMode>('search');
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let askResult = $state<AskResult | null>(null);
  let isSearching = $state(false);
  let hasSearched = $state(false);

  const TYPE_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'purple'> = {
    project: 'green',
    conversation: 'blue',
    idea: 'yellow',
    topic: 'purple',
    plan: 'blue',
    activity: 'green',
    claude_task: 'purple',
  };

  const TYPE_LINKS: Record<string, string> = {
    project: '/projects',
    conversation: '/conversations',
    idea: '/ideas',
    topic: '/trends',
    plan: '/plans',
    activity: '/activity',
    claude_task: '/vibe',
  };

  function getLink(result: SearchResult): string {
    if (result.type === 'topic') return '/trends';
    const base = TYPE_LINKS[result.type] ?? '/';
    return `${base}/${result.id}`;
  }

  function getSourceLink(source: AskResult['sources'][0]): string {
    if (source.type === 'topic') return '/trends';
    const base = TYPE_LINKS[source.type] ?? '/';
    return `${base}/${source.id}`;
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
    if (mode === 'search') {
      doSearch(query);
    }
  }

  async function handleAsk(): Promise<void> {
    if (!query || query.length < 3) return;
    isSearching = true;
    hasSearched = true;
    askResult = null;
    try {
      askResult = await askQuestion(query);
    } catch (err: unknown) {
      console.error('[Ask]', err);
      askResult = null;
    } finally {
      isSearching = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (mode === 'ask' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleAsk();
    }
  }

  function switchMode(newMode: SearchMode): void {
    mode = newMode;
    results = [];
    askResult = null;
    hasSearched = false;
  }
</script>

<svelte:head>
  <title>{mode === 'ask' ? 'Ask' : 'Search'} - MyTrend</title>
</svelte:head>

<div class="search-page">
  <div class="page-header">
    <h1 class="comic-heading">{mode === 'ask' ? 'Ask Your Knowledge' : 'Search Everything'}</h1>
    <div class="mode-toggle">
      <button
        class="mode-btn"
        class:active={mode === 'search'}
        onclick={() => switchMode('search')}
      >
        Search
      </button>
      <button
        class="mode-btn"
        class:active={mode === 'ask'}
        onclick={() => switchMode('ask')}
      >
        Ask
      </button>
    </div>
  </div>

  <div class="search-bar">
    {#if mode === 'search'}
      <ComicInput
        bind:value={query}
        type="search"
        placeholder="Search projects, conversations, ideas, topics..."
        oninput={handleInput}
        icon="🔍"
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ask-bar" onkeydown={handleKeydown}>
        <ComicInput
          bind:value={query}
          type="text"
          placeholder="Ask a question about your knowledge base..."
          icon="💬"
        />
        <ComicButton variant="primary" size="sm" onclick={handleAsk} disabled={isSearching || query.length < 3}>
          Ask
        </ComicButton>
      </div>
    {/if}
  </div>

  {#if isSearching}
    <div class="skeleton-results">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="90px" />
      {/each}
    </div>

  {:else if mode === 'ask' && askResult}
    <!-- Ask Mode: Answer + Sources -->
    <ComicCallout type="tip" title="Answer">
      <p class="ask-answer">{askResult.answer}</p>
    </ComicCallout>

    {#if askResult.sources.length > 0}
      <h3 class="sources-title">Evidence ({askResult.sources.length} sources)</h3>
      <div class="sources-grid">
        {#each askResult.sources as source, i (source.type + source.id)}
          <a href={getSourceLink(source)} class="source-card" style:animation-delay="{i * 40}ms">
            <ComicCard variant="standard">
              <div class="result-header">
                <ComicBadge color={TYPE_COLORS[source.type] ?? 'blue'} size="sm">
                  {source.type}
                </ComicBadge>
                <span class="score">{Math.round(source.relevance * 100)}%</span>
              </div>
              <h4 class="source-title">{source.title}</h4>
              {#if source.snippet}
                <p class="result-snippet">{source.snippet}</p>
              {/if}
            </ComicCard>
          </a>
        {/each}
      </div>
    {/if}

  {:else if mode === 'search' && hasSearched && results.length === 0}
    <ComicEmptyState
      illustration="search"
      message="No results found"
      description="Try different keywords or check your spelling."
    />

  {:else if mode === 'search' && results.length > 0}
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

  {:else if mode === 'ask' && hasSearched && !askResult}
    <ComicEmptyState
      illustration="search"
      message="Could not find an answer"
      description="Try rephrasing your question or asking something different."
    />

  {:else}
    <div class="search-hints">
      <ComicCard>
        {#if mode === 'search'}
          <h3 class="section-title">Search Tips</h3>
          <ul class="hints-list">
            <li>Search across all projects, conversations, ideas, and topics</li>
            <li>Results are ranked by relevance using FTS5 + Neural Memory</li>
            <li>Type at least 2 characters to start searching</li>
          </ul>
        {:else}
          <h3 class="section-title">Ask Mode</h3>
          <ul class="hints-list">
            <li>Ask natural language questions about your knowledge base</li>
            <li>Combines FTS5 search with Neural Memory for comprehensive answers</li>
            <li>Examples: "What did I work on last week?", "What topics relate to Docker?"</li>
            <li>Press Enter or click Ask to submit your question</li>
          </ul>
        {/if}
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

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .mode-toggle {
    display: flex;
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    overflow: hidden;
  }

  .mode-btn {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    padding: 6px var(--spacing-md);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mode-btn.active {
    background: var(--accent-blue);
    color: #1a1a1a;
  }

  .mode-btn:hover:not(.active) {
    background: var(--bg-secondary);
  }

  .search-bar {
    margin-bottom: var(--spacing-sm);
  }

  .ask-bar {
    display: flex;
    gap: var(--spacing-sm);
    align-items: stretch;
  }

  .ask-bar :global(.comic-input-wrapper) {
    flex: 1;
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

  .result-link,
  .source-card {
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

  /* Ask mode */
  .ask-answer {
    font-family: var(--font-comic);
    font-size: var(--font-size-md);
    line-height: var(--leading-relaxed);
    margin: 0;
  }

  .sources-title {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin: 0;
  }

  .sources-grid {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .source-title {
    font-size: 0.9rem;
    font-weight: 700;
    margin: 0 0 4px;
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

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
