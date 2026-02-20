<script lang="ts">
  import { goto } from '$app/navigation';
  import { createPlan } from '$lib/api/plans';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import { toast } from '$lib/stores/toast';
  import type { PlanType } from '$lib/types';

  let title = $state('');
  let planType = $state<PlanType>('implementation');
  let priority = $state('medium');
  let complexity = $state('moderate');
  let estimatedEffort = $state('');
  let trigger = $state('');
  let content = $state('');
  let reasoning = $state('');
  let alternatives = $state('');
  let tagsInput = $state('');
  let isSubmitting = $state(false);

  const typeTabs = [
    { id: 'implementation', label: 'Implementation' },
    { id: 'architecture', label: 'Architecture' },
    { id: 'design', label: 'Design' },
    { id: 'refactor', label: 'Refactor' },
    { id: 'bugfix', label: 'Bug Fix' },
    { id: 'investigation', label: 'Investigation' },
    { id: 'migration', label: 'Migration' },
  ];

  async function handleSubmit(): Promise<void> {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    isSubmitting = true;
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const plan = await createPlan({
        title: title.trim(),
        slug: title.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').substring(0, 200),
        plan_type: planType,
        status: 'draft',
        priority: priority as 'low' | 'medium' | 'high' | 'critical',
        complexity: complexity as 'trivial' | 'simple' | 'moderate' | 'complex' | 'epic',
        estimated_effort: estimatedEffort,
        trigger,
        content,
        reasoning,
        alternatives,
        tags,
        extraction_source: 'manual',
        extraction_confidence: 1.0,
      });
      toast.success('Plan created');
      goto(`/plans/${plan.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create plan');
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head><title>New Plan - MyTrend</title></svelte:head>

<div class="page">
  <div class="page-header">
    <a href="/plans" class="back-link">Back to Plans</a>
    <h1 class="comic-heading">New Plan</h1>
  </div>

  <ComicCard>
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="plan-form">
      <ComicInput label="Title" bind:value={title} placeholder="What is this plan about?" required />

      <div class="field">
        <span class="field-label">Type</span>
        <ComicTabs tabs={typeTabs} bind:active={planType} />
      </div>

      <div class="row">
        <div class="field">
          <label class="field-label" for="priority">Priority</label>
          <select id="priority" class="comic-select" bind:value={priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="complexity">Complexity</label>
          <select id="complexity" class="comic-select" bind:value={complexity}>
            <option value="trivial">Trivial</option>
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="complex">Complex</option>
            <option value="epic">Epic</option>
          </select>
        </div>
        <div class="field">
          <ComicInput label="Estimated Effort" bind:value={estimatedEffort} placeholder="e.g. 2-3 hours" />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="trigger">Trigger / Context</label>
        <textarea id="trigger" class="comic-textarea" bind:value={trigger} placeholder="What triggered this plan? What problem needs solving?" rows="3"></textarea>
      </div>

      <div class="field">
        <label class="field-label" for="content">Plan Content</label>
        <textarea id="content" class="comic-textarea" bind:value={content} placeholder="The actual plan - steps, approach, details (supports markdown)" rows="10"></textarea>
      </div>

      <div class="field">
        <label class="field-label" for="reasoning">Reasoning</label>
        <textarea id="reasoning" class="comic-textarea" bind:value={reasoning} placeholder="Why this approach? Trade-offs considered?" rows="4"></textarea>
      </div>

      <div class="field">
        <label class="field-label" for="alternatives">Alternatives Rejected</label>
        <textarea id="alternatives" class="comic-textarea" bind:value={alternatives} placeholder="What other approaches were considered and why were they rejected?" rows="3"></textarea>
      </div>

      <ComicInput label="Tags (comma-separated)" bind:value={tagsInput} placeholder="e.g. frontend, svelte, performance" />

      <div class="actions">
        <ComicButton variant="primary" disabled={isSubmitting || !title.trim()}>
          {isSubmitting ? 'Creating...' : 'Create Plan'}
        </ComicButton>
        <a href="/plans"><ComicButton variant="outline">Cancel</ComicButton></a>
      </div>
    </form>
  </ComicCard>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: var(--spacing-lg); max-width: 800px; }
  .page-header { display: flex; flex-direction: column; gap: var(--spacing-sm); }
  .back-link { font-family: var(--font-comic); font-size: var(--font-size-sm); color: var(--accent-blue); text-decoration: underline; font-weight: 700; }
  .plan-form { display: flex; flex-direction: column; gap: var(--spacing-lg); }
  .field { display: flex; flex-direction: column; gap: var(--spacing-xs); }
  .field-label { font-family: var(--font-comic); font-size: var(--font-size-sm); font-weight: 700; text-transform: uppercase; color: var(--text-secondary); }
  .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-md); }

  .comic-select, .comic-textarea {
    font-family: var(--font-comic);
    font-size: var(--font-size-md);
    background: var(--bg-secondary);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--text-primary);
    width: 100%;
  }

  .comic-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }

  .comic-select:focus, .comic-textarea:focus {
    outline: none;
    border-color: var(--accent-green);
    box-shadow: var(--shadow-sm);
  }

  .actions { display: flex; gap: var(--spacing-sm); }
  .actions a { text-decoration: none; }

  @media (max-width: 768px) {
    .row { grid-template-columns: 1fr; }
  }
</style>
