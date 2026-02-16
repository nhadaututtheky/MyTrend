<script lang="ts">
  interface Props {
    open: boolean;
    title?: string;
    onclose?: () => void;
    children?: import('svelte').Snippet;
    actions?: import('svelte').Snippet;
  }

  let { open = $bindable(false), title, onclose, children, actions }: Props = $props();

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
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title ?? 'Dialog'}
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
    data-testid="comic-dialog"
  >
    <div class="dialog">
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
    z-index: 1000;
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
    font-size: 1.1rem;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-secondary);
    line-height: 1;
    padding: 4px;
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
</style>
