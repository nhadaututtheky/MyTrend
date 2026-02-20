<script lang="ts">
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();
</script>

<div class="vibe-layout">
  {@render children()}
</div>

<style>
  .vibe-layout {
    display: flex;
    height: calc(100vh - var(--header-height) - var(--spacing-lg) * 2);
    margin: calc(-1 * var(--spacing-lg));
    margin-top: 0;
  }

  @media (max-width: 768px) {
    .vibe-layout {
      margin: calc(-1 * var(--spacing-md));
      margin-top: 0;
      height: calc(100vh - var(--header-height) - var(--spacing-md) * 2);
    }
  }
</style>
