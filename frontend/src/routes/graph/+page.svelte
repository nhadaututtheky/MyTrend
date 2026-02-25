<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import RoughGraph from '$lib/components/comic/RoughGraph.svelte';
  import BentoGrid from '$lib/components/comic/BentoGrid.svelte';
  import ComicBentoCard from '$lib/components/comic/ComicBentoCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
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

  const GROUP_COLORS: Record<string, string> = {
    project: '#00D26A',
    conversation: '#4ECDC4',
    idea: '#FFE66D',
    topic: '#A29BFE',
  };

  onMount(async () => {
    try {
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

      const topicIds = new Set(result.items.map((t) => t.id));
      const topicEdges: GraphEdge[] = result.items.flatMap((topic) =>
        (topic.related ?? [])
          .filter((relatedId: string) => topicIds.has(relatedId))
          .map((relatedId: string) => ({ source: topic.id, target: relatedId, weight: 1 })),
      );

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
  <div class="page-header">
    <h1 class="comic-heading">Knowledge Graph</h1>
    <span class="node-count">{nodes.length} nodes, {edges.length} edges</span>
  </div>

  {#if isLoading}
    <ComicSkeleton variant="chart" height="600px" />
  {:else if nodes.length === 0}
    <ComicEmptyState
      illustration="empty"
      message="No graph data yet"
      description="Topics and their relationships will appear here as you create conversations."
    />
  {:else}
    <BentoGrid columns={3} gap="md">
      <ComicBentoCard
        title="Knowledge Graph"
        icon="🌐"
        span="full"
        neonColor="purple"
        variant="neon"
      >
        <div class="graph-container">
          <RoughGraph {nodes} {edges} width={900} height={600} />
        </div>
      </ComicBentoCard>

      <ComicBentoCard title="Legend" icon="🏷" span={2}>
        <div class="legend-items">
          {#each Object.entries(GROUP_COLORS) as [group, color] (group)}
            <span class="legend-item">
              <span class="dot" style:background={color}></span>
              <span class="legend-label">{group}</span>
            </span>
          {/each}
        </div>
        <p class="hint">Node size = mention count. Edges = related topics.</p>
      </ComicBentoCard>

      <ComicBentoCard title="Stats" icon="📊" variant="neon" neonColor="green">
        <div class="graph-stats">
          <div class="stat-row">
            <span class="stat-label">Nodes</span>
            <ComicBadge color="green" size="sm">{nodes.length}</ComicBadge>
          </div>
          <div class="stat-row">
            <span class="stat-label">Edges</span>
            <ComicBadge color="blue" size="sm">{edges.length}</ComicBadge>
          </div>
          <div class="stat-row">
            <span class="stat-label">Density</span>
            <ComicBadge color="purple" size="sm">
              {nodes.length > 1
                ? Math.round((edges.length / ((nodes.length * (nodes.length - 1)) / 2)) * 100)
                : 0}%
            </ComicBadge>
          </div>
        </div>
      </ComicBentoCard>
    </BentoGrid>
  {/if}
</div>

<style>
  .graph-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .node-count {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .graph-container {
    overflow: auto;
    min-height: 500px;
    display: flex;
    align-items: center;
    justify-content: center;
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

  .legend-label {
    text-transform: capitalize;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: var(--spacing-sm);
  }

  .graph-stats {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
</style>
