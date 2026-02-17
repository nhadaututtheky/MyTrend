<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { Topic, ChartDataPoint } from '$lib/types';

  const ITEMS_PER_PAGE = 50;
  const BADGE_COLORS: Array<'green' | 'blue' | 'purple' | 'yellow' | 'orange'> = [
    'purple', 'blue', 'green', 'yellow', 'orange',
  ];

  let topics = $state<Topic[]>([]);
  let isLoading = $state(true);
  let categoryFilter = $state('all');

  const categories = $derived.by(() => {
    const cats = new Set<string>();
    for (const t of topics) {
      if (t.category) cats.add(t.category);
    }
    const tabs = [{ id: 'all', label: 'All', badge: topics.length }];
    for (const cat of [...cats].sort()) {
      tabs.push({
        id: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        badge: topics.filter((t) => t.category === cat).length,
      });
    }
    return tabs;
  });

  const filteredTopics = $derived(
    categoryFilter === 'all' ? topics : topics.filter((t) => t.category === categoryFilter),
  );

  const topChartData = $derived<ChartDataPoint[]>(
    [...filteredTopics]
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, 10)
      .map((t) => ({ label: t.name, value: t.mention_count })),
  );

  const totalMentions = $derived(filteredTopics.reduce((s, t) => s + t.mention_count, 0));
  const topTopic = $derived(
    filteredTopics.length > 0
      ? [...filteredTopics].sort((a, b) => b.mention_count - a.mention_count)[0]
      : null,
  );

  const maxMentions = $derived(
    filteredTopics.length > 0 ? Math.max(...filteredTopics.map((t) => t.mention_count)) : 1,
  );

  function getCloudSize(count: number): number {
    return Math.max(0.7, Math.min(2.2, 0.7 + (count / maxMentions) * 1.5));
  }

  function getBadgeColor(index: number): 'green' | 'blue' | 'purple' | 'yellow' | 'orange' {
    return BADGE_COLORS[index % BADGE_COLORS.length] ?? 'purple';
  }

  onMount(async () => {
    try {
      const result = await pb.collection('topics').getList<Topic>(1, ITEMS_PER_PAGE, {
        sort: '-mention_count',
      });
      topics = result.items;
    } catch (err: unknown) {
      console.error('[Trends/Topics]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Topic Trends - MyTrend</title>
</svelte:head>

<div class="topics-page">
  <div class="page-header">
    <h1 class="comic-heading">Topic Trends</h1>
    {#if !isLoading && topics.length > 0}
      <span class="stat-line">
        {filteredTopics.length} topics &middot; {totalMentions.toLocaleString()} mentions
      </span>
    {/if}
  </div>

  {#if !isLoading && categories.length > 2}
    <ComicTabs tabs={categories} bind:active={categoryFilter} />
  {/if}

  {#if isLoading}
    <BentoGrid columns={2} gap="md">
      <ComicSkeleton variant="chart" />
      <ComicSkeleton variant="card" height="300px" />
    </BentoGrid>
  {:else if filteredTopics.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No topics tracked yet"
      description="Start conversations to see topic trends emerge automatically."
    />
  {:else}
    <BentoGrid columns={2} gap="md">
      <ComicBentoCard title="Top Topics" icon="📊" neonColor="purple" variant="neon">
        <RoughChart type="bar" data={topChartData} title="" color="#A29BFE" width={600} height={300} />
      </ComicBentoCard>

      <ComicBentoCard title="Topic Cloud" icon="☁">
        <div class="topic-cloud">
          {#each filteredTopics as topic, i (topic.id)}
            <span
              class="topic-item"
              style:font-size="{getCloudSize(topic.mention_count)}rem"
              style:animation-delay="{i * 20}ms"
            >
              <ComicBadge color={getBadgeColor(i)} size="md">{topic.name}</ComicBadge>
              <span class="mention-count">{topic.mention_count}</span>
            </span>
          {/each}
        </div>
      </ComicBentoCard>
    </BentoGrid>

    {#if topTopic}
      <div class="top-topic-highlight">
        <ComicBentoCard title="Most Discussed" icon="🏆" neonColor="yellow" variant="neon" span="full">
          <div class="highlight-row">
            <span class="highlight-name">{topTopic.name}</span>
            <span class="highlight-count">{topTopic.mention_count} mentions</span>
            {#if topTopic.category}
              <ComicBadge color="blue" size="sm">{topTopic.category}</ComicBadge>
            {/if}
            <span class="highlight-range">
              First seen: {new Date(topTopic.first_seen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              &middot;
              Last: {new Date(topTopic.last_seen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </ComicBentoCard>
      </div>
    {/if}
  {/if}
</div>

<style>
  .topics-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-line {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .topic-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .topic-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    animation: sketchFadeIn 0.3s ease both;
  }

  .mention-count {
    font-size: 0.6rem;
    color: var(--text-muted);
    font-family: var(--font-mono, monospace);
    font-weight: 700;
  }

  .highlight-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex-wrap: wrap;
  }

  .highlight-name {
    font-size: 1.2rem;
    font-weight: 700;
  }

  .highlight-count {
    font-size: 0.85rem;
    font-family: var(--font-mono, monospace);
    color: var(--accent-green);
    font-weight: 700;
  }

  .highlight-range {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
