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
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/stores/toast';
  import { MODEL_PRICING } from '$lib/types';
  import type { HubSession, HubMessage } from '$lib/types';

  let session = $state<HubSession | null>(null);
  let sessions = $state<HubSession[]>([]);
  let messages = $state<HubMessage[]>([]);
  let streamingText = $state('');
  let isStreaming = $state(false);
  let isLoading = $state(true);
  let unsubscribe: (() => void) | undefined;
  let abortController: AbortController | null = null;

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
        const parsed = JSON.parse(data) as Record<string, unknown>;
        // Text: content_block_delta → delta.text
        if (parsed.type === 'content_block_delta') {
          const delta = parsed.delta as Record<string, unknown> | undefined;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            result.text += delta.text;
          }
        }
        // Input tokens: message_start → message.usage.input_tokens
        if (parsed.type === 'message_start') {
          const msg = parsed.message as Record<string, unknown> | undefined;
          const usage = msg?.usage as Record<string, unknown> | undefined;
          if (typeof usage?.input_tokens === 'number') {
            result.inputTokens = usage.input_tokens;
          }
        }
        // Output tokens: message_delta → usage.output_tokens
        if (parsed.type === 'message_delta') {
          const usage = parsed.usage as Record<string, unknown> | undefined;
          if (typeof usage?.output_tokens === 'number') {
            result.outputTokens = usage.output_tokens;
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    return result;
  }

  let sessionId = $derived($page.params['sessionId'] ?? '');

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

    try {
      unsubscribe = await pb.collection('hub_sessions').subscribe(sessionId, (e) => {
        if (e.action === 'update') {
          const updated = e.record as unknown as HubSession;
          session = updated;
          messages = updated.messages ?? [];
        }
      });
    } catch (err: unknown) {
      console.error('[Hub/Session] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => {
    unsubscribe?.();
    abortController?.abort();
  });

  async function handleSend(content: string): Promise<void> {
    if (!session) return;

    const userMsg: HubMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      tokens: 0,
    };
    messages = [...messages, userMsg];
    isStreaming = true;
    streamingText = '';

    abortController = new AbortController();

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
        signal: abortController.signal,
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

      const assistantMsg: HubMessage = {
        role: 'assistant',
        content: fullText,
        timestamp: new Date().toISOString(),
        tokens: outputTokens,
      };
      messages = [...messages, assistantMsg];
      streamingText = '';

      const pricing = MODEL_PRICING[session.model] ?? MODEL_PRICING['default'] ?? [3, 15];
      const [inputRate, outputRate] = pricing;
      const estimatedCost =
        (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;

      await updateSession(session.id, {
        messages,
        message_count: messages.length,
        total_input_tokens: (session.total_input_tokens ?? 0) + inputTokens,
        total_output_tokens: (session.total_output_tokens ?? 0) + outputTokens,
        estimated_cost: (session.estimated_cost ?? 0) + estimatedCost,
        last_message_at: new Date().toISOString(),
      });

      session = {
        ...session,
        message_count: messages.length,
        total_input_tokens: (session.total_input_tokens ?? 0) + inputTokens,
        total_output_tokens: (session.total_output_tokens ?? 0) + outputTokens,
        estimated_cost: (session.estimated_cost ?? 0) + estimatedCost,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — save partial response
        if (streamingText.trim()) {
          const partialMsg: HubMessage = {
            role: 'assistant',
            content: streamingText,
            timestamp: new Date().toISOString(),
            tokens: 0,
          };
          messages = [...messages, partialMsg];
          streamingText = '';
        }
        toast.info('Stopped');
      } else {
        console.error('[Hub/Stream]', err);
        toast.error('Streaming error');
      }
    } finally {
      isStreaming = false;
      abortController = null;
    }
  }

  function handleStop(): void {
    abortController?.abort();
  }

  function exportAsMarkdown(): void {
    if (!session) return;
    const md = messages
      .map((m) =>
        m.role === 'user' ? `## User\n${m.content}` : `## Assistant\n${m.content}`,
      )
      .join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name ?? 'hub-session'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyLastResponse(): void {
    const last = messages.findLast((m) => m.role === 'assistant');
    if (last) {
      navigator.clipboard.writeText(last.content);
      toast.success('Copied!');
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
    <div class="loading-state">
      <ComicSkeleton variant="text" />
      <ComicSkeleton variant="card" height="60px" />
      <ComicSkeleton variant="card" height="60px" />
      <ComicSkeleton variant="card" height="60px" />
    </div>
  {:else if !session}
    <div class="not-found">Session not found</div>
  {:else}
    <div class="chat-header">
      <div class="chat-info">
        <h2 class="session-name">{session.name}</h2>
        <div class="session-meta">
          <ComicBadge color="blue" size="sm">{session.model}</ComicBadge>
          <DeviceIndicator devices={session.devices} />
          {#if isStreaming}
            <span class="streaming-indicator">streaming...</span>
          {/if}
        </div>
      </div>
      <div class="chat-actions">
        <ComicButton variant="outline" size="sm" onclick={copyLastResponse}>
          Copy Last
        </ComicButton>
        <ComicButton variant="outline" size="sm" onclick={exportAsMarkdown}>
          Export .md
        </ComicButton>
      </div>
    </div>

    <MessageFeed {messages} {streamingText} {isStreaming} />

    <TokenCounter
      inputTokens={session.total_input_tokens}
      outputTokens={session.total_output_tokens}
      estimatedCost={session.estimated_cost}
    />

    <Composer disabled={isStreaming} onsend={handleSend} onstop={handleStop} />
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

  .chat-actions {
    display: flex;
    gap: var(--spacing-xs);
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

  .streaming-indicator {
    font-size: 0.7rem;
    color: var(--accent-purple);
    animation: neonPulse 1s ease-in-out infinite;
  }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
  }

  .not-found {
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

    .chat-actions {
      flex-direction: column;
    }
  }
</style>
