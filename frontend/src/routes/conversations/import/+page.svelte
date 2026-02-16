<script lang="ts">
  import { onMount } from 'svelte';
  import { createConversation } from '$lib/api/conversations';
  import { toast } from '$lib/stores/toast';
  import { goto } from '$app/navigation';
  import pb from '$lib/config/pocketbase';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { ConversationMessage } from '$lib/types';

  const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

  interface SyncProject {
    name: string;
    path: string;
    total: number;
    imported: number;
    pending: number;
  }

  interface SyncStatus {
    projects: SyncProject[];
    total_sessions: number;
    already_imported: number;
    pending: number;
  }

  interface SyncResult {
    projects_scanned: number;
    sessions_found: number;
    imported: number;
    skipped: number;
    errors: string[];
    error?: string;
  }

  let fileInput: HTMLInputElement;
  let isImporting = $state(false);
  let isSyncing = $state(false);
  let isLoadingStatus = $state(false);
  let importCount = $state(0);
  let syncResult: SyncResult | null = $state(null);
  let syncStatus: SyncStatus | null = $state(null);

  function parseJsonlLine(line: string): ConversationMessage | null {
    try {
      const obj = JSON.parse(line);
      if (!obj.role || !obj.content) return null;
      return {
        role: obj.role,
        content: typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content),
        timestamp: obj.timestamp ?? new Date().toISOString(),
        tokens: obj.tokens ?? 0,
      };
    } catch {
      return null;
    }
  }

  async function importJsonlFile(file: File, text: string): Promise<boolean> {
    const lines = text.split('\n').filter((l) => l.trim());
    const messages = lines.map(parseJsonlLine).filter((m): m is ConversationMessage => m !== null);

    if (messages.length === 0) return false;

    await createConversation({
      title: file.name.replace('.jsonl', ''),
      source: 'imported',
      messages,
      message_count: messages.length,
      total_tokens: messages.reduce((sum, m) => sum + m.tokens, 0),
      started_at: messages[0]?.timestamp ?? new Date().toISOString(),
      topics: [],
      tags: [],
    });
    return true;
  }

  async function importJsonFile(file: File, text: string): Promise<boolean> {
    const obj = JSON.parse(text);
    await createConversation({
      title: obj.title ?? file.name.replace('.json', ''),
      source: 'imported',
      messages: obj.messages ?? [],
      message_count: obj.messages?.length ?? 0,
      total_tokens: obj.total_tokens ?? 0,
      started_at: obj.started_at ?? new Date().toISOString(),
      topics: obj.topics ?? [],
      tags: obj.tags ?? [],
    });
    return true;
  }

  async function importFile(file: File): Promise<void> {
    const text = await file.text();
    let imported = false;

    if (file.name.endsWith('.jsonl')) {
      imported = await importJsonlFile(file, text);
    } else if (file.name.endsWith('.json')) {
      imported = await importJsonFile(file, text);
    }

    if (imported) importCount++;
  }

  async function handleFileSelect(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    isImporting = true;
    importCount = 0;

    try {
      for (const file of Array.from(files)) {
        await importFile(file);
      }

      toast.success(`Imported ${importCount} conversation(s)!`);
      if (importCount > 0) {
        await goto('/conversations');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Import failed: ' + message);
    } finally {
      isImporting = false;
    }
  }

  function authHeaders(): Record<string, string> {
    const token = pb.authStore.token;
    return token ? { Authorization: token } : {};
  }

  async function loadSyncStatus(): Promise<void> {
    isLoadingStatus = true;
    try {
      const res = await fetch(`${PB_URL}/api/mytrend/sync-status`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        syncStatus = await res.json();
      } else {
        const data = await res.json();
        toast.error('Failed to load sync status: ' + (data.error || 'Unknown'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error('Sync status error: ' + message);
    } finally {
      isLoadingStatus = false;
    }
  }

  async function handleSync(force = false): Promise<void> {
    isSyncing = true;
    syncResult = null;
    try {
      const url = force
        ? `${PB_URL}/api/mytrend/sync-claude?force=true`
        : `${PB_URL}/api/mytrend/sync-claude`;
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data: SyncResult = await res.json();

      if (res.ok) {
        syncResult = data;
        if (data.imported > 0) {
          toast.success(`Synced ${data.imported} conversation(s) from Claude!`);
        } else if (data.sessions_found === 0) {
          toast.info('No Claude sessions found. Make sure Docker volume is mounted.');
        } else {
          toast.info(`All ${data.skipped} session(s) already imported.`);
        }
        // Refresh status
        await loadSyncStatus();
      } else {
        toast.error('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error('Sync error: ' + message);
    } finally {
      isSyncing = false;
    }
  }

  onMount(() => {
    loadSyncStatus();
  });
</script>

<svelte:head>
  <title>Import Conversations - MyTrend</title>
</svelte:head>

<div class="import-page">
  <h1 class="comic-heading">Import Conversations</h1>

  <!-- Claude Auto-Sync Section -->
  <ComicCard>
    <div class="section-header">
      <h3 class="section-title">Claude Auto-Sync</h3>
      <span class="cron-badge">Cron: every 30 min</span>
    </div>
    <p class="section-desc">
      Automatically scans Claude Code CLI session logs from the mounted volume
      and imports new conversations.
    </p>

    {#if isLoadingStatus}
      <div class="status-loading">Loading sync status...</div>
    {:else if syncStatus}
      <div class="sync-status">
        <div class="status-grid">
          <div class="status-item">
            <span class="status-value">{syncStatus.total_sessions}</span>
            <span class="status-label">Total Sessions</span>
          </div>
          <div class="status-item imported">
            <span class="status-value">{syncStatus.already_imported}</span>
            <span class="status-label">Imported</span>
          </div>
          <div class="status-item pending">
            <span class="status-value">{syncStatus.pending}</span>
            <span class="status-label">Pending</span>
          </div>
        </div>

        {#if syncStatus.projects.length > 0}
          <div class="projects-list">
            <h4 class="projects-title">Projects Detected</h4>
            {#each syncStatus.projects as project}
              <div class="project-row">
                <span class="project-name">{project.name}</span>
                <span class="project-stats">
                  {project.imported}/{project.total}
                  {#if project.pending > 0}
                    <span class="pending-count">+{project.pending} new</span>
                  {/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if syncResult}
      <div class="sync-result" class:has-errors={syncResult.errors.length > 0}>
        <div class="result-summary">
          <span>Scanned {syncResult.projects_scanned} project(s),</span>
          <span>found {syncResult.sessions_found} session(s),</span>
          <strong>imported {syncResult.imported}</strong>,
          <span>skipped {syncResult.skipped}</span>
        </div>
        {#if syncResult.errors.length > 0}
          <details class="result-errors">
            <summary>{syncResult.errors.length} error(s)</summary>
            <ul>
              {#each syncResult.errors as error}
                <li>{error}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}

    <div class="sync-actions">
      <ComicButton variant="primary" onclick={() => handleSync(false)} disabled={isSyncing}>
        {isSyncing ? 'Syncing...' : 'Sync Now'}
      </ComicButton>
      <ComicButton variant="outline" onclick={() => handleSync(true)} disabled={isSyncing}>
        Force Re-sync (fix encoding)
      </ComicButton>
      <ComicButton variant="outline" onclick={loadSyncStatus} disabled={isLoadingStatus}>
        Refresh Status
      </ComicButton>
    </div>
  </ComicCard>

  <!-- Manual Import Section -->
  <ComicCard>
    <h3 class="section-title">Manual Import</h3>
    <p class="section-desc">Upload conversation files manually.</p>

    <div class="format-list">
      <span class="format-tag">.jsonl</span> Claude CLI session logs
      <span class="format-tag">.json</span> Full conversation export
    </div>

    <div class="upload-area">
      <input
        bind:this={fileInput}
        type="file"
        accept=".json,.jsonl"
        multiple
        onchange={handleFileSelect}
        class="file-input"
        id="file-upload"
      />
      <label for="file-upload" class="upload-label">
        Choose files or drag & drop
      </label>
    </div>

    {#if isImporting}
      <p class="status">Importing... ({importCount} done)</p>
    {/if}
  </ComicCard>

  <div class="actions">
    <ComicButton variant="outline" onclick={() => goto('/conversations')}>
      Back to Conversations
    </ComicButton>
  </div>
</div>

<style>
  .import-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 700px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0;
    letter-spacing: 0.5px;
  }

  .section-desc {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-md);
  }

  .cron-badge {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    padding: 2px 8px;
    border: 1px solid var(--accent-green, #00D26A);
    color: var(--accent-green, #00D26A);
    border-radius: var(--radius-sm, 6px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Sync Status */
  .status-loading {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    padding: var(--spacing-md);
  }

  .sync-status {
    margin-bottom: var(--spacing-md);
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }

  .status-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-sm);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md, 8px);
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .status-value {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 1.5rem;
    font-weight: 700;
  }

  .status-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-item.imported .status-value {
    color: var(--accent-green, #00D26A);
  }

  .status-item.pending .status-value {
    color: var(--accent-yellow, #FFE66D);
  }

  /* Projects List */
  .projects-list {
    border-top: 1px dashed var(--border-color);
    padding-top: var(--spacing-sm);
  }

  .projects-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
    letter-spacing: 0.5px;
  }

  .project-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-xs) 0;
    font-size: 0.875rem;
  }

  .project-name {
    font-weight: 600;
  }

  .project-stats {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .pending-count {
    color: var(--accent-green, #00D26A);
    font-weight: 700;
    margin-left: var(--spacing-xs);
  }

  /* Sync Result */
  .sync-result {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 2px solid var(--accent-green, #00D26A);
    border-radius: var(--radius-md, 8px);
    margin-bottom: var(--spacing-md);
    font-size: 0.875rem;
    background: color-mix(in srgb, var(--accent-green, #00D26A) 5%, transparent);
  }

  .sync-result.has-errors {
    border-color: var(--accent-yellow, #FFE66D);
    background: color-mix(in srgb, var(--accent-yellow, #FFE66D) 5%, transparent);
  }

  .result-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .result-errors {
    margin-top: var(--spacing-sm);
    font-size: 0.8rem;
    color: var(--accent-red, #FF4757);
  }

  .result-errors ul {
    padding-left: var(--spacing-md);
    margin: var(--spacing-xs) 0 0;
  }

  .result-errors li {
    margin-bottom: 2px;
    word-break: break-all;
  }

  /* Sync Actions */
  .sync-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  /* Manual Import */
  .format-list {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: var(--spacing-md);
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    align-items: center;
  }

  .format-tag {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.8rem;
    font-weight: 700;
    padding: 1px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  .upload-area {
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-md, 8px);
    padding: var(--spacing-2xl);
    text-align: center;
  }

  .file-input {
    display: none;
  }

  .upload-label {
    font-family: var(--font-comic, 'Comic Mono', monospace);
    font-weight: 700;
    color: var(--accent-blue, #4ECDC4);
    cursor: pointer;
    font-size: 1rem;
  }

  .upload-label:hover {
    color: var(--accent-green, #00D26A);
  }

  .status {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-top: var(--spacing-md);
  }

  .actions {
    display: flex;
    gap: var(--spacing-sm);
  }
</style>
