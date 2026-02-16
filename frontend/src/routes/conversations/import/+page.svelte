<script lang="ts">
  import { createConversation } from '$lib/api/conversations';
  import { toast } from '$lib/stores/toast';
  import { goto } from '$app/navigation';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { ConversationMessage } from '$lib/types';

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

  let fileInput: HTMLInputElement;
  let isImporting = $state(false);
  let importCount = $state(0);

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
      console.error('[Import]', err);
      toast.error('Import failed');
    } finally {
      isImporting = false;
    }
  }
</script>

<svelte:head>
  <title>Import Conversations - MyTrend</title>
</svelte:head>

<div class="import-page">
  <h1 class="comic-heading">Import Conversations</h1>

  <ComicCard>
    <h3 class="section-title">Supported Formats</h3>
    <ul class="format-list">
      <li><strong>.jsonl</strong> - Claude CLI session logs (one JSON per line)</li>
      <li><strong>.json</strong> - Full conversation export</li>
    </ul>
  </ComicCard>

  <ComicCard>
    <h3 class="section-title">Upload Files</h3>
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
    max-width: 600px;
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .format-list {
    font-size: 0.875rem;
    color: var(--text-secondary);
    padding-left: var(--spacing-lg);
  }

  .format-list li {
    margin-bottom: var(--spacing-xs);
  }

  .upload-area {
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--spacing-2xl);
    text-align: center;
  }

  .file-input {
    display: none;
  }

  .upload-label {
    font-family: var(--font-comic);
    font-weight: 700;
    color: var(--accent-blue);
    cursor: pointer;
    font-size: 1rem;
  }

  .upload-label:hover {
    color: var(--accent-green);
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
