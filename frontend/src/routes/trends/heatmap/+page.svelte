<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchHeatmapData } from '$lib/api/activity';
  import HeatmapCalendar from '$lib/components/comic/HeatmapCalendar.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import StatsGrid from '$lib/components/dashboard/StatsGrid.svelte';
  import type { HeatmapDay } from '$lib/types';

  let heatmapData = $state<HeatmapDay[]>([]);
  let isLoading = $state(true);

  let stats = $derived([
    {
      label: 'Total Activities',
      value: heatmapData.reduce((sum, d) => sum + d.count, 0),
      color: 'var(--accent-green)',
    },
    {
      label: 'Active Days',
      value: heatmapData.filter((d) => d.count > 0).length,
      color: 'var(--accent-blue)',
    },
    {
      label: 'Best Day',
      value: Math.max(0, ...heatmapData.map((d) => d.count)),
      color: 'var(--accent-yellow)',
    },
    {
      label: 'Current Streak',
      value: calculateStreak(heatmapData),
      color: 'var(--accent-orange)',
    },
  ]);

  function calculateStreak(data: HeatmapDay[]): number {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const day = data[i];
      if (day && day.count > 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  onMount(async () => {
    try {
      heatmapData = await fetchHeatmapData();
    } catch (err: unknown) {
      console.error('[Trends/Heatmap]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Activity Heatmap - MyTrend</title>
</svelte:head>

<div class="heatmap-page">
  <h1 class="comic-heading">Activity Heatmap</h1>

  {#if isLoading}
    <p class="loading">Loading heatmap...</p>
  {:else}
    <StatsGrid {stats} />

    <ComicCard>
      <HeatmapCalendar data={heatmapData} />
    </ComicCard>
  {/if}
</div>

<style>
  .heatmap-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .loading {
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-2xl);
  }
</style>
