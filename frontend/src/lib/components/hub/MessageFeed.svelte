<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { HubMessage } from '$lib/types';
  import MessageBubble from './MessageBubble.svelte';
  import StreamingText from './StreamingText.svelte';

  interface Props {
    messages: HubMessage[];
    streamingText?: string;
    isStreaming?: boolean;
  }

  const { messages, streamingText = '', isStreaming = false }: Props = $props();

  let feedEl: HTMLDivElement;

  async function scrollToBottom(): Promise<void> {
    await tick();
    if (feedEl) {
      feedEl.scrollTop = feedEl.scrollHeight;
    }
  }

  $effect(() => {
    // Scroll when messages change or streaming text updates
    void messages.length;
    void streamingText;
    scrollToBottom();
  });

  onMount(() => {
    scrollToBottom();
  });
</script>

<div class="feed" bind:this={feedEl} data-testid="message-feed">
  {#if messages.length === 0 && !isStreaming}
    <div class="empty">
      <p class="empty-title">Start a conversation</p>
      <p class="empty-hint">Type a message below to chat with Claude</p>
    </div>
  {:else}
    {#each messages as message, i (message.timestamp + '-' + i)}
      <MessageBubble {message} />
    {/each}

    {#if isStreaming && streamingText}
      <div class="streaming-bubble">
        <StreamingText text={streamingText} {isStreaming} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .feed {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
  }

  .empty-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .empty-hint {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .streaming-bubble {
    max-width: 75%;
    padding: var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: rgba(78, 205, 196, 0.1);
    box-shadow: 2px 2px 0 rgba(78, 205, 196, 0.3);
    margin-bottom: var(--spacing-md);
  }
</style>
