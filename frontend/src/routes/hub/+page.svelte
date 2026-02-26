<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import pb from '$lib/config/pocketbase';
  import { fetchSessions } from '$lib/api/hub';
  import SessionList from '$lib/components/hub/SessionList.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { HubSession } from '$lib/types';

  let sessions = $state<HubSession[]>([]);
  let isLoading = $state(true);
  let unsubscribe: (() => void) | undefined;

  onMount(async () => {
    try {
      const result = await fetchSessions();
      sessions = result.items;
    } catch (err: unknown) {
      console.error('[Hub]', err);
    } finally {
      isLoading = false;
    }

    try {
      unsubscribe = await pb.collection('hub_sessions').subscribe('*', (e) => {
        if (e.action === 'create') {
          sessions = [e.record as unknown as HubSession, ...sessions];
        } else if (e.action === 'update') {
          sessions = sessions.map((s) =>
            s.id === e.record.id ? (e.record as unknown as HubSession) : s,
          );
        } else if (e.action === 'delete') {
          sessions = sessions.filter((s) => s.id !== e.record.id);
        }
      });
    } catch (err: unknown) {
      console.error('[Hub] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  function handleSelect(session: HubSession): void {
    goto(`/hub/${session.id}`);
  }
</script>

<svelte:head>
  <title>Claude Hub - MyTrend</title>
</svelte:head>

<div class="hub-sidebar">
  {#if isLoading}
    <p class="loading">Loading sessions...</p>
  {:else}
    <SessionList {sessions} onselect={handleSelect} />
  {/if}
</div>

<div class="hub-main">
  <div class="welcome">
    <ComicCard>
      <div class="welcome-content">
        <h2 class="comic-heading">Claude Hub</h2>
        <p>Your central place to chat with Claude across all devices.</p>
        <ul class="features">
          <li>Direct Claude API streaming</li>
          <li>Cross-device session sync</li>
          <li>Auto-save to MyTrend archive</li>
          <li>Token tracking and cost estimation</li>
        </ul>
        <div class="hub-actions">
          <a href="/hub/new" class="start-btn">Start New Session</a>
          <a href="/hub/cron" class="cron-btn">⏱ Cron Jobs</a>
          <a href="/hub/settings" class="settings-btn">⚙ Settings</a>
        </div>
      </div>
    </ComicCard>
  </div>
</div>

<style>
  .hub-sidebar {
    width: 280px;
    border-right: var(--border-width) solid var(--border-color);
    background: var(--bg-card);
    overflow-y: auto;
    flex-shrink: 0;
  }

  .hub-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
  }

  .welcome-content {
    text-align: center;
    max-width: 400px;
  }

  .welcome-content p {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: var(--spacing-md) 0;
  }

  .features {
    text-align: left;
    font-size: 0.8rem;
    color: var(--text-secondary);
    padding-left: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }

  .features li {
    margin-bottom: var(--spacing-xs);
  }

  .start-btn {
    display: inline-block;
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.875rem;
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--accent-green);
    color: #1a1a1a;
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-sm);
    text-decoration: none;
    text-transform: uppercase;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  .hub-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    justify-content: center;
  }
  .cron-btn,
  .settings-btn {
    display: inline-block;
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.875rem;
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    color: var(--text-secondary);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: 2px 2px 0 var(--border-color);
    text-decoration: none;
    transition: all 150ms ease;
  }
  .cron-btn:hover,
  .settings-btn:hover {
    color: var(--accent-blue);
    border-color: var(--accent-blue);
    box-shadow: 3px 3px 0 var(--accent-blue);
    transform: translate(-1px, -1px);
    text-decoration: none;
  }
  .start-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    color: #1a1a1a;
    text-decoration: none;
  }

  .loading {
    text-align: center;
    color: var(--text-muted);
    padding: var(--spacing-xl);
  }

  @media (max-width: 768px) {
    .hub-sidebar {
      display: none;
    }
  }
</style>
