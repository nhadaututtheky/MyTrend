<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    columns?: 2 | 3 | 4;
    gap?: 'sm' | 'md' | 'lg';
    children: Snippet;
  }

  const { columns = 3, gap = 'md', children }: Props = $props();

  const GAP_MAP = {
    sm: 'var(--spacing-sm)',
    md: 'var(--spacing-md)',
    lg: 'var(--spacing-lg)',
  } as const;
</script>

<div class="bento-grid cols-{columns}" style:gap={GAP_MAP[gap]} data-testid="bento-grid">
  {@render children()}
</div>

<style>
  .bento-grid {
    display: grid;
    width: 100%;
  }

  .cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }

  /* Allow children to span via inline grid-column */
  .bento-grid > :global([data-span='2']) {
    grid-column: span 2;
  }
  .bento-grid > :global([data-span='3']) {
    grid-column: span 3;
  }
  .bento-grid > :global([data-span='4']) {
    grid-column: span 4;
  }
  .bento-grid > :global([data-span='full']) {
    grid-column: 1 / -1;
  }
  .bento-grid > :global([data-row-span='2']) {
    grid-row: span 2;
  }

  @media (max-width: 1024px) {
    .cols-3,
    .cols-4 {
      grid-template-columns: repeat(2, 1fr);
    }
    .bento-grid > :global([data-span='3']),
    .bento-grid > :global([data-span='4']) {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 768px) {
    .cols-2,
    .cols-3,
    .cols-4 {
      grid-template-columns: 1fr;
    }
    .bento-grid > :global([data-span='2']),
    .bento-grid > :global([data-span='3']),
    .bento-grid > :global([data-span='4']),
    .bento-grid > :global([data-span='full']) {
      grid-column: 1;
    }
  }
</style>
