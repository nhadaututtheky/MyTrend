<script lang="ts">
  import type { Snippet } from 'svelte';

  type CalloutType = 'tip' | 'note' | 'important' | 'warning';

  interface Props {
    type?: CalloutType;
    title?: string;
    children?: Snippet;
  }

  const { type = 'note', title, children }: Props = $props();

  const LABELS: Record<CalloutType, string> = {
    tip: 'Tip',
    note: 'Note',
    important: 'Important',
    warning: 'Warning',
  };

  const displayTitle = $derived(title ?? LABELS[type]);
</script>

<div class="callout callout-{type}" role="note" data-testid="comic-callout">
  <div class="callout-title">{displayTitle}</div>
  <div class="callout-body">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .callout {
    font-family: var(--font-comic);
    border-left: 4px solid;
    padding: var(--spacing-md);
    margin: var(--spacing-md) 0;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .callout-tip {
    border-color: var(--accent-green);
    background: rgba(0, 210, 106, 0.08);
  }

  .callout-note {
    border-color: var(--accent-blue);
    background: rgba(78, 205, 196, 0.08);
  }

  .callout-important {
    border-color: var(--accent-purple);
    background: rgba(162, 155, 254, 0.08);
  }

  .callout-warning {
    border-color: var(--accent-orange);
    background: rgba(255, 159, 67, 0.08);
  }

  .callout-title {
    font-weight: 700;
    font-size: 0.875rem;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .callout-body {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
</style>
