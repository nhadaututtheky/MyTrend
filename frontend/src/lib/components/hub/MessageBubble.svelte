<script lang="ts">
  import type { HubMessage } from '$lib/types';
  import { formatDateTime } from '$lib/utils/date';

  interface Props {
    message: HubMessage;
  }

  let { message }: Props = $props();

  let isUser = $derived(message.role === 'user');
</script>

<div class="bubble-wrapper" class:user={isUser} data-testid="message-bubble">
  <div class="bubble" class:user-bubble={isUser} class:assistant-bubble={!isUser}>
    <div class="content">
      {@html message.content.replace(/\n/g, '<br>')}
    </div>
    <div class="meta">
      <span class="time">{formatDateTime(message.timestamp)}</span>
      {#if message.tokens > 0}
        <span class="tokens">{message.tokens} tokens</span>
      {/if}
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

  .assistant-bubble {
    background: rgba(78, 205, 196, 0.1);
    box-shadow: 2px 2px 0 rgba(78, 205, 196, 0.3);
  }

  .content {
    margin-bottom: var(--spacing-xs);
  }

  .content :global(pre) {
    background: var(--bg-secondary);
    padding: var(--spacing-sm);
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.8rem;
  }

  .content :global(code) {
    font-family: var(--font-comic);
    font-size: 0.85em;
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.625rem;
    color: var(--text-muted);
  }
</style>
