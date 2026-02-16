<script lang="ts">
  import ComicButton from '$lib/components/comic/ComicButton.svelte';

  interface Props {
    disabled?: boolean;
    onsend?: (content: string) => void;
  }

  const { disabled = false, onsend }: Props = $props();

  let content = $state('');
  let textareaEl: HTMLTextAreaElement;

  function handleSubmit(e: SubmitEvent): void {
    e.preventDefault();
    if (!content.trim() || disabled) return;
    onsend?.(content.trim());
    content = '';
    resizeTextarea();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() && !disabled) {
        onsend?.(content.trim());
        content = '';
        resizeTextarea();
      }
    }
  }

  function resizeTextarea(): void {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 200)}px`;
  }
</script>

<form class="composer" onsubmit={handleSubmit} data-testid="composer">
  <div class="input-wrapper">
    <textarea
      bind:this={textareaEl}
      bind:value={content}
      class="message-input"
      placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
      rows="1"
      {disabled}
      onkeydown={handleKeydown}
      oninput={resizeTextarea}
    ></textarea>
  </div>
  <ComicButton
    variant="primary"
    type="submit"
    disabled={!content.trim() || disabled}
    size="md"
  >
    Send
  </ComicButton>
</form>

<style>
  .composer {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-end;
    padding: var(--spacing-md);
    border-top: var(--border-width) solid var(--border-color);
    background: var(--bg-card);
  }

  .input-wrapper {
    flex: 1;
  }

  .message-input {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-primary);
    color: var(--text-primary);
    resize: none;
    overflow-y: auto;
    max-height: 200px;
    line-height: 1.5;
  }

  .message-input:focus {
    outline: none;
    box-shadow: var(--shadow-md);
  }

  .message-input::placeholder {
    color: var(--text-muted);
  }

  .message-input:disabled {
    opacity: 0.5;
  }
</style>
