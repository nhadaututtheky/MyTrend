<script lang="ts">
  interface Props {
    content: string;
    maxHeight?: string;
    collapsible?: boolean;
  }

  const { content, maxHeight, collapsible = false }: Props = $props();
  let collapsed = $state(collapsible);

  /**
   * Lightweight markdown to HTML (no external dependency).
   * Handles: headings, bold, italic, code blocks, inline code, lists, links, paragraphs.
   */
  function parseMarkdown(md: string): string {
    if (!md) return '';
    let html = md
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Code blocks (``` ... ```)
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Headers
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold + Italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr>')
      // Unordered lists
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // Ordered lists
      .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>')
      // Line breaks
      .replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = '<p>' + html + '</p>';
    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>');
    // Remove <p> wrapping block elements
    html = html.replace(/<p>(<h[1-4]>)/g, '$1');
    html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)<\/p>/g, '$1');

    return html;
  }

  const html = $derived(parseMarkdown(content));
</script>

{#if collapsible}
  <button class="collapse-toggle" onclick={() => collapsed = !collapsed}>
    {collapsed ? '+ Show content' : '- Hide content'}
  </button>
{/if}

{#if !collapsed}
  <div class="comic-markdown" style:max-height={maxHeight} style:overflow={maxHeight ? 'auto' : undefined}>
    {@html html}
  </div>
{/if}

<style>
  .comic-markdown {
    font-size: var(--font-size-md);
    line-height: 1.6;
    color: var(--text-primary);
    word-wrap: break-word;
  }

  .comic-markdown :global(h1),
  .comic-markdown :global(h2),
  .comic-markdown :global(h3),
  .comic-markdown :global(h4) {
    font-family: var(--font-comic);
    font-weight: 700;
    margin: var(--spacing-md) 0 var(--spacing-xs);
    color: var(--text-primary);
  }

  .comic-markdown :global(h1) { font-size: var(--font-size-2xl); }
  .comic-markdown :global(h2) { font-size: var(--font-size-xl); }
  .comic-markdown :global(h3) { font-size: var(--font-size-lg); }
  .comic-markdown :global(h4) { font-size: var(--font-size-md); }

  .comic-markdown :global(p) {
    margin: 0 0 var(--spacing-sm);
  }

  .comic-markdown :global(strong) {
    font-weight: 700;
  }

  .comic-markdown :global(code) {
    font-family: var(--font-comic);
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .comic-markdown :global(pre) {
    background: var(--bg-secondary);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    overflow-x: auto;
    margin: var(--spacing-sm) 0;
  }

  .comic-markdown :global(pre code) {
    background: none;
    padding: 0;
    font-size: var(--font-size-sm);
  }

  .comic-markdown :global(ul) {
    padding-left: var(--spacing-lg);
    margin: var(--spacing-xs) 0;
  }

  .comic-markdown :global(li) {
    margin: 2px 0;
  }

  .comic-markdown :global(a) {
    color: var(--accent-blue);
    text-decoration: underline;
  }

  .comic-markdown :global(hr) {
    border: none;
    border-top: 2px dashed var(--border-color);
    margin: var(--spacing-md) 0;
  }

  .collapse-toggle {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--accent-blue);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs) 0;
    text-transform: uppercase;
  }

  .collapse-toggle:hover {
    text-decoration: underline;
  }
</style>
