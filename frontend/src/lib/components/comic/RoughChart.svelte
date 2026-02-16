<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChartDataPoint, TimeSeriesPoint } from '$lib/types';

  type ChartType = 'bar' | 'line' | 'pie' | 'donut';

  interface Props {
    type?: ChartType;
    data?: ChartDataPoint[];
    timeseries?: TimeSeriesPoint[];
    title?: string;
    width?: number;
    height?: number;
    color?: string;
    colors?: string[];
    roughness?: number;
  }

  let {
    type = 'bar',
    data = [],
    timeseries = [],
    title,
    width = 500,
    height = 300,
    color = '#00D26A',
    colors = ['#00D26A', '#4ECDC4', '#FF9F43', '#A29BFE', '#FF4757'],
    roughness = 2,
  }: Props = $props();

  let container: HTMLDivElement;
  let chartInstance: unknown;

  onMount(() => {
    // Dynamically import rough-viz to avoid SSR issues
    let cleanup = () => {
      if (container) {
        container.innerHTML = '';
      }
    };

    (async () => {
      try {
        // @ts-ignore - rough-viz doesn't have type declarations
        const roughViz = await import('rough-viz');
        renderChart(roughViz);
      } catch {
        // rough-viz not available, render fallback
        renderFallback();
      }
    })();

    return cleanup;
  });

  function renderChart(roughViz: Record<string, unknown>): void {
    if (!container) return;
    container.innerHTML = '';

    const chartData = data.length > 0
      ? { labels: data.map((d) => d.label), values: data.map((d) => d.value) }
      : { labels: timeseries.map((d) => d.date), values: timeseries.map((d) => d.value) };

    const commonOpts = {
      element: container,
      data: chartData,
      roughness,
      width,
      height,
      color,
      colors,
      font: 0,
      title: title ?? '',
      titleFontSize: '1rem',
      margin: { top: 40, right: 20, bottom: 40, left: 50 },
    };

    try {
      if (type === 'bar' && typeof roughViz.Bar === 'function') {
        chartInstance = new (roughViz.Bar as new (opts: typeof commonOpts) => unknown)(commonOpts);
      } else if (type === 'line' && typeof roughViz.Line === 'function') {
        chartInstance = new (roughViz.Line as new (opts: typeof commonOpts & { circle?: boolean }) => unknown)({
          ...commonOpts,
          circle: false,
        } as any);
      } else if (type === 'pie' && typeof roughViz.Pie === 'function') {
        chartInstance = new (roughViz.Pie as new (opts: typeof commonOpts) => unknown)(commonOpts);
      } else if (type === 'donut' && typeof roughViz.Donut === 'function') {
        chartInstance = new (roughViz.Donut as new (opts: typeof commonOpts) => unknown)(commonOpts);
      } else {
        renderFallback();
      }
    } catch {
      renderFallback();
    }
  }

  function renderFallback(): void {
    if (!container) return;
    container.innerHTML = `
      <div style="
        width: ${width}px;
        height: ${height}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed var(--border-color);
        border-radius: 8px;
        font-family: var(--font-comic);
        color: var(--text-secondary);
      ">
        ${title ?? 'Chart'} (${data.length || timeseries.length} data points)
      </div>
    `;
  }
</script>

<div
  bind:this={container}
  class="chart-container"
  data-testid="rough-chart"
  style="width: {width}px; height: {height}px;"
></div>

<style>
  .chart-container {
    font-family: var(--font-comic);
    overflow: hidden;
  }

  .chart-container :global(svg) {
    max-width: 100%;
  }

  .chart-container :global(text) {
    font-family: var(--font-comic) !important;
  }
</style>
