<script lang="ts">
  import { onMount } from 'svelte';
  import ComicButton from './ComicButton.svelte';

  interface Props {
    message?: string;
    description?: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
    illustration?: 'empty' | 'search' | 'error' | 'inbox';
  }

  const {
    message = 'Nothing here yet',
    description,
    actionLabel,
    actionHref,
    onAction,
    illustration = 'empty',
  }: Props = $props();

  let svgEl: SVGSVGElement | undefined = $state();

  const ILLUSTRATIONS: Record<string, string[]> = {
    empty: [
      'M 30 80 Q 50 20 70 80',
      'M 25 85 L 75 85',
      'M 40 60 L 40 55',
      'M 60 60 L 60 55',
      'M 42 72 Q 50 68 58 72',
    ],
    search: [
      'M 55 55 m -20 0 a 20 20 0 1 0 40 0 a 20 20 0 1 0 -40 0',
      'M 68 68 L 82 82',
      'M 45 48 L 52 48',
      'M 58 48 L 65 48',
    ],
    error: [
      'M 50 25 L 20 80 L 80 80 Z',
      'M 50 45 L 50 60',
      'M 50 67 L 50 70',
    ],
    inbox: [
      'M 20 40 L 50 20 L 80 40 L 80 80 L 20 80 Z',
      'M 20 40 L 50 60 L 80 40',
      'M 35 55 L 45 55',
      'M 55 55 L 65 55',
    ],
  };

  function drawRoughPaths(): void {
    if (!svgEl) return;
    try {
      const paths = ILLUSTRATIONS[illustration] ?? ILLUSTRATIONS['empty'] ?? [];
      for (const d of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--text-muted)');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.style.strokeDasharray = '1000';
        path.style.strokeDashoffset = '1000';
        path.style.animation = 'sketchDraw 0.8s ease forwards';
        path.style.animationDelay = `${Math.random() * 0.3}s`;
        svgEl.appendChild(path);
      }
    } catch {
      // SVG drawing failed, show text only
    }
  }

  onMount(() => { drawRoughPaths(); });
</script>

<div class="empty-state" data-testid="empty-state">
  <svg
    bind:this={svgEl}
    viewBox="0 0 100 100"
    class="empty-illustration"
    aria-hidden="true"
  ></svg>

  <p class="empty-message">{message}</p>

  {#if description}
    <p class="empty-description">{description}</p>
  {/if}

  {#if actionLabel}
    {#if actionHref}
      <a href={actionHref} class="empty-action">
        <ComicButton variant="primary">{actionLabel}</ComicButton>
      </a>
    {:else if onAction}
      <div class="empty-action">
        <ComicButton variant="primary" onclick={onAction}>{actionLabel}</ComicButton>
      </div>
    {/if}
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-2xl) var(--spacing-lg);
    text-align: center;
    gap: var(--spacing-sm);
  }

  .empty-illustration {
    width: 100px;
    height: 100px;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }

  .empty-message {
    font-family: var(--font-comic);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-secondary);
    margin: 0;
  }

  .empty-description {
    font-size: 0.85rem;
    color: var(--text-muted);
    max-width: 320px;
    margin: 0;
  }

  .empty-action {
    margin-top: var(--spacing-md);
    text-decoration: none;
  }
</style>
