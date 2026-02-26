<script lang="ts">
  import ComicBadge from './ComicBadge.svelte';
  import type { Plan, PlanStatus } from '$lib/types';

  interface Props {
    plans: Plan[];
    onStatusChange: (id: string, status: PlanStatus) => void;
  }

  let { plans, onStatusChange }: Props = $props();

  const COLUMNS: { id: PlanStatus; label: string; color: string; accentVar: string }[] = [
    { id: 'draft', label: 'Draft', color: 'yellow', accentVar: '--accent-yellow' },
    { id: 'in_progress', label: 'Active', color: 'orange', accentVar: '--accent-orange' },
    { id: 'review', label: 'Review', color: 'purple', accentVar: '--accent-purple' },
    { id: 'completed', label: 'Done', color: 'green', accentVar: '--accent-green' },
  ];

  // Map approved → draft bucket for display
  function columnFor(status: PlanStatus): PlanStatus {
    if (status === 'approved') return 'draft';
    if (status === 'superseded' || status === 'abandoned') return 'completed';
    return status;
  }

  function plansFor(colId: PlanStatus): Plan[] {
    return plans.filter((p) => columnFor(p.status) === colId);
  }

  const PRIORITY_COLORS: Record<string, 'red' | 'orange' | 'yellow'> = {
    critical: 'red',
    high: 'orange',
    medium: 'yellow',
    low: 'yellow',
  };

  let draggingId = $state<string | null>(null);
  let dragOverCol = $state<PlanStatus | null>(null);

  function onDragStart(e: DragEvent, planId: string) {
    draggingId = planId;
    e.dataTransfer?.setData('planId', planId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    draggingId = null;
    dragOverCol = null;
  }

  function onDragOver(e: DragEvent, colId: PlanStatus) {
    e.preventDefault();
    dragOverCol = colId;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function onDragLeave() {
    dragOverCol = null;
  }

  function onDrop(e: DragEvent, colId: PlanStatus) {
    e.preventDefault();
    dragOverCol = null;
    const planId = e.dataTransfer?.getData('planId') ?? draggingId;
    if (!planId) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    if (columnFor(plan.status) === colId) return; // no change
    onStatusChange(planId, colId);
    draggingId = null;
  }
</script>

<div class="kanban">
  {#each COLUMNS as col (col.id)}
    {@const colPlans = plansFor(col.id)}
    <div
      class="column"
      class:drag-over={dragOverCol === col.id}
      ondragover={(e) => onDragOver(e, col.id)}
      ondragleave={onDragLeave}
      ondrop={(e) => onDrop(e, col.id)}
      role="region"
      aria-label="{col.label} column"
    >
      <div class="col-header" style="--col-accent: var({col.accentVar})">
        <span class="col-title">{col.label}</span>
        <span class="col-count">{colPlans.length}</span>
      </div>

      <div class="cards">
        {#each colPlans as plan (plan.id)}
          <a
            href="/plans/{plan.id}"
            class="card"
            class:dragging={draggingId === plan.id}
            draggable="true"
            ondragstart={(e) => onDragStart(e, plan.id)}
            ondragend={onDragEnd}
            aria-label="Plan: {plan.title}"
          >
            <p class="card-title">{plan.title}</p>
            <div class="card-meta">
              {#if plan.plan_type}
                <ComicBadge color="blue" size="sm">{plan.plan_type}</ComicBadge>
              {/if}
              {#if plan.priority && plan.priority !== 'medium'}
                <ComicBadge color={PRIORITY_COLORS[plan.priority] ?? 'yellow'} size="sm"
                  >{plan.priority}</ComicBadge
                >
              {/if}
              {#if plan.estimated_effort}
                <span class="effort">{plan.estimated_effort}</span>
              {/if}
            </div>
            {#if (plan.milestones?.length ?? 0) > 0}
              {@const total = plan.milestones.length}
              {@const done = plan.milestones.filter((m) => m.done).length}
              <div class="milestone-bar" aria-label="{done}/{total} milestones done">
                <div class="bar-bg">
                  <div class="bar-fill" style="width:{Math.round((done / total) * 100)}%"></div>
                </div>
                <span class="bar-label">{done}/{total}</span>
              </div>
            {/if}
          </a>
        {:else}
          <div class="empty-col">Drop here</div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .kanban {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-md);
    align-items: start;
  }
  .column {
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    min-height: 200px;
    transition: background 150ms ease;
  }
  .column.drag-over {
    background: rgba(78, 205, 196, 0.06);
    border-color: var(--accent-blue);
  }
  .col-header {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 2px solid var(--col-accent, var(--border-color));
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .col-title {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    color: var(--col-accent, var(--text-primary));
  }
  .col-count {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    background: var(--bg-elevated);
    padding: 1px 6px;
    border-radius: 10px;
  }
  .cards {
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    min-height: 100px;
  }
  .card {
    display: block;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--spacing-sm);
    cursor: grab;
    text-decoration: none;
    color: inherit;
    transition: all 150ms ease;
    box-shadow: 2px 2px 0 var(--border-color);
  }
  .card:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0 var(--border-color);
  }
  .card.dragging {
    opacity: 0.4;
    cursor: grabbing;
  }
  .card-title {
    font-size: var(--font-size-sm);
    font-weight: 700;
    margin: 0 0 var(--spacing-xs);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .effort {
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .milestone-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }
  .bar-bg {
    flex: 1;
    height: 4px;
    background: var(--border-color);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent-green);
    border-radius: 2px;
    transition: width 300ms ease;
  }
  .bar-label {
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    white-space: nowrap;
  }
  .empty-col {
    border: 2px dashed var(--border-color);
    border-radius: 4px;
    padding: var(--spacing-lg);
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  @media (max-width: 900px) {
    .kanban {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 600px) {
    .kanban {
      grid-template-columns: 1fr;
    }
  }
</style>
