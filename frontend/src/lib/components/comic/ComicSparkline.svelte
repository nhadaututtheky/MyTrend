<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    data?: number[];
    color?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    roughness?: number;
  }

  const {
    data = [],
    color = 'var(--accent-green)',
    width = 100,
    height = 24,
    fill = false,
    roughness = 1.5,
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();

  function draw(): void {
    if (!canvasEl || data.length < 2) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const padding = 2;
    const usableH = height - padding * 2;
    const stepX = (width - padding * 2) / (data.length - 1);

    const points: Array<{ x: number; y: number }> = data.map((v, i) => ({
      x: padding + i * stepX,
      y: padding + usableH - ((v - min) / range) * usableH,
    }));

    // Resolve CSS variable color
    const resolvedColor = color.startsWith('var(')
      ? getComputedStyle(canvasEl).getPropertyValue(color.slice(4, -1)).trim() || '#00d26a'
      : color;

    // Fill area under line
    const first = points[0];
    const lastPt = points[points.length - 1];
    if (fill && first && lastPt) {
      ctx.beginPath();
      ctx.moveTo(first.x, height);
      for (const p of points) {
        ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(lastPt.x, height);
      ctx.closePath();
      ctx.fillStyle = resolvedColor;
      ctx.globalAlpha = 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw sketchy line
    ctx.beginPath();
    ctx.strokeStyle = resolvedColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (!pt) continue;
      const jx = (Math.random() - 0.5) * roughness;
      const jy = (Math.random() - 0.5) * roughness;
      if (i === 0) {
        ctx.moveTo(pt.x + jx, pt.y + jy);
      } else {
        ctx.lineTo(pt.x + jx, pt.y + jy);
      }
    }
    ctx.stroke();

    // Draw dot at last point
    const last = points[points.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = resolvedColor;
      ctx.fill();
    }
  }

  onMount(() => { draw(); });

  $effect(() => {
    if (data.length > 0) draw();
  });
</script>

<canvas
  bind:this={canvasEl}
  class="sparkline"
  style:width="{width}px"
  style:height="{height}px"
  aria-hidden="true"
  data-testid="sparkline"
></canvas>

<style>
  .sparkline {
    display: block;
    flex-shrink: 0;
  }
</style>
