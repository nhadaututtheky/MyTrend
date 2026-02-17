<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fetchAggregates, fetchHeatmapData } from '$lib/api/activity';
  import pb from '$lib/config/pocketbase';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import type { HeatmapDay, Topic } from '$lib/types';

  let isLoading = $state(true);
  let todayCount = $state(0);
  let weekCount = $state(0);
  let streak = $state(0);
  let topTopics = $state<Array<{ name: string; count: number }>>([]);

  function calculateStreak(data: HeatmapDay[]): number {
    let s = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const day = data[i];
      if (day && day.count > 0) s++;
      else break;
    }
    return s;
  }

  const sections = [
    {
      id: 'activity',
      label: 'Activity',
      icon: '📊',
      description: 'Daily breakdown, hours worked, productivity trends.',
      href: '/trends/activity',
      neonColor: 'green' as const,
    },
    {
      id: 'topics',
      label: 'Topics',
      icon: '💬',
      description: 'Most discussed topics across conversations and ideas.',
      href: '/trends/topics',
      neonColor: 'purple' as const,
    },
    {
      id: 'heatmap',
      label: 'Heatmap',
      icon: '🗓',
      description: 'GitHub-style calendar of your activity over the year.',
      href: '/trends/heatmap',
      neonColor: 'blue' as const,
    },
  ];

  onMount(async () => {
    try {
      const [dayAggs, heatmap, topicsResult] = await Promise.all([
        fetchAggregates('day'),
        fetchHeatmapData(),
        pb.collection('topics').getList<Topic>(1, 5, { sort: '-mention_count' }),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const todayAgg = dayAggs.find((a) => a.period_start.startsWith(today));
      todayCount = todayAgg?.total_count ?? 0;
      weekCount = dayAggs.slice(0, 7).reduce((s, a) => s + a.total_count, 0);
      streak = calculateStreak(heatmap);
      topTopics = topicsResult.items.map((t) => ({ name: t.name, count: t.mention_count }));
    } catch (err: unknown) {
      console.error('[Trends]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Trends - MyTrend</title>
</svelte:head>

<div class="trends-page">
  <h1 class="comic-heading">Trends</h1>

  {#if isLoading}
    <BentoGrid columns={3} gap="md">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
    </BentoGrid>
  {:else}
    <BentoGrid columns={3} gap="md">
      <ComicBentoCard title="Today" icon="⚡" neonColor="green" variant="neon">
        <span class="stat-value">{todayCount}</span>
        <span class="stat-label">activities</span>
      </ComicBentoCard>

      <ComicBentoCard title="This Week" icon="📅" neonColor="blue" variant="neon">
        <span class="stat-value">{weekCount}</span>
        <span class="stat-label">activities</span>
      </ComicBentoCard>

      <ComicBentoCard title="Streak" icon="🔥" neonColor="orange" variant="neon">
        <span class="stat-value">{streak}</span>
        <span class="stat-label">days</span>
      </ComicBentoCard>
    </BentoGrid>
  {/if}

  {#if topTopics.length > 0}
    <div class="top-topics">
      <h2 class="sub-heading">Hot Topics</h2>
      <div class="topics-row">
        {#each topTopics as topic (topic.name)}
          <span class="topic-chip">{topic.name} <span class="topic-count">{topic.count}</span></span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="trends-grid">
    {#each sections as section (section.id)}
      <button class="trend-card" onclick={() => goto(section.href)}>
        <ComicCard variant="standard">
          <div class="card-inner">
            <span class="card-icon">{section.icon}</span>
            <h2 class="card-title">{section.label}</h2>
            <p class="card-desc">{section.description}</p>
          </div>
        </ComicCard>
      </button>
    {/each}
  </div>
</div>

<style>
  .trends-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    font-family: var(--font-mono, monospace);
  }
  .stat-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sub-heading {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--spacing-sm);
    color: var(--text-secondary);
  }

  .top-topics { margin-top: calc(-1 * var(--spacing-sm)); }
  .topics-row { display: flex; flex-wrap: wrap; gap: var(--spacing-xs); }

  .topic-chip {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    padding: 4px 10px;
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .topic-count {
    font-size: 0.65rem;
    background: var(--accent-purple);
    color: #fff;
    padding: 1px 5px;
    border-radius: 8px;
  }

  .trends-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--spacing-md);
  }

  .trend-card {
    all: unset;
    cursor: pointer;
    display: block;
    transition: transform var(--transition-fast);
  }
  .trend-card:hover { transform: translateY(-2px); }
  .trend-card:focus-visible {
    outline: 2px solid var(--accent-green);
    outline-offset: 2px;
    border-radius: var(--radius-sketch);
  }

  .card-inner {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    text-align: center;
    padding: var(--spacing-md);
  }
  .card-icon { font-size: 2rem; }
  .card-title { font-size: 1rem; text-transform: uppercase; margin: 0; }
  .card-desc { font-size: 0.8rem; color: var(--text-secondary); margin: 0; }
</style>
