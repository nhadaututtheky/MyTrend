<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import RoughGraph from '$lib/components/comic/RoughGraph.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { Topic } from '$lib/types';

  interface GraphNode {
    id: string;
    label: string;
    group?: string;
    size?: number;
  }

  interface GraphEdge {
    source: string;
    target: string;
    weight?: number;
  }

  let nodes = $state<GraphNode[]>([]);
  let edges = $state<GraphEdge[]>([]);
  let isLoading = $state(true);

  onMount(async () => {
    try {
      // Fetch topics and build graph from related fields
      const result = await pb.collection('topics').getList<Topic>(1, 50, {
        sort: '-mention_count',
        fields: 'id,name,category,mention_count,related',
      });

      const topicNodes: GraphNode[] = result.items.map((t) => ({
        id: t.id,
        label: t.name,
        group: t.category || 'topic',
        size: Math.max(10, Math.min(30, t.mention_count * 2)),
      }));

      const topicEdges: GraphEdge[] = [];
      for (const topic of result.items) {
        if (topic.related) {
          for (const relatedId of topic.related) {
            if (result.items.some((t) => t.id === relatedId)) {
              topicEdges.push({ source: topic.id, target: relatedId, weight: 1 });
            }
          }
        }
      }

      nodes = topicNodes;
      edges = topicEdges;
    } catch (err: unknown) {
      console.error('[Graph]', err);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Knowledge Graph - MyTrend</title>
</svelte:head>

<div class="graph-page">
  <h1 class="comic-heading">Knowledge Graph</h1>

  {#if isLoading}
    <p class="loading">Building graph...</p>
  {:else}
    <ComicCard padding={false}>
      <div class="graph-container">
        <RoughGraph {nodes} {edges} width={900} height={600} />
      </div>
    </ComicCard>

    <div class="legend">
      <ComicCard>
        <h3 class="section-title">Legend</h3>
        <div class="legend-items">
          <span class="legend-item"><span class="dot" style:background="#00D26A"></span> Project</span>
          <span class="legend-item"><span class="dot" style:background="#4ECDC4"></span> Conversation</span>
          <span class="legend-item"><span class="dot" style:background="#FFE66D"></span> Idea</span>
          <span class="legend-item"><span class="dot" style:background="#A29BFE"></span> Topic</span>
        </div>
        <p class="hint">Node size = mention count. Edges = related topics.</p>
      </ComicCard>
    </div>
  {/if}
</div>

<style>
  .graph-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .graph-container {
    overflow: auto;
    min-height: 600px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading {
    text-align: center;
    color: var(--text-muted);
    padding: var(--spacing-2xl);
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-sm);
  }

  .legend-items {
    display: flex;
    gap: var(--spacing-lg);
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: var(--spacing-sm);
  }
</style>
