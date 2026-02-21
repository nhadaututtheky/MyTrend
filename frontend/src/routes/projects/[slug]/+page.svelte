<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchProjectBySlug } from '$lib/api/projects';
  import { fetchConversations } from '$lib/api/conversations';
  import { fetchIdeas } from '$lib/api/ideas';
  import { fetchPlans } from '$lib/api/plans';
  import { fetchActivities, fetchAggregates } from '$lib/api/activity';
  import { fetchTasks } from '$lib/api/tasks';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicSparkline from '$lib/components/comic/ComicSparkline.svelte';
  import ActivityTimeline from '$lib/components/dashboard/ActivityTimeline.svelte';
  import DNACard from '$lib/components/dashboard/DNACard.svelte';
  import { formatRelative, formatDate } from '$lib/utils/date';
  import type {
    Project,
    Conversation,
    Idea,
    Plan,
    Activity,
    ActivityAggregate,
    ClaudeTask,
  } from '$lib/types';

  let slug = $state('');
  let project = $state<Project | null>(null);
  let conversations = $state<Conversation[]>([]);
  let ideas = $state<Idea[]>([]);
  let plans = $state<Plan[]>([]);
  let activities = $state<Activity[]>([]);
  let tasks = $state<ClaudeTask[]>([]);
  let aggregates = $state<ActivityAggregate[]>([]);
  let isLoading = $state(true);
  let activeTab = $state('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'activity', label: 'Activity' },
    { id: 'plans', label: 'Plans' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'dna', label: 'DNA' },
  ];

  $effect(() => {
    const unsub = page.subscribe((p) => {
      slug = p.params['slug'] ?? '';
    });
    return unsub;
  });

  const stats = $derived(
    project
      ? [
          { label: 'Conversations', value: project.total_conversations, color: 'blue' as const },
          { label: 'Ideas', value: project.total_ideas, color: 'yellow' as const },
          {
            label: 'Hours',
            value: Math.round(project.total_minutes / 60),
            color: 'purple' as const,
          },
          { label: 'Plans', value: plans.length, color: 'green' as const },
        ]
      : [],
  );

  // Build sparkline data from daily aggregates (last 14 days)
  const sparklineData = $derived.by(() => {
    if (aggregates.length === 0) return [] as number[];
    const sorted = [...aggregates].sort(
      (a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime(),
    );
    return sorted.map((a) => a.total_count);
  });

  const PLAN_STATUS_COLORS: Record<
    string,
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

  const TASK_STATUS_COLORS: Record<string, 'green' | 'yellow' | 'orange'> = {
    pending: 'yellow',
    in_progress: 'orange',
    completed: 'green',
  };

  function getModelShort(model: string): string {
    if (!model) return '';
    if (model.includes('opus')) return 'opus';
    if (model.includes('sonnet')) return 'sonnet';
    if (model.includes('haiku')) return 'haiku';
    return model.split('-')[1] ?? model;
  }

  // Filter GitHub activities (commits, PRs, issues)
  const githubActivities = $derived(
    activities.filter((a) => a.type === 'commit' || a.type === 'pr' || a.type === 'issue'),
  );

  // Group tasks by status
  const tasksByStatus = $derived.by(() => {
    const groups: Record<string, ClaudeTask[]> = {
      in_progress: [],
      pending: [],
      completed: [],
    };
    for (const t of tasks) {
      const bucket = groups[t.status];
      if (bucket) bucket.push(t);
    }
    return groups;
  });

  onMount(async () => {
    try {
      project = await fetchProjectBySlug(slug);
      if (project) {
        const [convRes, ideasRes, plansRes, actRes, aggRes, tasksRes] = await Promise.allSettled([
          fetchConversations(1, project.id),
          fetchIdeas(1, project.id),
          fetchPlans(1, { projectId: project.id }),
          fetchActivities(1, project.id),
          fetchAggregates('day', project.id),
          fetchTasks({ projectDir: project.name, perPage: 100 }),
        ]);
        if (convRes.status === 'fulfilled') conversations = convRes.value.items;
        if (ideasRes.status === 'fulfilled') ideas = ideasRes.value.items;
        if (plansRes.status === 'fulfilled') plans = plansRes.value.items;
        if (actRes.status === 'fulfilled') activities = actRes.value.items;
        if (aggRes.status === 'fulfilled') aggregates = aggRes.value;
        if (tasksRes.status === 'fulfilled') tasks = tasksRes.value.items;
      }
    } catch (err: unknown) {
      console.error('[Project]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head><title>{project?.name ?? 'Project'} - MyTrend</title></svelte:head>

<div class="project-page">
  {#if isLoading}
    <ComicSkeleton variant="text" />
    <BentoGrid columns={4} gap="md">
      {#each Array(4) as _}
        <ComicSkeleton variant="card" height="100px" />
      {/each}
    </BentoGrid>
    <ComicSkeleton variant="card" height="200px" />
  {:else if !project}
    <ComicEmptyState
      illustration="error"
      message="Project not found"
      description={'No project with slug "' + slug + '"'}
      actionLabel="Back to Projects"
      actionHref="/projects"
    />
  {:else}
    <div class="project-header">
      <span class="icon" style:background={project.color}>{project.icon}</span>
      <div class="header-info">
        <div class="header-top">
          <h1 class="comic-heading">{project.name}</h1>
          <ComicBadge color={project.status === 'active' ? 'green' : 'blue'}
            >{project.status}</ComicBadge
          >
        </div>
        {#if project.description}<p class="description">{project.description}</p>{/if}
        {#if project.last_activity}
          <span class="last-active">Last active {formatRelative(project.last_activity)}</span>
        {/if}
      </div>
    </div>

    <ComicTabs {tabs} bind:active={activeTab} />

    <div class="tab-content">
      {#if activeTab === 'overview'}
        <!-- Stats Grid -->
        <BentoGrid columns={4} gap="md">
          {#each stats as stat (stat.label)}
            <ComicBentoCard title={stat.label} variant="neon" neonColor={stat.color}>
              <div class="stat-cell">
                <span class="stat-big">{stat.value}</span>
                {#if sparklineData.length > 1 && stat.label === 'Conversations'}
                  <ComicSparkline
                    data={sparklineData}
                    width={80}
                    height={24}
                    color="var(--accent-blue)"
                    fill
                  />
                {/if}
              </div>
            </ComicBentoCard>
          {/each}
        </BentoGrid>

        <!-- Tech Stack -->
        {#if project.tech_stack.length > 0}
          <ComicCard>
            <h3 class="section-title">Tech Stack</h3>
            <div class="tags">
              {#each project.tech_stack as tech (tech)}
                <ComicBadge color="blue" size="sm">{tech}</ComicBadge>
              {/each}
            </div>
          </ComicCard>
        {/if}

        <!-- GitHub -->
        {#if project.github_repo}
          <ComicCard>
            <h3 class="section-title">GitHub</h3>
            <div class="github-info">
              <a
                href={'https://github.com/' + project.github_repo}
                target="_blank"
                rel="noopener noreferrer"
                class="github-link"
              >
                {project.github_repo}
              </a>
              {#if project.github_last_synced}
                <span class="mini-meta">synced {formatRelative(project.github_last_synced)}</span>
              {/if}
            </div>
            {#if githubActivities.length > 0}
              <ActivityTimeline activities={githubActivities.slice(0, 5)} />
            {:else}
              <p class="empty-hint">No GitHub activity synced yet.</p>
            {/if}
          </ComicCard>
        {/if}

        <!-- Recent Activity -->
        {#if activities.length > 0}
          <ComicCard>
            <h3 class="section-title">Recent Activity</h3>
            <ActivityTimeline activities={activities.slice(0, 5)} />
          </ComicCard>
        {/if}

        <!-- Recent Plans -->
        {#if plans.length > 0}
          <ComicCard>
            <h3 class="section-title">Recent Plans</h3>
            <div class="mini-list">
              {#each plans.slice(0, 3) as plan (plan.id)}
                <a href="/plans/{plan.id}" class="mini-item">
                  <ComicBadge color={PLAN_STATUS_COLORS[plan.status] ?? 'blue'} size="sm"
                    >{plan.status}</ComicBadge
                  >
                  <span class="mini-title">{plan.title}</span>
                  <span class="mini-meta">{formatRelative(plan.created)}</span>
                </a>
              {/each}
            </div>
          </ComicCard>
        {/if}
      {:else if activeTab === 'conversations'}
        {#if conversations.length === 0}
          <ComicEmptyState
            illustration="inbox"
            message="No conversations"
            description="Start a conversation in the Hub for this project."
          />
        {:else}
          <div class="list">
            {#each conversations as conv, i (conv.id)}
              <a
                href="/conversations/{conv.id}"
                class="list-item"
                style:animation-delay="{i * 30}ms"
              >
                <ComicCard variant="standard">
                  <strong>{conv.title}</strong>
                  <span class="meta"
                    >{conv.message_count} msgs - {formatRelative(conv.started_at)}</span
                  >
                </ComicCard>
              </a>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'ideas'}
        {#if ideas.length === 0}
          <ComicEmptyState
            illustration="empty"
            message="No ideas"
            description="Capture ideas for this project."
            actionLabel="New Idea"
            actionHref="/ideas/new"
          />
        {:else}
          <div class="list">
            {#each ideas as idea, i (idea.id)}
              <a href="/ideas/{idea.id}" class="list-item" style:animation-delay="{i * 30}ms">
                <ComicCard variant="standard">
                  <strong>{idea.title}</strong>
                  <div class="idea-badges">
                    <ComicBadge color="orange" size="sm">{idea.type}</ComicBadge>
                    <ComicBadge color="green" size="sm">{idea.status}</ComicBadge>
                  </div>
                </ComicCard>
              </a>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'activity'}
        {#if activities.length === 0}
          <ComicEmptyState
            illustration="inbox"
            message="No activity"
            description="Activities are logged automatically as you work."
          />
        {:else}
          <ActivityTimeline {activities} />
        {/if}
      {:else if activeTab === 'plans'}
        {#if plans.length === 0}
          <ComicEmptyState
            illustration="empty"
            message="No plans"
            description="Plans are extracted from conversations automatically."
          />
        {:else}
          <div class="list">
            {#each plans as plan, i (plan.id)}
              <a href="/plans/{plan.id}" class="list-item" style:animation-delay="{i * 30}ms">
                <ComicCard variant="standard">
                  <div class="plan-header">
                    <strong>{plan.title}</strong>
                    <div class="plan-badges">
                      <ComicBadge color={PLAN_STATUS_COLORS[plan.status] ?? 'blue'} size="sm"
                        >{plan.status}</ComicBadge
                      >
                      <ComicBadge color="purple" size="sm">{plan.plan_type}</ComicBadge>
                      {#if plan.priority === 'critical'}
                        <ComicBadge color="red" size="sm">{plan.priority}</ComicBadge>
                      {:else if plan.priority === 'high'}
                        <ComicBadge color="orange" size="sm">{plan.priority}</ComicBadge>
                      {:else if plan.priority === 'low'}
                        <ComicBadge color="blue" size="sm">{plan.priority}</ComicBadge>
                      {/if}
                    </div>
                  </div>
                  <span class="meta">{formatDate(plan.created)}</span>
                </ComicCard>
              </a>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'tasks'}
        {#if tasks.length === 0}
          <ComicEmptyState
            illustration="inbox"
            message="No tasks"
            description="Claude tasks appear here when running via Vibe Terminal."
          />
        {:else}
          {#each ['in_progress', 'pending', 'completed'] as status}
            {@const group = tasksByStatus[status] ?? []}
            {#if group.length > 0}
              <div class="task-group">
                <h3 class="section-title">
                  <ComicBadge color={TASK_STATUS_COLORS[status] ?? 'blue'} size="sm">
                    {status.replace('_', ' ')}
                  </ComicBadge>
                  <span class="task-count">{group.length}</span>
                </h3>
                <div class="list">
                  {#each group as task (task.id)}
                    <ComicCard variant="standard">
                      <p class="task-content">
                        {task.status === 'in_progress'
                          ? task.active_form || task.content
                          : task.content}
                      </p>
                      <div class="task-meta">
                        {#if task.session_title}
                          <ComicBadge color="purple" size="sm">{task.session_title}</ComicBadge>
                        {/if}
                        {#if task.model}
                          <ComicBadge color="blue" size="sm">{getModelShort(task.model)}</ComicBadge
                          >
                        {/if}
                        <span class="meta">{formatRelative(task.updated)}</span>
                      </div>
                    </ComicCard>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      {:else if activeTab === 'dna'}
        <DNACard dna={project.dna} projectName={project.name} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .project-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .project-header {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
  }
  .header-info {
    flex: 1;
    min-width: 0;
  }
  .header-top {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }
  .icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
  }
  .description {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 4px 0 0;
  }
  .last-active {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-sm);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .stat-cell {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .stat-big {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .list-item {
    text-decoration: none;
    color: inherit;
    animation: sketchFadeIn 0.3s ease both;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: block;
    margin-top: 4px;
  }
  .idea-badges {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }

  .plan-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .plan-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mini-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .mini-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    text-decoration: none;
    color: inherit;
    padding: var(--spacing-xs) 0;
    border-bottom: 1px dashed var(--border-color);
  }
  .mini-item:last-child {
    border-bottom: none;
  }
  .mini-title {
    flex: 1;
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-meta {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .task-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .task-count {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-weight: 400;
  }
  .task-content {
    font-size: var(--font-size-sm);
    margin: 0 0 var(--spacing-xs);
    line-height: 1.5;
    word-break: break-word;
  }
  .task-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .github-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }
  .github-link {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-sm);
    color: var(--accent-blue);
    text-decoration: none;
    font-weight: 600;
  }
  .github-link:hover {
    text-decoration: underline;
  }
  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    text-align: center;
    padding: var(--spacing-md);
  }

  /* Responsive: 4 columns → 2 on mobile */
  @media (max-width: 768px) {
    .stat-cell {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
