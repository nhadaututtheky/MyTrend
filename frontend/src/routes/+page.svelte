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
  import { Flame, ChevronDown, ChevronUp } from 'lucide-svelte';
  import type {
    Project,
    Activity,
    HeatmapDay,
    TimeSeriesPoint,
    WeeklyInsights,
    WeekComparison,
    TrendingTopic,
  } from '$lib/types';

  let projects = $state<Project[]>([]);
  let activities = $state<Activity[]>([]);
  let heatmapData = $state<HeatmapDay[]>([]);
  let trendData = $state<TimeSeriesPoint[]>([]);
  let weeklyInsights = $state<WeeklyInsights | null>(null);
  let comparison = $state<WeekComparison | null>(null);
  let trendingTopics = $state<TrendingTopic[]>([]);
  let isLoading = $state(true);
  let showAllActivity = $state(false);
  let showHeatmap = $state(false);

  const totalConversations = $derived(projects.reduce((sum, p) => sum + p.total_conversations, 0));
  const totalIdeas = $derived(projects.reduce((sum, p) => sum + p.total_ideas, 0));
  const totalHours = $derived(
    Math.round(projects.reduce((sum, p) => sum + p.total_minutes, 0) / 60),
  );

  const conversationSpark = $derived(trendData.map((d) => d.value));
  const streakDays = $derived(computeStreak(heatmapData));
  const visibleActivities = $derived(showAllActivity ? activities : activities.slice(0, 5));

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
      const [
        projectsResult,
        activitiesResult,
        heatmap,
        insightsResult,
        compareResult,
        trendingResult,
      ] = await Promise.allSettled([
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

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<svelte:head>
  <title>Dashboard - MyTrend</title>
</svelte:head>

<div class="dashboard">
  <div class="page-header">
    <div class="header-left">
      <h1 class="comic-heading">Dashboard</h1>
      <p class="greeting">
        {getGreeting()}!
        {#if streakDays > 0}
          <span class="streak-inline"
            ><Flame size={14} /> <strong>{streakDays}</strong> day streak</span
          >
        {/if}
      </p>
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
      <!-- Hero: Weekly Pulse (full width, accent border) -->
      <ComicBentoCard title="Weekly Pulse" icon="💡" span="full" neonColor="green" variant="neon">
        <div class="hero-pulse">
          <WeeklyPulse {comparison} topTopics={weeklyInsights?.top_topics} streak={streakDays} />
        </div>
      </ComicBentoCard>

      <!-- Inline Stats Row (full width) -->
      <div data-span="full" class="stats-inline">
        <div class="stat-chip">
          <span class="stat-value animate-countUp">{projects.length}</span>
          <span class="stat-label">Projects</span>
          <ComicSparkline
            data={[3, 5, 4, 7, projects.length]}
            color="var(--accent-green)"
            width={48}
            height={16}
          />
        </div>
        <div class="stat-chip">
          <span class="stat-value animate-countUp">{totalConversations}</span>
          <span class="stat-label">Conversations</span>
          <ComicSparkline
            data={conversationSpark.slice(-7)}
            color="var(--accent-blue)"
            width={48}
            height={16}
          />
        </div>
        <div class="stat-chip">
          <span class="stat-value animate-countUp">{totalIdeas}</span>
          <span class="stat-label">Ideas</span>
          <ComicSparkline
            data={[2, 3, 1, 4, totalIdeas]}
            color="var(--accent-yellow)"
            width={48}
            height={16}
          />
        </div>
        <div class="stat-chip">
          <span class="stat-value animate-countUp">{totalHours}</span>
          <span class="stat-label">Hours</span>
          <ComicSparkline
            data={[5, 8, 6, 10, totalHours]}
            color="var(--accent-purple)"
            width={48}
            height={16}
          />
        </div>
      </div>

      <!-- Row 2: Peak Hours + Focus + Trending -->
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

      <!-- Row 3: 30-Day Trend (span 2) + Recent Activity (compact) -->
      <ComicBentoCard title="30-Day Trend" icon="📈" span={2} neonColor="blue" variant="neon">
        <TrendChart data={trendData} title="Daily Activity" />
      </ComicBentoCard>

      <ComicBentoCard title="Recent Activity" icon="⚡">
        <ActivityTimeline activities={visibleActivities} />
        {#if activities.length > 5}
          <button
            class="toggle-btn"
            onclick={() => {
              showAllActivity = !showAllActivity;
            }}
          >
            {#if showAllActivity}
              <ChevronUp size={14} /> Show less
            {:else}
              <ChevronDown size={14} /> Show all ({activities.length})
            {/if}
          </button>
        {/if}
      </ComicBentoCard>

      <!-- Collapsible: Heatmap -->
      <div data-span="full" class="collapsible-section">
        <button
          class="collapse-header"
          onclick={() => {
            showHeatmap = !showHeatmap;
          }}
        >
          <span class="collapse-title">Activity Heatmap</span>
          <span class="collapse-meta"
            >{heatmapData.reduce((s, d) => s + d.count, 0)} activities in the last year</span
          >
          {#if showHeatmap}
            <ChevronUp size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </button>
        {#if showHeatmap}
          <div class="collapse-content">
            <HeatmapCalendar data={heatmapData} />
          </div>
        {/if}
      </div>

      <!-- Projects (full width) -->
      <ComicBentoCard title="Active Projects" icon="📁" span="full">
        {#snippet footer()}
          <a href="/projects" class="see-all">View all projects →</a>
        {/snippet}
        <div class="projects-grid">
          {#each projects.slice(0, 6) as project (project.id)}
            <ProjectCard {project} />
          {:else}
            <p class="empty">No active projects. <a href="/projects/new">Create one!</a></p>
          {/each}
          {#if projects.length > 6}
            <a href="/projects" class="see-all-card">+{projects.length - 6} more</a>
          {/if}
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
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .streak-inline {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--accent-orange);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
  }

  .quick-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .quick-actions a {
    text-decoration: none;
  }

  /* Hero Pulse */
  .hero-pulse {
    position: relative;
  }

  /* Inline Stats Row */
  .stats-inline {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;
  }

  .stat-chip {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-sm);
  }

  .stat-chip:nth-child(1) {
    border-left: 4px solid var(--accent-green);
  }
  .stat-chip:nth-child(2) {
    border-left: 4px solid var(--accent-blue);
  }
  .stat-chip:nth-child(3) {
    border-left: 4px solid var(--accent-yellow);
  }
  .stat-chip:nth-child(4) {
    border-left: 4px solid var(--accent-purple);
  }

  .stat-chip .stat-value {
    font-family: var(--font-display);
    font-size: var(--font-size-3xl);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .stat-chip .stat-label {
    font-size: var(--font-size-2xs);
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  /* Toggle button for activity */
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    padding: var(--spacing-xs) 0;
    margin-top: var(--spacing-sm);
    background: none;
    border: none;
    border-top: 1px dashed var(--border-color);
    color: var(--accent-blue);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .toggle-btn:hover {
    color: var(--accent-green);
  }

  /* Collapsible section */
  .collapsible-section {
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .collapse-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md) var(--spacing-lg);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-primary);
    transition: background var(--transition-fast);
  }

  .collapse-header:hover {
    background: var(--bg-secondary);
  }

  .collapse-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .collapse-meta {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .collapse-content {
    padding: 0 var(--spacing-lg) var(--spacing-lg);
    animation: bentoFadeIn 200ms ease forwards;
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

  .see-all-card {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-comic);
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-muted);
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-xl);
    text-decoration: none;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .see-all-card:hover {
    color: var(--accent-blue);
    border-color: var(--accent-blue);
    text-decoration: none;
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

  .dashboard :global(.bento-card:nth-child(1)) {
    animation-delay: 0ms;
  }
  .dashboard :global(.bento-card:nth-child(2)) {
    animation-delay: 60ms;
  }
  .dashboard :global(.bento-card:nth-child(3)) {
    animation-delay: 120ms;
  }
  .dashboard :global(.bento-card:nth-child(4)) {
    animation-delay: 180ms;
  }
  .dashboard :global(.bento-card:nth-child(5)) {
    animation-delay: 220ms;
  }
  .dashboard :global(.bento-card:nth-child(6)) {
    animation-delay: 260ms;
  }
  .dashboard :global(.bento-card:nth-child(7)) {
    animation-delay: 300ms;
  }
  .dashboard :global(.bento-card:nth-child(8)) {
    animation-delay: 340ms;
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
    }

    .stats-inline {
      flex-wrap: wrap;
    }

    .stat-chip {
      min-width: calc(50% - var(--spacing-sm));
    }
  }
</style>
