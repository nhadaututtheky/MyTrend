<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    fetchPlanTimeline,
    transitionPlan,
    updatePlan,
    deletePlan,
    updatePlanMilestones,
  } from '$lib/api/plans';
  import RelatedContent from '$lib/components/comic/RelatedContent.svelte';
  import { buildRelatedQuery } from '$lib/api/related';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicTimeline from '$lib/components/comic/ComicTimeline.svelte';
  import ComicMarkdown from '$lib/components/comic/ComicMarkdown.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicDialog from '$lib/components/comic/ComicDialog.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import { formatDateTime, formatRelative } from '$lib/utils/date';
  import { toast } from '$lib/stores/toast';
  import type {
    PlanTimelineResponse,
    PlanStatus,
    PlanStageTransition,
    PlanMilestone,
  } from '$lib/types';

  let data = $state<PlanTimelineResponse | null>(null);
  let isLoading = $state(true);
  let showTransition = $state(false);
  let showDelete = $state(false);
  let transitionNote = $state('');
  let selectedTransition = $state<PlanStatus | ''>('');
  let isTransitioning = $state(false);
  let isEditing = $state(false);
  let editOutcome = $state('');

  // Milestones (2B)
  let milestones = $state<PlanMilestone[]>([]);
  let newMilestoneText = $state('');
  let isSavingMilestones = $state(false);

  function loadMilestones(raw: readonly PlanMilestone[] | undefined): void {
    milestones = raw ? [...raw].sort((a, b) => a.order - b.order) : [];
  }

  async function saveMilestones(updated: PlanMilestone[]): Promise<void> {
    if (!planId) return;
    isSavingMilestones = true;
    try {
      await updatePlanMilestones(planId, updated);
      milestones = updated;
    } catch {
      toast.error('Failed to save milestones');
    } finally {
      isSavingMilestones = false;
    }
  }

  async function toggleMilestone(id: string): Promise<void> {
    const updated = milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m));
    await saveMilestones(updated);
  }

  async function addMilestone(): Promise<void> {
    const title = newMilestoneText.trim();
    if (!title) return;
    const updated = [
      ...milestones,
      { id: crypto.randomUUID(), title, done: false, order: milestones.length },
    ];
    await saveMilestones(updated);
    newMilestoneText = '';
  }

  async function deleteMilestone(id: string): Promise<void> {
    const updated = milestones.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i }));
    await saveMilestones(updated);
  }

  const milestoneProgress = $derived(
    milestones.length > 0
      ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100)
      : 0,
  );
  const allMilestonesDone = $derived(milestones.length > 0 && milestones.every((m) => m.done));

  const STATUS_COLORS: Record<
    PlanStatus | 'none',
    'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple'
  > = {
    none: 'yellow',
    draft: 'yellow',
    approved: 'blue',
    in_progress: 'orange',
    review: 'purple',
    completed: 'green',
    abandoned: 'red',
    superseded: 'red',
  };

  const TRANSITIONS: Record<string, PlanStatus[]> = {
    draft: ['approved', 'abandoned'],
    approved: ['in_progress', 'abandoned'],
    in_progress: ['review', 'abandoned'],
    review: ['completed', 'in_progress', 'abandoned'],
    abandoned: ['draft'],
  };

  function getPriorityColor(priority: string): 'red' | 'orange' | 'yellow' {
    if (priority === 'critical') return 'red';
    if (priority === 'high') return 'orange';
    return 'yellow';
  }

  let planId = $derived($page.params.id ?? '');

  const plan = $derived(data?.plan);
  const allowedTransitions = $derived(plan ? TRANSITIONS[plan.status] || [] : []);

  const timelineNodes = $derived.by(() => {
    if (!data?.stage_history) return [];
    return data.stage_history.map((t: PlanStageTransition, i: number) => ({
      id: `stage-${i}`,
      label: t.to.replace('_', ' '),
      sublabel: t.from === 'none' ? 'Created' : `From ${t.from.replace('_', ' ')}`,
      timestamp: formatDateTime(t.timestamp),
      color: STATUS_COLORS[t.to] || ('yellow' as const),
      active: i === (data?.stage_history.length ?? 0) - 1,
      note: t.note,
      href: t.conversation_id ? `/conversations/${t.conversation_id}` : undefined,
    }));
  });

  async function load(): Promise<void> {
    isLoading = true;
    try {
      data = await fetchPlanTimeline(planId);
      editOutcome = data?.plan?.outcome ?? '';
      loadMilestones(data?.plan?.milestones);
    } catch (err: unknown) {
      console.error('[PlanDetail]', err);
      toast.error('Failed to load plan');
    } finally {
      isLoading = false;
    }
  }

  async function handleTransition(): Promise<void> {
    if (!selectedTransition || !transitionNote.trim() || !planId) return;
    isTransitioning = true;
    try {
      await transitionPlan(planId, selectedTransition as PlanStatus, transitionNote.trim());
      toast.success(`Plan transitioned to ${selectedTransition}`);
      showTransition = false;
      transitionNote = '';
      selectedTransition = '';
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Transition failed');
    } finally {
      isTransitioning = false;
    }
  }

  async function handleSaveOutcome(): Promise<void> {
    if (!planId) return;
    try {
      await updatePlan(planId, { outcome: editOutcome } as never);
      toast.success('Outcome saved');
      isEditing = false;
      await load();
    } catch {
      toast.error('Failed to save outcome');
    }
  }

  async function handleDelete(): Promise<void> {
    if (!planId) return;
    try {
      await deletePlan(planId);
      toast.success('Plan deleted');
      goto('/plans');
    } catch {
      toast.error('Failed to delete plan');
    }
  }

  onMount(() => {
    load();
  });
</script>

<svelte:head><title>{plan?.title ?? 'Plan Detail'} - MyTrend</title></svelte:head>

<div class="page">
  {#if isLoading}
    <ComicSkeleton variant="card" height="200px" />
    <ComicSkeleton variant="card" height="300px" />
  {:else if !plan}
    <p>Plan not found.</p>
  {:else}
    <!-- Header -->
    <div class="plan-header">
      <div class="header-top">
        <a href="/plans" class="back-link">Back to Plans</a>
      </div>
      <h1 class="comic-heading">{plan.title}</h1>
      <div class="badge-row">
        <ComicBadge color={STATUS_COLORS[plan.status]}>{plan.status.replace('_', ' ')}</ComicBadge>
        {#if plan.plan_type}
          <ComicBadge color="blue">{plan.plan_type}</ComicBadge>
        {/if}
        {#if plan.priority}
          <ComicBadge color={getPriorityColor(plan.priority)}>{plan.priority}</ComicBadge>
        {/if}
        {#if plan.complexity}
          <ComicBadge color="purple">{plan.complexity}</ComicBadge>
        {/if}
        {#if plan.extraction_source === 'auto'}
          <ComicBadge color="purple" size="sm"
            >auto-extracted ({Math.round(plan.extraction_confidence * 100)}%)</ComicBadge
          >
        {/if}
      </div>
      <div class="meta-row">
        {#if plan.estimated_effort}<span>Effort: {plan.estimated_effort}</span>{/if}
        <span>Created {formatRelative(plan.created)}</span>
        {#if plan.started_at}<span>Started {formatRelative(plan.started_at)}</span>{/if}
        {#if plan.completed_at}<span>Completed {formatRelative(plan.completed_at)}</span>{/if}
      </div>
      <div class="action-row">
        {#if allowedTransitions.length > 0}
          <ComicButton variant="primary" onclick={() => (showTransition = true)}
            >Transition</ComicButton
          >
        {/if}
        <ComicButton variant="danger" onclick={() => (showDelete = true)}>Delete</ComicButton>
      </div>
    </div>

    <!-- Lifecycle Timeline -->
    {#if timelineNodes.length > 0}
      <ComicCard>
        <h2 class="section-title">Lifecycle Timeline</h2>
        <ComicTimeline nodes={timelineNodes} />
      </ComicCard>
    {/if}

    <!-- Trigger -->
    {#if plan.trigger}
      <ComicCard>
        <h2 class="section-title">What Triggered This?</h2>
        <ComicMarkdown content={plan.trigger} />
      </ComicCard>
    {/if}

    <!-- Plan Content -->
    {#if plan.content}
      <ComicCard>
        <h2 class="section-title">Plan Content</h2>
        <ComicMarkdown content={plan.content} />
      </ComicCard>
    {/if}

    <!-- Reasoning -->
    {#if plan.reasoning}
      <ComicCard>
        <h2 class="section-title">Why This Approach?</h2>
        <ComicMarkdown content={plan.reasoning} />
      </ComicCard>
    {/if}

    <!-- Alternatives -->
    {#if plan.alternatives}
      <ComicCard>
        <h2 class="section-title">Alternatives Considered</h2>
        <ComicMarkdown content={plan.alternatives} collapsible />
      </ComicCard>
    {/if}

    <!-- Linked Items -->
    {#if data && (data.conversations.length > 0 || data.ideas.length > 0 || data.related_plans.length > 0)}
      <ComicCard>
        <h2 class="section-title">Linked Items</h2>
        {#if data.conversations.length > 0}
          <h3 class="subsection-title">Conversations</h3>
          <ul class="linked-list">
            {#each data.conversations as conv (conv.id)}
              <li>
                <a href="/conversations/{conv.id}" class="linked-item"
                  >{conv.title}
                  <span class="linked-meta">{formatRelative(conv.started_at)}</span></a
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if data.ideas.length > 0}
          <h3 class="subsection-title">Ideas</h3>
          <ul class="linked-list">
            {#each data.ideas as idea (idea.id)}
              <li>
                <a href="/ideas/{idea.id}" class="linked-item"
                  >{idea.title} <ComicBadge color="yellow" size="sm">{idea.status}</ComicBadge></a
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if data.related_plans.length > 0}
          <h3 class="subsection-title">Related Plans</h3>
          <ul class="linked-list">
            {#each data.related_plans as rp (rp.id)}
              <li>
                <a href="/plans/{rp.id}" class="linked-item"
                  >{rp.title}
                  <ComicBadge color={STATUS_COLORS[rp.status as PlanStatus]} size="sm"
                    >{rp.status}</ComicBadge
                  > <span class="linked-meta">({rp.relation})</span></a
                >
              </li>
            {/each}
          </ul>
        {/if}
      </ComicCard>
    {/if}

    <!-- Milestones (2B) -->
    <ComicCard>
      <div class="milestone-header">
        <h2 class="section-title">Milestones</h2>
        {#if milestones.length > 0}
          <div class="milestone-progress-row">
            <div class="milestone-bar-bg">
              <div class="milestone-bar-fill" style="width:{milestoneProgress}%"></div>
            </div>
            <span class="milestone-pct">{milestoneProgress}%</span>
          </div>
        {/if}
      </div>

      {#if allMilestonesDone && plan.status !== 'completed'}
        <div class="milestone-done-banner">
          🎉 All milestones done! Ready to mark as completed?
          <button class="done-btn" onclick={() => (showTransition = true)}>Transition →</button>
        </div>
      {/if}

      <ul class="milestone-list">
        {#each milestones as m (m.id)}
          <li class="milestone-item">
            <label class="milestone-check">
              <input
                type="checkbox"
                checked={m.done}
                onchange={() => toggleMilestone(m.id)}
                aria-label={m.title}
              />
              <span class="milestone-title" class:done={m.done}>{m.title}</span>
            </label>
            <button
              class="ms-del"
              onclick={() => deleteMilestone(m.id)}
              aria-label="Delete milestone"
              title="Delete">✕</button
            >
          </li>
        {/each}
      </ul>

      <div class="milestone-add">
        <input
          class="comic-input milestone-input"
          bind:value={newMilestoneText}
          placeholder="Add milestone…"
          onkeydown={(e) => e.key === 'Enter' && addMilestone()}
          aria-label="New milestone"
        />
        <button
          class="ms-add-btn"
          onclick={addMilestone}
          disabled={isSavingMilestones || !newMilestoneText.trim()}
          aria-label="Add">+</button
        >
      </div>
    </ComicCard>

    <!-- Outcome -->
    {#if plan.status === 'completed' || plan.status === 'abandoned' || plan.outcome}
      <ComicCard>
        <div class="outcome-header">
          <h2 class="section-title">Outcome / Retrospective</h2>
          {#if !isEditing}
            <ComicButton variant="outline" onclick={() => (isEditing = true)}>Edit</ComicButton>
          {/if}
        </div>
        {#if isEditing}
          <textarea
            class="outcome-editor"
            bind:value={editOutcome}
            placeholder="What actually happened? Lessons learned?"
            rows="6"
          ></textarea>
          <div class="outcome-actions">
            <ComicButton variant="primary" onclick={handleSaveOutcome}>Save</ComicButton>
            <ComicButton
              variant="outline"
              onclick={() => {
                isEditing = false;
                editOutcome = plan.outcome;
              }}>Cancel</ComicButton
            >
          </div>
        {:else if plan.outcome}
          <ComicMarkdown content={plan.outcome} />
        {:else}
          <p class="empty-outcome">No outcome recorded yet. Click Edit to add a retrospective.</p>
        {/if}
      </ComicCard>
    {/if}

    <!-- Related Content (2C) -->
    <RelatedContent
      collection="plans"
      id={planId}
      query={buildRelatedQuery([plan.title, plan.content, plan.trigger])}
    />

    <!-- Transition Dialog -->
    <ComicDialog
      title="Transition Plan"
      bind:open={showTransition}
      onclose={() => (showTransition = false)}
    >
      <div class="transition-form">
        <p class="transition-label">Move from <strong>{plan.status}</strong> to:</p>
        <div class="transition-options">
          {#each allowedTransitions as t (t)}
            <ComicButton
              variant={selectedTransition === t ? 'primary' : 'outline'}
              onclick={() => (selectedTransition = t)}
            >
              {t.replace('_', ' ')}
            </ComicButton>
          {/each}
        </div>
        <ComicInput
          label="Note (required)"
          bind:value={transitionNote}
          placeholder="Why this transition?"
        />
        <div class="transition-actions">
          <ComicButton
            variant="primary"
            disabled={!selectedTransition || !transitionNote.trim() || isTransitioning}
            onclick={handleTransition}
          >
            {isTransitioning ? 'Transitioning...' : 'Confirm'}
          </ComicButton>
          <ComicButton variant="outline" onclick={() => (showTransition = false)}
            >Cancel</ComicButton
          >
        </div>
      </div>
    </ComicDialog>

    <!-- Delete Confirmation -->
    <ComicDialog title="Delete Plan?" bind:open={showDelete} onclose={() => (showDelete = false)}>
      <p>This will permanently delete this plan. This cannot be undone.</p>
      <div class="transition-actions">
        <ComicButton variant="danger" onclick={handleDelete}>Delete</ComicButton>
        <ComicButton variant="outline" onclick={() => (showDelete = false)}>Cancel</ComicButton>
      </div>
    </ComicDialog>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 900px;
  }
  .plan-header {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .header-top {
    display: flex;
    align-items: center;
  }
  .back-link {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--accent-blue);
    text-decoration: underline;
    font-weight: 700;
  }
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }
  .action-row {
    display: flex;
    gap: var(--spacing-sm);
  }
  .section-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-xl);
    font-weight: 700;
    margin: 0 0 var(--spacing-md);
    text-transform: uppercase;
  }
  .subsection-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-md);
    font-weight: 700;
    margin: var(--spacing-md) 0 var(--spacing-xs);
    color: var(--text-secondary);
  }
  .linked-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  .linked-item {
    color: var(--accent-blue);
    text-decoration: underline;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }
  .linked-meta {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
  .outcome-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
  }
  .outcome-header .section-title {
    margin: 0;
  }
  .outcome-editor {
    width: 100%;
    min-height: 120px;
    font-family: var(--font-comic);
    font-size: var(--font-size-md);
    background: var(--bg-secondary);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    color: var(--text-primary);
    resize: vertical;
  }
  .outcome-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }
  .empty-outcome {
    color: var(--text-muted);
    font-style: italic;
  }
  .transition-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  .transition-label {
    margin: 0;
    font-size: var(--font-size-md);
  }
  .transition-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }
  .transition-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }
  /* Milestones */
  .milestone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }
  .milestone-header .section-title {
    margin: 0;
  }
  .milestone-progress-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
  .milestone-bar-bg {
    width: 100px;
    height: 6px;
    background: var(--border-color);
    border-radius: 3px;
    overflow: hidden;
  }
  .milestone-bar-fill {
    height: 100%;
    background: var(--accent-green);
    border-radius: 3px;
    transition: width 300ms ease;
  }
  .milestone-pct {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }
  .milestone-done-banner {
    background: rgba(0, 210, 106, 0.08);
    border: 1px solid rgba(0, 210, 106, 0.3);
    border-radius: 4px;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--accent-green);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }
  .done-btn {
    background: var(--accent-green);
    color: #1a1a1a;
    border: none;
    padding: 2px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: var(--font-comic);
    font-size: 11px;
    font-weight: 700;
  }
  .milestone-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 var(--spacing-sm);
  }
  .milestone-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  .milestone-check {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    cursor: pointer;
  }
  .milestone-title {
    font-size: var(--font-size-sm);
  }
  .milestone-title.done {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .ms-del {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    transition: color 150ms;
  }
  .ms-del:hover {
    color: var(--accent-red);
  }
  .milestone-add {
    display: flex;
    gap: var(--spacing-xs);
  }
  .milestone-input {
    flex: 1;
    font-size: var(--font-size-sm);
    padding: 6px var(--spacing-sm);
  }
  .ms-add-btn {
    background: var(--accent-green);
    color: #1a1a1a;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1.2rem;
    font-weight: 700;
    transition: opacity 150ms;
  }
  .ms-add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
