<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    variant?: 'text' | 'card' | 'chart' | 'avatar' | 'button' | 'sparkline';
    size?: 'sm' | 'md' | 'lg' | 'full';
    lines?: number;
    width?: string;
    height?: string;
  }

  const {
    variant = 'text',
    size = 'md',
    lines = 1,
    width,
    height,
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let mounted = $state(false);

  const SIZE_MAP = {
    sm: { w: 80, h: 16 },
    md: { w: 200, h: 20 },
    lg: { w: 320, h: 24 },
    full: { w: 0, h: 20 },
  } as const;

  const VARIANT_DIMS = {
    text: { w: 0, h: 20 },
    card: { w: 0, h: 120 },
    chart: { w: 0, h: 180 },
    avatar: { w: 40, h: 40 },
    button: { w: 120, h: 36 },
    sparkline: { w: 100, h: 24 },
  } as const;

  function getHeight(): string {
    if (height) return height;
    if (variant === 'card') return `${VARIANT_DIMS.card.h}px`;
    if (variant === 'chart') return `${VARIANT_DIMS.chart.h}px`;
    if (variant === 'avatar') return `${VARIANT_DIMS.avatar.h}px`;
    if (variant === 'button') return `${VARIANT_DIMS.button.h}px`;
    if (variant === 'sparkline') return `${VARIANT_DIMS.sparkline.h}px`;
    return `${SIZE_MAP[size].h * lines + (lines - 1) * 8}px`;
  }

  function getWidth(): string {
    if (width) return width;
    if (variant === 'avatar') return `${VARIANT_DIMS.avatar.w}px`;
    if (variant === 'button') return `${VARIANT_DIMS.button.w}px`;
    if (variant === 'sparkline') return `${VARIANT_DIMS.sparkline.w}px`;
    return '100%';
  }

  function drawSketchRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    roughness: number,
  ): void {
    ctx.beginPath();
    const jitter = () => (Math.random() - 0.5) * roughness;
    ctx.moveTo(x + jitter(), y + jitter());
    ctx.lineTo(x + w + jitter(), y + jitter());
    ctx.lineTo(x + w + jitter(), y + h + jitter());
    ctx.lineTo(x + jitter(), y + h + jitter());
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawSkeleton(): void {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const style = getComputedStyle(canvasEl);
    const borderColor = style.getPropertyValue('--border-color').trim() || '#2a2a2a';

    ctx.fillStyle = borderColor;
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = borderColor;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1.5;

    const roughness = 3;

    if (variant === 'text') {
      for (let i = 0; i < lines; i++) {
        const lineW = i === lines - 1 ? rect.width * (0.5 + Math.random() * 0.3) : rect.width * (0.85 + Math.random() * 0.15);
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = borderColor;
        drawSketchRect(ctx, 0, i * 28, lineW, 16, roughness);
      }
    } else if (variant === 'avatar') {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = borderColor;
      ctx.beginPath();
      ctx.arc(rect.width / 2, rect.height / 2, Math.min(rect.width, rect.height) / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.stroke();
    } else if (variant === 'sparkline') {
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const points = 8;
      for (let i = 0; i <= points; i++) {
        const px = (i / points) * rect.width;
        const py = rect.height * (0.3 + Math.random() * 0.4);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px + (Math.random() - 0.5) * 2, py);
      }
      ctx.stroke();
    } else if (variant === 'card') {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = borderColor;
      drawSketchRect(ctx, 0, 0, rect.width, rect.height, roughness);
      ctx.globalAlpha = 0.08;
      drawSketchRect(ctx, 16, 16, rect.width * 0.4, 18, roughness);
      drawSketchRect(ctx, 16, 46, rect.width * 0.7, 14, roughness);
      drawSketchRect(ctx, 16, 68, rect.width * 0.55, 14, roughness);
      drawSketchRect(ctx, 16, 96, 80, 24, roughness);
    } else if (variant === 'chart') {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = borderColor;
      drawSketchRect(ctx, 0, 0, rect.width, rect.height, roughness);
      const barCount = 7;
      const barW = (rect.width - 48) / barCount - 8;
      for (let i = 0; i < barCount; i++) {
        const barH = rect.height * (0.2 + Math.random() * 0.5);
        ctx.globalAlpha = 0.1;
        drawSketchRect(ctx, 24 + i * (barW + 8), rect.height - barH - 16, barW, barH, roughness);
      }
    } else if (variant === 'button') {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = borderColor;
      drawSketchRect(ctx, 0, 0, rect.width, rect.height, roughness);
    }
  }

  onMount(() => {
    mounted = true;
    drawSkeleton();
  });
</script>

<div
  class="comic-skeleton variant-{variant}"
  class:mounted
  style:width={getWidth()}
  style:height={getHeight()}
  aria-hidden="true"
  role="presentation"
>
  <canvas bind:this={canvasEl} class="skeleton-canvas"></canvas>
</div>

<style>
  .comic-skeleton {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-sm);
    animation: skeletonPulse 1.8s ease-in-out infinite;
  }

  .variant-card {
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    opacity: 0.5;
  }

  .variant-avatar {
    border-radius: 50%;
  }

  .variant-button {
    border-radius: var(--radius-sketch);
  }

  .skeleton-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .mounted {
    animation: skeletonPulse 1.8s ease-in-out infinite;
  }
</style>
