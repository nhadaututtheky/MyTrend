<script lang="ts">
  import type { VibeSession } from '$lib/types';

  interface Props {
    sessions: VibeSession[];
  }

  const { sessions }: Props = $props();

  function getModelColor(model: string): string {
    if (model.includes('opus')) return 'purple';
    if (model.includes('haiku')) return 'green';
    return 'blue';
  }

  function getStatusColor(isActive: boolean, progressPct: number): string {
    if (isActive) return '#FF9F43';
    if (progressPct === 100) return '#00D26A';
    return '#FFE66D';
  }

  function getStatusLabel(isActive: boolean, progressPct: number): string {
    if (isActive) return 'active';
    if (progressPct === 100) return 'complete';
    return 'pending';
  }

  type SortKey = 'project' | 'context_pct' | 'cost' | 'duration' | 'tokens';
  let sortKey = $state<SortKey>('context_pct');
  let sortAsc = $state(false);
  let expandedId = $state<string | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) sortAsc = !sortAsc;
    else {
      sortKey = key;
      sortAsc = false;
    }
  }

  const sorted = $derived(
    [...sessions].sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (sortKey === 'project') {
        va = a.project_name;
        vb = b.project_name;
      } else if (sortKey === 'context_pct') {
        va = a.context_pct;
        vb = b.context_pct;
      } else if (sortKey === 'cost') {
        va = a.estimated_cost;
        vb = b.estimated_cost;
      } else if (sortKey === 'duration') {
        va = a.duration_min;
        vb = b.duration_min;
      } else if (sortKey === 'tokens') {
        va = a.total_tokens;
        vb = b.total_tokens;
      }

      if (typeof va === 'string') {
        return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    }),
  );

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function formatNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function getModelShort(model: string): string {
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'snnt';
    if (model.includes('haiku')) return 'hiku';
    return 'ai';
  }

  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '↕';
    return sortAsc ? '↑' : '↓';
  }

  const statusDots: Record<string, string> = {
    pending: '#FFE66D',
    in_progress: '#FF9F43',
    completed: '#00D26A',
  };
</script>

<div class="panel">
  {#if sessions.length === 0}
    <p class="empty">No sessions synced yet.</p>
  {:else}
    <div class="table-wrap">
      <table class="data-table" aria-label="Context panel session table">
        <thead>
          <tr>
            <th>
              <button
                class="sort-btn"
                onclick={() => toggleSort('project')}
                aria-label="Sort by project"
              >
                Project {sortIcon('project')}
              </button>
            </th>
            <th>Title</th>
            <th>Model</th>
            <th>
              <button
                class="sort-btn"
                onclick={() => toggleSort('tokens')}
                aria-label="Sort by tokens"
              >
                Tokens {sortIcon('tokens')}
              </button>
            </th>
            <th>
              <button
                class="sort-btn"
                onclick={() => toggleSort('context_pct')}
                aria-label="Sort by context"
              >
                Ctx% {sortIcon('context_pct')}
              </button>
            </th>
            <th>
              <button class="sort-btn" onclick={() => toggleSort('cost')} aria-label="Sort by cost">
                Cost {sortIcon('cost')}
              </button>
            </th>
            <th>
              <button
                class="sort-btn"
                onclick={() => toggleSort('duration')}
                aria-label="Sort by duration"
              >
                Dur {sortIcon('duration')}
              </button>
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each sorted as session (`${session.session_id}::${session.agent_id}`)}
            {@const rowId = `${session.session_id}::${session.agent_id}`}
            {@const isExpanded = expandedId === rowId}
            <tr
              class="data-row"
              class:expanded={isExpanded}
              onclick={() => toggleExpand(rowId)}
              role="button"
              tabindex="0"
              aria-expanded={isExpanded}
              onkeydown={(e) => {
                if (e.key === 'Enter') toggleExpand(rowId);
              }}
            >
              <td class="cell-project">
                <span class="project-name">{session.project_name}</span>
              </td>
              <td class="cell-title">
                <span class="title-text" title={session.session_title}>
                  {session.session_title.slice(0, 40)}{session.session_title.length > 40 ? '…' : ''}
                </span>
              </td>
              <td>
                <span class="model-tag model-{getModelColor(session.model)}">
                  {getModelShort(session.model)}
                </span>
              </td>
              <td class="cell-mono">{formatNum(session.total_tokens)}</td>
              <td class="cell-mono">
                <span
                  class="ctx-pct"
                  class:ctx-warn={session.context_pct >= 80}
                  class:ctx-crit={session.context_pct >= 95}
                >
                  {session.context_pct}%
                </span>
              </td>
              <td class="cell-mono">${session.estimated_cost.toFixed(4)}</td>
              <td class="cell-mono"
                >{session.duration_min > 0 ? `${session.duration_min}m` : '-'}</td
              >
              <td>
                <span
                  class="status-dot"
                  style="background: {getStatusColor(session.is_active, session.progress_pct)}"
                  aria-label={getStatusLabel(session.is_active, session.progress_pct)}
                ></span>
              </td>
            </tr>

            {#if isExpanded}
              <tr class="expand-row" aria-label="Task details for {session.project_name}">
                <td colspan="8" class="expand-cell">
                  <div class="task-list">
                    {#each session.tasks as task (task.id)}
                      <div class="task-item">
                        <span
                          class="task-dot"
                          style="background: {statusDots[task.status] ?? '#888'}"
                          aria-label={task.status}
                        ></span>
                        <span class="task-text"
                          >{task.status === 'in_progress'
                            ? task.active_form || task.content
                            : task.content}</span
                        >
                      </div>
                    {/each}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .panel {
    overflow: hidden;
  }

  .empty {
    font-family: var(--font-comic);
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-2xl);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  thead th {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    padding: var(--spacing-sm) var(--spacing-sm);
    text-align: left;
    border-bottom: 2px solid var(--border-color);
    white-space: nowrap;
  }

  .sort-btn {
    background: none;
    border: none;
    font-family: inherit;
    font-weight: inherit;
    font-size: inherit;
    color: inherit;
    cursor: pointer;
    padding: 0;
    letter-spacing: inherit;
    text-transform: inherit;
  }

  .sort-btn:hover {
    color: var(--accent-green);
  }

  .data-row {
    cursor: pointer;
    border-bottom: 1px solid var(--border-color);
    transition: background 150ms ease;
  }

  .data-row:hover {
    background: var(--bg-elevated);
  }
  .data-row.expanded {
    background: var(--bg-elevated);
  }

  td {
    padding: var(--spacing-sm);
    vertical-align: middle;
  }

  .cell-project {
    font-weight: 700;
  }
  .project-name {
    color: var(--text-primary);
  }

  .cell-title {
    max-width: 200px;
  }

  .title-text {
    color: var(--text-secondary);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-mono {
    font-family: var(--font-mono);
    color: var(--text-primary);
    text-align: right;
  }

  .model-tag {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
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

  .ctx-pct {
    font-weight: 700;
    color: var(--accent-green);
  }
  .ctx-warn {
    color: var(--accent-orange);
  }
  .ctx-crit {
    color: var(--accent-red);
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .expand-row {
    background: var(--bg-elevated);
  }

  .expand-cell {
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .task-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  .task-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }
</style>
