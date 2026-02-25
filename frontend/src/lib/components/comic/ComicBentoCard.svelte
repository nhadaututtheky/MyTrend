<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    icon?: string;
    span?: 1 | 2 | 3 | 4 | 'full';
    rowSpan?: 1 | 2;
    variant?: 'default' | 'compact' | 'neon';
    neonColor?: 'green' | 'blue' | 'red' | 'purple' | 'yellow' | 'orange';
    children: Snippet;
    footer?: Snippet;
  }

  const {
    title,
    icon,
    span = 1,
    rowSpan = 1,
    variant = 'default',
    neonColor = 'green',
    children,
    footer,
  }: Props = $props();

  const accentMap: Record<string, string> = {
    green: 'var(--accent-green)',
    blue: 'var(--accent-blue)',
    red: 'var(--accent-red)',
    purple: 'var(--accent-purple)',
    yellow: 'var(--accent-yellow)',
    orange: 'var(--accent-orange)',
  };

  const cardAccent = $derived(neonColor ? accentMap[neonColor] : '');
  const getNeonClass = () => (variant === 'neon' ? `sketch-card-neon-${neonColor}` : '');

  function getSpanAttr(s: typeof span): string | undefined {
    if (s === 'full') return 'full';
    if (s > 1) return String(s);
    return undefined;
  }
</script>

<div
  class="bento-card {variant} {getNeonClass()} sketch-card"
  data-span={getSpanAttr(span)}
  data-row-span={rowSpan > 1 ? String(rowSpan) : undefined}
  data-testid="bento-card"
  style:--card-accent={cardAccent}
>
  {#if title || icon}
    <div class="bento-header">
      {#if icon}<span class="bento-icon">{icon}</span>{/if}
      {#if title}<h3 class="bento-title">{title}</h3>{/if}
    </div>
  {/if}

  <div class="bento-content">
    {@render children()}
  </div>

  {#if footer}
    <div class="bento-footer">
      {@render footer()}
    </div>
  {/if}
</div>

<style>
  .bento-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-top: 4px solid var(--card-accent, var(--border-color));
  }

  .compact {
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .bento-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .bento-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .bento-title {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--card-accent, var(--text-secondary));
    margin: 0;
  }

  .bento-content {
    flex: 1;
    min-height: 0;
  }

  .bento-footer {
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1.5px dashed var(--border-color);
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.8rem;
  }
</style>
