<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchTaskSessions, fetchTodoLists } from '$lib/api/tasks';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicProgress from '$lib/components/comic/ComicProgress.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { ClaudeTaskSession, ClaudeTodoList } from '$lib/types';

  type ProgressColor = 'green' | 'blue' | 'yellow';

  function getProgressColor(session: ClaudeTaskSession): ProgressColor {
    if (session.inProgress > 0) return 'blue';
    if (session.completed === session.total) return 'green';
    return 'yellow';
  }

  let sessions = $state<ClaudeTaskSession[]>([]);
  let todoLists = $state<ClaudeTodoList[]>([]);
  let isLoading = $state(true);

  const totalTasks = $derived(sessions.reduce((s, sess) => s + sess.total, 0));
  const totalCompleted = $derived(sessions.reduce((s, sess) => s + sess.completed, 0));
  const totalInProgress = $derived(sessions.reduce((s, sess) => s + sess.inProgress, 0));

  const activeTodos = $derived(
    todoLists
      .filter((tl) => tl.todos.some((t) => t.status === 'in_progress'))
      .sort((a, b) => {
        const aActive = a.todos.filter((t) => t.status === 'in_progress').length;
        const bActive = b.todos.filter((t) => t.status === 'in_progress').length;
        return bActive - aActive;
      }),
  );

  onMount(async () => {
    try {
      const [sessResult, todoResult] = await Promise.all([
        fetchTaskSessions(),
        fetchTodoLists(),
      ]);
      sessions = sessResult;
      todoLists = todoResult;
    } catch (err: unknown) {
      console.error('[Tasks]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Claude Tasks - MyTrend</title>
</svelte:head>

<div class="tasks-page">
  <div class="page-header">
    <h1 class="comic-heading">Claude Tasks</h1>
    {#if !isLoading && sessions.length > 0}
      <span class="stat-line">
        {sessions.length} sessions &middot; {totalTasks} tasks
      </span>
    {/if}
  </div>

  {#if isLoading}
    <BentoGrid columns={3} gap="sm">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
    </BentoGrid>
    <BentoGrid columns={2} gap="md">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="120px" />
      {/each}
    </BentoGrid>
  {:else if sessions.length === 0 && todoLists.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No Claude tasks found"
      description="Tasks appear here when Claude Code uses the TodoWrite tool during sessions."
    />
  {:else}
    <BentoGrid columns={3} gap="sm">
      <ComicBentoCard title="Total Tasks" icon="📋" variant="neon" neonColor="purple">
        <span class="stat-big">{totalTasks}</span>
        <span class="stat-sub">{sessions.length} sessions</span>
      </ComicBentoCard>

      <ComicBentoCard title="Completed" icon="✅" variant="neon" neonColor="green">
        <span class="stat-big">{totalCompleted}</span>
        <span class="stat-sub">{totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0}% done</span>
      </ComicBentoCard>

      <ComicBentoCard title="In Progress" icon="🔄" variant="neon" neonColor="blue">
        <span class="stat-big">{totalInProgress}</span>
        {#if totalInProgress > 0}
          <span class="stat-sub">active now</span>
        {/if}
      </ComicBentoCard>
    </BentoGrid>

    {#if activeTodos.length > 0}
      <section class="section">
        <h2 class="section-title">Active Todo Lists</h2>
        <BentoGrid columns={2} gap="md">
          {#each activeTodos as todoList (todoList.filename)}
            <ComicBentoCard title={todoList.sessionId.substring(0, 8)} icon="📝">
              <div class="todo-list">
                {#each todoList.todos as todo}
                  <div class="todo-item" class:done={todo.status === 'completed'} class:active={todo.status === 'in_progress'}>
                    <span class="todo-status">
                      {#if todo.status === 'completed'}✅
                      {:else if todo.status === 'in_progress'}🔄
                      {:else}⏳
                      {/if}
                    </span>
                    <span class="todo-content">
                      {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                    </span>
                  </div>
                {/each}
              </div>
            </ComicBentoCard>
          {/each}
        </BentoGrid>
      </section>
    {/if}

    <section class="section">
      <h2 class="section-title">Task Sessions</h2>
      <div class="session-grid">
        {#each sessions as session (session.sessionId)}
          <a href="/tasks/{session.sessionId}" class="session-card sketch-border">
            <div class="session-header">
              <span class="session-name">{session.subject}</span>
              <span class="session-id">{session.sessionId.substring(0, 8)}</span>
            </div>
            <ComicProgress
              value={session.completed}
              max={session.total}
              color={getProgressColor(session)}
              size="sm"
            />
            <div class="session-stats">
              {#if session.pending > 0}
                <ComicBadge color="yellow" size="sm">{session.pending} pending</ComicBadge>
              {/if}
              {#if session.inProgress > 0}
                <ComicBadge color="blue" size="sm">{session.inProgress} active</ComicBadge>
              {/if}
              <ComicBadge color="green" size="sm">{session.completed}/{session.total}</ComicBadge>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .tasks-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-line {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .stat-big {
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1;
    font-family: var(--font-mono, monospace);
  }

  .stat-sub {
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .todo-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .todo-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-xs);
    font-size: 0.75rem;
    padding: 2px 0;
  }

  .todo-item.done {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .todo-item.active {
    color: var(--accent-blue);
    font-weight: 700;
  }

  .todo-status {
    font-size: 0.7rem;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  .todo-content {
    line-height: 1.4;
  }

  .session-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-md);
  }

  .session-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--bg-card);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    text-decoration: none;
    color: inherit;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    cursor: pointer;
  }

  .session-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
    text-decoration: none;
    color: inherit;
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .session-name {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.85rem;
    line-height: 1.3;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-id {
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .session-stats {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
</style>
