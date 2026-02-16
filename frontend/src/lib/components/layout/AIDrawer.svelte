<script lang="ts">
  import { page } from '$app/stores';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(false), onclose }: Props = $props();

  let inputValue = $state('');
  let messages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  let isStreaming = $state(false);
  let currentPath = $state('/');

  $effect(() => {
    const unsub = page.subscribe((p) => {
      currentPath = p.url.pathname;
    });
    return unsub;
  });

  const quickPrompts = [
    { label: 'Summarize today', prompt: 'Summarize my activity today' },
    { label: 'Find ideas', prompt: 'Find related ideas for my current project' },
    { label: 'Suggest next', prompt: 'What should I work on next?' },
  ];

  function handleClose(): void {
    open = false;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') handleClose();
  }

  async function sendMessage(content: string): Promise<void> {
    if (!content.trim() || isStreaming) return;
    messages = [...messages, { role: 'user', content: content.trim() }];
    inputValue = '';
    isStreaming = true;

    try {
      const response = await fetch('/api/hub/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[Context: User is on page ${currentPath}]\n${content.trim()}`,
          model: 'claude-sonnet-4-5-20250929',
          history: messages.slice(-10),
        }),
      });

      if (!response.ok || !response.body) {
        messages = [...messages, { role: 'assistant', content: 'Sorry, unable to connect.' }];
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      messages = [...messages, { role: 'assistant', content: '' }];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMsg = parseSSEChunk(chunk, assistantMsg);
        messages = [...messages.slice(0, -1), { role: 'assistant', content: assistantMsg }];
      }
    } catch {
      messages = [...messages, { role: 'assistant', content: 'Connection error.' }];
    } finally {
      isStreaming = false;
    }
  }

  function parseSSEChunk(chunk: string, current: string): string {
    let result = current;
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content_block_delta' && data.delta?.text) {
          result += data.delta.text as string;
        }
      } catch { /* skip */ }
    }
    return result;
  }

  function handleSubmit(): void {
    sendMessage(inputValue);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="drawer-overlay" onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }} onkeydown={handleKeydown} role="dialog" aria-modal="true" aria-label="AI Assistant">
    <aside class="drawer">
      <div class="drawer-header">
        <h3 class="drawer-title">⚡ AI Assistant</h3>
        <button class="close-btn" onclick={handleClose} aria-label="Close drawer">✕</button>
      </div>

      <div class="drawer-body">
        {#if messages.length === 0}
          <div class="welcome">
            <p class="welcome-text">Ask me anything about your MyTrend data.</p>
            <div class="quick-prompts">
              {#each quickPrompts as qp}
                <button class="quick-btn" onclick={() => sendMessage(qp.prompt)}>
                  {qp.label}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="messages">
            {#each messages as msg}
              <div class="msg msg-{msg.role}">
                <span class="msg-role">{msg.role === 'user' ? '🧑' : '⚡'}</span>
                <div class="msg-content">{msg.content}{#if msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1]}<span class="cursor">▊</span>{/if}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="drawer-footer">
        <form class="input-row" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <input
            class="drawer-input"
            type="text"
            placeholder="Ask something..."
            bind:value={inputValue}
            disabled={isStreaming}
          />
          <ComicButton variant="primary" size="sm" type="submit" loading={isStreaming} disabled={!inputValue.trim()}>
            Send
          </ComicButton>
        </form>
      </div>
    </aside>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 200;
    animation: fadeIn 0.15s ease;
  }

  .drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 400px;
    max-width: 90vw;
    background: var(--bg-card);
    border-left: var(--border-width) solid var(--border-color);
    display: flex;
    flex-direction: column;
    animation: slideRight 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.15);
  }

  @keyframes slideRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: var(--border-width) solid var(--border-color);
    flex-shrink: 0;
  }

  .drawer-title {
    font-family: var(--font-comic);
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
  }

  :global([data-theme='dark']) .drawer-title {
    color: var(--accent-purple);
    text-shadow: 0 0 8px rgba(162, 155, 254, 0.3);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 1.1rem;
    padding: 4px;
  }

  .close-btn:hover {
    color: var(--accent-red);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  /* Welcome */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-lg);
    text-align: center;
  }

  .welcome-text {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .quick-prompts {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    width: 100%;
  }

  .quick-btn {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-secondary);
    border: 1.5px dashed var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-primary);
    text-align: left;
    transition: background var(--transition-fast);
  }

  .quick-btn:hover {
    background: var(--bg-primary);
    border-style: solid;
  }

  /* Messages */
  .messages {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .msg {
    display: flex;
    gap: var(--spacing-sm);
    animation: sketchFadeIn 0.2s ease forwards;
  }

  .msg-role {
    flex-shrink: 0;
    font-size: 1rem;
  }

  .msg-content {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .msg-user .msg-content {
    background: var(--accent-green);
    color: #1a1a1a;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .msg-assistant .msg-content {
    background: var(--bg-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .cursor {
    animation: neonPulse 0.8s ease-in-out infinite;
    color: var(--accent-purple);
  }

  /* Footer */
  .drawer-footer {
    border-top: var(--border-width) solid var(--border-color);
    padding: var(--spacing-sm) var(--spacing-md);
    flex-shrink: 0;
  }

  .input-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .drawer-input {
    flex: 1;
    font-family: var(--font-comic);
    font-size: 0.85rem;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .drawer-input:focus {
    border-color: var(--accent-purple);
  }

  .drawer-input:disabled {
    opacity: 0.5;
  }
</style>
