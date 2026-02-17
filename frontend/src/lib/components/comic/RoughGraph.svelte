<script lang="ts">
  import { onMount } from 'svelte';

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

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    width?: number;
    height?: number;
    maxEdgesPerNode?: number;
    onNodeClick?: (node: GraphNode) => void;
  }

  const {
    nodes = [],
    edges = [],
    width = 900,
    height = 600,
    maxEdgesPerNode = 4,
    onNodeClick,
  }: Props = $props();

  let svgElement: SVGSVGElement;
  let selectedNodeId = $state<string | null>(null);

  const GROUP_COLORS: Record<string, string> = {
    project: '#00D26A',
    conversation: '#4ECDC4',
    idea: '#FFE66D',
    topic: '#A29BFE',
    tag: '#FF9F43',
    keyword: '#6C9BFF',
    'idea-type': '#FFE66D',
    general: '#A29BFE',
  };

  onMount(async () => {
    if (nodes.length === 0) return;

    try {
      const [d3Force, d3Selection, d3Drag, d3Zoom] = await Promise.all([
        import('d3-force'),
        import('d3-selection'),
        import('d3-drag'),
        import('d3-zoom'),
      ]);

      renderInteractiveGraph(d3Force, d3Selection, d3Drag, d3Zoom);
    } catch (err) {
      console.error('[RoughGraph] Import/render failed:', err);
    }
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function renderInteractiveGraph(
    d3Force: any,
    d3Selection: any,
    d3Drag: any,
    d3Zoom: any,
  ): void {
    if (!svgElement) return;

    // Prune edges: keep only top N edges per node for readability
    const prunedEdges = pruneEdges(edges, maxEdgesPerNode);

    type SimNode = GraphNode & { x: number; y: number; fx?: number | null; fy?: number | null };
    type SimLink = { source: SimNode; target: SimNode };

    const simNodes: SimNode[] = nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y: height / 2 + (Math.random() - 0.5) * height * 0.5,
    }));

    const simLinks: SimLink[] = prunedEdges.map((e) => ({ ...e })) as unknown as SimLink[];

    const simulation = d3Force
      .forceSimulation(simNodes)
      .force('link', d3Force.forceLink(simLinks).id((d: SimNode) => d.id).distance(100))
      .force('charge', d3Force.forceManyBody().strength(-300))
      .force('center', d3Force.forceCenter(width / 2, height / 2))
      .force('collide', d3Force.forceCollide().radius((d: SimNode) => (d.size ?? 14) + 6))
      .force('x', d3Force.forceX(width / 2).strength(0.05))
      .force('y', d3Force.forceY(height / 2).strength(0.05));

    const svg = d3Selection.select(svgElement);
    svg.selectAll('*').remove();

    // Container for zoom/pan
    const g = svg.append('g').attr('class', 'graph-content');

    // Zoom behavior
    const zoom = d3Zoom.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Edges
    const link = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'graph-edge');

    // Node groups
    const node = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
      .attr('cursor', 'grab')
      .on('click', (_event: MouseEvent, d: SimNode) => {
        selectedNodeId = selectedNodeId === d.id ? null : d.id;
        updateSelection();
        if (onNodeClick) onNodeClick(d);
      })
      .call(
        d3Drag.drag()
          .on('start', (event: any, d: SimNode) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event: any, d: SimNode) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event: any, d: SimNode) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Circle for each node
    node.append('circle')
      .attr('r', (d: SimNode) => d.size ?? 14)
      .attr('fill', (d: SimNode) => GROUP_COLORS[d.group ?? ''] ?? '#A29BFE')
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .attr('class', 'node-circle');

    // Label
    node.append('text')
      .text((d: SimNode) => (d.label ?? d.id ?? '').slice(0, 14))
      .attr('dy', (d: SimNode) => (d.size ?? 14) + 14)
      .attr('text-anchor', 'middle')
      .attr('class', 'node-label');

    function updateSelection(): void {
      node.select('.node-circle')
        .attr('stroke', (d: SimNode) => d.id === selectedNodeId ? '#fff' : '#333')
        .attr('stroke-width', (d: SimNode) => d.id === selectedNodeId ? 3 : 2);

      link.attr('class', (d: SimLink) => {
        if (!selectedNodeId) return 'graph-edge';
        const connected = d.source.id === selectedNodeId || d.target.id === selectedNodeId;
        return connected ? 'graph-edge graph-edge--active' : 'graph-edge graph-edge--dim';
      });
    }

    simulation.on('tick', () => {
      link
        .attr('x1', (d: SimLink) => d.source.x)
        .attr('y1', (d: SimLink) => d.source.y)
        .attr('x2', (d: SimLink) => d.target.x)
        .attr('y2', (d: SimLink) => d.target.y);

      node.attr('transform', (d: SimNode) => `translate(${d.x},${d.y})`);
    });
  }

  /**
   * Keep max N edges per node, preferring nodes with fewer connections.
   */
  function pruneEdges(allEdges: GraphEdge[], maxPerNode: number): GraphEdge[] {
    const edgeCounts = new Map<string, number>();
    const result: GraphEdge[] = [];

    // Sort edges randomly to avoid bias
    const shuffled = [...allEdges].sort(() => Math.random() - 0.5);

    for (const edge of shuffled) {
      const srcCount = edgeCounts.get(edge.source) ?? 0;
      const tgtCount = edgeCounts.get(edge.target) ?? 0;
      if (srcCount < maxPerNode && tgtCount < maxPerNode) {
        result.push(edge);
        edgeCounts.set(edge.source, srcCount + 1);
        edgeCounts.set(edge.target, tgtCount + 1);
      }
    }
    return result;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
</script>

<svg
  bind:this={svgElement}
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  class="graph"
  data-testid="rough-graph"
>
  {#if nodes.length === 0}
    <text x={width / 2} y={height / 2} text-anchor="middle" class="empty-text">
      No data for knowledge graph
    </text>
  {/if}
</svg>

<style>
  .graph {
    width: 100%;
    max-width: 100%;
    overflow: visible;
    cursor: grab;
    background: transparent;
  }

  .graph:active {
    cursor: grabbing;
  }

  .graph :global(.graph-edge) {
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 1;
    transition: stroke 0.2s, opacity 0.2s;
  }

  .graph :global(.graph-edge--active) {
    stroke: rgba(255, 255, 255, 0.7);
    stroke-width: 2;
  }

  .graph :global(.graph-edge--dim) {
    stroke: rgba(255, 255, 255, 0.04);
    stroke-width: 0.5;
  }

  .graph :global(.node-circle) {
    transition: stroke 0.15s, filter 0.15s;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.3));
  }

  .graph :global(.graph-node:hover .node-circle) {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));
    stroke: #fff;
  }

  .graph :global(.node-label) {
    font-family: 'Comic Mono', monospace;
    font-size: 10px;
    fill: rgba(255, 255, 255, 0.7);
    pointer-events: none;
    user-select: none;
  }

  .graph :global(.graph-node:hover .node-label) {
    fill: #fff;
  }

  .empty-text {
    fill: #888;
    font-family: 'Comic Mono', monospace;
  }
</style>
