<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchIdea, promoteIdeaToPlan } from '$lib/api/ideas';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import TelegramFileList from '$lib/components/telegram/TelegramFileList.svelte';
  import TelegramFileUpload from '$lib/components/telegram/TelegramFileUpload.svelte';
  import RelatedContent from '$lib/components/comic/RelatedContent.svelte';
  import { buildRelatedQuery } from '$lib/api/related';
  import { formatDate } from '$lib/utils/date';
  import type { Idea } from '$lib/types';

  let ideaId = $derived($page.params['id'] ?? '');
  let idea = $state<Idea | null>(null);
  let isLoading = $state(true);
  let isPromoting = $state(false);

  onMount(async () => {
    try {
      idea = await fetchIdea(ideaId);
    } catch (err: unknown) {
      console.error('[Idea]', err);
    } finally {
      isLoading = false;
    }
  });

  async function handlePromote() {
    if (!idea || isPromoting) return;
    isPromoting = true;
    try {
      const updated = await promoteIdeaToPlan(idea.id);
      idea = updated;
    } catch (err: unknown) {
      console.error('[Idea] Promote failed:', err);
    } finally {
      isPromoting = false;
    }
  }
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

    <!-- Plan Link Section -->
    {#if idea.linked_plan}
      <ComicCard>
        <div class="plan-link-section">
          <h3 class="section-title">Linked Plan</h3>
          <a href="/plans/{idea.linked_plan}" class="plan-link"> View Plan → </a>
        </div>
      </ComicCard>
    {:else if idea.status === 'considering' || idea.status === 'inbox'}
      <button
        class="comic-btn promote-btn"
        onclick={handlePromote}
        disabled={isPromoting}
        aria-label="Promote this idea to a plan"
      >
        {isPromoting ? 'Creating Plan...' : 'Promote to Plan'}
      </button>
    {/if}

    {#if idea.content}
      <ComicCard>
        <div class="content">{idea.content}</div>
      </ComicCard>
    {/if}

    {#if (idea.tags?.length ?? 0) > 0}
      <div class="tags">
        {#each idea.tags as tag (tag)}<ComicBadge color="purple" size="sm">{tag}</ComicBadge>{/each}
      </div>
    {/if}

    <!-- Telegram Files -->
    <TelegramFileList linkedCollection="ideas" linkedRecordId={ideaId} editable />

    <ComicCard>
      <h3 class="section-title">Add Files</h3>
      <TelegramFileUpload linkedCollection="ideas" linkedRecordId={ideaId} />
    </ComicCard>

    {#if (idea.related_ideas?.length ?? 0) > 0}
      <ComicCard>
        <h3 class="section-title">Related Ideas</h3>
        <ul class="related-list">
          {#each idea.related_ideas as relId (relId)}<li>
              <a href="/ideas/{relId}" class="related-link">{relId}</a>
            </li>{/each}
        </ul>
      </ComicCard>
    {/if}

    <RelatedContent
      collection="ideas"
      id={ideaId}
      query={buildRelatedQuery([idea.title, idea.content])}
    />
  {/if}
</div>

<style>
  .idea-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 800px;
  }
  .idea-header {
    animation: sketchFadeIn 0.3s ease;
  }
  .badges {
    display: flex;
    gap: var(--spacing-xs);
    margin: var(--spacing-sm) 0 4px;
  }
  .date {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .content {
    font-size: 0.875rem;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-sm);
  }
  .related-list {
    padding-left: var(--spacing-lg);
    font-size: 0.85rem;
  }
  .related-link {
    color: var(--accent-blue);
  }

  .plan-link-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .plan-link {
    color: var(--accent-green);
    font-family: 'Comic Mono', monospace;
    font-weight: 700;
    text-decoration: none;
    border: 2px solid var(--accent-green);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: 4px;
    box-shadow: 2px 2px 0 var(--accent-green);
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
    cursor: pointer;
  }
  .plan-link:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 var(--accent-green);
  }

  .promote-btn {
    font-family: 'Comic Mono', monospace;
    font-weight: 700;
    text-transform: uppercase;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 2px solid var(--accent-blue);
    background: transparent;
    color: var(--accent-blue);
    border-radius: 4px;
    box-shadow: 3px 3px 0 var(--accent-blue);
    cursor: pointer;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
    min-height: 44px;
  }
  .promote-btn:hover:not(:disabled) {
    transform: translate(-2px, -2px);
    box-shadow: 5px 5px 0 var(--accent-blue);
  }
  .promote-btn:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 var(--accent-blue);
  }
  .promote-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
