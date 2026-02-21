<script lang="ts">
  import type { ClaudeTask } from '$lib/types';

  interface Props {
    task: ClaudeTask;
    compact?: boolean;
  }

  const { task, compact = false }: Props = $props();

  const statusColors = {
    pending: 'var(--accent-yellow)',
    in_progress: 'var(--accent-orange)',
    completed: 'var(--accent-green)',
  };

  function getModelShort(model: string): string {
    if (!model) return '';
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'sonnet';
    if (model.includes('haiku')) return 'haiku';
    return model.split('-')[1] ?? model;
  }

  function getModelColor(model: string): string {
    if (model.includes('opus')) return 'purple';
    if (model.includes('haiku')) return 'green';
    return 'blue';
  }

  function getProjectName(dir: string): string {
    if (!dir) return '';
    // Dash-encoded: Claude Code encodes ':' and '\' as '-', so '--' = two consecutive separators
    if (!dir.includes('/') && !dir.includes('\\')) {
      const stripped = dir.replace(/--\.?claude-worktrees-.+$/, '');
      const decoded = stripped.replace(/--/g, '/');
      const parts = decoded.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      const tokens = last ? last.split('-').filter(Boolean) : [];
      return tokens[tokens.length - 1] ?? stripped ?? dir;
    }
    // Slash format
    const normalized = dir.replace(/\\/g, '/').replace(/\/+/g, '/');
    const stripped = normalized.replace(/\/\.?claude\/worktrees\/[^/]*\/?$/, '');
    const parts = stripped.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? dir;
  }

  function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const displayText = $derived(
    task.status === 'in_progress' ? (task.active_form || task.content) : task.content,
  );

  const projectName = $derived(getProjectName(task.project_dir));
  const modelShort = $derived(getModelShort(task.model));
  const modelColor = $derived(getModelColor(task.model));
  const timeLabel = $derived(timeAgo(task.updated));
</script>

<div
  class="task-card task-{task.status}"
  class:task-compact={compact}
  style="--status-color: {statusColors[task.status]}"
  aria-label="Task: {displayText}"
>
  {#if task.status === 'in_progress' && !compact}
    <div class="pulse-dot" aria-hidden="true"></div>
  {/if}

  <p class="task-content" class:content-truncate={compact}>{displayText}</p>

  {#if !compact}
    <div class="task-meta">
      {#if task.session_title}
        <span class="meta-badge session-badge" title={task.session_title}>
          {task.session_title}
        </span>
      {/if}
      {#if modelShort}
        <span class="meta-badge model-badge model-{modelColor}">{modelShort}</span>
      {/if}
      {#if projectName}
        <span class="meta-badge project-badge" title={task.project_dir}>{projectName}</span>
      {/if}
      {#if timeLabel}
        <span class="meta-time">{timeLabel}</span>
      {/if}
    </div>
  {:else}
    <div class="task-meta">
      {#if modelShort}
        <span class="meta-badge model-badge model-{modelColor}">{modelShort}</span>
      {/if}
      {#if timeLabel}
        <span class="meta-time">{timeLabel}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .task-card {
    background: var(--bg-card);
    border: 2px solid var(--status-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
    position: relative;
    transition:
      transform 200ms ease,
      box-shadow 200ms ease;
    overflow: hidden;
    flex-shrink: 0;
    min-height: 80px;
  }

  .task-card:hover {
    transform: translateY(-2px);
    box-shadow: 4px 4px 0 var(--border-color);
  }

  .task-pending {
    box-shadow: 2px 2px 0 var(--accent-yellow);
  }

  .task-in_progress {
    box-shadow: 2px 2px 0 var(--accent-orange);
    animation: activePulse 2s ease-in-out infinite;
  }

  .task-completed {
    box-shadow: 2px 2px 0 var(--accent-green);
    opacity: 0.85;
  }

  @keyframes activePulse {
    0%, 100% { box-shadow: 2px 2px 0 var(--accent-orange); }
    50% { box-shadow: 4px 4px 0 var(--accent-orange), 0 0 12px rgba(255, 159, 67, 0.3); }
  }

  .pulse-dot {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-orange);
    animation: dotPulse 1.5s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.4); }
  }

  .task-content {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    margin: 0 0 var(--spacing-sm);
    line-height: 1.5;
    word-break: break-word;
  }

  .task-in_progress .task-content {
    font-weight: 700;
  }

  .task-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .meta-badge {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-badge {
    background: rgba(162, 155, 254, 0.2);
    color: var(--accent-purple);
    border: 1px solid rgba(162, 155, 254, 0.4);
    max-width: 180px;
    text-transform: none;
    font-weight: 600;
  }

  .model-green { background: rgba(0, 210, 106, 0.15); color: var(--accent-green); border: 1px solid rgba(0, 210, 106, 0.3); text-transform: uppercase; }
  .model-blue { background: rgba(78, 205, 196, 0.15); color: var(--accent-blue); border: 1px solid rgba(78, 205, 196, 0.3); text-transform: uppercase; }
  .model-purple { background: rgba(162, 155, 254, 0.15); color: var(--accent-purple); border: 1px solid rgba(162, 155, 254, 0.3); text-transform: uppercase; }

  .project-badge {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    text-transform: uppercase;
  }

  .meta-time {
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  /* Compact mode */
  .task-compact {
    padding: var(--spacing-sm) var(--spacing-md);
    min-height: auto;
  }

  .task-compact .task-content {
    font-size: var(--font-size-xs);
    margin-bottom: 2px;
  }

  .content-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
