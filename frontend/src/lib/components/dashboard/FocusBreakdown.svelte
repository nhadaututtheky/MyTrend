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

  const chartData = $derived.by((): ChartDataPoint[] => {
    if (breakdown.length === 0) return [];

    const top5 = breakdown.slice(0, 5);
    const rest = breakdown.slice(5);
    const points = top5.map((item) => ({
      label:
        item.project_name.length > 12 ? item.project_name.slice(0, 11) + '..' : item.project_name,
      value: Math.round(item.minutes),
    }));

    if (rest.length > 0) {
      const otherMins = rest.reduce((sum, item) => sum + item.minutes, 0);
      points.push({ label: 'Other', value: Math.round(otherMins) });
    }

    return points;
  });

  const totalHours = $derived(
    Math.round((breakdown.reduce((sum, item) => sum + item.minutes, 0) / 60) * 10) / 10,
  );
</script>

<div class="focus-breakdown" data-testid="focus-breakdown">
  {#if chartData.length > 0}
    <RoughChart
      type="donut"
      data={chartData}
      height={160}
      colors={['#00D26A', '#4ECDC4', '#FF9F43', '#A29BFE', '#FF4757', '#FFE66D']}
      roughness={1.5}
    />
    <p class="focus-total">{totalHours}h across {breakdown.length} projects</p>
  {:else}
    <p class="focus-empty">No project focus data yet</p>
  {/if}
</div>

<style>
  .focus-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .focus-total {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .focus-empty {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-xl) 0;
    font-style: italic;
    margin: 0;
  }
</style>
