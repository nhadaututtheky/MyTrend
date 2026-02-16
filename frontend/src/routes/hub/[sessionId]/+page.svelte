<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import pb from '$lib/config/pocketbase';
  import { fetchSession, updateSession, fetchSessions } from '$lib/api/hub';
  import SessionList from '$lib/components/hub/SessionList.svelte';
  import MessageFeed from '$lib/components/hub/MessageFeed.svelte';
  import Composer from '$lib/components/hub/Composer.svelte';
  import TokenCounter from '$lib/components/hub/TokenCounter.svelte';
  import DeviceIndicator from '$lib/components/hub/DeviceIndicator.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/stores/toast';
  import type { HubSession, HubMessage } from '$lib/types';

  let sessionId = $state('');
  let session = $state<HubSession | null>(null);
  let sessions = $state<HubSession[]>([]);
  let messages = $state<HubMessage[]>([]);
  let streamingText = $state('');
  let isStreaming = $state(false);
  let isLoading = $state(true);
  let unsubscribe: (() => void) | undefined;

  interface SSEParsed {
    text: string;
    inputTokens: number;
    outputTokens: number;
  }

  function parseSSEChunk(chunk: string): SSEParsed {
    const result: SSEParsed = { text: '', inputTokens: 0, outputTokens: 0 };
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          text?: string;
          input_tokens?: number;
          output_tokens?: number;
        };
        if (parsed.type === 'content_block_delta' || parsed.text) {
          result.text += parsed.text ?? '';
        }
        if (parsed.input_tokens) result.inputTokens = parsed.input_tokens;
        if (parsed.output_tokens) result.outputTokens = parsed.output_tokens;
      } catch {
        // Skip non-JSON lines
      }
    }
    return result;
  }

  $effect(() => {
    const unsub = page.subscribe((p) => {
      sessionId = p.params['sessionId'] ?? '';
    });
    return unsub;
  });

  onMount(async () => {
    try {
      const [sess, sessList] = await Promise.all([
        fetchSession(sessionId),
        fetchSessions(),
      ]);
      session = sess;
      sessions = sessList.items;
      messages = sess?.messages ?? [];
    } catch (err: unknown) {
      console.error('[Hub/Session]', err);
      toast.error('Failed to load session');
    } finally {
      isLoading = false;
    }

    // Real-time sync for this session
    unsubscribe = await pb.collection('hub_sessions').subscribe(sessionId, (e) => {
      if (e.action === 'update') {
        const updated = e.record as unknown as HubSession;
        session = updated;
        messages = updated.messages ?? [];
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  async function handleSend(content: string): Promise<void> {
    if (!session) return;

    // Add user message
    const userMsg: HubMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      tokens: 0,
    };
    messages = [...messages, userMsg];
    isStreaming = true;
    streamingText = '';

    try {
      const response = await fetch('/api/hub/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          content,
          model: session.model,
          systemPrompt: session.system_prompt,
          history: messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        toast.error('Failed to get response from Claude');
        isStreaming = false;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const parsed = parseSSEChunk(chunk);
        fullText += parsed.text;
        streamingText = fullText;
        if (parsed.inputTokens > 0) inputTokens = parsed.inputTokens;
        if (parsed.outputTokens > 0) outputTokens = parsed.outputTokens;
      }

      // Add assistant message
      const assistantMsg: HubMessage = {
        role: 'assistant',
        content: fullText,
        timestamp: new Date().toISOString(),
        tokens: outputTokens,
      };
      messages = [...messages, assistantMsg];
      streamingText = '';

      // Save to PocketBase
      const estimatedCost =
        (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

      await updateSession(session.id, {
        messages,
        message_count: messages.length,
        total_input_tokens: (session.total_input_tokens ?? 0) + inputTokens,
        total_output_tokens: (session.total_output_tokens ?? 0) + outputTokens,
        estimated_cost: (session.estimated_cost ?? 0) + estimatedCost,
        last_message_at: new Date().toISOString(),
      });

      // Update local session state
      session = {
        ...session,
        message_count: messages.length,
        total_input_tokens: (session.total_input_tokens ?? 0) + inputTokens,
        total_output_tokens: (session.total_output_tokens ?? 0) + outputTokens,
        estimated_cost: (session.estimated_cost ?? 0) + estimatedCost,
      };
    } catch (err: unknown) {
      console.error('[Hub/Stream]', err);
      toast.error('Streaming error');
    } finally {
      isStreaming = false;
    }
  }

  function handleSelectSession(s: HubSession): void {
    goto(`/hub/${s.id}`);
  }
</script>

<svelte:head>
  <title>{session?.name ?? 'Session'} - Hub - MyTrend</title>
</svelte:head>

<div class="hub-sidebar">
  <SessionList {sessions} activeId={sessionId} onselect={handleSelectSession} />
</div>

<div class="hub-chat">
  {#if isLoading}
    <div class="loading">Loading session...</div>
  {:else if !session}
    <div class="not-found">Session not found</div>
  {:else}
    <div class="chat-header">
      <div class="chat-info">
        <h2 class="session-name">{session.name}</h2>
        <div class="session-meta">
          <ComicBadge color="blue" size="sm">{session.model}</ComicBadge>
          <DeviceIndicator devices={session.devices} />
        </div>
      </div>
    </div>

    <MessageFeed {messages} {streamingText} {isStreaming} />

    <TokenCounter
      inputTokens={session.total_input_tokens}
      outputTokens={session.total_output_tokens}
      estimatedCost={session.estimated_cost}
    />

    <Composer disabled={isStreaming} onsend={handleSend} />
  {/if}
</div>

<style>
  .hub-sidebar {
    width: 280px;
    border-right: var(--border-width) solid var(--border-color);
    background: var(--bg-card);
    overflow-y: auto;
    flex-shrink: 0;
  }

  .hub-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: var(--border-width) solid var(--border-color);
    background: var(--bg-card);
  }

  .chat-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .session-name {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
  }

  .session-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .loading, .not-found {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1rem;
  }

  @media (max-width: 768px) {
    .hub-sidebar {
      display: none;
    }
  }
</style>
