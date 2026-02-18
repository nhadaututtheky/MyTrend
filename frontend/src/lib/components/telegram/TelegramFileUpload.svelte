<script lang="ts">
  import { uploadToTelegram, deleteTelegramFile, fetchTelegramFiles } from '$lib/api/telegram';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import type { TelegramFile } from '$lib/types';

  interface Props {
    linkedCollection?: string;
    linkedRecordId?: string;
    maxFiles?: number;
    maxSizeMB?: number;
  }

  let { linkedCollection = '', linkedRecordId = '', maxFiles = 10, maxSizeMB = 50 }: Props = $props();

  let files = $state<TelegramFile[]>([]);
  let isUploading = $state(false);
  let isDragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (linkedCollection && linkedRecordId) {
      loadFiles();
    }
  });

  async function loadFiles(): Promise<void> {
    if (!linkedCollection || !linkedRecordId) return;
    try {
      const result = await fetchTelegramFiles(linkedCollection, linkedRecordId);
      files = result.items as TelegramFile[];
    } catch {
      // may not have files yet
    }
  }

  async function handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selected = input.files;
    if (!selected || selected.length === 0) return;
    await uploadFiles(Array.from(selected));
    input.value = '';
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    isDragOver = false;
    const dropped = event.dataTransfer?.files;
    if (!dropped || dropped.length === 0) return;
    await uploadFiles(Array.from(dropped));
  }

  async function uploadFiles(fileList: File[]): Promise<void> {
    if (files.length + fileList.length > maxFiles) {
      toast.warning(`Maximum ${maxFiles} files allowed`);
      return;
    }

    isUploading = true;
    let uploaded = 0;

    for (const file of fileList) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`${file.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }

      try {
        const result = await uploadToTelegram(file, {
          linkedCollection,
          linkedRecordId,
        });
        files = [...files, {
          id: result.id,
          filename: result.filename,
          mime_type: result.mime_type,
          file_size: result.file_size,
          telegram_msg_id: result.telegram_msg_id,
          created: result.created,
        } as TelegramFile];
        uploaded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${msg}`);
      }
    }

    if (uploaded > 0) {
      toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
    }
    isUploading = false;
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

  function getFileIcon(mime: string): string {
    if (mime.startsWith('image/')) return 'img';
    if (mime.startsWith('video/')) return 'vid';
    if (mime.startsWith('audio/')) return 'aud';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return 'zip';
    return 'doc';
  }
</script>

<div class="tg-upload">
  <!-- Upload area -->
  <div
    class="upload-zone"
    class:drag-over={isDragOver}
    role="button"
    tabindex="0"
    ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
    ondragleave={() => { isDragOver = false; }}
    ondrop={handleDrop}
    onclick={() => fileInput?.click()}
    onkeydown={(e) => { if (e.key === 'Enter') fileInput?.click(); }}
  >
    <input
      bind:this={fileInput}
      type="file"
      multiple
      class="file-input"
      onchange={handleFileSelect}
    />
    {#if isUploading}
      <span class="upload-icon">...</span>
      <span class="upload-text">Uploading to Telegram...</span>
    {:else}
      <span class="upload-icon">+</span>
      <span class="upload-text">Drop files or click to upload</span>
      <span class="upload-hint">Max {maxSizeMB}MB per file | Stored on Telegram</span>
    {/if}
  </div>

  <!-- File list -->
  {#if files.length > 0}
    <div class="file-list">
      {#each files as file (file.id)}
        <div class="file-item">
          <span class="file-icon">[{getFileIcon(file.mime_type)}]</span>
          <div class="file-info">
            <span class="file-name" title={file.filename}>{file.filename}</span>
            <span class="file-meta">{formatSize(file.file_size)}</span>
          </div>
          <ComicButton variant="danger" size="sm" onclick={() => handleDelete(file.id)}>x</ComicButton>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tg-upload {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .upload-zone {
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-sketch, 8px);
    padding: var(--spacing-lg);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--accent-blue);
    background: var(--bg-secondary);
  }

  .file-input {
    display: none;
  }

  .upload-icon {
    font-family: var(--font-comic);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent-blue);
  }

  .upload-text {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .upload-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1.5px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-card);
  }

  .file-icon {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--accent-blue);
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .file-name {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    font-size: 0.7rem;
    color: var(--text-muted);
  }
</style>
