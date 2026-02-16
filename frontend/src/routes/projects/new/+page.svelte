<script lang="ts">
  import { goto } from '$app/navigation';
  import { createProject } from '$lib/api/projects';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import { getProjectColor } from '$lib/utils/colors';

  let name = $state('');
  let description = $state('');
  let icon = $state('📁');
  let techStackStr = $state('');
  let isCreating = $state(false);

  const slug = $derived(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const color = $derived(getProjectColor(name.length));

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) return;
    isCreating = true;
    try {
      const techStack = techStackStr.split(',').map((s) => s.trim()).filter(Boolean);
      await createProject({ name, slug, description, color, icon, tech_stack: techStack, status: 'active' });
      toast.success('Project created!');
      await goto(`/projects/${slug}`);
    } catch (err: unknown) {
      console.error('[Projects/New]', err);
      toast.error('Failed to create project');
    } finally {
      isCreating = false;
    }
  }
</script>

<svelte:head><title>New Project - MyTrend</title></svelte:head>

<div class="new-project-page">
  <ComicCard>
    <h1 class="comic-heading">New Project</h1>
    <form onsubmit={handleSubmit}>
      <div class="fields">
        <ComicInput bind:value={name} label="Project Name" placeholder="My Awesome Project" required />
        <div class="slug-preview">Slug: <code>{slug || '...'}</code></div>
        <ComicInput bind:value={icon} label="Icon (emoji)" placeholder="📁" />
        <div class="field">
          <label class="label" for="description">Description</label>
          <textarea id="description" class="comic-input textarea" bind:value={description} placeholder="What is this project about?" rows="3"></textarea>
        </div>
        <ComicInput bind:value={techStackStr} label="Tech Stack" placeholder="TypeScript, Svelte, PocketBase (comma-separated)" />
      </div>
      <div class="actions">
        <ComicButton variant="primary" type="submit" loading={isCreating}>Create Project</ComicButton>
        <ComicButton variant="outline" onclick={() => goto('/projects')}>Cancel</ComicButton>
      </div>
    </form>
  </ComicCard>
</div>

<style>
  .new-project-page { max-width: 550px; }
  .fields { display: flex; flex-direction: column; gap: var(--spacing-md); margin: var(--spacing-lg) 0; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .label { font-family: var(--font-comic); font-size: 0.875rem; font-weight: 700; }
  .textarea { resize: vertical; min-height: 60px; font-family: var(--font-comic); line-height: 1.5; }
  .slug-preview { font-size: 0.75rem; color: var(--text-muted); }
  .slug-preview code { background: var(--bg-secondary); padding: 1px 4px; border-radius: 2px; }
  .actions { display: flex; gap: var(--spacing-sm); }
</style>
