<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchProjects } from '$lib/api/projects';
  import { fetchActivities, fetchHeatmapData } from '$lib/api/activity';
  import { fetchWeeklyInsights, fetchWeekComparison } from '$lib/api/insights';
  import { fetchTrendingTopics } from '$lib/api/topics';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicSparkline from '$lib/components/comic/ComicSparkline.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ActivityTimeline from '$lib/components/dashboard/ActivityTimeline.svelte';
  import ProjectCard from '$lib/components/dashboard/ProjectCard.svelte';
  import TrendChart from '$lib/components/dashboard/TrendChart.svelte';
  import WeeklyPulse from '$lib/components/dashboard/WeeklyPulse.svelte';
  import PeakHoursChart from '$lib/components/dashboard/PeakHoursChart.svelte';
  import FocusBreakdown from '$lib/components/dashboard/FocusBreakdown.svelte';
  import MiniTrending from '$lib/components/dashboard/MiniTrending.svelte';
  import HeatmapCalendar from '$lib/components/comic/HeatmapCalendar.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type {
    Project, Activity, HeatmapDay, TimeSeriesPoint,
    WeeklyInsights, WeekComparison, TrendingTopic,
  } from '$lib/types';

  let projects = $state<Project[]>([]);
  let activities = $state<Activity[]>([]);
  let heatmapData = $state<HeatmapDay[]>([]);
  let trendData = $state<TimeSeriesPoint[]>([]);
  let weeklyInsights = $state<WeeklyInsights | null>(null);
  let comparison = $state<WeekComparison | null>(null);
  let trendingTopics = $state<TrendingTopic[]>([]);
  let isLoading = $state(true);

  const totalConversations = $derived(projects.reduce((sum, p) => sum + p.total_conversations, 0));
  const totalIdeas = $derived(projects.reduce((sum, p) => sum + p.total_ideas, 0));
  const totalHours = $derived(Math.round(projects.reduce((sum, p) => sum + p.total_minutes, 0) / 60));

  const conversationSpark = $derived(trendData.map((d) => d.value));
  const streakDays = $derived(computeStreak(heatmapData));

  function computeStreak(data: HeatmapDay[]): number {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const day = data[i];
      if (day && day.count > 0) streak++;
      else break;
    }
    return streak;
  }

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  let unsubscribe: (() => void) | undefined;

  onMount(async () => {
    try {
      const [projectsResult, activitiesResult, heatmap, insightsResult, compareResult, trendingResult] =
        await Promise.allSettled([
          fetchProjects(1, 'active'),
          fetchActivities(1),
          fetchHeatmapData(),
          fetchWeeklyInsights(),
          fetchWeekComparison('week'),
          fetchTrendingTopics(5),
        ]);

      if (projectsResult.status === 'fulfilled') {
        projects = projectsResult.value.items;
      }
      if (activitiesResult.status === 'fulfilled') {
        activities = activitiesResult.value.items.slice(0, 10);
      }
      if (heatmap.status === 'fulfilled') {
        heatmapData = heatmap.value;
        trendData = heatmap.value.slice(-30).map((d) => ({ date: d.date, value: d.count }));
      }
      if (insightsResult.status === 'fulfilled') {
        weeklyInsights = insightsResult.value;
      }
      if (compareResult.status === 'fulfilled') {
        comparison = compareResult.value;
      }
      if (trendingResult.status === 'fulfilled') {
        trendingTopics = trendingResult.value;
      }
    } catch (err: unknown) {
      console.error('[Dashboard]', err);
    } finally {
      isLoading = false;
    }

    try {
      unsubscribe = await pb.collection('activities').subscribe('*', (e) => {
        if (e.action === 'create') {
          activities = [e.record as unknown as Activity, ...activities].slice(0, 10);
        }
      });
    } catch (err: unknown) {
      console.error('[Dashboard] Realtime subscribe failed:', err);
    }
  });

  onDestroy(() => { unsubscribe?.(); });
</script>

<svelte:head>
  <title>Dashboard - MyTrend</title>
</svelte:head>

<div class="dashboard">
  <div class="page-header">
    <div>
      <h1 class="comic-heading">Dashboard</h1>
      <p class="greeting">{getGreeting()}! You have <strong>{streakDays}</strong> day streak</p>
    </div>
    <div class="quick-actions">
      <a href="/ideas/new"><ComicButton variant="outline" size="sm">Quick Idea</ComicButton></a>
      <a href="/projects/new"><ComicButton variant="primary" size="sm">New Project</ComicButton></a>
    </div>
  </div>

  {#if isLoading}
    <BentoGrid columns={3} gap="md">
      <div data-span="full"><ComicSkeleton variant="card" height="80px" /></div>
      <div data-span="2"><ComicSkeleton variant="card" height="100px" /></div>
      <div><ComicSkeleton variant="card" height="100px" /></div>
      <div><ComicSkeleton variant="chart" /></div>
      <div><ComicSkeleton variant="chart" /></div>
      <div><ComicSkeleton variant="card" height="180px" /></div>
      <div data-span="2"><ComicSkeleton variant="chart" /></div>
      <div><ComicSkeleton variant="card" height="180px" /></div>
    </BentoGrid>
  {:else}
    <BentoGrid columns={3} gap="md">
      <!-- Row 1: Weekly Pulse (full width) -->
      <ComicBentoCard title="Weekly Pulse" icon="💡" span="full" neonColor="green" variant="neon">
        <WeeklyPulse
          {comparison}
          topTopics={weeklyInsights?.top_topics}
          streak={streakDays}
        />
      </ComicBentoCard>

      <!-- Row 2: Overview Stats (span 2) + Streak -->
      <ComicBentoCard title="Overview" icon="📊" span={2} neonColor="green" variant="neon">
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-value animate-countUp">{projects.length}</span>
            <span class="stat-label">Projects</span>
            <ComicSparkline data={[3, 5, 4, 7, projects.length]} color="var(--accent-green)" width={64} height={20} />
          </div>
          <div class="stat-item">
            <span class="stat-value animate-countUp">{totalConversations}</span>
            <span class="stat-label">Conversations</span>
            <ComicSparkline data={conversationSpark.slice(-7)} color="var(--accent-blue)" width={64} height={20} />
          </div>
          <div class="stat-item">
            <span class="stat-value animate-countUp">{totalIdeas}</span>
            <span class="stat-label">Ideas</span>
            <ComicSparkline data={[2, 3, 1, 4, totalIdeas]} color="var(--accent-yellow)" width={64} height={20} />
          </div>
          <div class="stat-item">
            <span class="stat-value animate-countUp">{totalHours}</span>
            <span class="stat-label">Hours</span>
            <ComicSparkline data={[5, 8, 6, 10, totalHours]} color="var(--accent-purple)" width={64} height={20} fill />
          </div>
        </div>
      </ComicBentoCard>

      <ComicBentoCard title="Streak" icon="🔥" neonColor="orange" variant="neon">
        <div class="streak-display">
          <span class="streak-number">{streakDays}</span>
          <span class="streak-unit">days</span>
        </div>
        <div class="streak-bar">
          {#each Array(7) as _, i}
            {@const active = i < Math.min(streakDays, 7)}
            <div class="streak-dot" class:active></div>
          {/each}
        </div>
      </ComicBentoCard>

      <!-- Row 3: Peak Hours + Focus Breakdown + Mini Trending -->
      <ComicBentoCard title="Peak Hours" icon="⏰" neonColor="blue" variant="neon">
        <PeakHoursChart peakHours={weeklyInsights?.peak_hours} />
      </ComicBentoCard>

      <ComicBentoCard title="Focus" icon="🎯" neonColor="purple" variant="neon">
        <FocusBreakdown breakdown={weeklyInsights?.focus_breakdown} />
      </ComicBentoCard>

      <ComicBentoCard title="Trending" icon="🔥" neonColor="orange" variant="neon">
        {#snippet footer()}
          <a href="/trends" class="see-all">View all trends →</a>
        {/snippet}
        <MiniTrending topics={trendingTopics} />
      </ComicBentoCard>

      <!-- Row 4: 30-Day Trend (span 2) + Activity -->
      <ComicBentoCard title="30-Day Trend" icon="📈" span={2} neonColor="blue" variant="neon">
        <TrendChart data={trendData} title="Daily Activity" />
      </ComicBentoCard>

      <ComicBentoCard title="Recent Activity" icon="⚡">
        <ActivityTimeline {activities} />
      </ComicBentoCard>

      <!-- Row 5: Heatmap (full width) -->
      <ComicBentoCard title="Activity Heatmap" icon="🗓" span="full">
        <HeatmapCalendar data={heatmapData} />
      </ComicBentoCard>

      <!-- Row 6: Projects (full width) -->
      <ComicBentoCard title="Active Projects" icon="📁" span="full">
        {#snippet footer()}
          <a href="/projects" class="see-all">View all projects →</a>
        {/snippet}
        <div class="projects-grid">
          {#each projects as project (project.id)}
            <ProjectCard {project} />
          {:else}
            <p class="empty">No active projects. <a href="/projects/new">Create one!</a></p>
          {/each}
        </div>
      </ComicBentoCard>
    </BentoGrid>
  {/if}
</div>

<style>
  .dashboard {
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

  .greeting {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin: var(--spacing-xs) 0 0;
  }

  .quick-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .quick-actions a {
    text-decoration: none;
  }

  /* Stats Row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-md);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: var(--font-size-5xl);
    font-weight: 800;
    line-height: var(--leading-tight);
    letter-spacing: -0.02em;
  }

  .stat-label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-xs);
  }

  /* Streak */
  .streak-display {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }

  .streak-number {
    font-family: var(--font-display);
    font-size: var(--font-size-6xl);
    font-weight: 800;
    line-height: var(--leading-tight);
    letter-spacing: -0.03em;
    color: var(--accent-orange);
  }

  .streak-unit {
    font-size: var(--font-size-md);
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .streak-bar {
    display: flex;
    gap: 4px;
  }

  .streak-dot {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--border-color);
    transition: background var(--transition-fast);
  }

  .streak-dot.active {
    background: var(--accent-orange);
  }

  /* Projects */
  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--spacing-md);
  }

  .see-all {
    font-size: var(--font-size-md);
    color: var(--accent-blue);
    text-decoration: none;
    font-weight: 700;
  }

  .see-all:hover {
    text-decoration: underline;
  }

  .empty {
    color: var(--text-muted);
    font-size: var(--font-size-base);
  }

  /* Stagger animation for bento cards */
  @keyframes bentoFadeIn {
    from {
      opacity: 0;
      transform: translate(4px, 4px);
    }
    to {
      opacity: 1;
      transform: translate(0, 0);
    }
  }

  .dashboard :global(.bento-card) {
    animation: bentoFadeIn 280ms ease backwards;
  }

  .dashboard :global(.bento-card:nth-child(1)) { animation-delay: 0ms; }
  .dashboard :global(.bento-card:nth-child(2)) { animation-delay: 60ms; }
  .dashboard :global(.bento-card:nth-child(3)) { animation-delay: 120ms; }
  .dashboard :global(.bento-card:nth-child(4)) { animation-delay: 180ms; }
  .dashboard :global(.bento-card:nth-child(5)) { animation-delay: 220ms; }
  .dashboard :global(.bento-card:nth-child(6)) { animation-delay: 260ms; }
  .dashboard :global(.bento-card:nth-child(7)) { animation-delay: 300ms; }
  .dashboard :global(.bento-card:nth-child(8)) { animation-delay: 340ms; }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
    }

    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
