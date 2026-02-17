<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topic, TrendingTopic, TopicTrendSeries, HeatmapDay, InsightPatterns } from '$lib/types';
  import { fetchTopicTrends, fetchTrendingTopics, fetchAllTopics } from '$lib/api/topics';
  import { fetchHeatmapData } from '$lib/api/activity';
  import { fetchPatterns } from '$lib/api/insights';
  import ComicCallout from '$lib/components/comic/ComicCallout.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicSparkline from '$lib/components/comic/ComicSparkline.svelte';
  import HeatmapCalendar from '$lib/components/comic/HeatmapCalendar.svelte';
  import RoughMultiLineChart from '$lib/components/comic/RoughMultiLineChart.svelte';
  import TopicSearchBar from '$lib/components/comic/TopicSearchBar.svelte';
  import TrendingList from '$lib/components/comic/TrendingList.svelte';

  type TimeRange = '7d' | '30d' | '90d' | '1y';

  function getSortArrow(dir: 'asc' | 'desc'): string {
    return dir === 'desc' ? '\u25BC' : '\u25B2';
  }

  let selectedTopics = $state<Topic[]>([]);
  let timeRange = $state<TimeRange>('30d');
  let trendSeries = $state<TopicTrendSeries[]>([]);
  let trendingTopics = $state<TrendingTopic[]>([]);
  let heatmapData = $state<HeatmapDay[]>([]);
  let allTopics = $state<Topic[]>([]);
  let allTopicsTotal = $state(0);
  let topicsPage = $state(1);
  let topicsSortKey = $state('mention_count');
  let topicsSortDir = $state<'asc' | 'desc'>('desc');

  let isLoadingChart = $state(false);
  let isLoadingTrending = $state(true);
  let isLoadingHeatmap = $state(true);
  let isLoadingTopics = $state(true);
  let chartWidth = $state(800);
  let patterns = $state<InsightPatterns | null>(null);

  const autoInsight = $derived.by((): string | null => {
    if (!patterns || !trendingTopics.length) return null;
    const rising = trendingTopics.filter((t) => t.direction === 'rising');
    if (rising.length === 0) return null;
    const top = rising[0];
    if (!top) return null;
    const pctText = top.change_pct > 0 ? `+${top.change_pct}%` : `${top.change_pct}%`;
    return `${top.name} is your hottest topic (${pctText} this week)`;
  });

  const TIME_RANGES: Array<{ id: TimeRange; label: string }> = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '1y', label: '1Y' },
  ];

  // Heatmap derived stats
  const totalActivities = $derived(heatmapData.reduce((s, d) => s + d.count, 0));
  const activeDays = $derived(heatmapData.filter((d) => d.count > 0).length);
  const bestDay = $derived(Math.max(0, ...heatmapData.map((d) => d.count)));
  const currentStreak = $derived.by(() => {
    let streak = 0;
    for (let i = heatmapData.length - 1; i >= 0; i--) {
      const day = heatmapData[i];
      if (day && day.count > 0) streak++;
      else break;
    }
    return streak;
  });

  onMount(async () => {
    // Parallel fetch
    const [trendingResult, heatmapResult, topicsResult, patternsResult] = await Promise.allSettled([
      fetchTrendingTopics(20),
      fetchHeatmapData(),
      fetchAllTopics(1, 20, '-mention_count'),
      fetchPatterns(),
    ]);

    if (trendingResult.status === 'fulfilled') {
      trendingTopics = trendingResult.value;
      // Auto-select top 3 trending topics
      const topSlugs = trendingTopics.slice(0, 3);
      for (const t of topSlugs) {
        selectedTopics = [...selectedTopics, {
          id: t.id, name: t.name, slug: t.slug, category: t.category,
          mention_count: t.mention_count,
          user: '', first_seen: '', last_seen: '', trend_data: [], related: [],
          created: '', updated: '', collectionId: '', collectionName: '',
        }];
      }
    }
    isLoadingTrending = false;

    if (heatmapResult.status === 'fulfilled') heatmapData = heatmapResult.value;
    isLoadingHeatmap = false;

    if (topicsResult.status === 'fulfilled') {
      allTopics = topicsResult.value.items;
      allTopicsTotal = topicsResult.value.totalItems;
    }
    isLoadingTopics = false;

    if (patternsResult.status === 'fulfilled') {
      patterns = patternsResult.value;
    }
  });

  // Fetch comparison data when topics or range change
  $effect(() => {
    if (selectedTopics.length === 0) {
      trendSeries = [];
      return;
    }
    const slugs = selectedTopics.map((t) => t.slug);
    void timeRange; // track dependency

    isLoadingChart = true;
    fetchTopicTrends(slugs, timeRange)
      .then((res) => { trendSeries = res.series; })
      .catch((err) => { console.error('[Trends] Fetch error:', err); trendSeries = []; })
      .finally(() => { isLoadingChart = false; });
  });

  function addTopic(topic: Topic): void {
    if (selectedTopics.some((t) => t.id === topic.id)) return;
    selectedTopics = [...selectedTopics, topic];
  }

  function removeTopic(topic: Topic): void {
    selectedTopics = selectedTopics.filter((t) => t.id !== topic.id);
  }

  function addTrendingTopic(trending: TrendingTopic): void {
    if (selectedTopics.some((t) => t.slug === trending.slug)) return;
    addTopic({
      id: trending.id, name: trending.name, slug: trending.slug,
      category: trending.category, mention_count: trending.mention_count,
      user: '', first_seen: '', last_seen: '', trend_data: [], related: [],
      created: '', updated: '', collectionId: '', collectionName: '',
    });
  }

  async function loadTopicsPage(page: number): Promise<void> {
    topicsPage = page;
    isLoadingTopics = true;
    try {
      const sort = `${topicsSortDir === 'desc' ? '-' : ''}${topicsSortKey}`;
      const result = await fetchAllTopics(page, 20, sort);
      allTopics = result.items;
      allTopicsTotal = result.totalItems;
    } catch { /* skip */ }
    isLoadingTopics = false;
  }

  function handleSort(key: string): void {
    if (topicsSortKey === key) {
      topicsSortDir = topicsSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      topicsSortKey = key;
      topicsSortDir = 'desc';
    }
    loadTopicsPage(1);
  }

  function parseTrendSparkline(topic: Topic): number[] {
    if (!topic.trend_data || topic.trend_data.length === 0) return [];
    const last7 = topic.trend_data.slice(-7);
    return last7.map((d) => d.count);
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  const totalTopicPages = $derived(Math.ceil(allTopicsTotal / 20));
</script>

<svelte:head>
  <title>Trends - MyTrend</title>
</svelte:head>

<div class="trends-page">
  <!-- Header -->
  <div class="header">
    <h1 class="comic-heading">Trends</h1>
    <div class="time-range">
      {#each TIME_RANGES as tr}
        <button
          class="range-btn"
          class:active={timeRange === tr.id}
          onclick={() => { timeRange = tr.id; }}
        >
          {tr.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Auto Insight -->
  {#if autoInsight}
    <ComicCallout type="tip" title="Insight">
      <p class="auto-insight">{autoInsight}</p>
    </ComicCallout>
  {/if}

  <!-- Topic Search -->
  <TopicSearchBar
    {selectedTopics}
    onselect={addTopic}
    onremove={removeTopic}
  />

  <!-- Comparison Chart -->
  <div class="chart-section" bind:clientWidth={chartWidth}>
    <ComicBentoCard title="Interest Over Time" icon="&#128200;" variant="neon" neonColor="green" span="full">
      {#if isLoadingChart}
        <ComicSkeleton variant="chart" />
      {:else}
        <RoughMultiLineChart
          series={trendSeries.map((s) => ({ id: s.topic_id, label: s.name, color: s.color, data: s.data }))}
          width={Math.max(chartWidth - 48, 400)}
          height={350}
        />
      {/if}
    </ComicBentoCard>
  </div>

  <!-- Middle Row: Trending + Heatmap -->
  <BentoGrid columns={3}>
    <!-- Trending Topics -->
    <div data-span="1">
      <ComicBentoCard title="Trending" icon="&#128293;" variant="neon" neonColor="orange">
        {#if isLoadingTrending}
          <ComicSkeleton variant="text" lines={8} />
        {:else}
          <TrendingList topics={trendingTopics.slice(0, 10)} onTopicClick={addTrendingTopic} />
        {/if}
      </ComicBentoCard>
    </div>

    <!-- Activity Heatmap + Stats -->
    <div data-span="2">
      <ComicBentoCard title="Your Activity" icon="&#128202;" variant="neon" neonColor="blue">
        {#if isLoadingHeatmap}
          <ComicSkeleton variant="chart" />
        {:else}
          <div class="heatmap-section">
            <HeatmapCalendar data={heatmapData} />
            <div class="stats-row">
              <div class="stat">
                <span class="stat-value" style="color: var(--accent-green)">{totalActivities}</span>
                <span class="stat-label">total</span>
              </div>
              <div class="stat">
                <span class="stat-value" style="color: var(--accent-blue)">{activeDays}</span>
                <span class="stat-label">active days</span>
              </div>
              <div class="stat">
                <span class="stat-value" style="color: var(--accent-yellow)">{bestDay}</span>
                <span class="stat-label">best day</span>
              </div>
              <div class="stat">
                <span class="stat-value" style="color: var(--accent-orange)">{currentStreak}</span>
                <span class="stat-label">streak</span>
              </div>
            </div>
          </div>
        {/if}
      </ComicBentoCard>
    </div>
  </BentoGrid>

  <!-- All Topics Table -->
  <ComicBentoCard title="All Topics ({allTopicsTotal})" icon="&#128203;" variant="neon" neonColor="purple" span="full">
    {#if isLoadingTopics}
      <ComicSkeleton variant="text" lines={10} />
    {:else if allTopics.length === 0}
      <p class="empty-msg">No topics yet. Start conversations to see trends.</p>
    {:else}
      <div class="topics-table-wrapper">
        <table class="topics-table">
          <thead>
            <tr>
              <th>
                <button class="sort-btn" onclick={() => handleSort('name')}>
                  Name {topicsSortKey === 'name' ? getSortArrow(topicsSortDir) : ''}
                </button>
              </th>
              <th>Category</th>
              <th>
                <button class="sort-btn" onclick={() => handleSort('mention_count')}>
                  Mentions {topicsSortKey === 'mention_count' ? getSortArrow(topicsSortDir) : ''}
                </button>
              </th>
              <th>Last Seen</th>
              <th>Trend</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each allTopics as topic}
              <tr>
                <td class="topic-name-cell">{topic.name}</td>
                <td><span class="category-badge">{topic.category}</span></td>
                <td class="num-cell">{topic.mention_count}</td>
                <td class="date-cell">{formatDate(topic.last_seen)}</td>
                <td>
                  <ComicSparkline
                    data={parseTrendSparkline(topic)}
                    color="#4ECDC4"
                    width={60}
                    height={18}
                  />
                </td>
                <td>
                  <button
                    class="add-btn"
                    onclick={() => addTopic(topic)}
                    disabled={selectedTopics.some((t) => t.id === topic.id)}
                    aria-label="Compare {topic.name}"
                  >+</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if totalTopicPages > 1}
        <div class="pagination">
          <button
            class="page-btn"
            disabled={topicsPage <= 1}
            onclick={() => loadTopicsPage(topicsPage - 1)}
          >Prev</button>
          <span class="page-info">{topicsPage} / {totalTopicPages}</span>
          <button
            class="page-btn"
            disabled={topicsPage >= totalTopicPages}
            onclick={() => loadTopicsPage(topicsPage + 1)}
          >Next</button>
        </div>
      {/if}
    {/if}
  </ComicBentoCard>
</div>

<style>
  .trends-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-md);
  }

  .time-range {
    display: flex;
    gap: 4px;
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 3px;
  }

  .range-btn {
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .range-btn.active {
    background: var(--accent-green);
    color: var(--bg-base);
  }

  .range-btn:hover:not(.active) {
    color: var(--text-primary);
  }

  .chart-section {
    width: 100%;
  }

  /* Heatmap section */
  .heatmap-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .stats-row {
    display: flex;
    gap: var(--spacing-lg);
    justify-content: center;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-family: 'Comic Mono', monospace;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .stat-label {
    font-family: 'Comic Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Topics table */
  .topics-table-wrapper {
    overflow-x: auto;
  }

  .topics-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Comic Mono', monospace;
    font-size: 0.8rem;
  }

  .topics-table th {
    text-align: left;
    padding: 8px;
    border-bottom: 2px solid var(--border-color);
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .topics-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .topics-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .sort-btn {
    all: unset;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
  }

  .sort-btn:hover {
    color: var(--text-primary);
  }

  .topic-name-cell {
    font-weight: 700;
    color: var(--text-primary);
  }

  .num-cell {
    font-weight: 700;
    text-align: right;
  }

  .date-cell {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .category-badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .add-btn {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-color);
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-weight: 700;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    transition: all 150ms ease;
  }

  .add-btn:hover:not(:disabled) {
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  .add-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    padding-top: var(--spacing-md);
  }

  .page-btn {
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 12px;
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .page-btn:hover:not(:disabled) {
    box-shadow: var(--shadow-sm);
    transform: translate(-1px, -1px);
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .page-info {
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .empty-msg {
    text-align: center;
    color: var(--text-muted);
    font-family: 'Comic Mono', monospace;
    padding: var(--spacing-lg);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .stats-row {
      gap: var(--spacing-md);
    }

    .stat-value {
      font-size: 1rem;
    }
  }
</style>
