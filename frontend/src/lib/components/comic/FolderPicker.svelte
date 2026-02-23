<script lang="ts">
  import { browseDir } from '$lib/api/companion';
  import type { BrowseDirResult } from '$lib/api/companion';
  import ComicButton from './ComicButton.svelte';

  let {
    value = $bindable(''),
    label = 'Directory',
    placeholder = 'Select a folder...',
  }: {
    value: string;
    label?: string;
    placeholder?: string;
  } = $props();

  let open = $state(false);
  let loading = $state(false);
  let browseResult = $state<BrowseDirResult | null>(null);
  let history = $state<string[]>([]);

  async function browse(path?: string): Promise<void> {
    loading = true;
    try {
      browseResult = await browseDir(path);
    } catch {
      browseResult = { path: path || '', dirs: [], error: 'Companion offline' };
    } finally {
      loading = false;
    }
  }

  async function openBrowser(): Promise<void> {
    open = true;
    history = [];
    await browse(value || undefined);
  }

  async function navigateTo(dir: string): Promise<void> {
    if (browseResult?.path) {
      history = [...history, browseResult.path];
    }
    await browse(dir);
  }

  async function goBack(): Promise<void> {
    const prev = history[history.length - 1];
    history = history.slice(0, -1);
    await browse(prev || undefined);
  }

  function selectCurrent(): void {
    if (browseResult?.path) {
      value = browseResult.path;
    }
    open = false;
  }

  function selectDir(dir: string): void {
    value = dir;
    open = false;
  }

  function getFolderName(fullPath: string): string {
    const sep = fullPath.includes('\\') ? '\\' : '/';
    const parts = fullPath.split(sep).filter(Boolean);
    return parts[parts.length - 1] || fullPath;
  }
</script>

<div class="folder-picker">
  <label class="fp-label" for="fp-input">{label}</label>
  <div class="fp-input-row">
    <input
      id="fp-input"
      class="comic-input fp-text"
      type="text"
      bind:value
      {placeholder}
    />
    <ComicButton variant="outline" onclick={openBrowser}>Browse</ComicButton>
  </div>

  {#if open}
    <div class="fp-browser">
      <div class="fp-toolbar">
        <ComicButton variant="outline" onclick={goBack} disabled={history.length === 0}>
          ..
        </ComicButton>
        <span class="fp-path" title={browseResult?.path || 'Root'}>
          {browseResult?.path || 'Drives'}
        </span>
        {#if browseResult?.hasGit}
          <span class="fp-git-badge">git</span>
        {/if}
      </div>

      {#if loading}
        <div class="fp-loading">Loading...</div>
      {:else if browseResult?.error}
        <div class="fp-error">{browseResult.error}</div>
      {:else}
        <div class="fp-list">
          {#each browseResult?.dirs ?? [] as dir (dir)}
            <div class="fp-item">
              <button
                class="fp-folder-btn"
                type="button"
                ondblclick={() => navigateTo(dir)}
                onclick={() => navigateTo(dir)}
              >
                {getFolderName(dir)}
              </button>
              <button
                class="fp-select-btn"
                type="button"
                onclick={() => selectDir(dir)}
                title="Select this folder"
              >
                Select
              </button>
            </div>
          {/each}
          {#if (browseResult?.dirs ?? []).length === 0}
            <div class="fp-empty">No subfolders</div>
          {/if}
        </div>
      {/if}

      <div class="fp-footer">
        {#if browseResult?.path && !browseResult?.isRoot}
          <ComicButton variant="primary" onclick={selectCurrent}>
            Select Current Folder
          </ComicButton>
        {/if}
        <ComicButton variant="outline" onclick={() => { open = false; }}>Close</ComicButton>
      </div>
    </div>
  {/if}
</div>

<style>
  .folder-picker {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .fp-label {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .fp-input-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .fp-text {
    flex: 1;
    min-width: 0;
  }

  .fp-browser {
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    max-height: 320px;
    display: flex;
    flex-direction: column;
    margin-top: 4px;
  }

  .fp-toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .fp-path {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .fp-git-badge {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--accent-green);
    background: var(--bg-primary);
    border: 1px solid var(--accent-green);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
  }

  .fp-list {
    overflow-y: auto;
    max-height: 200px;
    padding: var(--spacing-xs);
  }

  .fp-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .fp-folder-btn {
    flex: 1;
    text-align: left;
    padding: 4px var(--spacing-sm);
    border: none;
    background: none;
    cursor: pointer;
    font-family: var(--font-comic);
    font-size: 0.8rem;
    color: var(--text-primary);
    border-radius: 3px;
  }

  .fp-folder-btn:hover {
    background: var(--bg-secondary);
  }

  .fp-select-btn {
    font-family: var(--font-comic);
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-secondary);
    color: var(--accent-green);
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .fp-item:hover .fp-select-btn {
    opacity: 1;
  }

  .fp-select-btn:hover {
    background: var(--accent-green);
    color: var(--bg-primary);
  }

  .fp-loading,
  .fp-error,
  .fp-empty {
    padding: var(--spacing-md);
    text-align: center;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .fp-error {
    color: var(--accent-red);
  }

  .fp-footer {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-top: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }
</style>
