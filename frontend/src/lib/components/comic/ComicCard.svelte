<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'standard' | 'skewed' | 'interactive';

  interface Props {
    variant?: Variant;
    padding?: boolean;
    neon?: 'green' | 'blue' | 'red' | 'purple' | 'yellow' | 'orange' | false;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  }

  const { variant = 'standard', padding = true, neon = false, onclick, children }: Props = $props();

  const isClickable = $derived(onclick !== undefined);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="card card-{variant} {neon ? `sketch-card-neon-${neon}` : ''}"
  class:clickable={isClickable}
  class:padded={padding}
  role={isClickable ? 'button' : undefined}
  tabindex={isClickable ? 0 : undefined}
  onclick={onclick}
  onkeydown={(e) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onclick?.(e as unknown as MouseEvent);
    }
  }}
  data-testid="comic-card"
>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .card {
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-md);
    transition:
      transform 250ms ease,
      box-shadow 250ms ease;
  }

  .padded {
    padding: var(--spacing-lg);
  }

  .card-skewed {
    transform: skewX(-2deg);
  }

  .card-skewed:hover {
    transform: skewX(0) translateY(-4px);
    box-shadow: var(--shadow-lg);
  }

  .card-interactive:hover {
    transform: translateY(-8px);
    box-shadow: var(--shadow-lg);
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
  }
</style>
