<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchResearchTrends, type ResearchTrends } from '$lib/api/research';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';

  let trends = $state<ResearchTrends | null>(null);
  let isLoading = $state(true);
  let loadError = $state('');

  // Source donut data
  const sourceChartData = $derived.by(() => {
    if (!trends || trends.source_trends.length === 0) return [];
    // Aggregate all months
    const totals: Record<string, number> = {};
    for (const st of trends.source_trends) {
      for (const [src, count] of Object.entries(st.sources)) {
        totals[src] = (totals[src] ?? 0) + count;
      }
    }
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value }));
  });

  // Top patterns bar chart data
  const patternChartData = $derived.by(() => {
    if (!trends) return [];
    return trends.top_patterns.slice(0, 8).map((p) => ({
      label: p.pattern.length > 20 ? p.pattern.slice(0, 18) + '..' : p.pattern,
      value: p.count,
    }));
  });

  // Top 5 tags for multi-line (simplified: show as bar chart of overall counts)
  const tagChartData = $derived.by(() => {
    if (!trends || trends.tag_trends.length === 0) return [];
    const totals: Record<string, number> = {};
    for (const tt of trends.tag_trends) {
      for (const [tag, count] of Object.entries(tt.tags)) {
        totals[tag] = (totals[tag] ?? 0) + count;
      }
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, value]) => ({ label, value }));
  });

  const SOURCE_EMOJI: Record<string, string> = {
    github: '\uD83D\uDC19',
    npm: '\uD83D\uDCE6',
    blog: '\uD83D\uDCDD',
    docs: '\uD83D\uDCD6',
    other: '\uD83D\uDD17',
  };

  onMount(async () => {
    try {
      trends = await fetchResearchTrends();
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Failed to load trends';
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Tech Radar | MyTrend</title>
</svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="page-title">Tech Radar</h1>
      <p class="page-subtitle">Research trends over the last 6 months</p>
    </div>
    <a href="/research" class="back-link">&larr; Research Feed</a>
  </div>

  {#if loadError}
    <ComicEmptyState illustration="error" message="Failed to load" description={loadError} />
  {:else if isLoading}
    <div class="grid">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="250px" />
      {/each}
    </div>
  {:else if !trends || (trends.tag_trends.length === 0 && trends.top_patterns.length === 0)}
    <ComicEmptyState
      illustration="empty"
      message="No trend data yet"
      description="Send more URLs via Telegram to build up research trends."
    />
  {:else}
    <div class="grid">
      <!-- Top Tech Tags -->
      {#if tagChartData.length > 0}
        <ComicCard>
          <h3 class="section-title">Top Tech Tags</h3>
          <RoughChart type="bar" data={tagChartData} height={250} color="var(--accent-blue)" />
        </ComicCard>
      {/if}

      <!-- Source Distribution -->
      {#if sourceChartData.length > 0}
        <ComicCard>
          <h3 class="section-title">Sources</h3>
          <RoughChart
            type="donut"
            data={sourceChartData}
            height={250}
            colors={['#4ECDC4', '#FF6B6B', '#FFE66D', '#A29BFE', '#95A5A6']}
          />
        </ComicCard>
      {/if}

      <!-- Rising Tags -->
      {#if trends.rising.length > 0}
        <ComicCard>
          <h3 class="section-title">Rising This Month</h3>
          <div class="rising-tags">
            {#each trends.rising as tag (tag)}
              <div class="rising-tag">
                <span class="rising-arrow">&uarr;</span>
                <ComicBadge color="green" size="sm">{tag}</ComicBadge>
              </div>
            {/each}
          </div>
        </ComicCard>
      {/if}

      <!-- Top Patterns -->
      {#if patternChartData.length > 0}
        <ComicCard>
          <h3 class="section-title">Top Patterns</h3>
          <RoughChart
            type="bar"
            data={patternChartData}
            height={250}
            color="var(--accent-purple)"
          />
        </ComicCard>
      {/if}

      <!-- Monthly Breakdown Table -->
      {#if trends.source_trends.length > 0}
        <ComicCard>
          <h3 class="section-title">Monthly Breakdown</h3>
          <div class="monthly-table">
            {#each trends.source_trends as st (st.month)}
              <div class="month-row">
                <span class="month-label">{st.month}</span>
                <div class="month-sources">
                  {#each Object.entries(st.sources) as [src, count] (src)}
                    <span class="source-chip">
                      {SOURCE_EMOJI[src] ?? '\uD83D\uDD17'}
                      {count}
                    </span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </ComicCard>
      {/if}
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

  .back-link {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--accent-blue);
    text-decoration: none;
  }
  .back-link:hover {
    text-decoration: underline;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: var(--spacing-lg);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    font-weight: 700;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
    color: var(--text-primary);
  }

  .rising-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .rising-tag {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .rising-arrow {
    font-size: var(--font-size-base);
    font-weight: 700;
    color: var(--accent-green);
  }

  .monthly-table {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .month-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xs) 0;
    border-bottom: 1px dashed var(--border-color);
  }
  .month-row:last-child {
    border-bottom: none;
  }

  .month-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-secondary);
    min-width: 80px;
  }

  .month-sources {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .source-chip {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: var(--border-width) solid var(--border-color);
  }

  @media (max-width: 768px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
