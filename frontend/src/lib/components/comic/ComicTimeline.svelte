<script lang="ts">
  import type { Snippet } from 'svelte';

  type NodeColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple';

  interface TimelineNode {
    id: string;
    label: string;
    sublabel?: string;
    timestamp: string;
    color: NodeColor;
    active?: boolean;
    note?: string;
    href?: string;
  }

  interface Props {
    nodes: TimelineNode[];
    children?: Snippet;
  }

  const { nodes }: Props = $props();
</script>

<div class="timeline" data-testid="comic-timeline">
  {#each nodes as node, i (node.id)}
    <div class="timeline-item" class:active={node.active}>
      <div class="timeline-line">
        <div class="timeline-dot dot-{node.color}" class:active={node.active}></div>
        {#if i < nodes.length - 1}
          <div class="timeline-connector"></div>
        {/if}
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-label label-{node.color}">{node.label}</span>
          <span class="timeline-time">{node.timestamp}</span>
        </div>
        {#if node.sublabel}
          <p class="timeline-sublabel">{node.sublabel}</p>
        {/if}
        {#if node.note}
          <p class="timeline-note">{node.note}</p>
        {/if}
        {#if node.href}
          <a href={node.href} class="timeline-link">View conversation</a>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    position: relative;
    padding: var(--spacing-xs) 0;
  }

  .timeline-item {
    display: flex;
    gap: var(--spacing-md);
    position: relative;
    min-height: 60px;
  }

  .timeline-line {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 20px;
    flex-shrink: 0;
  }

  .timeline-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: var(--border-width) solid var(--border-color);
    flex-shrink: 0;
    z-index: 1;
    transition: all var(--transition-sketch);
  }

  .timeline-dot.active {
    width: 18px;
    height: 18px;
    border-width: 3px;
  }

  .dot-green {
    background: var(--accent-green);
    border-color: var(--accent-green);
  }
  .dot-blue {
    background: var(--accent-blue);
    border-color: var(--accent-blue);
  }
  .dot-yellow {
    background: var(--accent-yellow);
    border-color: var(--accent-yellow);
  }
  .dot-orange {
    background: var(--accent-orange);
    border-color: var(--accent-orange);
  }
  .dot-red {
    background: var(--accent-red);
    border-color: var(--accent-red);
  }
  .dot-purple {
    background: var(--accent-purple);
    border-color: var(--accent-purple);
  }

  :global([data-theme='dark']) .timeline-dot.active {
    box-shadow: 0 0 8px currentColor;
  }
  :global([data-theme='dark']) .dot-green.active {
    box-shadow: 0 0 10px var(--accent-green);
  }
  :global([data-theme='dark']) .dot-blue.active {
    box-shadow: 0 0 10px var(--accent-blue);
  }
  :global([data-theme='dark']) .dot-yellow.active {
    box-shadow: 0 0 10px var(--accent-yellow);
  }
  :global([data-theme='dark']) .dot-orange.active {
    box-shadow: 0 0 10px var(--accent-orange);
  }
  :global([data-theme='dark']) .dot-red.active {
    box-shadow: 0 0 10px var(--accent-red);
  }
  :global([data-theme='dark']) .dot-purple.active {
    box-shadow: 0 0 10px var(--accent-purple);
  }

  .timeline-connector {
    width: 2px;
    flex-grow: 1;
    min-height: 24px;
    border-left: 2px dashed var(--border-color);
    opacity: 0.5;
  }

  .timeline-content {
    flex: 1;
    padding-bottom: var(--spacing-md);
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .timeline-label {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    padding: 1px 8px;
    border-radius: var(--radius-sketch);
  }

  .label-green {
    background: var(--accent-green);
    color: #1a1a1a;
  }
  .label-blue {
    background: var(--accent-blue);
    color: #1a1a1a;
  }
  .label-yellow {
    background: var(--accent-yellow);
    color: #1a1a1a;
  }
  .label-orange {
    background: var(--accent-orange);
    color: #1a1a1a;
  }
  .label-red {
    background: var(--accent-red);
    color: #ffffff;
  }
  .label-purple {
    background: var(--accent-purple);
    color: #1a1a1a;
  }

  .timeline-time {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .timeline-sublabel {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 2px 0 0;
  }

  .timeline-note {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: var(--spacing-xs) 0 0;
    font-style: italic;
  }

  .timeline-link {
    font-size: var(--font-size-xs);
    color: var(--accent-blue);
    text-decoration: underline;
    cursor: pointer;
  }

  .active .timeline-content {
    font-weight: 600;
  }
</style>
