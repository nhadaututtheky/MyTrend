<script lang="ts">
  import type { ClaudeTask } from '$lib/types';
  import TaskCard from './TaskCard.svelte';
  import { Clock, Zap, CheckCircle, ChevronDown, ChevronUp } from 'lucide-svelte';

  interface Props {
    pending: ClaudeTask[];
    inProgress: ClaudeTask[];
    completed: ClaudeTask[];
  }

  const { pending, inProgress, completed }: Props = $props();

  let doneExpanded = $state(false);

  const COMPACT_THRESHOLD = 5;
  const visibleDone = $derived(
    doneExpanded ? completed : completed.slice(0, 3),
  );
</script>

<div class="kanban" aria-label="Task kanban board">
  <!-- PENDING -->
  <div class="column column-pending" aria-label="Pending tasks">
    <div class="column-header">
      <span class="header-icon" aria-hidden="true"><Clock size={14} /></span>
      <span class="header-title">PENDING</span>
      <span class="header-count">{pending.length}</span>
    </div>
    <div class="column-tasks" class:compact={pending.length > COMPACT_THRESHOLD}>
      {#if pending.length === 0}
        <div class="empty-col">No pending tasks</div>
      {:else}
        {#each pending as task (task.id)}
          <TaskCard {task} compact={pending.length > COMPACT_THRESHOLD} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- IN PROGRESS -->
  <div class="column column-active" aria-label="In progress tasks">
    <div class="column-header header-active">
      <span class="header-icon" aria-hidden="true"><Zap size={14} /></span>
      <span class="header-title">IN PROGRESS</span>
      <span class="header-count count-active">{inProgress.length}</span>
    </div>
    <div class="column-tasks" class:compact={inProgress.length > COMPACT_THRESHOLD}>
      {#if inProgress.length === 0}
        <div class="empty-col">Nothing running</div>
      {:else}
        {#each inProgress as task (task.id)}
          <TaskCard {task} compact={inProgress.length > COMPACT_THRESHOLD} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- DONE (collapsed by default when many items) -->
  <div class="column column-done" aria-label="Completed tasks">
    <button
      class="column-header column-header-btn"
      onclick={() => { doneExpanded = !doneExpanded; }}
    >
      <span class="header-icon" aria-hidden="true"><CheckCircle size={14} /></span>
      <span class="header-title">DONE</span>
      <span class="header-count count-done">{completed.length}</span>
      {#if completed.length > 3}
        <span class="expand-icon">
          {#if doneExpanded}
            <ChevronUp size={14} />
          {:else}
            <ChevronDown size={14} />
          {/if}
        </span>
      {/if}
    </button>
    <div class="column-tasks compact">
      {#if completed.length === 0}
        <div class="empty-col">Nothing done yet</div>
      {:else}
        {#each visibleDone as task (task.id)}
          <TaskCard {task} compact />
        {/each}
        {#if !doneExpanded && completed.length > 3}
          <button class="show-more-btn" onclick={() => { doneExpanded = true; }}>
            +{completed.length - 3} more completed
          </button>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .kanban {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-md);
    height: 100%;
    min-height: 0;
  }

  @media (max-width: 768px) {
    .kanban {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
    }
  }

  .column {
    display: flex;
    flex-direction: column;
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    overflow: hidden;
    min-height: 0;
  }

  .column-pending { border-color: var(--accent-yellow); }
  .column-active { border-color: var(--accent-orange); }
  .column-done { border-color: var(--accent-green); }

  .column-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 2px solid var(--border-color);
    background: var(--bg-elevated);
  }

  .column-pending .column-header { border-bottom-color: var(--accent-yellow); background: rgba(255, 230, 109, 0.08); }
  .column-active .column-header { border-bottom-color: var(--accent-orange); background: rgba(255, 159, 67, 0.08); }
  .column-done .column-header { border-bottom-color: var(--accent-green); background: rgba(0, 210, 106, 0.08); }

  .header-active {
    animation: headerPulse 2.5s ease-in-out infinite;
  }

  @keyframes headerPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.75; }
  }

  .header-icon {
    font-size: 16px;
  }

  .header-title {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex: 1;
    color: var(--text-primary);
  }

  .header-count {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
  }

  .count-active {
    background: rgba(255, 159, 67, 0.15);
    border-color: var(--accent-orange);
    color: var(--accent-orange);
  }

  .count-done {
    background: rgba(0, 210, 106, 0.15);
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  .column-tasks {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .empty-col {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-xl) var(--spacing-md);
    opacity: 0.6;
  }

  .column-header-btn {
    cursor: pointer;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 2px solid var(--border-color);
  }

  .column-done .column-header-btn {
    border-bottom-color: var(--accent-green);
    background: rgba(0, 210, 106, 0.08);
  }

  .expand-icon {
    margin-left: auto;
    color: var(--text-muted);
    display: flex;
    align-items: center;
  }

  .column-tasks.compact {
    gap: 4px;
  }

  .show-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: var(--spacing-sm);
    background: none;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--accent-blue);
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }

  .show-more-btn:hover {
    color: var(--accent-green);
    border-color: var(--accent-green);
  }
</style>
