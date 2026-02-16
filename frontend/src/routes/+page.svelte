<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { fetchProjects } from '$lib/api/projects';
  import { fetchActivities, fetchHeatmapData } from '$lib/api/activity';
  import StatsGrid from '$lib/components/dashboard/StatsGrid.svelte';
  import ActivityTimeline from '$lib/components/dashboard/ActivityTimeline.svelte';
  import ProjectCard from '$lib/components/dashboard/ProjectCard.svelte';
  import TrendChart from '$lib/components/dashboard/TrendChart.svelte';
  import HeatmapCalendar from '$lib/components/comic/HeatmapCalendar.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { Project, Activity, HeatmapDay, TimeSeriesPoint } from '$lib/types';

  let projects = $state<Project[]>([]);
  let activities = $state<Activity[]>([]);
  let heatmapData = $state<HeatmapDay[]>([]);
  let trendData = $state<TimeSeriesPoint[]>([]);
  let isLoading = $state(true);

  const stats = $derived([
    { label: 'Projects', value: projects.length, icon: '📁', color: 'var(--accent-green)' },
    {
      label: 'Conversations',
      value: projects.reduce((sum, p) => sum + p.total_conversations, 0),
      icon: '💬',
      color: 'var(--accent-blue)',
    },
    {
      label: 'Ideas',
      value: projects.reduce((sum, p) => sum + p.total_ideas, 0),
      icon: '💡',
      color: 'var(--accent-yellow)',
    },
    {
      label: 'Hours',
      value: Math.round(projects.reduce((sum, p) => sum + p.total_minutes, 0) / 60),
      icon: '⏱',
      color: 'var(--accent-purple)',
    },
  ]);

  let unsubscribe: (() => void) | undefined;

  onMount(async () => {
    try {
      const [projectsResult, activitiesResult, heatmap] = await Promise.allSettled([
        fetchProjects(1, 'active'),
        fetchActivities(1),
        fetchHeatmapData(),
      ]);

      if (projectsResult.status === 'fulfilled') {
        projects = projectsResult.value.items;
      }
      if (activitiesResult.status === 'fulfilled') {
        activities = activitiesResult.value.items.slice(0, 10);
      }
      if (heatmap.status === 'fulfilled') {
        heatmapData = heatmap.value;
        // Build trend from heatmap - last 30 days
        trendData = heatmap.value.slice(-30).map((d) => ({ date: d.date, value: d.count }));
      }
    } catch (err: unknown) {
      console.error('[Dashboard]', err);
    } finally {
      isLoading = false;
    }

    // Real-time subscription for activities
    unsubscribe = await pb.collection('activities').subscribe('*', (e) => {
      if (e.action === 'create') {
        activities = [e.record as unknown as Activity, ...activities].slice(0, 10);
      }
    });
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
    <h1 class="comic-heading">Dashboard</h1>
  </div>

  {#if isLoading}
    <div class="loading">Loading...</div>
  {:else}
    <StatsGrid {stats} />

    <div class="grid-layout">
      <div class="col-main">
        <ComicCard>
          <h2 class="section-title">Activity Heatmap</h2>
          <HeatmapCalendar data={heatmapData} />
        </ComicCard>

        <ComicCard>
          <h2 class="section-title">30-Day Trend</h2>
          <TrendChart data={trendData} title="Daily Activity" />
        </ComicCard>

        <div class="projects-section">
          <h2 class="section-title">Active Projects</h2>
          <div class="projects-grid">
            {#each projects as project (project.id)}
              <ProjectCard {project} />
            {:else}
              <p class="empty">No active projects. <a href="/projects/new">Create one!</a></p>
            {/each}
          </div>
        </div>
      </div>

      <div class="col-side">
        <ComicCard>
          <h2 class="section-title">Recent Activity</h2>
          <ActivityTimeline {activities} />
        </ComicCard>
      </div>
    </div>
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
    align-items: center;
    justify-content: space-between;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-2xl);
    color: var(--text-muted);
    font-size: 1.1rem;
  }

  .grid-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: var(--spacing-lg);
    margin-top: var(--spacing-md);
  }

  .col-main {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    min-width: 0;
  }

  .col-side {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-md);
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  @media (max-width: 1024px) {
    .grid-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
