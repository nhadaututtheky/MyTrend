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
    onNodeClick?: (node: GraphNode) => void;
  }

  const {
    nodes = [],
    edges = [],
    width = 600,
    height = 400,
    onNodeClick: _onNodeClick,
  }: Props = $props();

  let svgElement: SVGSVGElement;

  onMount(async () => {
    if (nodes.length === 0) return;

    try {
      const [d3Force, d3Selection, rough] = await Promise.all([
        import('d3-force'),
        import('d3-selection'),
        import('roughjs'),
      ]);

      renderGraph(d3Force as D3ForceModule, d3Selection as D3SelectionModule, rough as RoughModule);
    } catch {
      renderFallback();
    }
  });

  /* eslint-disable @typescript-eslint/consistent-type-imports */
  type D3ForceModule = typeof import('d3-force');
  type D3SelectionModule = typeof import('d3-selection');
  /* eslint-enable @typescript-eslint/consistent-type-imports */
  interface RoughModule { default: { svg: (el: SVGSVGElement) => { line: (...args: unknown[]) => SVGElement; circle: (...args: unknown[]) => SVGElement } } }

  function renderGraph(
    d3Force: D3ForceModule,
    d3Selection: D3SelectionModule,
    rough: RoughModule,
  ): void {
    if (!svgElement) return;

    const svg = d3Selection.select(svgElement) as { selectAll: (s: string) => { remove: () => void } };
    svg.selectAll('*').remove();

    const rc = rough.default.svg(svgElement) as {
      line: (...args: unknown[]) => SVGElement;
      circle: (...args: unknown[]) => SVGElement;
    };

    type SimNode = GraphNode & { x: number; y: number };

    const simulation = d3Force
      .forceSimulation(nodes.map((n) => ({ ...n, x: width / 2, y: height / 2 })))
      .force(
        'link',
        d3Force
          .forceLink(edges.map((e) => ({ ...e })))
          .id((d: object) => (d as { id?: string }).id ?? '')
          .distance(80),
      )
      .force('charge', d3Force.forceManyBody().strength(-200))
      .force('center', d3Force.forceCenter(width / 2, height / 2)) as {
        on: (event: string, cb: () => void) => void;
        nodes: () => SimNode[];
        alpha: (a: number) => { restart: () => void };
      };

    const GROUP_COLORS: Record<string, string> = {
      project: '#00D26A',
      conversation: '#4ECDC4',
      idea: '#FFE66D',
      topic: '#A29BFE',
    };

    simulation.on('tick', () => {
      svg.selectAll('*').remove();

      // Draw edges
      for (const edge of edges) {
        const source = simulation.nodes().find((n) => n.id === edge.source);
        const target = simulation.nodes().find((n) => n.id === edge.target);
        if (source && target) {
          const line = rc.line(source.x, source.y, target.x, target.y, {
            roughness: 1.5,
            stroke: 'var(--text-muted)',
            strokeWidth: 1,
          });
          svgElement.appendChild(line);
        }
      }

      // Draw nodes
      for (const n of simulation.nodes()) {
        const nodeColor = GROUP_COLORS[n.group ?? ''] ?? '#888888';
        const radius = n.size ?? 16;

        const circle = rc.circle(n.x, n.y, radius * 2, {
          fill: nodeColor,
          fillStyle: 'solid',
          roughness: 2,
          stroke: 'var(--border-color)',
          strokeWidth: 2,
        });
        svgElement.appendChild(circle);

        // Label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(n.x));
        text.setAttribute('y', String(n.y + radius + 14));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', 'Comic Mono, monospace');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', 'var(--text-primary)');
        text.textContent = (n.label ?? n.id ?? '').slice(0, 12);
        svgElement.appendChild(text);
      }
    });

    simulation.alpha(1).restart();
  }

  function renderFallback(): void {
    // SVG fallback with static text
  }
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
    <text x={width / 2} y={height / 2} text-anchor="middle" fill="var(--text-muted)">
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
  }

  .graph:active {
    cursor: grabbing;
  }
</style>
