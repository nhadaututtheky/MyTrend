<script lang="ts">
  import { theme, toggleTheme } from '$lib/stores/theme';

  let currentTheme = $state('light');

  $effect(() => {
    const unsub = theme.subscribe((t) => {
      currentTheme = t;
    });
    return unsub;
  });
</script>

<button
  class="toggle"
  onclick={toggleTheme}
  aria-label="Toggle theme to {currentTheme === 'light' ? 'dark' : 'light'} mode"
  data-testid="theme-toggle"
>
  {#if currentTheme === 'light'}
    <span class="icon">&#9790;</span>
  {:else}
    <span class="icon">&#9728;</span>
  {/if}
</button>

<style>
  .toggle {
    font-size: 1.25rem;
    background: none;
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: 4px 8px;
    cursor: pointer;
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  .toggle:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .icon {
    display: inline-block;
  }
</style>
