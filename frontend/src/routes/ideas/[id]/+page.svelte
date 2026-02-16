<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchIdea } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { formatDate } from '$lib/utils/date';
  import type { Idea } from '$lib/types';

  let ideaId = $state('');
  let idea = $state<Idea | null>(null);
  let isLoading = $state(true);

  $effect(() => {
    const unsub = page.subscribe((p) => { ideaId = p.params['id'] ?? ''; });
    return unsub;
  });

  onMount(async () => {
    try { idea = await fetchIdea(ideaId); }
    catch (err: unknown) { console.error('[Idea]', err); }
    finally { isLoading = false; }
  });
</script>

<svelte:head><title>{idea?.title ?? 'Idea'} - MyTrend</title></svelte:head>

<div class="idea-page">
  {#if isLoading}
    <ComicSkeleton variant="text" />
    <ComicSkeleton variant="card" height="150px" />
  {:else if !idea}
    <ComicEmptyState
      illustration="error"
      message="Idea not found"
      description="This idea may have been deleted."
      actionLabel="Back to Ideas"
      actionHref="/ideas"
    />
  {:else}
    <div class="idea-header">
      <h1 class="comic-heading">{idea.title}</h1>
      <div class="badges">
        <ComicBadge color="blue">{idea.type}</ComicBadge>
        <ComicBadge color="green">{idea.status}</ComicBadge>
        <ComicBadge color="orange">{idea.priority}</ComicBadge>
      </div>
      <span class="date">Created {formatDate(idea.created)}</span>
    </div>

    {#if idea.content}
      <ComicCard>
        <div class="content">{idea.content}</div>
      </ComicCard>
    {/if}

    {#if idea.tags.length > 0}
      <div class="tags">{#each idea.tags as tag (tag)}<ComicBadge color="purple" size="sm">{tag}</ComicBadge>{/each}</div>
    {/if}

    {#if idea.related_ideas.length > 0}
      <ComicCard>
        <h3 class="section-title">Related Ideas</h3>
        <ul class="related-list">{#each idea.related_ideas as relId (relId)}<li><a href="/ideas/{relId}" class="related-link">{relId}</a></li>{/each}</ul>
      </ComicCard>
    {/if}
  {/if}
</div>

<style>
  .idea-page { display: flex; flex-direction: column; gap: var(--spacing-lg); max-width: 800px; }
  .idea-header { animation: sketchFadeIn 0.3s ease; }
  .badges { display: flex; gap: var(--spacing-xs); margin: var(--spacing-sm) 0 4px; }
  .date { font-size: 0.75rem; color: var(--text-muted); }
  .content { font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .section-title { font-size: 0.875rem; text-transform: uppercase; margin: 0 0 var(--spacing-sm); }
  .related-list { padding-left: var(--spacing-lg); font-size: 0.85rem; }
  .related-link { color: var(--accent-blue); }
</style>
