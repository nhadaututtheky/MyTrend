<script lang="ts">
  import type { TrendingTopic } from '$lib/types';
  import ComicSparkline from '$lib/components/comic/ComicSparkline.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    topics?: TrendingTopic[];
    limit?: number;
  }

  const { topics = [], limit = 5 }: Props = $props();

  const displayTopics = $derived(topics.slice(0, limit));

  function directionArrow(dir: string): string {
    if (dir === 'rising') return '\u25B2';
    if (dir === 'falling') return '\u25BC';
    return '\u2022';
  }

  function directionColor(dir: string): 'green' | 'red' | 'yellow' {
    if (dir === 'rising') return 'green';
    if (dir === 'falling') return 'red';
    return 'yellow';
  }

  function sparklineColor(dir: string): string {
    if (dir === 'rising') return 'var(--accent-green)';
    if (dir === 'falling') return 'var(--accent-red)';
    return 'var(--accent-yellow)';
  }
</script>

<div class="mini-trending" data-testid="mini-trending">
  {#if displayTopics.length > 0}
    <ul class="trending-list">
      {#each displayTopics as topic, idx (topic.id)}
        <li class="trending-item">
          <span class="rank">#{idx + 1}</span>
          <a href="/trends?topic={topic.slug}" class="topic-name">{topic.name}</a>
          <ComicBadge color={directionColor(topic.direction)} size="sm">
            {directionArrow(topic.direction)} {Math.abs(topic.change_pct)}%
          </ComicBadge>
          <ComicSparkline
            data={topic.sparkline}
            color={sparklineColor(topic.direction)}
            width={48}
            height={16}
          />
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">No trending topics yet</p>
  {/if}
</div>

<style>
  .mini-trending {
    display: flex;
    flex-direction: column;
  }

  .trending-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trending-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--border-color);
  }

  .trending-item:last-child {
    border-bottom: none;
  }

  .rank {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    color: var(--text-muted);
    min-width: 20px;
  }

  .topic-name {
    flex: 1;
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .topic-name:hover {
    color: var(--accent-blue);
  }

  .empty {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-lg) 0;
    font-style: italic;
    margin: 0;
  }
</style>
