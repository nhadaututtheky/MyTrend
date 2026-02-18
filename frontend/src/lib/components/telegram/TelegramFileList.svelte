<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchTelegramFiles, getTelegramFileUrl, deleteTelegramFile } from '$lib/api/telegram';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type { TelegramFile } from '$lib/types';

  interface Props {
    linkedCollection: string;
    linkedRecordId: string;
    editable?: boolean;
  }

  let { linkedCollection, linkedRecordId, editable = false }: Props = $props();

  let files = $state<TelegramFile[]>([]);
  let isLoading = $state(true);

  onMount(async () => {
    await loadFiles();
  });

  async function loadFiles(): Promise<void> {
    isLoading = true;
    try {
      const result = await fetchTelegramFiles(linkedCollection, linkedRecordId);
      files = result.items as TelegramFile[];
    } catch {
      // no files
    } finally {
      isLoading = false;
    }
  }

  async function handleDelete(fileId: string): Promise<void> {
    try {
      await deleteTelegramFile(fileId);
      files = files.filter((f) => f.id !== fileId);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImage(mime: string): boolean {
    return mime.startsWith('image/');
  }
</script>

{#if isLoading}
  <span class="tg-files-loading">Loading files...</span>
{:else if files.length > 0}
  <div class="tg-files">
    <h3 class="section-title">Attachments ({files.length})</h3>
    <div class="file-grid">
      {#each files as file (file.id)}
        <a href={getTelegramFileUrl(file.id)} target="_blank" rel="noopener" class="file-card" title={file.filename}>
          {#if isImage(file.mime_type)}
            <div class="file-preview">
              <img src={getTelegramFileUrl(file.id)} alt={file.filename} loading="lazy" />
            </div>
          {:else}
            <div class="file-preview file-icon-large">
              {file.filename.split('.').pop()?.toUpperCase() || 'FILE'}
            </div>
          {/if}
          <div class="file-details">
            <span class="file-name">{file.filename}</span>
            <span class="file-meta">{formatSize(file.file_size)}</span>
          </div>
          {#if editable}
            <ComicButton variant="danger" size="sm" onclick={(e: MouseEvent) => { e.preventDefault(); handleDelete(file.id); }}>
              x
            </ComicButton>
          {/if}
        </a>
      {/each}
    </div>
  </div>
{/if}

<style>
  .tg-files {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .tg-files-loading {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .section-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0;
  }

  .file-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .file-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--spacing-xs);
    border: 1.5px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-card);
    text-decoration: none;
    color: inherit;
    width: 120px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .file-card:hover {
    border-color: var(--accent-blue);
  }

  .file-preview {
    width: 100px;
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 4px;
    background: var(--bg-secondary);
  }

  .file-preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: cover;
  }

  .file-icon-large {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--accent-blue);
  }

  .file-details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    width: 100%;
  }

  .file-name {
    font-family: var(--font-comic);
    font-size: 0.7rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    text-align: center;
  }

  .file-meta {
    font-size: 0.65rem;
    color: var(--text-muted);
  }
</style>
