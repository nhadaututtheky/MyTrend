<script lang="ts">
  import { onMount } from 'svelte';

  interface SeriesData {
    id: string;
    label: string;
    color: string;
    data: Array<{ date: string; count: number }>;
  }

  interface Props {
    series?: SeriesData[];
    width?: number;
    height?: number;
    roughness?: number;
  }

  const {
    series = [],
    width = 800,
    height = 350,
    roughness = 1.2,
  }: Props = $props();

  let svgElement: SVGSVGElement;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let roughModule: any = $state(null);
  let d3Module: any = $state(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const MARGIN = { top: 30, right: 20, bottom: 40, left: 50 };

  onMount(async () => {
    try {
      const [rm, d3] = await Promise.all([import('roughjs'), import('d3-scale')]);
      roughModule = rm.default;
      d3Module = d3;
    } catch (err) {
      console.error('[RoughMultiLineChart] Import failed:', err);
    }
  });

  $effect(() => {
    if (!roughModule || !d3Module || !svgElement) return;
    void series;
    renderChart();
  });

  function renderChart(): void {
    if (!svgElement || series.length === 0) return;

    // Clear previous
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);

    const rc = roughModule.svg(svgElement);
    const chartW = width - MARGIN.left - MARGIN.right;
    const chartH = height - MARGIN.top - MARGIN.bottom;

    // Collect all dates and find max value
    let allDates: string[] = [];
    let maxVal = 0;
    for (const s of series) {
      for (const d of s.data) {
        if (!allDates.includes(d.date)) allDates.push(d.date);
        if (d.count > maxVal) maxVal = d.count;
      }
    }
    allDates = allDates.sort();
    if (allDates.length === 0) return;
    if (maxVal === 0) maxVal = 1;

    const xScale = d3Module.scaleLinear().domain([0, allDates.length - 1]).range([0, chartW]);
    const yScale = d3Module.scaleLinear().domain([0, maxVal * 1.1]).range([chartH, 0]);

    // Container group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    svgElement.appendChild(g);

    // Grid lines
    const gridTicks = 5;
    for (let i = 0; i <= gridTicks; i++) {
      const y = (chartH / gridTicks) * i;
      const line = rc.line(0, y, chartW, y, {
        stroke: 'rgba(255,255,255,0.07)',
        strokeWidth: 0.5,
        roughness: 0.3,
      });
      g.appendChild(line);
    }

    // X-axis
    g.appendChild(rc.line(0, chartH, chartW, chartH, {
      stroke: 'rgba(255,255,255,0.2)',
      strokeWidth: 1,
      roughness: 0.5,
    }));

    // Y-axis
    g.appendChild(rc.line(0, 0, 0, chartH, {
      stroke: 'rgba(255,255,255,0.2)',
      strokeWidth: 1,
      roughness: 0.5,
    }));

    // Y-axis labels
    for (let i = 0; i <= gridTicks; i++) {
      const val = Math.round((maxVal * 1.1 / gridTicks) * (gridTicks - i));
      const y = (chartH / gridTicks) * i;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.textContent = String(val);
      label.setAttribute('x', '-8');
      label.setAttribute('y', String(y + 4));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'axis-label');
      g.appendChild(label);
    }

    // X-axis labels (show ~8 labels max)
    const labelInterval = Math.max(1, Math.floor(allDates.length / 8));
    for (let i = 0; i < allDates.length; i += labelInterval) {
      const x = xScale(i) as number;
      const dateStr = allDates[i] ?? '';
      const short = dateStr.substring(5); // MM-DD
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.textContent = short;
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(chartH + 20));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'axis-label');
      g.appendChild(label);
    }

    // Draw each series
    for (const s of series) {
      const dateMap: Record<string, number> = {};
      for (const d of s.data) dateMap[d.date] = d.count;

      // Build points - subsample if too many
      const step = allDates.length > 90 ? Math.ceil(allDates.length / 90) : 1;
      const points: Array<[number, number]> = [];
      for (let i = 0; i < allDates.length; i += step) {
        const date = allDates[i] ?? '';
        const val = dateMap[date] ?? 0;
        points.push([MARGIN.left + (xScale(i) as number), MARGIN.top + (yScale(val) as number)]);
      }

      if (points.length < 2) continue;

      // Draw line directly on SVG (outside the g transform)
      const lineEl = rc.linearPath(points, {
        stroke: s.color,
        strokeWidth: 2.5,
        roughness: roughness,
        fill: 'none',
      });
      svgElement.appendChild(lineEl);

      // Draw dots at data points
      for (const [px, py] of points) {
        const dot = rc.circle(px, py, 6, {
          fill: s.color,
          fillStyle: 'solid',
          stroke: s.color,
          roughness: 0.5,
        });
        svgElement.appendChild(dot);
      }
    }

    // Hover overlay (invisible rects for tooltip)
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('class', 'hover-overlay');

    const tooltipG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tooltipG.setAttribute('class', 'tooltip-group');
    tooltipG.style.display = 'none';
    svgElement.appendChild(tooltipG);

    const colWidth = chartW / Math.max(allDates.length - 1, 1);
    for (let i = 0; i < allDates.length; i++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const x = MARGIN.left + (xScale(i) as number) - colWidth / 2;
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(MARGIN.top));
      rect.setAttribute('width', String(colWidth));
      rect.setAttribute('height', String(chartH));
      rect.setAttribute('fill', 'transparent');
      rect.setAttribute('data-idx', String(i));

      rect.addEventListener('mouseenter', () => {
        showTooltip(i, allDates, tooltipG, xScale, yScale);
      });
      rect.addEventListener('mouseleave', () => {
        tooltipG.style.display = 'none';
      });
      overlay.appendChild(rect);
    }
    svgElement.appendChild(overlay);
  }

  function showTooltip(
    idx: number,
    allDates: string[],
    /* eslint-disable @typescript-eslint/no-explicit-any */
    tooltipG: SVGGElement,
    xScale: any,
    yScale: any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
  ): void {
    while (tooltipG.firstChild) tooltipG.removeChild(tooltipG.firstChild);
    tooltipG.style.display = '';

    const date = allDates[idx] ?? '';
    const x = MARGIN.left + (xScale(idx) as number);

    // Vertical line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(MARGIN.top));
    line.setAttribute('y2', String(MARGIN.top + height - MARGIN.top - MARGIN.bottom));
    line.setAttribute('stroke', 'rgba(255,255,255,0.3)');
    line.setAttribute('stroke-dasharray', '3,3');
    tooltipG.appendChild(line);

    // Tooltip box
    const boxX = Math.min(x + 10, width - 140);
    const boxY = MARGIN.top + 10;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(boxX));
    bg.setAttribute('y', String(boxY));
    bg.setAttribute('width', '130');
    bg.setAttribute('height', String(24 + series.length * 18));
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', 'rgba(13,13,26,0.9)');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    tooltipG.appendChild(bg);

    // Date label
    const dateLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dateLabel.textContent = date;
    dateLabel.setAttribute('x', String(boxX + 8));
    dateLabel.setAttribute('y', String(boxY + 16));
    dateLabel.setAttribute('class', 'tooltip-date');
    tooltipG.appendChild(dateLabel);

    // Series values
    for (let s = 0; s < series.length; s++) {
      const ser = series[s];
      if (!ser) continue;
      const dateMap: Record<string, number> = {};
      for (const d of ser.data) dateMap[d.date] = d.count;
      const val = dateMap[date] ?? 0;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(boxX + 14));
      dot.setAttribute('cy', String(boxY + 32 + s * 18));
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', ser.color);
      tooltipG.appendChild(dot);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = `${ser.label}: ${val}`;
      text.setAttribute('x', String(boxX + 24));
      text.setAttribute('y', String(boxY + 36 + s * 18));
      text.setAttribute('class', 'tooltip-text');
      tooltipG.appendChild(text);

      // Highlight dot on chart
      const cy = MARGIN.top + (yScale(val) as number);
      const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      highlight.setAttribute('cx', String(x));
      highlight.setAttribute('cy', String(cy));
      highlight.setAttribute('r', '5');
      highlight.setAttribute('fill', ser.color);
      highlight.setAttribute('stroke', '#fff');
      highlight.setAttribute('stroke-width', '2');
      tooltipG.appendChild(highlight);
    }
  }
</script>

<div class="chart-container">
  <svg
    bind:this={svgElement}
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    class="multi-line-chart"
    data-testid="rough-multi-line-chart"
  >
    {#if series.length === 0}
      <text x={width / 2} y={height / 2} text-anchor="middle" class="empty-text">
        Select topics to compare trends
      </text>
    {/if}
  </svg>

  {#if series.length > 0}
    <div class="legend">
      {#each series as s}
        <span class="legend-item">
          <span class="legend-dot" style="background: {s.color}"></span>
          {s.label}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart-container {
    width: 100%;
  }

  .multi-line-chart {
    width: 100%;
    max-width: 100%;
    overflow: visible;
  }

  .multi-line-chart :global(.axis-label) {
    font-family: 'Comic Mono', monospace;
    font-size: 10px;
    fill: rgba(255, 255, 255, 0.5);
  }

  .multi-line-chart :global(.tooltip-date) {
    font-family: 'Comic Mono', monospace;
    font-size: 11px;
    fill: rgba(255, 255, 255, 0.8);
    font-weight: 700;
  }

  .multi-line-chart :global(.tooltip-text) {
    font-family: 'Comic Mono', monospace;
    font-size: 10px;
    fill: rgba(255, 255, 255, 0.7);
  }

  .empty-text {
    fill: var(--text-muted);
    font-family: 'Comic Mono', monospace;
    font-size: 14px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: center;
    padding: 8px 0;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
