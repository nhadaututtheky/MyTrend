<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchSessionTasks } from '$lib/api/tasks';
  import ComicKanban from '$lib/components/comic/ComicKanban.svelte';
  import ComicProgress from '$lib/components/comic/ComicProgress.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type { ClaudeTask } from '$lib/types';

  let sessionId = $derived($page.params.sessionId ?? '');
  let tasks = $state<ClaudeTask[]>([]);
  let highwatermark = $state(0);
  let isLoading = $state(true);

  const pending = $derived(tasks.filter((t) => t.status === 'pending').length);
  const inProgress = $derived(tasks.filter((t) => t.status === 'in_progress').length);
  const onDiskCompleted = $derived(tasks.filter((t) => t.status === 'completed').length);
  const totalCompleted = $derived(
    highwatermark > 0
      ? Math.max(onDiskCompleted, highwatermark - pending - inProgress)
      : onDiskCompleted,
  );
  const total = $derived(highwatermark > 0 ? highwatermark : tasks.length);

  async function loadTasks(): Promise<void> {
    if (!sessionId) return;
    isLoading = true;
    try {
      const result = await fetchSessionTasks(sessionId);
      tasks = result.tasks;
      highwatermark = result.highwatermark;
    } catch (err: unknown) {
      console.error('[Tasks/Session]', err);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    void loadTasks();
  });
</script>

<svelte:head>
  <title>Tasks: {sessionId.substring(0, 8)} - MyTrend</title>
</svelte:head>

<div class="session-page">
  <div class="page-header">
    <div class="header-left">
      <a href="/tasks" class="back-link">
        <ComicButton size="sm" variant="outline">Back</ComicButton>
      </a>
      <h1 class="comic-heading">Session {sessionId.substring(0, 8)}</h1>
    </div>
    <ComicButton size="sm" variant="outline" onclick={loadTasks}>Refresh</ComicButton>
  </div>

  {#if isLoading}
    <BentoGrid columns={4} gap="sm">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="70px" />
      {/each}
    </BentoGrid>
    <ComicSkeleton variant="chart" />
  {:else if tasks.length === 0 && highwatermark === 0}
    <ComicEmptyState
      illustration="empty"
      message="No tasks in this session"
      description="This session has no active tasks. Tasks may have been cleaned up after completion."
    />
  {:else}
    <BentoGrid columns={4} gap="sm">
      <ComicBentoCard title="Total" icon="📋" variant="neon" neonColor="purple">
        <span class="stat-big">{total}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Pending" icon="⏳" variant="neon" neonColor="yellow">
        <span class="stat-big">{pending}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Active" icon="🔄" variant="neon" neonColor="blue">
        <span class="stat-big">{inProgress}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Done" icon="✅" variant="neon" neonColor="green">
        <span class="stat-big">{totalCompleted}</span>
      </ComicBentoCard>
    </BentoGrid>

    <div class="progress-section">
      <ComicProgress value={totalCompleted} max={total} color="green" />
    </div>

    <ComicKanban {tasks} completedCount={totalCompleted} />
  {/if}
</div>

<style>
  .session-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .back-link {
    text-decoration: none;
  }

  .progress-section {
    padding: 0 var(--spacing-sm);
  }

  .stat-big {
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1;
    font-family: var(--font-mono, monospace);
  }
</style>
