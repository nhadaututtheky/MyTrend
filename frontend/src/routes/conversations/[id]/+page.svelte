<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchConversation } from '$lib/api/conversations';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import RelatedContent from '$lib/components/comic/RelatedContent.svelte';
  import { buildRelatedQuery } from '$lib/api/related';
  import { formatDateTime, formatDuration } from '$lib/utils/date';
  import type { Conversation } from '$lib/types';

  let convId = $derived($page.params['id'] ?? '');
  let conversation = $state<Conversation | null>(null);
  let isLoading = $state(true);

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
