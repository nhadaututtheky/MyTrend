<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchTasks, syncTasks, getSyncStatus, groupTasksBySessions } from '$lib/api/tasks';
  import { sendVibeNotification } from '$lib/api/telegram';
  import SessionSidebar from '$lib/components/vibe/SessionSidebar.svelte';
  import KanbanBoard from '$lib/components/vibe/KanbanBoard.svelte';
  import ContextMeter from '$lib/components/vibe/ContextMeter.svelte';
  import ContextPanel from '$lib/components/vibe/ContextPanel.svelte';
  import ModelRouter from '$lib/components/vibe/ModelRouter.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import type { ClaudeTask, VibeSession, VibeSyncStatus } from '$lib/types';

  // ─── State ────────────────────────────────────────────────────────────────
  let tasks = $state<ClaudeTask[]>([]);
  let syncStatus = $state<VibeSyncStatus | null>(null);
  let selectedSessionId = $state<string | null>(null);
  let searchQuery = $state('');
  let activeTab = $state('kanban');
  let isLoading = $state(true);
  let isSyncing = $state(false);
  let isSendingSummary = $state(false);
  let errorMessage = $state('');
  let unsubscribe: (() => void) | undefined;

  // ─── Derived ──────────────────────────────────────────────────────────────
  const sessions = $derived(groupTasksBySessions(tasks));

  const filteredTasks = $derived(
    selectedSessionId
      ? tasks.filter((t) => t.session_id === selectedSessionId)
      : tasks,
  );

  const displayTasks = $derived(
    searchQuery
      ? filteredTasks.filter(
          (t) =>
            t.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.session_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.project_dir.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : filteredTasks,
  );

  const pendingTasks = $derived(displayTasks.filter((t) => t.status === 'pending'));
  const inProgressTasks = $derived(displayTasks.filter((t) => t.status === 'in_progress'));
  const completedTasks = $derived(displayTasks.filter((t) => t.status === 'completed'));
  const activeSessions = $derived(sessions.filter((s) => s.is_active));

  const selectedSession = $derived(
    selectedSessionId ? sessions.find((s) => s.session_id === selectedSessionId) ?? null : null,
  );

  const tabs = $derived([
    { id: 'kanban', label: 'Kanban', badge: inProgressTasks.length || undefined },
    { id: 'context', label: 'Context' },
    { id: 'router', label: 'Router' },
  ]);

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  onMount(async () => {
    await loadTasks();
    await loadSyncStatus();
    subscribeRealtime();
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  async function loadTasks() {
    try {
      isLoading = true;
      const result = await fetchTasks({ perPage: 500 });
      tasks = result.items;
    } catch (err) {
      errorMessage = 'Failed to load tasks';
      console.error('[Vibe]', err);
    } finally {
      isLoading = false;
    }
  }

  async function loadSyncStatus() {
    try {
      syncStatus = await getSyncStatus();
    } catch {
      // non-critical
    }
  }

  function subscribeRealtime() {
    pb.collection('claude_tasks')
      .subscribe('*', (e) => {
        const record = e.record as unknown as ClaudeTask;
        if (e.action === 'create') {
          tasks = [record, ...tasks];
        } else if (e.action === 'update') {
          tasks = tasks.map((t) => (t.id === record.id ? record : t));
        } else if (e.action === 'delete') {
          tasks = tasks.filter((t) => t.id !== record.id);
        }
      })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.error('[Vibe] Realtime subscribe failed:', err);
      });
  }

  async function handleSync() {
    isSyncing = true;
    errorMessage = '';
    try {
      await syncTasks();
      await loadTasks();
      await loadSyncStatus();
    } catch (err) {
      errorMessage = 'Sync failed';
      console.error('[Vibe] Sync error:', err);
    } finally {
      isSyncing = false;
    }
  }

  async function handleSendSummary() {
    isSendingSummary = true;
    try {
      const lines: string[] = ['*Vibe Summary*'];
      lines.push(`Active sessions: ${activeSessions.length}`);
      lines.push(`Tasks: ${pendingTasks.length} pending • ${inProgressTasks.length} running • ${completedTasks.length} done`);

      if (activeSessions.length > 0) {
        lines.push('');
        lines.push('*Active Sessions:*');
        for (const s of activeSessions.slice(0, 5)) {
          lines.push(`• ${s.project_name}: ${s.in_progress_count} running, ${s.pending_count} pending`);
        }
      }

      await sendVibeNotification(lines.join('\n'), 'Markdown');
    } catch (err) {
      errorMessage = 'Failed to send summary';
      console.error('[Vibe] Telegram error:', err);
    } finally {
      isSendingSummary = false;
    }
  }
</script>

<svelte:head>
  <title>Vibe - Claude Code Monitor</title>
</svelte:head>

<!-- Two-panel layout -->
<SessionSidebar
  {sessions}
  {selectedSessionId}
  onselect={(id) => { selectedSessionId = id; }}
/>

<div class="vibe-main">
  <!-- Header -->
  <div class="vibe-header">
    <div class="header-left">
      <h1 class="page-title">VIBE</h1>
      <div class="header-badges">
        {#if activeSessions.length > 0}
          <span class="badge-active" aria-label="{activeSessions.length} active sessions">
            ⚡ {activeSessions.length} active
          </span>
        {/if}
        {#if inProgressTasks.length > 0}
          <span class="badge-running">{inProgressTasks.length} running</span>
        {/if}
        <span class="badge-total">{tasks.length} tasks</span>
      </div>
    </div>

    <div class="header-right">
      <!-- Search -->
      <input
        class="search-input"
        type="search"
        placeholder="Search tasks..."
        bind:value={searchQuery}
        aria-label="Search tasks"
      />

      <!-- Sync button -->
      <button
        class="btn-sync"
        onclick={handleSync}
        disabled={isSyncing}
        aria-label="Sync tasks from Claude Code"
      >
        {isSyncing ? '⟳ Syncing...' : '⟳ Sync'}
      </button>

      <!-- Send Summary button -->
      <button
        class="btn-summary"
        onclick={handleSendSummary}
        disabled={isSendingSummary}
        aria-label="Send Telegram summary"
      >
        {isSendingSummary ? 'Sending...' : '📬 Summary'}
      </button>
    </div>
  </div>

  {#if errorMessage}
    <div class="error-bar" role="alert">{errorMessage}</div>
  {/if}

  <!-- Tabs -->
  <div class="tabs-bar">
    <ComicTabs {tabs} bind:active={activeTab} />
    {#if syncStatus?.last_sync}
      <span class="sync-time" aria-label="Last sync time">
        synced {new Date(syncStatus.last_sync).toLocaleTimeString()}
      </span>
    {/if}
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    {#if isLoading}
      <div class="loading-state">
        <p class="loading-text">Loading tasks...</p>
      </div>
    {:else if activeTab === 'kanban'}
      {#if tasks.length === 0}
        <div class="empty-state">
          <p class="empty-icon">🎯</p>
          <p class="empty-title">No Tasks Yet</p>
          <p class="empty-sub">Run Claude Code with TodoWrite tool to see tasks here.<br />Click <strong>Sync</strong> to pull current todo files.</p>
        </div>
      {:else}
        <KanbanBoard pending={pendingTasks} inProgress={inProgressTasks} completed={completedTasks} />
      {/if}

    {:else if activeTab === 'context'}
      <div class="context-layout">
        <div class="context-top">
          <ContextMeter session={selectedSession} sessions={sessions} />
        </div>
        <div class="context-bottom">
          <ContextPanel {sessions} />
        </div>
      </div>

    {:else if activeTab === 'router'}
      <div class="router-layout">
        <ModelRouter />
        <div class="router-hint">
          <p>The Router analyzes task keywords to suggest the best Claude model.</p>
          <ul>
            <li>🍃 <strong>Haiku</strong> — search, read, check, simple tasks</li>
            <li>⚡ <strong>Sonnet</strong> — write code, fix bugs, standard tasks (default)</li>
            <li>🏔️ <strong>Opus</strong> — architect, design, complex multi-file work</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Two-panel layout: sidebar is rendered in parent via slot, main fills rest */
  .vibe-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* Header */
  .vibe-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 2px solid var(--border-color);
    flex-shrink: 0;
    gap: var(--spacing-md);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .page-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-xl);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--accent-green);
    margin: 0;
  }

  :global([data-theme='dark']) .page-title {
    text-shadow: 0 0 12px rgba(0, 210, 106, 0.4);
  }

  .header-badges {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .badge-active {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    padding: 2px var(--spacing-sm);
    background: rgba(255, 159, 67, 0.15);
    color: var(--accent-orange);
    border: 1px solid var(--accent-orange);
    border-radius: 4px;
    animation: badgePulse 2s ease-in-out infinite;
  }

  @keyframes badgePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .badge-running {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    padding: 2px var(--spacing-sm);
    background: rgba(78, 205, 196, 0.15);
    color: var(--accent-blue);
    border: 1px solid rgba(78, 205, 196, 0.4);
    border-radius: 4px;
  }

  .badge-total {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    padding: 2px var(--spacing-sm);
    background: var(--bg-elevated);
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .search-input {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    width: 180px;
    outline: none;
    transition: border-color 150ms ease;
  }

  .search-input:focus {
    border-color: var(--accent-green);
  }

  .btn-sync,
  .btn-summary {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .btn-sync {
    background: var(--bg-elevated);
    color: var(--text-secondary);
  }

  .btn-sync:hover:not(:disabled) {
    border-color: var(--accent-green);
    color: var(--accent-green);
    transform: translateY(-1px);
  }

  .btn-summary {
    background: var(--bg-elevated);
    color: var(--text-secondary);
  }

  .btn-summary:hover:not(:disabled) {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    transform: translateY(-1px);
  }

  .btn-sync:disabled,
  .btn-summary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-bar {
    background: rgba(255, 71, 87, 0.15);
    border-bottom: 1px solid var(--accent-red);
    color: var(--accent-red);
    padding: var(--spacing-xs) var(--spacing-lg);
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  /* Tabs */
  .tabs-bar {
    display: flex;
    align-items: center;
    padding: 0 var(--spacing-lg);
    border-bottom: 2px solid var(--border-color);
    flex-shrink: 0;
    gap: var(--spacing-md);
  }

  .tabs-bar :global(.tabs) {
    border-bottom: none;
    flex: 1;
  }

  .sync-time {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Tab Content */
  .tab-content {
    flex: 1;
    overflow: hidden;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
  }

  /* Loading */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .loading-text {
    font-family: var(--font-comic);
    color: var(--text-muted);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: var(--spacing-2xl);
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--spacing-md);
  }

  .empty-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--spacing-sm);
  }

  .empty-sub {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    line-height: 1.6;
    max-width: 400px;
  }

  /* Context tab */
  .context-layout {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    overflow-y: auto;
    flex: 1;
  }

  .context-top {
    flex-shrink: 0;
  }

  .context-bottom {
    flex: 1;
    overflow: hidden;
  }

  /* Router tab */
  .router-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-lg);
    align-items: start;
    overflow-y: auto;
  }

  .router-hint {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
  }

  .router-hint p {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-sm);
  }

  .router-hint ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .router-hint li {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .router-hint strong {
    color: var(--text-primary);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .vibe-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-right {
      width: 100%;
    }

    .search-input {
      width: 100%;
    }

    .router-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
