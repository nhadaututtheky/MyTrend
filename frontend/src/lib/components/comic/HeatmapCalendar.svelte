<script lang="ts">
  import type { HeatmapDay } from '$lib/types';
  import { getHeatmapColor } from '$lib/utils/colors';
  import { theme } from '$lib/stores/theme';

  interface Props {
    data?: HeatmapDay[];
    width?: number;
  }

  const { data = [] }: Props = $props();

  const CELL_SIZE = 12;
  const CELL_GAP = 2;
  const WEEKS = 53;
  const DAYS_PER_WEEK = 7;
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  let svgElement: SVGSVGElement;
  let currentTheme = $state('light');

  $effect(() => {
    const unsub = theme.subscribe((t) => {
      currentTheme = t;
    });
    return unsub;
  });

  const isDark = $derived(currentTheme === 'dark');

  // Build calendar grid from data
  const grid = $derived.by(() => {
    if (data.length === 0) return [];

    const cells: { x: number; y: number; date: string; count: number; level: HeatmapDay['level'] }[] = [];

    for (let i = 0; i < data.length; i++) {
      const day = data[i];
      if (!day) continue;
      const date = new Date(day.date);
      const weekDay = date.getDay();
      const weekIndex = Math.floor(i / 7);

      cells.push({
        x: weekIndex * (CELL_SIZE + CELL_GAP) + 30,
        y: weekDay * (CELL_SIZE + CELL_GAP) + 20,
        date: day.date,
        count: day.count,
        level: day.level,
      });
    }

    return cells;
  });

  const svgWidth = $derived(WEEKS * (CELL_SIZE + CELL_GAP) + 60);
  const svgHeight = $derived(DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP) + 40);

  const totalCount = $derived(data.reduce((sum, d) => sum + d.count, 0));
</script>

<div class="heatmap-wrapper" data-testid="heatmap-calendar">
  <div class="heatmap-header">
    <span class="total">{totalCount} activities in the last year</span>
  </div>
  <div class="heatmap-scroll">
    <svg
      bind:this={svgElement}
      width={svgWidth}
      height={svgHeight}
      viewBox="0 0 {svgWidth} {svgHeight}"
    >
      <!-- Day labels -->
      {#each DAY_LABELS as label, i}
        {#if label}
          <text
            x="0"
            y={i * (CELL_SIZE + CELL_GAP) + 20 + CELL_SIZE - 2}
            font-size="9"
            fill="var(--text-muted)"
            font-family="Comic Mono, monospace"
          >
            {label}
          </text>
        {/if}
      {/each}

      <!-- Cells -->
      {#each grid as cell (cell.date)}
        <rect
          x={cell.x}
          y={cell.y}
          width={CELL_SIZE}
          height={CELL_SIZE}
          rx="2"
          fill={getHeatmapColor(cell.level, isDark)}
          stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
          stroke-width="1"
        >
          <title>{cell.date}: {cell.count} activities</title>
        </rect>
      {/each}
    </svg>
  </div>
  <div class="legend">
    <span>Less</span>
    {#each [0, 1, 2, 3, 4] as level}
      <span
        class="legend-cell"
        style="background: {getHeatmapColor(level as 0 | 1 | 2 | 3 | 4, isDark)}"
      ></span>
    {/each}
    <span>More</span>
  </div>
</div>

<style>
  .heatmap-wrapper {
    font-family: var(--font-comic);
  }

  .heatmap-header {
    margin-bottom: var(--spacing-sm);
  }

  .total {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .heatmap-scroll {
    overflow-x: auto;
    padding-bottom: var(--spacing-sm);
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--text-muted);
    justify-content: flex-end;
    margin-top: var(--spacing-sm);
  }

  .legend-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    display: inline-block;
  }
</style>
