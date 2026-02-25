<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchRelated, relatedHref, relatedIcon, type RelatedItem } from '$lib/api/related';
  import ComicSkeleton from './ComicSkeleton.svelte';

  interface Props {
    collection: string;
    id: string;
    query: string;
    limit?: number;
  }

  const { collection, id, query, limit = 5 }: Props = $props();

  let items = $state<RelatedItem[]>([]);
  let isLoading = $state(true);

  onMount(async () => {
    try {
      items = await fetchRelated(collection, id, query, limit);
    } catch {
      // Non-critical
    } finally {
      isLoading = false;
    }
  });
</script>

{#if isLoading}
  <div class="related-container">
    <h3 class="related-heading">Related</h3>
    <ComicSkeleton variant="text" />
    <ComicSkeleton variant="text" />
  </div>
{:else if items.length > 0}
  <div class="related-container">
    <h3 class="related-heading">Related</h3>
    <ul class="related-list">
      {#each items as item (item.type + item.id)}
        <li class="related-item">
          <a href={relatedHref(item)} class="related-link">
            <span class="related-icon" aria-hidden="true">{relatedIcon(item.type)}</span>
            <div class="related-body">
              <span class="related-title">{item.title}</span>
              {#if item.snippet}
                <span class="related-snippet">{item.snippet}</span>
              {/if}
            </div>
            <span class="related-type">{item.type}</span>
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .related-container {
    margin-top: var(--spacing-lg);
  }

  .related-heading {
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .related-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .related-item {
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    overflow: hidden;
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }

  .related-item:hover {
    transform: translate(-2px, -2px);
    box-shadow: 3px 3px 0 var(--border-color);
  }

  .related-item:active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }

  .related-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    text-decoration: none;
    color: inherit;
  }

  .related-icon {
    font-size: 1.1em;
    flex-shrink: 0;
    line-height: 1;
  }

  .related-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .related-title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .related-link:hover .related-title {
    color: var(--accent-blue);
  }

  .related-snippet {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .related-type {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
</style>
