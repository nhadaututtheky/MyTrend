<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import type { Topic, ChartDataPoint } from '$lib/types';

  const ITEMS_PER_PAGE = 20;

  let topics = $state<Topic[]>([]);
  let isLoading = $state(true);

  let topTopics = $derived<ChartDataPoint[]>(
    topics
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
    <p class="loading">Loading topics...</p>
  {:else}
    <ComicCard>
      <h2 class="section-title">Top Topics</h2>
      <RoughChart type="bar" data={topTopics} title="" color="#A29BFE" width={600} height={300} />
    </ComicCard>

    <ComicCard>
      <h2 class="section-title">All Topics</h2>
      <div class="topic-cloud">
        {#each topics as topic (topic.id)}
          <span
            class="topic-item"
            style:font-size="{Math.max(0.75, Math.min(2, topic.mention_count / 5))}rem"
          >
            <ComicBadge color="purple" size="md">{topic.name} ({topic.mention_count})</ComicBadge>
          </span>
        {:else}
          <p class="empty">No topics tracked yet. Start conversations to see trends!</p>
        {/each}
      </div>
    </ComicCard>
  {/if}
</div>

<style>
  .topics-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .topic-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .topic-item {
    display: inline-block;
  }

  .loading, .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-2xl);
  }
</style>
