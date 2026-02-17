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
  let selectedDay = $state<HeatmapDay | null>(null);

  const totalActivities = $derived(heatmapData.reduce((sum, d) => sum + d.count, 0));
  const activeDays = $derived(heatmapData.filter((d) => d.count > 0).length);
  const bestDay = $derived.by(() => {
    if (heatmapData.length === 0) return { date: '-', count: 0 };
    let best: HeatmapDay | undefined;
    for (const d of heatmapData) {
      if (!best || d.count > best.count) best = d;
    }
    return best ?? { date: '-', count: 0 };
  });
  const currentStreak = $derived(calculateStreak(heatmapData));
  const avgPerActiveDay = $derived(activeDays > 0 ? Math.round(totalActivities / activeDays) : 0);

  function calculateStreak(data: HeatmapDay[]): number {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const day = data[i];
      if (day && day.count > 0) streak++;
      else break;
    }
    return streak;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
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
    <BentoGrid columns={4} gap="sm">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
    </BentoGrid>
    <ComicSkeleton variant="chart" />
  {:else}
    <BentoGrid columns={4} gap="sm">
      <ComicBentoCard title="Total" icon="📊" variant="neon" neonColor="green">
        <span class="stat-big">{totalActivities}</span>
        <span class="stat-sub">{activeDays} active days</span>
      </ComicBentoCard>

      <ComicBentoCard title="Avg / Day" icon="📈" variant="neon" neonColor="blue">
        <span class="stat-big">{avgPerActiveDay}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Best Day" icon="🏆" variant="neon" neonColor="yellow">
        <span class="stat-big">{bestDay.count}</span>
        <span class="stat-sub">{bestDay.date !== '-' ? formatDate(bestDay.date) : '-'}</span>
      </ComicBentoCard>

      <ComicBentoCard title="Streak" icon="🔥" variant="neon" neonColor="orange">
        <span class="stat-big">{currentStreak}</span>
        <span class="stat-sub">days</span>
      </ComicBentoCard>
    </BentoGrid>

    {#if selectedDay}
      <div class="day-detail">
        <span class="day-date">{formatDate(selectedDay.date)}</span>
        <span class="day-count">{selectedDay.count} activit{selectedDay.count !== 1 ? 'ies' : 'y'}</span>
      </div>
    {/if}

    <div class="heatmap-container sketch-border">
      <HeatmapCalendar data={heatmapData} />
    </div>

    <div class="legend">
      <span class="legend-label">Less</span>
      {#each [0, 1, 2, 3, 4] as level}
        <span class="legend-cell level-{level}" aria-label="Level {level}"></span>
      {/each}
      <span class="legend-label">More</span>
    </div>
  {/if}
</div>

<style>
  .heatmap-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
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

  .day-detail {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-card);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    font-family: var(--font-comic);
    animation: sketchFadeIn 0.2s ease;
  }
  .day-date { font-weight: 700; font-size: 0.85rem; }
  .day-count { font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono, monospace); }

  .heatmap-container {
    padding: var(--spacing-md);
    background: var(--bg-card);
    overflow-x: auto;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .legend-label { margin: 0 4px; }
  .legend-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid var(--border-color);
  }
  .level-0 { background: var(--bg-secondary); }
  .level-1 { background: rgba(0, 210, 106, 0.25); }
  .level-2 { background: rgba(0, 210, 106, 0.5); }
  .level-3 { background: rgba(0, 210, 106, 0.75); }
  .level-4 { background: var(--accent-green); }

  @media (max-width: 768px) {
    :global(.heatmap-page .bento-grid) {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
</style>
