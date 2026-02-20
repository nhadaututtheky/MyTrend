<script lang="ts">
  interface Props {
    disabled?: boolean;
    placeholder?: string;
    onsend: (content: string) => void;
    oninterrupt?: () => void;
    isBusy?: boolean;
  }

  let { disabled = false, placeholder, onsend, oninterrupt, isBusy = false }: Props = $props();

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  function handleSubmit() {
    const trimmed = inputValue.trim();
    if (!trimmed || disabled) return;
    onsend(trimmed);
    inputValue = '';
    // Reset textarea height
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
</script>

<div class="composer">
  <textarea
    bind:this={textareaEl}
    class="composer-input"
    rows={1}
    {placeholder}
    {disabled}
    bind:value={inputValue}
    onkeydown={handleKeydown}
    oninput={autoResize}
    aria-label="Message input"
  ></textarea>

  <div class="composer-actions">
    {#if isBusy && oninterrupt}
      <button
        class="btn-interrupt"
        onclick={oninterrupt}
        aria-label="Interrupt Claude"
      >
        Stop
      </button>
    {/if}

    <button
      class="btn-send"
      onclick={handleSubmit}
      disabled={disabled || !inputValue.trim()}
      aria-label="Send message"
    >
      Send
    </button>
  </div>
</div>

<style>
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 2px solid var(--border-color);
    background: var(--bg-card);
  }

  .composer-input {
    flex: 1;
    padding: var(--spacing-sm);
    background: var(--bg-elevated);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    resize: none;
    outline: none;
    min-height: 36px;
    max-height: 150px;
    transition: border-color 150ms ease;
  }

  .composer-input:focus {
    border-color: var(--accent-green);
  }

  .composer-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .composer-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  .btn-send {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--accent-green);
    color: #1a1a1a;
    border: 2px solid var(--accent-green);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .btn-send:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .btn-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-interrupt {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    background: rgba(255, 71, 87, 0.15);
    color: var(--accent-red);
    border: 2px solid var(--accent-red);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
    animation: interruptPulse 1.5s ease-in-out infinite;
  }

  @keyframes interruptPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .btn-interrupt:hover {
    background: var(--accent-red);
    color: #fff;
    transform: translateY(-1px);
  }
</style>
