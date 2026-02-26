<script lang="ts">
  import { goto } from '$app/navigation';
  import { createIdea } from '$lib/api/ideas';
  import { fetchProjects } from '$lib/api/projects';
  import { uploadToTelegram } from '$lib/api/telegram';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import type { Project } from '$lib/types';

  let title = $state('');
  let content = $state('');
  let type = $state('feature');
  let priority = $state('medium');
  let projectId = $state('');
  let tagsStr = $state('');
  let isCreating = $state(false);
  let projects = $state<Project[]>([]);
  let pendingFiles = $state<File[]>([]);
  let fileInput: HTMLInputElement | undefined = $state();

  // Duplicate detection
  type SimilarIdea = { id: string; title: string; status: string; type: string; score: number };
  let similarIdeas = $state<SimilarIdea[]>([]);
  let dupCheckTimer: ReturnType<typeof setTimeout> | undefined;

  async function checkDuplicates(text: string): Promise<void> {
    if (text.trim().length < 8) {
      similarIdeas = [];
      return;
    }
    try {
      const token = pb.authStore.token;
      const res = await fetch(`/api/mytrend/ideas/similar?text=${encodeURIComponent(text)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { items: SimilarIdea[] };
        similarIdeas = data.items ?? [];
      }
    } catch {
      /* non-critical */
    }
  }

  function onTitleInput(): void {
    clearTimeout(dupCheckTimer);
    dupCheckTimer = setTimeout(() => {
      void checkDuplicates(title + ' ' + content);
    }, 600);
  }

  onMount(async () => {
    try {
      const r = await fetchProjects();
      projects = r.items;
    } catch {
      /* optional */
    }
  });

  function handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      pendingFiles = [...pendingFiles, ...Array.from(input.files)];
      input.value = '';
    }
  }

  function removePendingFile(index: number): void {
    pendingFiles = pendingFiles.filter((_, i) => i !== index);
  }

  async function uploadPendingFiles(ideaId: string): Promise<void> {
    if (pendingFiles.length === 0) return;
    let uploaded = 0;
    for (const file of pendingFiles) {
      try {
        await uploadToTelegram(file, {
          linkedCollection: 'ideas',
          linkedRecordId: ideaId,
        });
        uploaded++;
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    if (uploaded > 0) toast.info(`${uploaded} file(s) uploaded to Telegram`);
  }

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    isCreating = true;
    try {
      const tags = tagsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const idea = await createIdea({
        title,
        content,
        type: type as 'feature',
        priority: priority as 'medium',
        project: projectId || null,
        tags,
        status: 'inbox',
        related_ideas: [],
      });

      await uploadPendingFiles(idea.id);

      toast.success('Idea created!');
      await goto(`/ideas/${idea.id}`);
    } catch (err: unknown) {
      console.error('[Ideas/New]', err);
      toast.error('Failed to create idea');
    } finally {
      isCreating = false;
    }
  }
</script>

<svelte:head><title>New Idea - MyTrend</title></svelte:head>

<div class="new-idea-page">
  <ComicCard>
    <h1 class="comic-heading">New Idea</h1>
    <form onsubmit={handleSubmit}>
      <div class="fields">
        <ComicInput
          bind:value={title}
          label="Title"
          placeholder="What's the idea?"
          required
          oninput={onTitleInput}
        />
        <div class="field">
          <label class="label" for="content">Description</label>
          <textarea
            id="content"
            class="comic-input textarea"
            bind:value={content}
            rows="5"
            placeholder="Describe the idea..."
          ></textarea>
        </div>
        <div class="row">
          <div class="field">
            <label class="label" for="type">Type</label>
            <select id="type" class="comic-input" bind:value={type}>
              <option value="feature">Feature</option><option value="bug">Bug</option>
              <option value="design">Design</option><option value="architecture"
                >Architecture</option
              >
              <option value="optimization">Optimization</option><option value="question"
                >Question</option
              >
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
        <ComicInput
          bind:value={tagsStr}
          label="Tags"
          placeholder="svelte, performance, ux (comma-separated)"
        />

        <!-- File attachments -->
        <div class="field">
          <label class="label" for="file-attachments">Attachments (Telegram Storage)</label>
          <div
            class="upload-zone"
            role="button"
            tabindex="0"
            onclick={() => fileInput?.click()}
            onkeydown={(e) => {
              if (e.key === 'Enter') fileInput?.click();
            }}
          >
            <input
              id="file-attachments"
              bind:this={fileInput}
              type="file"
              multiple
              class="file-input"
              onchange={handleFileSelect}
            />
            <span class="upload-text">+ Drop files or click (max 50MB each)</span>
          </div>
          {#if pendingFiles.length > 0}
            <div class="pending-files">
              {#each pendingFiles as file, i (file.name + i)}
                <div class="pending-file">
                  <span class="pending-name">{file.name}</span>
                  <button type="button" class="pending-remove" onclick={() => removePendingFile(i)}
                    >x</button
                  >
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      {#if similarIdeas.length > 0}
        <div class="dup-warning" role="alert">
          <p class="dup-header">Similar ideas found — check before creating:</p>
          {#each similarIdeas as idea (idea.id)}
            <a href="/ideas/{idea.id}" class="dup-item" target="_blank" rel="noreferrer">
              <span class="dup-title">{idea.title}</span>
              <span class="dup-meta">{idea.status} · {idea.type}</span>
            </a>
          {/each}
        </div>
      {/if}

      <div class="actions">
        <ComicButton variant="primary" type="submit" loading={isCreating}>Create Idea</ComicButton>
        <ComicButton variant="outline" onclick={() => goto('/ideas')}>Cancel</ComicButton>
      </div>
    </form>
  </ComicCard>
</div>

<style>
  .new-idea-page {
    max-width: 550px;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin: var(--spacing-lg) 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
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
  .row {
    display: flex;
    gap: var(--spacing-md);
  }
  .actions {
    display: flex;
    gap: var(--spacing-sm);
  }
  .upload-zone {
    border: 2px dashed var(--border-color);
    border-radius: 6px;
    padding: var(--spacing-md);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .upload-zone:hover {
    border-color: var(--accent-blue);
  }
  .file-input {
    display: none;
  }
  .upload-text {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .pending-files {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .pending-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-card);
  }
  .pending-name {
    font-family: var(--font-comic);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .pending-remove {
    background: none;
    border: none;
    color: var(--accent-red);
    font-weight: 700;
    cursor: pointer;
    padding: 0 4px;
  }

  .dup-warning {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 2px solid var(--accent-yellow);
    border-radius: 6px;
    background: rgba(255, 230, 109, 0.08);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dup-header {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-yellow);
    margin: 0 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dup-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: 4px 6px;
    border-radius: 4px;
    text-decoration: none;
    color: inherit;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    transition: background 150ms;
  }

  .dup-item:hover {
    background: var(--bg-elevated);
  }

  .dup-title {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .dup-meta {
    font-size: 0.7rem;
    color: var(--text-muted);
    white-space: nowrap;
    text-transform: capitalize;
  }
</style>
