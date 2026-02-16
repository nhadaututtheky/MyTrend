<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchIdea } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
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
    <p class="loading">Loading...</p>
  {:else if !idea}
    <ComicCard><h2>Idea not found</h2></ComicCard>
  {:else}
    <div class="idea-header">
      <h1>{idea.title}</h1>
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
        <ul>{#each idea.related_ideas as relId (relId)}<li><a href="/ideas/{relId}">{relId}</a></li>{/each}</ul>
      </ComicCard>
    {/if}
  {/if}
</div>

<style>
  .idea-page { display: flex; flex-direction: column; gap: var(--spacing-lg); max-width: 800px; }
  .idea-header h1 { margin: 0 0 var(--spacing-sm); }
  .badges { display: flex; gap: var(--spacing-xs); margin-bottom: 4px; }
  .date { font-size: 0.75rem; color: var(--text-muted); }
  .content { font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .section-title { font-size: 0.875rem; text-transform: uppercase; margin: 0 0 var(--spacing-sm); }
  .loading { text-align: center; color: var(--text-muted); padding: var(--spacing-2xl); }
</style>
