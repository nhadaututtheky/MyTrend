<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchTelegramFiles,
    getTelegramFileUrl,
    getTelegramStatus,
    deleteTelegramFile,
    uploadToTelegram,
  } from '$lib/api/telegram';
  import { toast } from '$lib/stores/toast';
  import type { TelegramFile, TelegramStatus } from '$lib/types';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';

  type FileFilter = 'all' | 'images' | 'documents' | 'archives' | 'other';

  let status = $state<TelegramStatus | null>(null);
  let files = $state<TelegramFile[]>([]);
  let isLoading = $state(true);
  let isUploading = $state(false);
  let isDragOver = $state(false);
  let activeFilter = $state<FileFilter>('all');
  let fileInput: HTMLInputElement | undefined = $state();

  const FILTERS: { key: FileFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'images', label: 'Images' },
    { key: 'documents', label: 'Docs' },
    { key: 'archives', label: 'Archives' },
    { key: 'other', label: 'Other' },
  ];

  function matchesFilter(mime: string, filter: FileFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'images') return mime.startsWith('image/');
    if (filter === 'documents') {
      return (
        mime.includes('pdf') ||
        mime.includes('text') ||
        mime.includes('document') ||
        mime.includes('spreadsheet') ||
        mime.includes('presentation') ||
        mime.includes('json') ||
        mime.includes('markdown') ||
        mime.includes('yaml') ||
        mime.includes('xml')
      );
    }
    if (filter === 'archives') {
      return mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip');
    }
    // 'other'
    return (
      !mime.startsWith('image/') &&
      !mime.includes('pdf') &&
      !mime.includes('text') &&
      !mime.includes('document') &&
      !mime.includes('spreadsheet') &&
      !mime.includes('zip') &&
      !mime.includes('tar') &&
      !mime.includes('rar')
    );
  }

  const filteredFiles = $derived(files.filter((f) => matchesFilter(f.mime_type, activeFilter)));

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getFileTypeIcon(mime: string): string {
    if (mime.startsWith('image/')) return 'IMG';
    if (mime.startsWith('video/')) return 'VID';
    if (mime.startsWith('audio/')) return 'AUD';
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return 'ZIP';
    if (mime.includes('json')) return 'JSON';
    if (mime.includes('text') || mime.includes('markdown')) return 'TXT';
    if (mime.includes('document')) return 'DOC';
    if (mime.includes('spreadsheet')) return 'XLS';
    return 'FILE';
  }

  function getFileExtColor(mime: string): 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'yellow' {
    if (mime.startsWith('image/')) return 'green';
    if (mime.includes('pdf')) return 'red';
    if (mime.includes('zip') || mime.includes('tar')) return 'purple';
    if (mime.includes('json') || mime.includes('text')) return 'yellow';
    if (mime.includes('document') || mime.includes('spreadsheet')) return 'blue';
    return 'orange';
  }

  async function loadData(): Promise<void> {
    isLoading = true;
    try {
      const [statusRes, filesRes] = await Promise.allSettled([
        getTelegramStatus(),
        fetchTelegramFiles(),
      ]);
      if (statusRes.status === 'fulfilled') status = statusRes.value;
      if (filesRes.status === 'fulfilled') files = filesRes.value.items as TelegramFile[];
    } catch {
      toast.error('Failed to load files');
    } finally {
      isLoading = false;
    }
  }

  async function handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selected = input.files;
    if (!selected || selected.length === 0) return;
    await uploadFiles(Array.from(selected));
    input.value = '';
  }

  async function handleDrop(event: Event): Promise<void> {
    event.preventDefault();
    isDragOver = false;
    // eslint-disable-next-line no-undef
    const dropped = (event as DragEvent).dataTransfer?.files;
    if (!dropped || dropped.length === 0) return;
    await uploadFiles(Array.from(dropped));
  }

  async function uploadFiles(fileList: File[]): Promise<void> {
    isUploading = true;
    let uploaded = 0;

    for (const file of fileList) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 50MB limit`);
        continue;
      }
      try {
        const result = await uploadToTelegram(file);
        files = [
          {
            id: result.id,
            filename: result.filename,
            mime_type: result.mime_type,
            file_size: result.file_size,
            telegram_msg_id: result.telegram_msg_id,
            created: result.created,
          } as TelegramFile,
          ...files,
        ];
        uploaded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        toast.error(`Failed: ${file.name} - ${msg}`);
      }
    }

    if (uploaded > 0) {
      toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
    }
    isUploading = false;
  }

  async function handleDelete(fileId: string, filename: string): Promise<void> {
    if (!window.confirm(`Delete "${filename}"? This removes it from Telegram too.`)) return;
    try {
      await deleteTelegramFile(fileId);
      files = files.filter((f) => f.id !== fileId);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<svelte:head>
  <title>Files | MyTrend</title>
</svelte:head>

<div class="files-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-left">
      <h1 class="page-title">Files</h1>
      <span class="page-subtitle">Telegram Cloud Storage</span>
    </div>
    {#if status?.configured}
      <div class="storage-stats">
        <ComicBadge color="blue" size="sm">
          {status.total_files} file{status.total_files !== 1 ? 's' : ''}
        </ComicBadge>
        <ComicBadge color="green" size="sm">
          {formatSize(status.total_size)}
        </ComicBadge>
      </div>
    {/if}
  </header>

  {#if isLoading}
    <div class="loading-state">
      <div class="skeleton-grid">
        {#each Array(6) as _}
          <div class="skeleton-card"></div>
        {/each}
      </div>
    </div>
  {:else if !status?.configured}
    <!-- Telegram not configured -->
    <ComicCard>
      <div class="config-prompt">
        <h2 class="config-title">Telegram Storage Not Configured</h2>
        <p class="config-desc">
          Files are stored on Telegram using a Bot + Private Channel.
          Set up your Bot Token and Channel ID in Settings to get started.
        </p>
        <a href="/settings" class="config-link">
          <ComicButton variant="primary">Go to Settings</ComicButton>
        </a>
      </div>
    </ComicCard>
  {:else}
    <!-- Upload zone -->
    <div
      class="upload-zone"
      class:drag-over={isDragOver}
      class:uploading={isUploading}
      role="button"
      tabindex="0"
      aria-label="Upload files"
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
        class="file-input-hidden"
        onchange={handleFileSelect}
      />
      {#if isUploading}
        <span class="upload-icon uploading-icon">...</span>
        <span class="upload-label">Uploading to Telegram...</span>
      {:else}
        <span class="upload-icon">+</span>
        <span class="upload-label">Drop files here or click to upload</span>
        <span class="upload-hint">Max 50MB per file | Stored on Telegram</span>
      {/if}
    </div>

    <!-- Filter bar -->
    {#if files.length > 0}
      <div class="filter-bar">
        {#each FILTERS as f (f.key)}
          <button
            class="filter-btn"
            class:active={activeFilter === f.key}
            onclick={() => { activeFilter = f.key; }}
          >
            {f.label}
            {#if f.key !== 'all'}
              <span class="filter-count">
                {files.filter((file) => matchesFilter(file.mime_type, f.key)).length}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- File grid -->
    {#if filteredFiles.length === 0 && files.length === 0}
      <ComicEmptyState
        message="No files yet"
        description="Upload files to store them on Telegram cloud"
        illustration="inbox"
      />
    {:else if filteredFiles.length === 0}
      <ComicEmptyState
        message="No files match this filter"
        illustration="search"
      />
    {:else}
      <div class="file-grid">
        {#each filteredFiles as file (file.id)}
          <div class="file-card">
            <a
              href={getTelegramFileUrl(file.id)}
              target="_blank"
              rel="noopener"
              class="file-preview-link"
              title={'Download ' + file.filename}
            >
              {#if file.mime_type.startsWith('image/')}
                <div class="file-preview">
                  <img
                    src={getTelegramFileUrl(file.id)}
                    alt={file.filename}
                    loading="lazy"
                  />
                </div>
              {:else}
                <div class="file-preview file-type-icon">
                  <span class="type-label">{getFileTypeIcon(file.mime_type)}</span>
                  <span class="type-ext">.{file.filename.split('.').pop() ?? ''}</span>
                </div>
              {/if}
            </a>
            <div class="file-info">
              <span class="file-name" title={file.filename}>{file.filename}</span>
              <div class="file-meta-row">
                <ComicBadge color={getFileExtColor(file.mime_type)} size="sm">
                  {getFileTypeIcon(file.mime_type)}
                </ComicBadge>
                <span class="file-size">{formatSize(file.file_size)}</span>
                <span class="file-date">{formatDate(file.created)}</span>
              </div>
              {#if file.linked_collection}
                <span class="file-linked">
                  Linked: {file.linked_collection}
                </span>
              {/if}
            </div>
            <div class="file-actions">
              <a
                href={getTelegramFileUrl(file.id)}
                target="_blank"
                rel="noopener"
                class="action-btn download"
                title="Download"
                aria-label={'Download ' + file.filename}
              >
                DL
              </a>
              <button
                class="action-btn delete"
                title="Delete"
                aria-label={'Delete ' + file.filename}
                onclick={() => handleDelete(file.id, file.filename)}
              >
                x
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .files-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  /* Header */
  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-md);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .page-title {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }

  .page-subtitle {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 700;
  }

  .storage-stats {
    display: flex;
    gap: var(--spacing-sm);
  }

  /* Loading */
  .loading-state {
    padding: var(--spacing-md) 0;
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-md);
  }

  .skeleton-card {
    height: 160px;
    border-radius: var(--radius-sketch);
    background: var(--bg-secondary);
    border: var(--border-width) solid var(--border-color);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.8; }
  }

  /* Config prompt */
  .config-prompt {
    text-align: center;
    padding: var(--spacing-xl);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
  }

  .config-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    margin: 0;
  }

  .config-desc {
    font-size: 0.875rem;
    color: var(--text-secondary);
    max-width: 400px;
    margin: 0;
  }

  .config-link {
    text-decoration: none;
  }

  /* Upload zone */
  .upload-zone {
    border: 2.5px dashed var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-xl) var(--spacing-lg);
    text-align: center;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
    background: var(--bg-card);
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--accent-blue);
    background: var(--bg-secondary);
    box-shadow: var(--shadow-comic-md);
  }

  .upload-zone.uploading {
    border-color: var(--accent-yellow);
    pointer-events: none;
  }

  .file-input-hidden {
    display: none;
  }

  .upload-icon {
    font-family: var(--font-comic);
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent-blue);
    line-height: 1;
  }

  .uploading-icon {
    color: var(--accent-yellow);
    animation: pulse 1s ease-in-out infinite;
  }

  .upload-label {
    font-family: var(--font-comic);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .upload-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Filter bar */
  .filter-bar {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .filter-btn {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .filter-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .filter-btn.active {
    background: var(--accent-green);
    color: #1a1a1a;
    box-shadow: 3px 3px 0 var(--border-color);
    transform: translate(-1px, -1px);
  }

  .filter-count {
    font-size: 0.7rem;
    opacity: 0.7;
  }

  /* File grid */
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--spacing-md);
  }

  .file-card {
    display: flex;
    flex-direction: column;
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    overflow: hidden;
    box-shadow: var(--shadow-md);
    transition:
      transform 200ms ease,
      box-shadow 200ms ease;
  }

  .file-card:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--shadow-lg);
  }

  .file-preview-link {
    text-decoration: none;
    color: inherit;
  }

  .file-preview {
    width: 100%;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-type-icon {
    flex-direction: column;
    gap: 2px;
  }

  .type-label {
    font-family: var(--font-comic);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent-blue);
  }

  .type-ext {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .file-info {
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .file-name {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
  }

  .file-meta-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .file-size,
  .file-date {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .file-linked {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .file-actions {
    display: flex;
    border-top: 1px solid var(--border-color);
  }

  .action-btn {
    flex: 1;
    padding: var(--spacing-xs);
    font-family: var(--font-comic);
    font-size: 0.75rem;
    font-weight: 700;
    text-align: center;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .action-btn.download:hover {
    background: var(--accent-blue);
    color: #fff;
  }

  .action-btn.delete:hover {
    background: var(--accent-red);
    color: #fff;
  }

  .action-btn + .action-btn {
    border-left: 1px solid var(--border-color);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .files-page {
      padding: var(--spacing-md);
    }

    .page-title {
      font-size: 1.5rem;
    }

    .file-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    }

    .file-preview {
      height: 90px;
    }
  }
</style>
