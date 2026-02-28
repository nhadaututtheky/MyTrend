<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchResearch, fetchResearchStats } from '$lib/api/research';
  import { createIdeaFromResearch } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { Research, ResearchStats } from '$lib/types';

  let items = $state<Research[]>([]);
  let stats = $state<ResearchStats | null>(null);
  let isLoading = $state(true);
  let verdictFilter = $state('all');
  let unsubscribe: (() => void) | undefined;

  const verdictTabs = [
    { id: 'all', label: 'All' },
    { id: 'fit', label: 'Fit' },
    { id: 'partial', label: 'Partial' },
    { id: 'concept-only', label: 'Concept' },
  ];

  const VERDICT_COLOR: Record<string, 'green' | 'yellow' | 'blue' | 'purple'> = {
    fit: 'green',
    partial: 'yellow',
    'concept-only': 'blue',
    irrelevant: 'purple',
  };

  const SOURCE_EMOJI: Record<string, string> = {
    github: '🐙',
    npm: '📦',
    blog: '📝',
    docs: '📖',
    other: '🔗',
  };

  const filtered = $derived(
    verdictFilter === 'all' ? items : items.filter((r) => r.verdict === verdictFilter),
  );

  const fitCount = $derived(items.filter((r) => r.verdict === 'fit').length);

  const verdictTabsWithCount = $derived(
    verdictTabs.map((t) => {
      if (t.id === 'all') return { ...t, label: `All (${items.length})` };
      if (t.id === 'fit' && fitCount > 0) return { ...t, label: `Fit (${fitCount})` };
      return t;
    }),
  );

  onMount(async () => {
    try {
      const [result, statsData] = await Promise.allSettled([fetchResearch(), fetchResearchStats()]);
      if (result.status === 'fulfilled') items = result.value.items;
      if (statsData.status === 'fulfilled') stats = statsData.value;
    } catch (err: unknown) {
      console.error('[Research]', err);
    } finally {
      isLoading = false;
    }

    try {
      unsubscribe = await pb.collection('research').subscribe('*', (e) => {
        if (e.action === 'create') items = [e.record as unknown as Research, ...items];
        else if (e.action === 'update')
          items = items.map((r) => (r.id === e.record.id ? (e.record as unknown as Research) : r));
        else if (e.action === 'delete') items = items.filter((r) => r.id !== e.record.id);
      });
    } catch (err: unknown) {
      console.error('[Research] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  // Track which research items already have ideas created
  let createdIdeaIds = $state(new Set<string>());
  let creatingIdeaId = $state<string | null>(null);

  async function handleCreateIdea(e: MouseEvent, item: Research) {
    e.preventDefault(); // Don't follow the <a> link
    e.stopPropagation();
    if (createdIdeaIds.has(item.id) || creatingIdeaId === item.id) return;
    creatingIdeaId = item.id;
    try {
      await createIdeaFromResearch(item);
      createdIdeaIds = new Set([...createdIdeaIds, item.id]);
    } catch (err: unknown) {
      console.error('[Research] Create idea failed:', err);
    } finally {
      creatingIdeaId = null;
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<svelte:head>
  <title>Research | MyTrend</title>
</svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="page-title">Research</h1>
      <p class="page-subtitle">
        {items.length} items indexed
        {#if fitCount > 0}&middot; {fitCount} ready to use{/if}
      </p>
    </div>
    {#if stats}
      <div class="stats-row">
        {#if stats.by_source.github > 0}
          <span class="stat-chip">🐙 {stats.by_source.github}</span>
        {/if}
        {#if stats.by_source.npm > 0}
          <span class="stat-chip">📦 {stats.by_source.npm}</span>
        {/if}
        {#if stats.by_source.blog + stats.by_source.docs > 0}
          <span class="stat-chip">📝 {stats.by_source.blog + stats.by_source.docs}</span>
        {/if}
      </div>
    {/if}
  </div>

  <ComicTabs tabs={verdictTabsWithCount} bind:active={verdictFilter} />

  {#if isLoading}
    <div class="research-grid">
      {#each Array(6) as _}
        <ComicSkeleton variant="card" />
      {/each}
    </div>
  {:else if filtered.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No research items yet"
      description="Send GitHub, npm, or blog URLs to the Telegram bot to auto-index."
    />
  {:else}
    <div class="research-grid">
      {#each filtered as item (item.id)}
        <a href={item.url} target="_blank" rel="noopener noreferrer" class="research-link">
          <ComicCard variant="standard" neon={item.verdict === 'fit' ? 'green' : false}>
            <div class="item-content">
              <div class="item-header">
                <span class="source-icon">{SOURCE_EMOJI[item.source] ?? '🔗'}</span>
                <h3 class="item-title">{item.title}</h3>
              </div>

              <div class="item-meta">
                <ComicBadge color={VERDICT_COLOR[item.verdict] ?? 'blue'} size="sm">
                  {item.verdict}
                </ComicBadge>
                {#if item.stars > 0}
                  <span class="meta-text">⭐ {item.stars.toLocaleString()}</span>
                {/if}
                {#if item.npm_downloads > 0}
                  <span class="meta-text">📥 {item.npm_downloads.toLocaleString()}</span>
                {/if}
                <span class="meta-date">{formatDate(item.created)}</span>
              </div>

              {#if item.ai_summary}
                <p class="item-summary">
                  {item.ai_summary.length > 150
                    ? item.ai_summary.slice(0, 147) + '...'
                    : item.ai_summary}
                </p>
              {/if}

              {#if item.tech_tags.length > 0}
                <div class="item-tags">
                  {#each item.tech_tags.slice(0, 4) as tag (tag)}
                    <ComicBadge color="purple" size="sm">{tag}</ComicBadge>
                  {/each}
                  {#if item.tech_tags.length > 4}
                    <span class="meta-text">+{item.tech_tags.length - 4}</span>
                  {/if}
                </div>
              {/if}

              {#if item.applicable_projects.length > 0}
                <p class="item-projects">📂 {item.applicable_projects.join(', ')}</p>
              {/if}

              <div class="item-actions">
                {#if createdIdeaIds.has(item.id)}
                  <span class="idea-created-badge">&#9989; Idea created</span>
                {:else}
                  <button
                    class="btn-create-idea"
                    disabled={creatingIdeaId === item.id}
                    onclick={(e) => handleCreateIdea(e, item)}
                    aria-label="Create idea from {item.title}"
                  >
                    {creatingIdeaId === item.id ? 'Creating...' : '&#128161; Create Idea'}
                  </button>
                {/if}
              </div>
            </div>
          </ComicCard>
        </a>
      {/each}
    </div>
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
    flex-wrap: wrap;
    gap: var(--spacing-md);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .page-subtitle {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin: var(--spacing-xs) 0 0;
  }

  .stats-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .stat-chip {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: var(--border-width) solid var(--border-color);
  }

  .research-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--spacing-md);
  }

  .research-link {
    text-decoration: none;
    color: inherit;
    display: block;
  }

  .item-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .item-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .source-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .item-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }

  .item-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .meta-text {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .meta-date {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .item-summary {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .item-projects {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin: 0;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .btn-create-idea {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    padding: 2px var(--spacing-sm);
    background: rgba(255, 230, 109, 0.15);
    border: 2px solid var(--accent-yellow);
    border-radius: var(--radius-sm);
    color: var(--accent-yellow);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-create-idea:hover:not(:disabled) {
    background: var(--accent-yellow);
    color: #1a1a1a;
    transform: translateY(-1px);
  }

  .btn-create-idea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .idea-created-badge {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--accent-green);
    font-weight: 700;
  }

  @media (max-width: 768px) {
    .research-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
