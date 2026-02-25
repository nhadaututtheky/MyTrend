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

  const {
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

  let svgElement: SVGSVGElement;

  const MARGIN = { top: 40, right: 20, bottom: 50, left: 55 };

  onMount(() => {
    void (async () => {
      try {
        const [roughModule, d3Scale] = await Promise.all([import('roughjs'), import('d3-scale')]);
        const rough = roughModule.default;
        renderChart(rough, d3Scale);
      } catch (err) {
        console.error('[RoughChart] Import failed:', err);
      }
    })();

    return () => {
      if (svgElement) {
        while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);
      }
    };
  });

  interface RoughSVG {
    rectangle: (
      x: number,
      y: number,
      w: number,
      h: number,
      opts?: Record<string, unknown>,
    ) => SVGGElement;
    line: (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      opts?: Record<string, unknown>,
    ) => SVGGElement;
    arc: (
      x: number,
      y: number,
      w: number,
      h: number,
      start: number,
      stop: number,
      closed: boolean,
      opts?: Record<string, unknown>,
    ) => SVGGElement;
    circle: (x: number, y: number, d: number, opts?: Record<string, unknown>) => SVGGElement;
    linearPath: (points: [number, number][], opts?: Record<string, unknown>) => SVGGElement;
  }

  interface D3ScaleModule {
    scaleLinear: () => {
      domain: (d: number[]) => { range: (r: number[]) => (v: number) => number };
    };
    scaleBand: () => {
      domain: (d: string[]) => {
        range: (r: number[]) => {
          padding: (p: number) => {
            (v: string): number | undefined;
            bandwidth: () => number;
            domain: () => string[];
          };
        };
      };
    };
  }

  function getChartData(): { labels: string[]; values: number[] } {
    if (data.length > 0) {
      return { labels: data.map((d) => d.label), values: data.map((d) => d.value) };
    }
    return { labels: timeseries.map((d) => d.date), values: timeseries.map((d) => d.value) };
  }

  function addSvgText(
    text: string,
    x: number,
    y: number,
    opts: { anchor?: string; size?: string; fill?: string; rotate?: number } = {},
  ): void {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('text-anchor', opts.anchor ?? 'middle');
    el.setAttribute('font-size', opts.size ?? '11');
    el.setAttribute('fill', opts.fill ?? 'currentColor');
    el.style.fontFamily = 'Comic Mono, monospace';
    if (opts.rotate) {
      el.setAttribute('transform', `rotate(${opts.rotate}, ${x}, ${y})`);
    }
    el.textContent = text;
    svgElement.appendChild(el);
  }

  function renderChart(
    rough: { svg: (el: SVGSVGElement) => RoughSVG },
    d3Scale: D3ScaleModule,
  ): void {
    if (!svgElement) return;
    while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);

    const chartData = getChartData();
    if (chartData.labels.length === 0) return;

    try {
      if (type === 'bar') renderBar(rough, d3Scale, chartData);
      else if (type === 'line') renderLine(rough, d3Scale, chartData);
      else if (type === 'donut' || type === 'pie') renderDonut(rough, chartData);
    } catch (err) {
      console.error(`[RoughChart] Render ${type} failed:`, err);
    }

    // Title
    if (title) {
      addSvgText(title, width / 2, 18, { size: '14', anchor: 'middle' });
    }
  }

  function renderBar(
    rough: { svg: (el: SVGSVGElement) => RoughSVG },
    d3Scale: D3ScaleModule,
    chartData: { labels: string[]; values: number[] },
  ): void {
    const rc = rough.svg(svgElement);
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const maxVal = Math.max(...chartData.values, 1);

    const xScale = d3Scale.scaleBand().domain(chartData.labels).range([0, plotW]).padding(0.3);
    const yScale = d3Scale
      .scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([plotH, 0]);

    // Y-axis line
    svgElement.appendChild(
      rc.line(MARGIN.left, MARGIN.top, MARGIN.left, MARGIN.top + plotH, {
        roughness: 0.8,
        stroke: '#888',
        strokeWidth: 1.5,
      }),
    );

    // X-axis line
    svgElement.appendChild(
      rc.line(MARGIN.left, MARGIN.top + plotH, MARGIN.left + plotW, MARGIN.top + plotH, {
        roughness: 0.8,
        stroke: '#888',
        strokeWidth: 1.5,
      }),
    );

    // Y-axis ticks (5 ticks)
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const val = Math.round((maxVal * 1.1 * i) / tickCount);
      const yPos = MARGIN.top + yScale(val);
      addSvgText(String(val), MARGIN.left - 8, yPos + 4, {
        anchor: 'end',
        size: '10',
        fill: '#888',
      });
      // Grid line
      svgElement.appendChild(
        rc.line(MARGIN.left, yPos, MARGIN.left + plotW, yPos, {
          roughness: 0.3,
          stroke: '#ddd',
          strokeWidth: 0.5,
        }),
      );
    }

    // Bars
    for (let i = 0; i < chartData.labels.length; i++) {
      const label = chartData.labels[i] ?? '';
      const value = chartData.values[i] ?? 0;
      const bx = xScale(label);
      if (bx === undefined) continue;

      const bw = xScale.bandwidth();
      const barH = plotH - yScale(value);
      const barY = MARGIN.top + yScale(value);
      const barX = MARGIN.left + bx;

      const barColor = colors[i % colors.length] ?? color;
      svgElement.appendChild(
        rc.rectangle(barX, barY, bw, barH, {
          fill: barColor,
          fillStyle: 'solid',
          roughness,
          stroke: barColor,
          strokeWidth: 1.5,
        }),
      );

      // X label
      const displayLabel = label.length > 8 ? label.slice(0, 7) + '..' : label;
      addSvgText(displayLabel, barX + bw / 2, MARGIN.top + plotH + 16, {
        size: '10',
        fill: '#888',
        rotate: chartData.labels.length > 6 ? -35 : 0,
      });

      // Value on top
      addSvgText(String(value), barX + bw / 2, barY - 6, { size: '10', fill: '#aaa' });
    }
  }

  function renderLine(
    rough: { svg: (el: SVGSVGElement) => RoughSVG },
    d3Scale: D3ScaleModule,
    chartData: { labels: string[]; values: number[] },
  ): void {
    const rc = rough.svg(svgElement);
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const maxVal = Math.max(...chartData.values, 1);

    const yScale = d3Scale
      .scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([plotH, 0]);

    // Axes
    svgElement.appendChild(
      rc.line(MARGIN.left, MARGIN.top, MARGIN.left, MARGIN.top + plotH, {
        roughness: 0.8,
        stroke: '#888',
        strokeWidth: 1.5,
      }),
    );
    svgElement.appendChild(
      rc.line(MARGIN.left, MARGIN.top + plotH, MARGIN.left + plotW, MARGIN.top + plotH, {
        roughness: 0.8,
        stroke: '#888',
        strokeWidth: 1.5,
      }),
    );

    // Points
    const points: [number, number][] = chartData.values.map((v, i) => {
      const x = MARGIN.left + (plotW / (chartData.values.length - 1 || 1)) * i;
      const y = MARGIN.top + yScale(v);
      return [x, y];
    });

    // Line path
    if (points.length > 1) {
      svgElement.appendChild(
        rc.linearPath(points, {
          roughness,
          stroke: color,
          strokeWidth: 2.5,
        }),
      );
    }

    // Dots
    for (const [px, py] of points) {
      svgElement.appendChild(
        rc.circle(px, py, 8, {
          fill: color,
          fillStyle: 'solid',
          roughness: 1,
          stroke: color,
        }),
      );
    }

    // X labels
    for (let i = 0; i < chartData.labels.length; i++) {
      const x = MARGIN.left + (plotW / (chartData.labels.length - 1 || 1)) * i;
      const label = chartData.labels[i] ?? '';
      const lbl = label.length > 8 ? label.slice(0, 7) + '..' : label;
      addSvgText(lbl, x, MARGIN.top + plotH + 16, { size: '10', fill: '#888' });
    }
  }

  function renderDonut(
    rough: { svg: (el: SVGSVGElement) => RoughSVG },
    chartData: { labels: string[]; values: number[] },
  ): void {
    const rc = rough.svg(svgElement);
    const cx = width / 2;
    const cy = height / 2 + 10;
    const outerR = Math.min(width, height) / 2 - 40;
    const innerR = type === 'donut' ? outerR * 0.5 : 0;
    const total = chartData.values.reduce((s, v) => s + v, 0);
    if (total === 0) return;

    let angle = -Math.PI / 2;
    for (let i = 0; i < chartData.values.length; i++) {
      const sliceAngle = ((chartData.values[i] ?? 0) / total) * Math.PI * 2;
      const startAngle = angle;
      const endAngle = angle + sliceAngle;
      const sliceColor = colors[i % colors.length];

      // Draw arc using rough path
      const arcPath = describeArc(cx, cy, outerR, startAngle, endAngle, innerR);
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', arcPath);
      // Use roughjs to generate a filled rough shape
      svgElement.appendChild(
        rc.arc(cx, cy, outerR * 2, outerR * 2, startAngle, endAngle, true, {
          fill: sliceColor,
          fillStyle: 'solid',
          roughness: roughness * 0.8,
          stroke: sliceColor,
          strokeWidth: 1,
        }),
      );

      // Label
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = outerR + 16;
      const lx = cx + labelR * Math.cos(midAngle);
      const ly = cy + labelR * Math.sin(midAngle);
      const pct = Math.round(((chartData.values[i] ?? 0) / total) * 100);
      const sliceLabel = chartData.labels[i] ?? '';
      const lbl = sliceLabel.length > 10 ? sliceLabel.slice(0, 9) + '..' : sliceLabel;
      addSvgText(`${lbl} ${pct}%`, lx, ly, {
        size: '10',
        fill: '#aaa',
        anchor: midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'end' : 'start',
      });

      angle = endAngle;
    }

    // Inner circle for donut
    if (type === 'donut' && innerR > 0) {
      svgElement.appendChild(
        rc.circle(cx, cy, innerR * 2, {
          fill: 'var(--bg-primary, #0d0d1a)',
          fillStyle: 'solid',
          roughness: 1,
          stroke: 'none',
        }),
      );
      // Total in center
      addSvgText(String(total), cx, cy + 4, { size: '18', fill: '#fff' });
    }
  }

  function describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number,
    innerR: number,
  ): string {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(endAngle);
      const iy1 = cy + innerR * Math.sin(endAngle);
      const ix2 = cx + innerR * Math.cos(startAngle);
      const iy2 = cy + innerR * Math.sin(startAngle);
      return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    }
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }
</script>

<svg
  bind:this={svgElement}
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  class="chart-container"
  data-testid="rough-chart"
>
  {#if data.length === 0 && timeseries.length === 0}
    <text x={width / 2} y={height / 2} text-anchor="middle" fill="var(--text-muted)">
      No chart data
    </text>
  {/if}
</svg>

<style>
  .chart-container {
    font-family: var(--font-comic);
    max-width: 100%;
    overflow: visible;
  }

  .chart-container :global(text) {
    font-family: var(--font-comic), monospace !important;
  }
</style>
