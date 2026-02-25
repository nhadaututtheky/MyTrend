<script lang="ts">
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import type { ChartDataPoint } from '$lib/types';

  interface Props {
    peakHours?: Array<{ hour: number; count: number }>;
    allHourData?: Record<string, number>;
  }

  const { peakHours = [], allHourData }: Props = $props();

  const chartData = $derived.by((): ChartDataPoint[] => {
    if (allHourData && Object.keys(allHourData).length > 0) {
      const points: ChartDataPoint[] = [];
      for (let h = 0; h < 24; h++) {
        points.push({
          label: formatHour(h),
          value: allHourData[String(h)] ?? 0,
        });
      }
      return points;
    }

    // Fallback: build from peak hours only (sparse)
    if (peakHours.length === 0) return [];

    const points: ChartDataPoint[] = [];
    const peakMap = new Map(peakHours.map((p) => [p.hour, p.count]));
    for (let h = 0; h < 24; h++) {
      points.push({
        label: formatHour(h),
        value: peakMap.get(h) ?? 0,
      });
    }
    return points;
  });

  const peakLabel = $derived.by((): string => {
    if (peakHours.length === 0) return 'No data yet';
    const formatted = peakHours
      .slice(0, 3)
      .map((p) => formatHour(p.hour))
      .join(', ');
    return `Most active: ${formatted}`;
  });

  function formatHour(h: number): string {
    if (h === 0) return '12a';
    if (h < 12) return `${h}a`;
    if (h === 12) return '12p';
    return `${h - 12}p`;
  }
</script>

<div class="peak-hours" data-testid="peak-hours-chart">
  {#if chartData.length > 0}
    <RoughChart type="bar" data={chartData} height={160} color="#4ECDC4" roughness={1.5} />
  {/if}
  <p class="peak-label">{peakLabel}</p>
</div>

<style>
  .peak-hours {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .peak-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
