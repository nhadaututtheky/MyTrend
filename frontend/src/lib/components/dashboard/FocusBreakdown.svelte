<script lang="ts">
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import type { ChartDataPoint } from '$lib/types';

  interface FocusItem {
    project_id: string;
    project_name: string;
    minutes: number;
    count: number;
    pct: number;
  }

  interface Props {
    breakdown?: FocusItem[];
  }

  const { breakdown = [] }: Props = $props();

  const COLORS = ['#00D26A', '#4ECDC4', '#FF9F43', '#A29BFE', '#FF4757', '#FFE66D'];

  const chartData = $derived.by((): ChartDataPoint[] => {
    if (breakdown.length === 0) return [];
    const top5 = breakdown.slice(0, 5);
    const rest = breakdown.slice(5);
    const points = top5.map((item) => ({
      label: item.project_name.length > 12 ? item.project_name.slice(0, 11) + '..' : item.project_name,
      value: Math.round(item.minutes),
    }));
    if (rest.length > 0) {
      points.push({ label: 'Other', value: Math.round(rest.reduce((s, i) => s + i.minutes, 0)) });
    }
    return points;
  });

  const totalMinutes = $derived(breakdown.reduce((s, i) => s + i.minutes, 0));
  const totalHours = $derived(
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`
      : `${Math.round(totalMinutes)}m`,
  );

  const top5 = $derived(breakdown.slice(0, 5));
  const maxMinutes = $derived(Math.max(...breakdown.map((i) => i.minutes), 1));

  function formatTime(mins: number): string {
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
    return `${Math.round(mins)}m`;
  }
</script>

<div class="focus-breakdown" data-testid="focus-breakdown">
  {#if breakdown.length === 0}
    <!-- Empty state: show skeleton bars -->
    <div class="empty-list">
      {#each [70, 45, 30, 20, 12] as w}
        <div class="empty-row">
          <div class="empty-name"></div>
          <div class="empty-bar-track">
            <div class="empty-bar" style:width="{w}%"></div>
          </div>
          <div class="empty-time"></div>
        </div>
      {/each}
    </div>
    <p class="focus-empty">No project focus data yet</p>
  {:else}
    <div class="focus-layout">
      <!-- Left: donut chart -->
      <div class="donut-wrap">
        <RoughChart
          type="donut"
          data={chartData}
          width={140}
          height={140}
          colors={COLORS}
          roughness={1.2}
        />
        <div class="donut-center">
          <span class="donut-total">{totalHours}</span>
          <span class="donut-label">total</span>
        </div>
      </div>

      <!-- Right: ranked bar list -->
      <div class="bar-list">
        {#each top5 as item, i}
          {@const barPct = Math.max(3, Math.round((item.minutes / maxMinutes) * 100))}
          <div class="bar-row">
            <div class="bar-dot" style:background={COLORS[i % COLORS.length]}></div>
            <span class="bar-name">{item.project_name}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                style:width="{barPct}%"
                style:background={COLORS[i % COLORS.length]}
              ></div>
            </div>
            <span class="bar-time">{formatTime(item.minutes)}</span>
          </div>
        {/each}
        {#if breakdown.length > 5}
          <p class="bar-more">+{breakdown.length - 5} more projects</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .focus-breakdown {
    width: 100%;
  }

  /* Empty state skeleton */
  .empty-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: var(--spacing-sm);
    opacity: 0.4;
  }

  .empty-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .empty-name {
    width: 60px;
    height: 8px;
    background: var(--border-color);
    border-radius: 2px;
    flex-shrink: 0;
  }

  .empty-bar-track {
    flex: 1;
    height: 8px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .empty-bar {
    height: 100%;
    background: var(--border-color);
    border-radius: 2px;
  }

  .empty-time {
    width: 28px;
    height: 8px;
    background: var(--border-color);
    border-radius: 2px;
    flex-shrink: 0;
  }

  .focus-empty {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    margin: 0;
    font-style: italic;
  }

  /* Data layout */
  .focus-layout {
    display: flex;
    gap: var(--spacing-md);
    align-items: flex-start;
  }

  /* Donut */
  .donut-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .donut-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .donut-total {
    font-family: var(--font-comic);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
  }

  .donut-label {
    font-family: var(--font-comic);
    font-size: 0.55rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Bar list */
  .bar-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bar-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .bar-name {
    font-family: var(--font-comic);
    font-size: 0.7rem;
    color: var(--text-primary);
    font-weight: 600;
    width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bar-track {
    flex: 1;
    height: 6px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 2px;
    opacity: 0.8;
    transition: width 500ms ease;
  }

  .bar-time {
    font-family: var(--font-comic);
    font-size: 0.65rem;
    color: var(--text-muted);
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }

  .bar-more {
    font-family: var(--font-comic);
    font-size: 0.65rem;
    color: var(--text-muted);
    margin: 2px 0 0;
    text-align: right;
  }
</style>
