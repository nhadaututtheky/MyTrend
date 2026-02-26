<script lang="ts">
  import type { TrendingTopic } from '$lib/types';
  import ComicSparkline from './ComicSparkline.svelte';

  interface Props {
    topics?: TrendingTopic[];
    onTopicClick?: (topic: TrendingTopic) => void;
  }

  const { topics = [], onTopicClick }: Props = $props();

  const maxCount = $derived(Math.max(...topics.map((t) => t.mention_count ?? 1), 1));

  function isNew(topic: TrendingTopic): boolean {
    return Math.abs(topic.change_pct) >= 100 && topic.direction === 'falling';
  }

  function getDirectionIcon(topic: TrendingTopic): string {
    if (isNew(topic)) return '';
    if (topic.direction === 'rising') return '↑';
    if (topic.direction === 'falling') return '↓';
    return '→';
  }

  function getDirectionClass(topic: TrendingTopic): string {
    if (isNew(topic)) return 'dir-new';
    if (topic.direction === 'rising') return 'dir-rising';
    if (topic.direction === 'falling') return 'dir-falling';
    return 'dir-stable';
  }

  function getSparkColor(topic: TrendingTopic): string {
    if (isNew(topic)) return '#4ECDC4';
    if (topic.direction === 'rising') return '#00D26A';
    if (topic.direction === 'falling') return '#FF4757';
    return '#A29BFE';
  }

  function formatPct(topic: TrendingTopic): string {
    if (isNew(topic)) return 'NEW';
    if (topic.change_pct === 0) return '';
    return `${topic.change_pct > 0 ? '+' : ''}${topic.change_pct}%`;
  }

  function barWidth(topic: TrendingTopic): number {
    return Math.max(4, Math.round(((topic.mention_count ?? 0) / maxCount) * 100));
  }
</script>

<div class="trending-list" data-testid="trending-list">
  {#if topics.length === 0}
    <p class="empty">No trending data yet</p>
  {:else}
    <ol class="list">
      {#each topics as topic, i}
        <li class="list-item">
          <button class="trend-row" onclick={() => onTopicClick?.(topic)}>
            <!-- Proportional bar background -->
            <div class="bar-bg" style:width="{barWidth(topic)}%"></div>

            <span class="rank">{i + 1}</span>
            <span class="name">{topic.name}</span>
            <span class="spark">
              <ComicSparkline
                data={topic.sparkline}
                color={getSparkColor(topic)}
                width={48}
                height={18}
              />
            </span>
            <span class="direction {getDirectionClass(topic)}">
              {#if isNew(topic)}
                <span class="badge-new">NEW</span>
              {:else}
                {getDirectionIcon(topic)}
                {#if formatPct(topic)}
                  <span class="pct">{formatPct(topic)}</span>
                {/if}
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
    gap: 1px;
  }

  .list-item {
    position: relative;
  }

  .trend-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: 'Comic Mono', monospace;
    font-size: 0.78rem;
    cursor: pointer;
    border-radius: 3px;
    transition: background 150ms ease;
    text-align: left;
    overflow: hidden;
  }

  .trend-row:hover {
    background: var(--bg-secondary);
  }

  /* Proportional bar — sits behind content */
  .bar-bg {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--accent-green);
    opacity: 0.07;
    border-radius: 3px;
    pointer-events: none;
    transition: width 400ms ease;
  }

  .rank {
    width: 16px;
    text-align: right;
    color: var(--text-muted);
    font-size: 0.7rem;
    font-weight: 700;
    flex-shrink: 0;
    position: relative;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    position: relative;
  }

  .spark {
    flex-shrink: 0;
    position: relative;
    opacity: 0.85;
  }

  .direction {
    display: flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    font-size: 0.72rem;
    min-width: 44px;
    justify-content: flex-end;
    flex-shrink: 0;
    position: relative;
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
  .dir-new {
    color: var(--accent-blue);
  }

  .badge-new {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    background: var(--accent-blue);
    color: #fff;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .pct {
    font-size: 0.68rem;
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    font-family: 'Comic Mono', monospace;
    font-size: 0.8rem;
    padding: 16px;
  }
</style>
