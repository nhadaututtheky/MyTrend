<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchHeatmapData } from '$lib/api/activity';
  import HeatmapCalendar from '$lib/components/comic/HeatmapCalendar.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import type { HeatmapDay } from '$lib/types';

  let heatmapData = $state<HeatmapDay[]>([]);
  let isLoading = $state(true);

  const totalActivities = $derived(heatmapData.reduce((sum, d) => sum + d.count, 0));
  const activeDays = $derived(heatmapData.filter((d) => d.count > 0).length);
  const bestDay = $derived(Math.max(0, ...heatmapData.map((d) => d.count)));
  const currentStreak = $derived(calculateStreak(heatmapData));

  function calculateStreak(data: HeatmapDay[]): number {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const day = data[i];
      if (day && day.count > 0) streak++;
      else break;
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
    <BentoGrid columns={4} gap="md">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
      <div data-span="full"><ComicSkeleton variant="chart" /></div>
    </BentoGrid>
  {:else}
    <BentoGrid columns={4} gap="md">
      <ComicBentoCard title="Total" icon="📊" variant="neon" neonColor="green">
        <span class="stat-big">{totalActivities}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Active Days" icon="📅" variant="neon" neonColor="blue">
        <span class="stat-big">{activeDays}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Best Day" icon="🏆" variant="neon" neonColor="yellow">
        <span class="stat-big">{bestDay}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Streak" icon="🔥" variant="neon" neonColor="orange">
        <span class="stat-big">{currentStreak}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Activity Heatmap" icon="🗓" span="full">
        <HeatmapCalendar data={heatmapData} />
      </ComicBentoCard>
    </BentoGrid>
  {/if}
</div>

<style>
  .heatmap-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .stat-big {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }
</style>
