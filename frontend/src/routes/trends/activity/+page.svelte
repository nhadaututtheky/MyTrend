<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAggregates } from '$lib/api/activity';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import type { ActivityAggregate, ChartDataPoint } from '$lib/types';

  let period = $state('day');
  let aggregates = $state<ActivityAggregate[]>([]);
  let isLoading = $state(true);
  let initialized = $state(false);

  const periodTabs = [
    { id: 'day', label: 'Daily' },
    { id: 'week', label: 'Weekly' },
    { id: 'month', label: 'Monthly' },
  ];

  const chartData = $derived<ChartDataPoint[]>(
    aggregates.map((a) => ({
      label: new Date(a.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: a.total_count,
    })),
  );

  const breakdownData = $derived.by(() => {
    const totals: Record<string, number> = {};
    for (const agg of aggregates) {
      for (const [key, value] of Object.entries(agg.breakdown)) {
        totals[key] = (totals[key] ?? 0) + (value as number);
      }
    }
    return Object.entries(totals).map(([label, value]) => ({ label, value }));
  });

  const totalActivity = $derived(aggregates.reduce((s, a) => s + a.total_count, 0));
  const totalMinutes = $derived(aggregates.reduce((s, a) => s + a.total_minutes, 0));
  const avgPerPeriod = $derived(aggregates.length > 0 ? Math.round(totalActivity / aggregates.length) : 0);
  const peakDay = $derived.by(() => {
    if (aggregates.length === 0) return { label: '-', value: 0 };
    let max: ActivityAggregate | undefined;
    for (const a of aggregates) {
      if (!max || a.total_count > max.total_count) max = a;
    }
    if (!max) return { label: '-', value: 0 };
    return {
      label: new Date(max.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: max.total_count,
    };
  });

  async function loadData(): Promise<void> {
    isLoading = true;
    try {
      aggregates = await fetchAggregates(period);
    } catch (err: unknown) {
      console.error('[Trends/Activity]', err);
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    await loadData();
    initialized = true;
  });

  $effect(() => {
    if (!initialized) return;
    void period;
    loadData();
  });
</script>

<svelte:head>
  <title>Activity Trends - MyTrend</title>
</svelte:head>

<div class="activity-page">
  <div class="page-header">
    <h1 class="comic-heading">Activity Breakdown</h1>
  </div>

  <ComicTabs tabs={periodTabs} bind:active={period} />

  {#if isLoading}
    <BentoGrid columns={4} gap="sm">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
    </BentoGrid>
    <BentoGrid columns={2} gap="md">
      <ComicSkeleton variant="chart" />
      <ComicSkeleton variant="chart" />
    </BentoGrid>
  {:else if aggregates.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No activity data yet"
      description="Activities are tracked automatically when you create conversations, ideas, and projects."
    />
  {:else}
    <BentoGrid columns={4} gap="sm">
      <ComicBentoCard title="Total" icon="📊" neonColor="green" variant="neon">
        <span class="stat-big">{totalActivity}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Time Spent" icon="⏱" neonColor="blue" variant="neon">
        <span class="stat-big">{totalMinutes < 60 ? `${totalMinutes}m` : `${Math.round(totalMinutes / 60)}h`}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Avg / Period" icon="📈" neonColor="yellow" variant="neon">
        <span class="stat-big">{avgPerPeriod}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Peak" icon="🏆" neonColor="orange" variant="neon">
        <span class="stat-big">{peakDay.value}</span>
        <span class="stat-sub">{peakDay.label}</span>
      </ComicBentoCard>
    </BentoGrid>

    <BentoGrid columns={2} gap="md">
      <ComicBentoCard title="Activity Over Time" icon="📊" neonColor="green" variant="neon">
        <RoughChart type="bar" data={chartData} title="" color="#00D26A" width={600} height={300} />
      </ComicBentoCard>

      <ComicBentoCard title="Type Breakdown" icon="🍩" neonColor="purple" variant="neon">
        <RoughChart type="donut" data={breakdownData} title="" width={400} height={300} />
      </ComicBentoCard>
    </BentoGrid>
  {/if}
</div>

<style>
  .activity-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
</style>
