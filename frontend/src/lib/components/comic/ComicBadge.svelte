<script lang="ts">
  import type { Snippet } from 'svelte';

  type Color = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange';
  type Size = 'sm' | 'md';

  interface Props {
    color?: Color;
    size?: Size;
    animated?: boolean;
    children?: Snippet;
  }

  const { color = 'green', size = 'md', animated = false, children }: Props = $props();
</script>

<span class="badge badge-{color} badge-{size}" class:animated data-testid="comic-badge">
  {#if children}
    {@render children()}
  {/if}
</span>

<style>
  .badge {
    font-family: var(--font-comic);
    font-weight: 700;
    display: inline-block;
    text-transform: uppercase;
    border-radius: var(--radius-sketch);
    white-space: nowrap;
  }

  .badge-md {
    font-size: var(--font-size-sm);
    padding: 2px var(--spacing-sm);
  }

  .badge-sm {
    font-size: var(--font-size-2xs);
    padding: 1px 6px;
  }

  .badge-green { background: var(--accent-green); color: #1a1a1a; }
  .badge-red { background: var(--accent-red); color: #ffffff; }
  .badge-yellow { background: var(--accent-yellow); color: #1a1a1a; }
  .badge-blue { background: var(--accent-blue); color: #1a1a1a; }
  .badge-purple { background: var(--accent-purple); color: #1a1a1a; }
  .badge-orange { background: var(--accent-orange); color: #1a1a1a; }

  .animated {
    animation: neonPulse 2s ease-in-out infinite;
  }
</style>
