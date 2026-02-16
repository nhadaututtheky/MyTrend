<script lang="ts">
  type Position = 'top' | 'bottom' | 'left' | 'right';

  interface Props {
    text: string;
    position?: Position;
    children?: import('svelte').Snippet;
  }

  let { text, position = 'top', children }: Props = $props();
</script>

<div class="tooltip-wrapper" data-testid="comic-tooltip">
  {#if children}
    {@render children()}
  {/if}
  <div class="tooltip tooltip-{position}" role="tooltip">
    {text}
  </div>
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    font-family: var(--font-comic);
    font-size: 0.75rem;
    position: absolute;
    background: var(--border-color);
    color: var(--bg-primary);
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 150ms ease;
    z-index: 100;
  }

  .tooltip-wrapper:hover .tooltip {
    opacity: 1;
  }

  .tooltip-top {
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-bottom {
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-left {
    right: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip-right {
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
  }
</style>
