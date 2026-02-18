<script lang="ts">
  import type { TrendingTopic } from '$lib/types';
  import ComicSparkline from './ComicSparkline.svelte';

  interface Props {
    topics?: TrendingTopic[];
    onTopicClick?: (topic: TrendingTopic) => void;
  }

  const {
    topics = [],
    onTopicClick,
  }: Props = $props();

  function getDirectionIcon(direction: string): string {
    if (direction === 'rising') return '\u2191';
    if (direction === 'falling') return '\u2193';
    return '\u2192';
  }

  function getDirectionClass(direction: string): string {
    if (direction === 'rising') return 'dir-rising';
    if (direction === 'falling') return 'dir-falling';
    return 'dir-stable';
  }

  function getSparkColor(direction: string): string {
    if (direction === 'rising') return '#00D26A';
    if (direction === 'falling') return '#FF4757';
    return '#A29BFE';
  }
</script>

<div class="trending-list" data-testid="trending-list">
  {#if topics.length === 0}
    <p class="empty">No trending data yet</p>
  {:else}
    <ol class="list">
      {#each topics as topic, i}
        <li>
          <button class="trend-row" onclick={() => onTopicClick?.(topic)}>
            <span class="rank">{i + 1}</span>
            <span class="name">{topic.name}</span>
            <span class="spark">
              <ComicSparkline
                data={topic.sparkline}
                color={getSparkColor(topic.direction)}
                width={60}
                height={20}
              />
            </span>
            <span class="direction {getDirectionClass(topic.direction)}">
              {getDirectionIcon(topic.direction)}
              {#if topic.change_pct !== 0}
                <span class="pct">{topic.change_pct > 0 ? '+' : ''}{topic.change_pct}%</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .trending-list {
    width: 100%;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .trend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: 'Comic Mono', monospace;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 150ms ease;
    text-align: left;
  }

  .trend-row:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rank {
    width: 20px;
    text-align: right;
    color: var(--text-muted);
    font-weight: 700;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .spark {
    flex-shrink: 0;
  }

  .direction {
    display: flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    font-size: 0.75rem;
    min-width: 50px;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .dir-rising {
    color: var(--accent-green);
  }

  .dir-falling {
    color: var(--accent-red);
  }

  .dir-stable {
    color: var(--text-muted);
  }

  .pct {
    font-size: 0.7rem;
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    font-family: 'Comic Mono', monospace;
    font-size: 0.8rem;
    padding: 16px;
  }
</style>
