<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchConversation } from '$lib/api/conversations';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import RelatedContent from '$lib/components/comic/RelatedContent.svelte';
  import { buildRelatedQuery } from '$lib/api/related';
  import { sendContentToTelegram } from '$lib/api/telegram';
  import { formatDateTime, formatDuration } from '$lib/utils/date';
  import type { Conversation } from '$lib/types';

  let convId = $derived($page.params['id'] ?? '');
  let conversation = $state<Conversation | null>(null);
  let isLoading = $state(true);
  let isSendingToTg = $state(false);

  async function handleSendToTelegram() {
    if (!conversation || isSendingToTg) return;
    isSendingToTg = true;
    try {
      await sendContentToTelegram(
        'conversation',
        conversation.title,
        conversation.summary ?? '',
        `/conversations/${convId}`,
      );
    } catch {
      // Non-critical
    } finally {
      isSendingToTg = false;
    }
  }

  function buildDiscussPrompt(conv: Conversation): string {
    const parts = [`[Conversation: ${conv.title}]`];
    if (conv.summary) parts.push(conv.summary.slice(0, 300));
    return encodeURIComponent(parts.join('\n'));
  }

  onMount(async () => {
    try {
      conversation = await fetchConversation(convId);
    } catch (err: unknown) {
      console.error('[Conversation]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head><title>{conversation?.title ?? 'Conversation'} - MyTrend</title></svelte:head>

<div class="conv-page">
  {#if isLoading}
    <p class="loading">Loading...</p>
  {:else if !conversation}
    <ComicCard><h2>Conversation not found</h2></ComicCard>
  {:else}
    <div class="conv-header">
      <h1>{conversation.title}</h1>
      <div class="meta">
        <ComicBadge color="blue">{conversation.source}</ComicBadge>
        <span>{formatDateTime(conversation.started_at)}</span>
        {#if conversation.duration_min}<span>{formatDuration(conversation.duration_min)}</span>{/if}
        {#if conversation.device_name}<span>{conversation.device_name}</span>{/if}
        <span>{conversation.total_tokens.toLocaleString()} tokens</span>
      </div>
      <div class="header-actions">
        <a
          href="/vibe?prompt={buildDiscussPrompt(conversation)}&tab=terminal"
          class="action-btn discuss-btn"
          aria-label="Discuss this conversation with Claude">💬 Discuss</a
        >
        <button
          class="action-btn tg-btn"
          onclick={handleSendToTelegram}
          disabled={isSendingToTg}
          aria-label="Send to Telegram">{isSendingToTg ? '...' : '✈️ Telegram'}</button
        >
      </div>
    </div>

    {#if conversation.summary}
      <ComicCard>
        <h3 class="section-title">Summary</h3>
        <p class="summary">{conversation.summary}</p>
      </ComicCard>
    {/if}

    {#if conversation.tags.length > 0 || conversation.topics.length > 0}
      <div class="tags-row">
        {#each conversation.topics as topic (topic)}<ComicBadge color="purple" size="sm"
            >{topic}</ComicBadge
          >{/each}
        {#each conversation.tags as tag (tag)}<ComicBadge color="blue" size="sm">{tag}</ComicBadge
          >{/each}
      </div>
    {/if}

    <div class="messages">
      {#each conversation.messages as msg, i (i)}
        <div
          class="message"
          class:user={msg.role === 'user'}
          class:assistant={msg.role === 'assistant'}
        >
          <div class="msg-role">{msg.role}</div>
          <div class="msg-content">{msg.content}</div>
        </div>
      {/each}
    </div>

    <RelatedContent
      collection="conversations"
      id={convId}
      query={buildRelatedQuery([conversation.title, conversation.summary])}
    />
  {/if}
</div>

<style>
  .conv-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }
  .conv-header h1 {
    margin: 0 0 var(--spacing-xs);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    margin-top: var(--spacing-sm);
  }
  .action-btn {
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 4px;
    border: 2px solid var(--border-color);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: none;
    transition: all 150ms ease;
    box-shadow: 2px 2px 0 var(--border-color);
    white-space: nowrap;
    min-height: 30px;
    display: inline-flex;
    align-items: center;
  }
  .action-btn:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 var(--border-color);
    color: var(--text-primary);
  }
  .action-btn:active:not(:disabled) {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 var(--border-color);
  }
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .discuss-btn {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    box-shadow: 2px 2px 0 var(--accent-blue);
  }
  .discuss-btn:hover {
    background: rgba(78, 205, 196, 0.08);
    box-shadow: 3px 3px 0 var(--accent-blue) !important;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    font-size: 0.8rem;
    color: var(--text-muted);
    align-items: center;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-sm);
  }
  .summary {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }
  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .messages {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  .message {
    padding: var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .message.user {
    background: rgba(0, 210, 106, 0.08);
    margin-left: 10%;
  }
  .message.assistant {
    background: rgba(78, 205, 196, 0.08);
    margin-right: 10%;
  }
  .msg-role {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .loading {
    text-align: center;
    color: var(--text-muted);
    padding: var(--spacing-2xl);
  }
</style>
