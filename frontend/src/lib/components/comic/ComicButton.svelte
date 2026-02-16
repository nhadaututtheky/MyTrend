<script lang="ts">
  type Variant = 'primary' | 'secondary' | 'danger' | 'outline';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    type = 'button',
    onclick,
    children,
  }: Props = $props();
</script>

<button
  class="comic-btn comic-btn-{variant} size-{size}"
  {type}
  disabled={disabled || loading}
  {onclick}
  data-testid="comic-button"
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .comic-btn {
    font-family: var(--font-comic);
    font-weight: 700;
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    white-space: nowrap;
  }

  .comic-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .comic-btn:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: none;
  }

  .comic-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .comic-btn-primary {
    background: var(--accent-green);
    color: #1a1a1a;
  }

  .comic-btn-secondary {
    background: var(--accent-blue);
    color: #1a1a1a;
  }

  .comic-btn-danger {
    background: var(--accent-red);
    color: #ffffff;
  }

  .comic-btn-outline {
    background: transparent;
    color: var(--text-primary);
  }

  .size-sm {
    font-size: 0.75rem;
    padding: 4px 8px;
  }

  .size-md {
    font-size: 0.875rem;
    padding: 8px 16px;
  }

  .size-lg {
    font-size: 1rem;
    padding: 12px 24px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
