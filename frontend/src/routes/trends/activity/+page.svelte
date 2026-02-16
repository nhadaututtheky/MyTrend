<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchAggregates } from '$lib/api/activity';
  import RoughChart from '$lib/components/comic/RoughChart.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import type { ActivityAggregate, ChartDataPoint } from '$lib/types';

  let period = $state('day');
  let aggregates = $state<ActivityAggregate[]>([]);
  let isLoading = $state(true);

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

  onMount(() => {
    loadData();
  });

  $effect(() => {
    // Re-fetch when period changes
    void period;
    loadData();
  });
</script>

<svelte:head>
  <title>Activity Trends - MyTrend</title>
</svelte:head>

<div class="activity-page">
  <h1 class="comic-heading">Activity Breakdown</h1>

  <ComicTabs tabs={periodTabs} bind:active={period} />

  {#if isLoading}
    <p class="loading">Loading...</p>
  {:else}
    <div class="charts-grid">
      <ComicCard>
        <h2 class="section-title">Activity Over Time</h2>
        <RoughChart type="bar" data={chartData} title="" color="#00D26A" width={600} height={300} />
      </ComicCard>

      <ComicCard>
        <h2 class="section-title">Activity Type Breakdown</h2>
        <RoughChart type="donut" data={breakdownData} title="" width={400} height={300} />
      </ComicCard>
    </div>
  {/if}
</div>

<style>
  .activity-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-lg);
  }

  .loading {
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-2xl);
  }

  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
