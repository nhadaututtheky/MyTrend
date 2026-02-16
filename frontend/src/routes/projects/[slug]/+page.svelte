<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchProjectBySlug } from '$lib/api/projects';
  import { fetchConversations } from '$lib/api/conversations';
  import { fetchIdeas } from '$lib/api/ideas';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import DNACard from '$lib/components/dashboard/DNACard.svelte';
  import { formatRelative } from '$lib/utils/date';
  import type { Project, Conversation, Idea } from '$lib/types';

  let slug = $state('');
  let project = $state<Project | null>(null);
  let conversations = $state<Conversation[]>([]);
  let ideas = $state<Idea[]>([]);
  let isLoading = $state(true);
  let activeTab = $state('overview');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'conversations', label: 'Conversations' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'dna', label: 'DNA' },
  ];

  $effect(() => {
    const unsub = page.subscribe((p) => { slug = p.params['slug'] ?? ''; });
    return unsub;
  });

  const stats = $derived(project ? [
    { label: 'Conversations', value: project.total_conversations, color: 'blue' as const },
    { label: 'Ideas', value: project.total_ideas, color: 'yellow' as const },
    { label: 'Hours', value: Math.round(project.total_minutes / 60), color: 'purple' as const },
  ] : []);

  onMount(async () => {
    try {
      project = await fetchProjectBySlug(slug);
      if (project) {
        const [convResult, ideasResult] = await Promise.allSettled([
          fetchConversations(1, project.id),
          fetchIdeas(1, project.id),
        ]);
        if (convResult.status === 'fulfilled') conversations = convResult.value.items;
        if (ideasResult.status === 'fulfilled') ideas = ideasResult.value.items;
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
    <BentoGrid columns={3} gap="md">
      {#each Array(3) as _}
        <ComicSkeleton variant="card" height="80px" />
      {/each}
    </BentoGrid>
    <ComicSkeleton variant="card" height="200px" />
  {:else if !project}
    <ComicEmptyState
      illustration="error"
      message="Project not found"
      description='No project with slug "{slug}"'
      actionLabel="Back to Projects"
      actionHref="/projects"
    />
  {:else}
    <div class="project-header">
      <span class="icon" style:background={project.color}>{project.icon}</span>
      <div>
        <h1 class="comic-heading">{project.name}</h1>
        <ComicBadge color={project.status === 'active' ? 'green' : 'blue'}>{project.status}</ComicBadge>
      </div>
    </div>
    {#if project.description}<p class="description">{project.description}</p>{/if}

    <ComicTabs {tabs} bind:active={activeTab} />

    <div class="tab-content">
      {#if activeTab === 'overview'}
        <BentoGrid columns={3} gap="md">
          {#each stats as stat (stat.label)}
            <ComicBentoCard title={stat.label} variant="neon" neonColor={stat.color}>
              <span class="stat-big">{stat.value}</span>
            </ComicBentoCard>
          {/each}
        </BentoGrid>
        {#if project.tech_stack.length > 0}
          <ComicCard>
            <h3 class="section-title">Tech Stack</h3>
            <div class="tags">{#each project.tech_stack as tech (tech)}<ComicBadge color="blue" size="sm">{tech}</ComicBadge>{/each}</div>
          </ComicCard>
        {/if}
      {:else if activeTab === 'conversations'}
        {#if conversations.length === 0}
          <ComicEmptyState illustration="inbox" message="No conversations" description="Start a conversation in the Hub for this project." />
        {:else}
          <div class="list">
            {#each conversations as conv, i (conv.id)}
              <a href="/conversations/{conv.id}" class="list-item" style:animation-delay="{i * 30}ms">
                <ComicCard variant="standard">
                  <strong>{conv.title}</strong>
                  <span class="meta">{conv.message_count} msgs - {formatRelative(conv.started_at)}</span>
                </ComicCard>
              </a>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'ideas'}
        {#if ideas.length === 0}
          <ComicEmptyState illustration="empty" message="No ideas" description="Capture ideas for this project." actionLabel="New Idea" actionHref="/ideas/new" />
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
      {:else if activeTab === 'dna'}
        <DNACard dna={project.dna} projectName={project.name} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .project-page { display: flex; flex-direction: column; gap: var(--spacing-lg); }
  .project-header { display: flex; align-items: center; gap: var(--spacing-md); }
  .icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
  .description { color: var(--text-secondary); font-size: 0.875rem; }
  .section-title { font-size: 0.875rem; text-transform: uppercase; margin: 0 0 var(--spacing-sm); }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tab-content { display: flex; flex-direction: column; gap: var(--spacing-md); }
  .stat-big { font-size: 2rem; font-weight: 700; line-height: 1; }
  .list { display: flex; flex-direction: column; gap: var(--spacing-sm); }
  .list-item { text-decoration: none; color: inherit; animation: sketchFadeIn 0.3s ease both; }
  .meta { font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px; }
  .idea-badges { display: flex; gap: 4px; margin-top: 4px; }
</style>
