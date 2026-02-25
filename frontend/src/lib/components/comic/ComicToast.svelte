<script lang="ts">
  import { toast } from '$lib/stores/toast';

  const ICONS: Record<string, string> = {
    success: '✓',
    error: '✗',
    info: 'i',
    warning: '!',
  };

  function getIcon(type: string): string {
    return ICONS[type] ?? 'i';
  }

  function dismiss(id: string): void {
    toast.dismiss(id);
  }
</script>

<div class="toast-container" aria-live="polite" data-testid="comic-toast-container">
  {#each $toast as t (t.id)}
    <div class="toast toast-{t.type}" role="alert">
      <span class="icon">{getIcon(t.type)}</span>
      <span class="message">{t.message}</span>
      <button class="dismiss" onclick={() => dismiss(t.id)} aria-label="Dismiss"> &times; </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: var(--spacing-lg);
    right: var(--spacing-lg);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    max-width: 400px;
  }

  .toast {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-md);
    animation: slideIn 0.3s ease;
  }

  .toast-success {
    background: #d4edda;
  }
  .toast-error {
    background: #f8d7da;
  }
  .toast-info {
    background: #d1ecf1;
  }
  .toast-warning {
    background: #fff3cd;
  }

  :global([data-theme='dark']) .toast-success {
    background: #1a3d2a;
    color: #d4edda;
  }
  :global([data-theme='dark']) .toast-error {
    background: #3d1a1a;
    color: #f8d7da;
  }
  :global([data-theme='dark']) .toast-info {
    background: #1a2d3d;
    color: #d1ecf1;
  }
  :global([data-theme='dark']) .toast-warning {
    background: #3d3a1a;
    color: #fff3cd;
  }

  .icon {
    font-weight: 700;
    font-size: 1rem;
    width: 20px;
    text-align: center;
  }

  .message {
    flex: 1;
  }

  .dismiss {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    padding: 0 4px;
  }

  .dismiss:hover {
    opacity: 1;
  }

  @keyframes slideIn {
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
