<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchPlans, syncPlanFiles } from '$lib/api/plans';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { formatRelative } from '$lib/utils/date';
  import { toast } from '$lib/stores/toast';
  import type { Plan, PlanStatus, PlanType } from '$lib/types';

  let plans = $state<Plan[]>([]);
  let isLoading = $state(true);
  let isSyncing = $state(false);
  let statusFilter = $state('all');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalItems = $state(0);
  let unsubscribe: (() => void) | undefined;

  const statusTabs = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'approved', label: 'Approved' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'review', label: 'Review' },
    { id: 'completed', label: 'Completed' },
    { id: 'abandoned', label: 'Abandoned' },
  ];

  const STATUS_COLORS: Record<
    PlanStatus,
    'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple'
  > = {
    draft: 'yellow',
    approved: 'blue',
    in_progress: 'orange',
    review: 'purple',
    completed: 'green',
    abandoned: 'red',
    superseded: 'red',
  };

  const TYPE_COLORS: Record<PlanType, 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple'> = {
    implementation: 'green',
    architecture: 'blue',
    design: 'purple',
    refactor: 'orange',
    bugfix: 'red',
    investigation: 'yellow',
    migration: 'blue',
  };

  const PRIORITY_COLORS: Record<string, 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple'> =
    {
      low: 'blue',
      medium: 'yellow',
      high: 'orange',
      critical: 'red',
    };

  async function loadPlans(): Promise<void> {
    isLoading = true;
    try {
      const status = statusFilter === 'all' ? undefined : (statusFilter as PlanStatus);
      const result = await fetchPlans(currentPage, { status });
      plans = result.items;
      totalPages = result.totalPages;
      totalItems = result.totalItems;
    } catch (err: unknown) {
      console.error('[Plans]', err);
    } finally {
      isLoading = false;
    }
  }

  function handleTabChange(): void {
    currentPage = 1;
    loadPlans();
  }

  $effect(() => {
    void statusFilter; // Track dependency
    handleTabChange();
  });

  onMount(async () => {
    await loadPlans();
    unsubscribe = await pb.collection('plans').subscribe('*', (e) => {
      if (e.action === 'create') plans = [e.record as unknown as Plan, ...plans].slice(0, 100);
      else if (e.action === 'delete') plans = plans.filter((p) => p.id !== e.record.id);
      else if (e.action === 'update') {
        plans = plans.map((p) => (p.id === e.record.id ? (e.record as unknown as Plan) : p));
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  async function handleSyncPlanFiles(): Promise<void> {
    isSyncing = true;
    try {
      const result = await syncPlanFiles();
      if (result.imported > 0) {
        toast.success(`Synced ${result.imported} plan files`);
        await loadPlans();
      } else if (result.skipped > 0) {
        toast.success(`All ${result.files_found} plan files already imported`);
      } else {
        toast.success('No plan files found');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      isSyncing = false;
    }
  }
</script>

<svelte:head><title>Plans - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Plans</h1>
      <p class="subtitle">{totalItems} plans tracked</p>
    </div>
    <div class="header-actions">
      <ComicButton variant="outline" disabled={isSyncing} onclick={handleSyncPlanFiles}>
        {isSyncing ? 'Syncing...' : 'Sync Claude Files'}
      </ComicButton>
      <a href="/plans/new"><ComicButton variant="primary">New Plan</ComicButton></a>
    </div>
  </div>

  <ComicTabs tabs={statusTabs} bind:active={statusFilter} />

  {#if isLoading}
    <div class="skeleton-list">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="100px" />
      {/each}
    </div>
  {:else if plans.length === 0}
    <ComicEmptyState
      illustration="inbox"
      message="No plans found"
      description="Create a new plan manually or import conversations to auto-extract plans."
      actionLabel="New Plan"
      actionHref="/plans/new"
    />
  {:else}
    <div class="list">
      {#each plans as plan, i (plan.id)}
        <a href="/plans/{plan.id}" class="list-link" style:animation-delay="{i * 30}ms">
          <ComicCard variant="standard">
            <div class="plan-header">
              <h3 class="plan-title">{plan.title}</h3>
              <div class="plan-badges">
                <ComicBadge color={STATUS_COLORS[plan.status]} size="sm"
                  >{plan.status.replace('_', ' ')}</ComicBadge
                >
                {#if plan.plan_type}
                  <ComicBadge color={TYPE_COLORS[plan.plan_type]} size="sm"
                    >{plan.plan_type}</ComicBadge
                  >
                {/if}
              </div>
            </div>
            {#if plan.trigger}
              <p class="plan-trigger">{plan.trigger.replace(/<[^>]*>/g, '').substring(0, 150)}</p>
            {/if}
            <div class="plan-meta">
              {#if plan.priority}
                <ComicBadge color={PRIORITY_COLORS[plan.priority] ?? 'blue'} size="sm"
                  >{plan.priority}</ComicBadge
                >
              {/if}
              {#if plan.complexity}
                <span class="meta-text">{plan.complexity}</span>
              {/if}
              {#if plan.estimated_effort}
                <span class="meta-text">{plan.estimated_effort}</span>
              {/if}
              {#if plan.extraction_source === 'auto'}
                <ComicBadge color="purple" size="sm">auto</ComicBadge>
              {/if}
              <span class="time">{formatRelative(plan.created)}</span>
            </div>
            {#if plan.tags.length > 0}
              <div class="tags">
                {#each plan.tags.slice(0, 5) as tag (tag)}
                  <ComicBadge color="purple" size="sm">{tag}</ComicBadge>
                {/each}
              </div>
            {/if}
          </ComicCard>
        </a>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <ComicButton
          variant="outline"
          disabled={currentPage <= 1}
          onclick={() => {
            currentPage--;
            loadPlans();
          }}>Prev</ComicButton
        >
        <span class="page-info">Page {currentPage} / {totalPages}</span>
        <ComicButton
          variant="outline"
          disabled={currentPage >= totalPages}
          onclick={() => {
            currentPage++;
            loadPlans();
          }}>Next</ComicButton
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
  }
  .page-header a {
    text-decoration: none;
  }
  .header-actions {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    flex-shrink: 0;
  }
  .subtitle {
    font-size: var(--font-size-md);
    color: var(--text-muted);
    margin: var(--spacing-xs) 0 0;
  }
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .list-link {
    text-decoration: none;
    color: inherit;
    animation: sketchFadeIn 0.3s ease both;
  }
  .plan-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }
  .plan-title {
    font-size: var(--font-size-lg);
    font-weight: 700;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .plan-badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .plan-trigger {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .plan-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    flex-wrap: wrap;
  }
  .meta-text {
    text-transform: capitalize;
  }
  .time {
    margin-left: auto;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: var(--spacing-xs);
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
  }
  .page-info {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
    }
    .plan-header {
      flex-direction: column;
    }
  }
</style>
