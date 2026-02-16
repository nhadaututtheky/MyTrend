<script lang="ts">
  import type { HubSession } from '$lib/types';
  import { formatRelative } from '$lib/utils/date';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    sessions: HubSession[];
    activeId?: string;
    onselect?: (session: HubSession) => void;
  }

  let { sessions, activeId, onselect }: Props = $props();

  const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'blue'> = {
    active: 'green',
    paused: 'yellow',
    archived: 'blue',
  };
</script>

<div class="session-list" data-testid="session-list">
  <div class="list-header">
    <h3 class="list-title">Sessions</h3>
    <a href="/hub/new" class="new-btn" aria-label="New session">+</a>
  </div>

  {#if sessions.length === 0}
    <p class="empty">No sessions yet</p>
  {:else}
    {#each sessions as session (session.id)}
      <button
        class="session-item"
        class:active={session.id === activeId}
        onclick={() => onselect?.(session)}
      >
        <div class="session-header">
          <span class="session-name">{session.name}</span>
          <ComicBadge color={STATUS_COLORS[session.status] ?? 'blue'} size="sm">
            {session.status}
          </ComicBadge>
        </div>
        <div class="session-meta">
          <span>{session.message_count} msgs</span>
          {#if session.last_message_at}
            <span>{formatRelative(session.last_message_at)}</span>
          {/if}
        </div>
        <div class="session-model">{session.model}</div>
      </button>
    {/each}
  {/if}
</div>

<style>
  .session-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: var(--border-width) solid var(--border-color);
    position: sticky;
    top: 0;
    background: var(--bg-card);
  }

  .list-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0;
  }

  .new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    font-size: 1.25rem;
    font-weight: 700;
    background: var(--accent-green);
    color: #1a1a1a;
    border-radius: 50%;
    text-decoration: none;
    border: var(--border-width) solid var(--border-color);
    box-shadow: var(--shadow-sm);
    transition: transform 150ms ease;
  }

  .new-btn:hover {
    transform: scale(1.1);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
    padding: var(--spacing-xl);
  }

  .session-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    border-bottom: 1px solid var(--bg-secondary);
    cursor: pointer;
    font-family: var(--font-comic);
    color: var(--text-primary);
    transition: background 150ms ease;
  }

  .session-item:hover {
    background: var(--bg-secondary);
  }

  .session-item.active {
    background: rgba(0, 210, 106, 0.1);
    border-left: 3px solid var(--accent-green);
  }

  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xs);
    margin-bottom: 2px;
  }

  .session-name {
    font-size: 0.8rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.625rem;
    color: var(--text-muted);
  }

  .session-model {
    font-size: 0.6rem;
    color: var(--text-muted);
    margin-top: 2px;
  }
</style>
