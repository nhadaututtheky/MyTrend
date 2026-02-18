<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title?: string;
    mode?: 'dialog' | 'drawer';
    onclose?: () => void;
    children?: Snippet;
    actions?: Snippet;
  }

  let { open = $bindable(false), title, mode = 'dialog', onclose, children, actions }: Props = $props();

  function handleBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      open = false;
      onclose?.();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      open = false;
      onclose?.();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title ?? 'Dialog'}
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
    data-testid="comic-dialog"
  >
    <div class="dialog" class:drawer={mode === 'drawer'}>
      {#if title}
        <div class="header">
          <h3 class="title">{title}</h3>
          <button
            class="close-btn"
            onclick={() => {
              open = false;
              onclose?.();
            }}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>
      {/if}
      <div class="body">
        {#if children}
          {@render children()}
        {/if}
      </div>
      {#if actions}
        <div class="footer">
          {@render actions()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    animation: fadeIn 0.2s ease;
  }

  .dialog {
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-lg);
    min-width: 320px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    animation: slideUp 0.2s ease;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .title {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-2xl);
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: var(--font-size-4xl);
    cursor: pointer;
    color: var(--text-secondary);
    line-height: 1;
    padding: var(--spacing-xs);
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--accent-red);
  }

  .body {
    padding: var(--spacing-lg);
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-top: var(--border-width) solid var(--border-color);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Drawer mode: slide from right */
  .drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    min-width: 360px;
    max-width: 480px;
    width: 90vw;
    max-height: 100vh;
    border-radius: 0;
    border-right: none;
    border-top: none;
    border-bottom: none;
    animation: slideRight 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
