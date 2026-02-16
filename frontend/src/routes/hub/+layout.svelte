<script lang="ts">
  const { children } = $props();
</script>

<div class="hub-layout">
  {@render children()}
</div>

<style>
  .hub-layout {
    display: flex;
    height: calc(100vh - var(--header-height) - var(--spacing-lg) * 2);
    margin: calc(-1 * var(--spacing-lg));
    margin-top: 0;
  }

  @media (max-width: 768px) {
    .hub-layout {
      margin: calc(-1 * var(--spacing-md));
      margin-top: 0;
      height: calc(100vh - var(--header-height) - var(--spacing-md) * 2);
    }
  }
</style>
