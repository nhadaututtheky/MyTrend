<script lang="ts">
  import { goto } from '$app/navigation';
  import { createIdea } from '$lib/api/ideas';
  import { fetchProjects } from '$lib/api/projects';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import { onMount } from 'svelte';
  import type { Project } from '$lib/types';

  let title = $state('');
  let content = $state('');
  let type = $state('feature');
  let priority = $state('medium');
  let projectId = $state('');
  let tagsStr = $state('');
  let isCreating = $state(false);
  let projects = $state<Project[]>([]);

  onMount(async () => {
    try { const r = await fetchProjects(); projects = r.items; } catch { /* optional */ }
  });

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    isCreating = true;
    try {
      const tags = tagsStr.split(',').map((s) => s.trim()).filter(Boolean);
      const idea = await createIdea({
        title, content, type: type as 'feature', priority: priority as 'medium',
        project: projectId || null, tags, status: 'inbox', related_ideas: [],
      });
      toast.success('Idea created!');
      await goto(`/ideas/${idea.id}`);
    } catch (err: unknown) { console.error('[Ideas/New]', err); toast.error('Failed to create idea'); }
    finally { isCreating = false; }
  }
</script>

<svelte:head><title>New Idea - MyTrend</title></svelte:head>

<div class="new-idea-page">
  <ComicCard>
    <h1 class="comic-heading">New Idea</h1>
    <form onsubmit={handleSubmit}>
      <div class="fields">
        <ComicInput bind:value={title} label="Title" placeholder="What's the idea?" required />
        <div class="field">
          <label class="label" for="content">Description</label>
          <textarea id="content" class="comic-input textarea" bind:value={content} rows="5" placeholder="Describe the idea..."></textarea>
        </div>
        <div class="row">
          <div class="field">
            <label class="label" for="type">Type</label>
            <select id="type" class="comic-input" bind:value={type}>
              <option value="feature">Feature</option><option value="bug">Bug</option>
              <option value="design">Design</option><option value="architecture">Architecture</option>
              <option value="optimization">Optimization</option><option value="question">Question</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="priority">Priority</label>
            <select id="priority" class="comic-input" bind:value={priority}>
              <option value="low">Low</option><option value="medium">Medium</option>
              <option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="label" for="project">Project (optional)</label>
          <select id="project" class="comic-input" bind:value={projectId}>
            <option value="">None</option>
            {#each projects as p (p.id)}<option value={p.id}>{p.icon} {p.name}</option>{/each}
          </select>
        </div>
        <ComicInput bind:value={tagsStr} label="Tags" placeholder="svelte, performance, ux (comma-separated)" />
      </div>
      <div class="actions">
        <ComicButton variant="primary" type="submit" loading={isCreating}>Create Idea</ComicButton>
        <ComicButton variant="outline" onclick={() => goto('/ideas')}>Cancel</ComicButton>
      </div>
    </form>
  </ComicCard>
</div>

<style>
  .new-idea-page { max-width: 550px; }
  .fields { display: flex; flex-direction: column; gap: var(--spacing-md); margin: var(--spacing-lg) 0; }
  .field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .label { font-family: var(--font-comic); font-size: 0.875rem; font-weight: 700; }
  .textarea { resize: vertical; min-height: 80px; font-family: var(--font-comic); line-height: 1.5; }
  .row { display: flex; gap: var(--spacing-md); }
  .actions { display: flex; gap: var(--spacing-sm); }
</style>
