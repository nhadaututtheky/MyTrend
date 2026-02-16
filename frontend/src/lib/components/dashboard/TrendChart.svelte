<script lang="ts">
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import type { TimeSeriesPoint } from '$lib/types';

  interface Props {
    data: TimeSeriesPoint[];
    title?: string;
    color?: string;
  }

  const { data, title = 'Activity Trend', color = '#00D26A' }: Props = $props();
</script>

<div class="trend-chart" data-testid="trend-chart">
  <RoughChart
    type="line"
    timeseries={data}
    {title}
    {color}
    width={500}
    height={250}
    roughness={2}
  />
</div>

<style>
  .trend-chart {
    width: 100%;
    overflow-x: auto;
  }
</style>
