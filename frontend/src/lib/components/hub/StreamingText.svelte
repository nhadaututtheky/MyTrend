<script lang="ts">
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    text: string;
    isStreaming?: boolean;
  }

  const { text, isStreaming = false }: Props = $props();
</script>

<div class="streaming-text" data-testid="streaming-text">
  <div class="text-content markdown-body">{@html renderMarkdown(text)}</div>
  {#if isStreaming}
    <span class="cursor" aria-hidden="true">|</span>
  {/if}
</div>

<style>
  .streaming-text {
    font-size: 0.875rem;
    line-height: 1.6;
    word-break: break-word;
  }

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

  .cursor {
    display: inline-block;
    color: var(--accent-green);
    font-weight: 700;
    animation: blink 0.8s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }
</style>
