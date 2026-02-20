<script lang="ts">
  import type { ClaudeTask } from '$lib/types';
  import TaskCard from './TaskCard.svelte';

  interface Props {
    pending: ClaudeTask[];
    inProgress: ClaudeTask[];
    completed: ClaudeTask[];
  }

  const { pending, inProgress, completed }: Props = $props();
</script>

<div class="kanban" aria-label="Task kanban board">
  <!-- PENDING -->
  <div class="column column-pending" aria-label="Pending tasks">
    <div class="column-header">
      <span class="header-icon" aria-hidden="true">⏳</span>
      <span class="header-title">PENDING</span>
      <span class="header-count">{pending.length}</span>
    </div>
    <div class="column-tasks">
      {#if pending.length === 0}
        <div class="empty-col">No pending tasks</div>
      {:else}
        {#each pending as task (task.id)}
          <TaskCard {task} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- IN PROGRESS -->
  <div class="column column-active" aria-label="In progress tasks">
    <div class="column-header header-active">
      <span class="header-icon" aria-hidden="true">⚡</span>
      <span class="header-title">IN PROGRESS</span>
      <span class="header-count count-active">{inProgress.length}</span>
    </div>
    <div class="column-tasks">
      {#if inProgress.length === 0}
        <div class="empty-col">Nothing running</div>
      {:else}
        {#each inProgress as task (task.id)}
          <TaskCard {task} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- DONE -->
  <div class="column column-done" aria-label="Completed tasks">
    <div class="column-header">
      <span class="header-icon" aria-hidden="true">✅</span>
      <span class="header-title">DONE</span>
      <span class="header-count count-done">{completed.length}</span>
    </div>
    <div class="column-tasks">
      {#if completed.length === 0}
        <div class="empty-col">Nothing done yet</div>
      {:else}
        {#each completed as task (task.id)}
          <TaskCard {task} />
        {/each}
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
</style>
