<script lang="ts">
  import type { HubMessage } from '$lib/types';
  import { formatDateTime } from '$lib/utils/date';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { toast } from '$lib/stores/toast';

  interface Props {
    message: HubMessage;
  }

  const { message }: Props = $props();

  const isUser = $derived(message.role === 'user');

  function copyContent(): void {
    navigator.clipboard.writeText(message.content);
    toast.success('Copied!');
  }
</script>

<div class="bubble-wrapper" class:user={isUser} data-testid="message-bubble">
  <div class="bubble" class:user-bubble={isUser} class:assistant-bubble={!isUser}>
    {#if isUser}
      <div class="content">{message.content}</div>
    {:else}
      <div class="content markdown-body">{@html renderMarkdown(message.content)}</div>
    {/if}
    <div class="meta">
      <span class="time">{formatDateTime(message.timestamp)}</span>
      {#if message.tokens > 0}
        <span class="tokens">{message.tokens} tokens</span>
      {/if}
      <button
        class="copy-btn"
        onclick={copyContent}
        aria-label="Copy message"
        type="button"
      >
        copy
      </button>
    </div>
  </div>
</div>

<style>
  .bubble-wrapper {
    display: flex;
    margin-bottom: var(--spacing-md);
  }

  .bubble-wrapper.user {
    justify-content: flex-end;
  }

  .bubble {
    max-width: 75%;
    padding: var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    font-size: 0.875rem;
    line-height: 1.6;
    word-break: break-word;
  }

  .user-bubble {
    background: rgba(0, 210, 106, 0.1);
    box-shadow: 2px 2px 0 rgba(0, 210, 106, 0.3);
  }

  .user-bubble .content {
    white-space: pre-wrap;
  }

  .assistant-bubble {
    background: rgba(78, 205, 196, 0.1);
    box-shadow: 2px 2px 0 rgba(78, 205, 196, 0.3);
  }

  .content {
    margin-bottom: var(--spacing-xs);
  }

  /* Markdown styles for assistant messages */
  .markdown-body :global(p) {
    margin: 0 0 0.5em;
  }

  .markdown-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-body :global(pre) {
    background: var(--bg-secondary);
    padding: var(--spacing-sm);
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8rem;
    margin: 0.5em 0;
    border: 1px solid var(--border-color);
  }

  .markdown-body :global(code) {
    font-family: 'Comic Mono', 'JetBrains Mono', monospace;
    font-size: 0.85em;
  }

  .markdown-body :global(:not(pre) > code) {
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  .markdown-body :global(li) {
    margin: 0.2em 0;
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4) {
    margin: 0.75em 0 0.25em;
    font-weight: 700;
  }

  .markdown-body :global(h1) { font-size: 1.2em; }
  .markdown-body :global(h2) { font-size: 1.1em; }
  .markdown-body :global(h3) { font-size: 1em; }

  .markdown-body :global(blockquote) {
    border-left: 3px solid var(--border-color);
    padding-left: var(--spacing-sm);
    margin: 0.5em 0;
    color: var(--text-secondary);
  }

  .markdown-body :global(table) {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 0.85em;
  }

  .markdown-body :global(th),
  .markdown-body :global(td) {
    border: 1px solid var(--border-color);
    padding: 4px 8px;
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 0.75em 0;
  }

  .meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.625rem;
    color: var(--text-muted);
    align-items: center;
  }

  .copy-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-comic);
    font-size: 0.625rem;
    cursor: pointer;
    padding: 0 2px;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .copy-btn:hover {
    color: var(--text-primary);
  }

  .copy-btn:focus-visible {
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
    opacity: 1;
  }

  .bubble:hover .copy-btn {
    opacity: 1;
  }
</style>
