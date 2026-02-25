<script lang="ts">
  import type { VibeSession } from '$lib/types';

  interface Props {
    sessions: VibeSession[];
    selectedSessionId: string | null;
    onselect: (sessionId: string | null) => void;
  }

  const { sessions, selectedSessionId, onselect }: Props = $props();

  function getModelShort(model: string): string {
    if (!model) return '?';
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'snnt';
    if (model.includes('haiku')) return 'hiku';
    return 'ai';
  }

  function getModelClass(model: string): string {
    if (model.includes('opus')) return 'model-purple';
    if (model.includes('haiku')) return 'model-green';
    return 'model-blue';
  }

  function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function formatTokens(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  }
</script>

<aside class="sidebar" aria-label="Claude Code sessions">
  <div class="sidebar-header">
    <span class="sidebar-title">SESSIONS</span>
    <span class="session-count">{sessions.length}</span>
  </div>

  <!-- ALL button -->
  <button
    class="session-all-btn"
    class:active={selectedSessionId === null}
    onclick={() => onselect(null)}
    aria-pressed={selectedSessionId === null}
  >
    All Sessions
  </button>

  <div class="session-list" role="list">
    {#if sessions.length === 0}
      <div class="empty">No sessions yet. Run Claude Code with TodoWrite to see tasks here.</div>
    {:else}
      {#each sessions as session (`${session.session_id}::${session.agent_id}`)}
        {@const isSelected = selectedSessionId === session.session_id}
        <button
          class="session-item"
          class:selected={isSelected}
          class:active={session.is_active}
          onclick={() => onselect(session.session_id)}
          aria-pressed={isSelected}
          aria-label="Session {session.project_name}"
        >
          <!-- Project name + model badge -->
          <div class="item-header">
            <span class="project-name">{session.project_name}</span>
            <span class="model-badge {getModelClass(session.model)}"
              >{getModelShort(session.model)}</span
            >
          </div>

          <!-- Session title -->
          {#if session.session_title && session.session_title !== 'Untitled'}
            <p class="session-title">
              {session.session_title.slice(0, 50)}{session.session_title.length > 50 ? '…' : ''}
            </p>
          {/if}

          <!-- 3-segment progress bar -->
          {#if session.total_tasks > 0}
            <div
              class="progress-bar"
              aria-label="Progress"
              title="{session.completed_count}/{session.total_tasks} complete"
            >
              <div
                class="progress-done"
                style="width: {(session.completed_count / session.total_tasks) * 100}%"
              ></div>
              <div
                class="progress-active"
                style="width: {(session.in_progress_count / session.total_tasks) * 100}%"
              ></div>
              <div
                class="progress-pending"
                style="width: {(session.pending_count / session.total_tasks) * 100}%"
              ></div>
            </div>
          {/if}

          <!-- Stats row -->
          <div class="item-stats">
            <span class="stat-tasks">
              {#if session.in_progress_count > 0}
                <span class="stat-active">⚡{session.in_progress_count}</span>
              {/if}
              {#if session.pending_count > 0}
                <span class="stat-pending">⏳{session.pending_count}</span>
              {/if}
              <span class="stat-done">✅{session.completed_count}</span>
            </span>

            <span class="stat-right">
              {#if session.context_pct > 50}
                <span class="context-warn" title="{session.context_pct}% context used"
                  >{session.context_pct}%</span
                >
              {:else if session.total_tokens > 0}
                <span class="stat-tokens">{formatTokens(session.total_tokens)}t</span>
              {/if}
              <span class="stat-time">{timeAgo(session.ended_at)}</span>
            </span>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    border-right: 2px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-base);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 2px solid var(--border-color);
    flex-shrink: 0;
  }

  .sidebar-title {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
  }

  .session-count {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 1px 8px;
    color: var(--text-muted);
  }

  .session-all-btn {
    width: 100%;
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .session-all-btn:hover,
  .session-all-btn.active {
    background: rgba(0, 210, 106, 0.08);
    color: var(--accent-green);
  }

  .session-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xs);
  }

  .session-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }

  .session-item:hover {
    border-color: var(--accent-green);
  }

  .session-item.selected {
    border-color: var(--accent-green);
    box-shadow: 2px 2px 0 var(--accent-green);
  }

  .session-item.active {
    border-left: 4px solid var(--accent-green);
  }

  :global([data-theme='dark']) .session-item.active {
    box-shadow: 0 0 8px rgba(0, 210, 106, 0.2);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .project-name {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .model-badge {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .model-green {
    background: rgba(0, 210, 106, 0.15);
    color: var(--accent-green);
    border: 1px solid rgba(0, 210, 106, 0.3);
  }
  .model-blue {
    background: rgba(78, 205, 196, 0.15);
    color: var(--accent-blue);
    border: 1px solid rgba(78, 205, 196, 0.3);
  }
  .model-purple {
    background: rgba(162, 155, 254, 0.15);
    color: var(--accent-purple);
    border: 1px solid rgba(162, 155, 254, 0.3);
  }

  .session-title {
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    margin: 0 0 var(--spacing-xs);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-bar {
    height: 4px;
    background: var(--bg-elevated);
    border-radius: 2px;
    margin: var(--spacing-xs) 0;
    display: flex;
    overflow: hidden;
  }

  .progress-done {
    background: var(--accent-green);
    transition: width 500ms ease;
  }

  .progress-active {
    background: var(--accent-orange);
    animation: activePulse 1.5s ease-in-out infinite;
  }

  @keyframes activePulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .progress-pending {
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
  }

  .item-stats {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--font-size-2xs);
  }

  .stat-tasks {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .stat-active {
    color: var(--accent-orange);
    font-weight: 700;
  }
  .stat-pending {
    color: var(--accent-yellow);
  }
  .stat-done {
    color: var(--accent-green);
  }

  .stat-right {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .context-warn {
    background: rgba(255, 71, 87, 0.15);
    color: var(--accent-red);
    border: 1px solid rgba(255, 71, 87, 0.3);
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
  }

  .stat-tokens {
    color: var(--text-muted);
  }

  .stat-time {
    color: var(--text-muted);
  }

  .empty {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    padding: var(--spacing-xl) var(--spacing-md);
    text-align: center;
    line-height: 1.6;
  }
</style>
