<script lang="ts">
  import { goto } from '$app/navigation';
  import { createSession } from '$lib/api/hub';
  import { fetchProjects } from '$lib/api/projects';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import { onMount } from 'svelte';
  import type { Project } from '$lib/types';

  let name = $state('');
  let selectedProject = $state('');
  let model = $state('claude-sonnet-4-5-20250929');
  let systemPrompt = $state('');
  let isCreating = $state(false);
  let projects = $state<Project[]>([]);

  const MODELS = [
    { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  ];

  onMount(async () => {
    try {
      const result = await fetchProjects(1, 'active');
      projects = result.items;
    } catch {
      // Projects are optional
    }
  });

  async function handleCreate(): Promise<void> {
    isCreating = true;
    try {
      const session = await createSession({
        name: name || undefined,
        project: selectedProject || undefined,
        model,
        system_prompt: systemPrompt,
      });
      toast.success('Session created!');
      await goto(`/hub/${session.id}`);
    } catch (err: unknown) {
      console.error('[Hub/New]', err);
      toast.error('Failed to create session');
    } finally {
      isCreating = false;
    }
  }
</script>

<svelte:head>
  <title>New Session - Hub - MyTrend</title>
</svelte:head>

<div class="new-session-page">
  <ComicCard>
    <h2 class="comic-heading">New Hub Session</h2>

    <div class="form-fields">
      <ComicInput
        bind:value={name}
        label="Session Name"
        placeholder="Leave empty for auto-generated name"
      />

      <div class="field">
        <label class="label" for="project-select">Project (optional)</label>
        <select id="project-select" class="comic-input" bind:value={selectedProject}>
          <option value="">No project</option>
          {#each projects as project (project.id)}
            <option value={project.id}>{project.icon} {project.name}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label class="label" for="model-select">Model</label>
        <select id="model-select" class="comic-input" bind:value={model}>
          {#each MODELS as m (m.value)}
            <option value={m.value}>{m.label}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label class="label" for="system-prompt">System Prompt (optional)</label>
        <textarea
          id="system-prompt"
          class="comic-input textarea"
          bind:value={systemPrompt}
          placeholder="Custom system instructions for this session..."
          rows="4"
        ></textarea>
      </div>
    </div>

    <div class="actions">
      <ComicButton variant="primary" loading={isCreating} onclick={handleCreate}>
        Create Session
      </ComicButton>
      <ComicButton variant="outline" onclick={() => goto('/hub')}>
        Cancel
      </ComicButton>
    </div>
  </ComicCard>
</div>

<style>
  .new-session-page {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin: var(--spacing-lg) 0;
    width: 450px;
    max-width: 100%;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .textarea {
    resize: vertical;
    min-height: 80px;
    font-family: var(--font-comic);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: var(--spacing-sm);
  }
</style>
