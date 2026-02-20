<script lang="ts">
  import type { ClaudeTask } from '$lib/types';
  import ComicBadge from './ComicBadge.svelte';

  interface Props {
    tasks: ClaudeTask[];
    completedCount?: number;
  }

  const { tasks, completedCount = 0 }: Props = $props();

  const pendingTasks = $derived(tasks.filter((t) => t.status === 'pending'));
  const inProgressTasks = $derived(tasks.filter((t) => t.status === 'in_progress'));
  const completedTasks = $derived(tasks.filter((t) => t.status === 'completed'));

  const columns = $derived([
    { id: 'pending', label: 'Pending', color: 'yellow' as const, icon: '⏳', items: pendingTasks },
    { id: 'in_progress', label: 'In Progress', color: 'blue' as const, icon: '🔄', items: inProgressTasks },
    { id: 'completed', label: 'Done', color: 'green' as const, icon: '✅', items: completedTasks, extraCount: completedCount },
  ]);
</script>

<div class="kanban" data-testid="comic-kanban">
  {#each columns as col (col.id)}
    <div class="kanban-col">
      <div class="col-header">
        <span class="col-icon">{col.icon}</span>
        <span class="col-title">{col.label}</span>
        <ComicBadge color={col.color} size="sm">
          {col.items.length}{#if col.extraCount && col.extraCount > col.items.length}+{col.extraCount - col.items.length}{/if}
        </ComicBadge>
      </div>
      <div class="col-body">
        {#if col.extraCount && col.extraCount > col.items.length}
          <div class="ghost-card">
            <span class="ghost-count">{col.extraCount - col.items.length} completed tasks cleaned up</span>
          </div>
        {/if}
        {#each col.items as task (task.id)}
          <div class="task-card sketch-border" class:active={task.status === 'in_progress'}>
            <div class="task-subject">{task.subject}</div>
            {#if task.description}
              <div class="task-desc">{task.description.length > 120 ? task.description.slice(0, 117) + '...' : task.description}</div>
            {/if}
            {#if task.status === 'in_progress' && task.activeForm}
              <div class="task-active">
                <span class="active-dot"></span>
                {task.activeForm}
              </div>
            {/if}
            {#if task.blockedBy.length > 0}
              <div class="task-blocked">
                <ComicBadge color="red" size="sm">Blocked by #{task.blockedBy.join(', #')}</ComicBadge>
              </div>
            {/if}
            <span class="task-id">#{task.id}</span>
          </div>
        {:else}
          {#if !col.extraCount || col.extraCount === 0}
            <div class="empty-col">No tasks</div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .kanban {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-md);
    min-height: 300px;
  }

  .kanban-col {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .col-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm);
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.85rem;
    border-bottom: 2px solid var(--border-color);
  }

  .col-icon { font-size: 1rem; }
  .col-title { flex: 1; }

  .col-body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
    min-height: 100px;
    padding: var(--spacing-xs);
  }

  .task-card {
    padding: var(--spacing-sm);
    background: var(--bg-card);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    position: relative;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    cursor: default;
  }

  .task-card:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .task-card.active {
    border-color: var(--accent-blue);
    box-shadow: 0 0 8px rgba(78, 205, 196, 0.15);
  }

  .task-subject {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.8rem;
    margin-bottom: 4px;
    padding-right: 28px;
  }

  .task-desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 4px;
  }

  .task-active {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.65rem;
    color: var(--accent-blue);
    font-family: var(--font-comic);
    font-weight: 700;
    margin-top: 4px;
  }

  .active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-blue);
    animation: pulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }

  .task-blocked { margin-top: 4px; }

  .task-id {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    color: var(--text-muted);
    font-weight: 700;
  }

  .ghost-card {
    padding: var(--spacing-sm);
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-sketch);
    text-align: center;
  }

  .ghost-count {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .empty-col {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-lg) var(--spacing-sm);
    font-style: italic;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @media (max-width: 768px) {
    .kanban { grid-template-columns: 1fr; }
  }
</style>
