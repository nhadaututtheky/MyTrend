<script lang="ts">
  import type { ContentBlock } from '$lib/api/companion';

  interface Props {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
    model?: string;
    timestamp?: number;
    toolName?: string;
  }

  let { role, content, model, timestamp, toolName }: Props = $props();

  const time = $derived(
    timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  );

  function extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
      .join('\n');
  }

  function extractToolUses(blocks: ContentBlock[]): ContentBlock[] {
    return blocks.filter((b) => b.type === 'tool_use');
  }

  const textContent = $derived(
    typeof content === 'string' ? content : extractText(content)
  );

  const toolUses = $derived(
    typeof content === 'string' ? [] : extractToolUses(content)
  );
</script>

{#if textContent || toolUses.length > 0}
<div class="msg msg-{role}" class:has-tools={toolUses.length > 0}>
  <div class="msg-header">
    <span class="msg-role">{role === 'user' ? 'You' : model ?? 'Claude'}</span>
    {#if toolName}
      <span class="msg-tool">{toolName}</span>
    {/if}
    {#if time}
      <span class="msg-time">{time}</span>
    {/if}
  </div>

  {#if textContent}
    <div class="msg-body">{textContent}</div>
  {/if}

  {#if toolUses.length > 0}
    <div class="tool-uses">
      {#each toolUses as tool (tool.id)}
        <div class="tool-card">
          <span class="tool-name">{tool.name}</span>
          {#if tool.input}
            <pre class="tool-input">{JSON.stringify(tool.input, null, 2).slice(0, 500)}</pre>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
{/if}

<style>
  .msg {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-xs);
    border: 1px solid var(--border-color);
  }

  .msg-user {
    background: rgba(78, 205, 196, 0.08);
    border-color: rgba(78, 205, 196, 0.3);
    margin-left: var(--spacing-xl);
  }

  .msg-assistant {
    background: var(--bg-elevated);
    margin-right: var(--spacing-md);
  }

  .msg-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: 4px;
  }

  .msg-role {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .msg-user .msg-role {
    color: var(--accent-blue);
  }

  .msg-tool {
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    padding: 1px 6px;
    background: rgba(162, 155, 254, 0.15);
    color: var(--accent-purple);
    border-radius: 3px;
  }

  .msg-time {
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .msg-body {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tool-uses {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: var(--spacing-xs);
  }

  .tool-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .tool-name {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--accent-purple);
  }

  .tool-input {
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    margin: 4px 0 0;
    overflow: hidden;
    max-height: 120px;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
