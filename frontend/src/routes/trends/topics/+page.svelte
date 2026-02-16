<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { Topic, ChartDataPoint } from '$lib/types';

  const ITEMS_PER_PAGE = 20;

  let topics = $state<Topic[]>([]);
  let isLoading = $state(true);

  const topTopics = $derived<ChartDataPoint[]>(
    [...topics]
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, 10)
      .map((t) => ({ label: t.name, value: t.mention_count })),
  );

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
  <h1 class="comic-heading">Topic Trends</h1>

  {#if isLoading}
    <BentoGrid columns={2} gap="md">
      <ComicSkeleton variant="chart" />
      <ComicSkeleton variant="card" height="300px" />
    </BentoGrid>
  {:else if topics.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No topics tracked yet"
      description="Start conversations to see topic trends emerge automatically."
    />
  {:else}
    <BentoGrid columns={2} gap="md">
      <ComicBentoCard title="Top Topics" icon="📊" neonColor="purple" variant="neon">
        <RoughChart type="bar" data={topTopics} title="" color="#A29BFE" width={600} height={300} />
      </ComicBentoCard>

      <ComicBentoCard title="Topic Cloud" icon="☁">
        <div class="topic-cloud">
          {#each topics as topic (topic.id)}
            <span
              class="topic-item"
              style:font-size="{Math.max(0.75, Math.min(2, topic.mention_count / 5))}rem"
            >
              <ComicBadge color="purple" size="md">{topic.name} ({topic.mention_count})</ComicBadge>
            </span>
          {/each}
        </div>
      </ComicBentoCard>
    </BentoGrid>
  {/if}
</div>

<style>
  .topics-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .topic-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .topic-item {
    display: inline-block;
    animation: sketchFadeIn 0.3s ease both;
  }
</style>
