<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchCronJobs,
    createCronJob,
    updateCronJob,
    deleteCronJob,
    runCronJob,
    fetchEnvironments,
  } from '$lib/api/hub';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicDialog from '$lib/components/comic/ComicDialog.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { toast } from '$lib/stores/toast';
  import { formatRelative } from '$lib/utils/date';
  import type { HubCronJob, HubEnvironment } from '$lib/types';

  const COMPANION_URL = 'http://localhost:3457';

  let jobs = $state<HubCronJob[]>([]);
  let environments = $state<HubEnvironment[]>([]);
  let isLoading = $state(true);
  let dialogOpen = $state(false);
  let editingJob = $state<HubCronJob | null>(null);

  // Form fields
  let fName = $state('');
  let fSchedule = $state('');
  let fPrompt = $state('');
  let fEnv = $state('');
  let fEnabled = $state(true);
  let isSaving = $state(false);
  let runningId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  // NL parser state
  let nlMode = $state(true);
  let nlText = $state('');
  let nlResult = $state<{ cron?: string; description?: string; error?: string } | null>(null);
  let nlParsing = $state(false);
  let nlTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      [jobs, environments] = await Promise.all([fetchCronJobs(), fetchEnvironments()]);
    } catch (err: unknown) {
      console.error('[Cron]', err);
    } finally {
      isLoading = false;
    }
  });

  function formatCron(cron: string): string {
    const p = cron.split(' ');
    if (p.length !== 5) return cron;
    const min = p[0] ?? '';
    const hour = p[1] ?? '';
    const dow = p[4] ?? '*';
    if (cron === '* * * * *') return 'Every minute';
    if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} minutes`;
    if (min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
    if (min === '0' && hour === '*') return 'Every hour';
    if (dow === '1-5') return `Weekdays at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = parseInt(dow);
    if (dow !== '*' && !isNaN(d)) return `Every ${days[d] ?? dow} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    if (hour !== '*' && dow === '*') return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    return cron;
  }

  async function parseNL(text: string) {
    if (!text.trim()) { nlResult = null; return; }
    nlParsing = true;
    try {
      const res = await fetch(`${COMPANION_URL}/api/nlcron/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      nlResult = await res.json();
    } catch {
      nlResult = { error: 'Companion offline' };
    } finally {
      nlParsing = false;
    }
  }

  function handleNLInput() {
    clearTimeout(nlTimer);
    nlTimer = setTimeout(() => parseNL(nlText), 400);
  }

  function acceptNL() {
    if (nlResult && 'cron' in nlResult && nlResult.cron) {
      fSchedule = nlResult.cron;
    }
  }

  function openCreate() {
    editingJob = null;
    fName = ''; fSchedule = ''; fPrompt = ''; fEnabled = true;
    fEnv = environments[0]?.id ?? '';
    nlText = ''; nlResult = null; nlMode = true;
    dialogOpen = true;
  }

  function openEdit(job: HubCronJob) {
    editingJob = job;
    fName = job.name; fSchedule = job.schedule; fPrompt = job.prompt;
    fEnabled = job.enabled; fEnv = job.environment ?? '';
    nlText = ''; nlResult = null; nlMode = false;
    dialogOpen = true;
  }

  async function handleSave() {
    if (!fName.trim() || !fSchedule.trim() || !fPrompt.trim()) {
      toast.error('Name, schedule and prompt are required');
      return;
    }
    isSaving = true;
    try {
      const data = { name: fName, schedule: fSchedule, prompt: fPrompt, environment: fEnv || undefined, enabled: fEnabled };
      if (editingJob) {
        const updated = await updateCronJob(editingJob.id, data);
        jobs = jobs.map((j) => (j.id === updated.id ? updated : j));
        toast.success('Cron job updated');
      } else {
        const created = await createCronJob(data);
        jobs = [created, ...jobs];
        toast.success('Cron job created');
      }
      dialogOpen = false;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      isSaving = false;
    }
  }

  async function handleToggle(job: HubCronJob) {
    try {
      const updated = await updateCronJob(job.id, { enabled: !job.enabled });
      jobs = jobs.map((j) => (j.id === updated.id ? updated : j));
    } catch {
      toast.error('Failed to update');
    }
  }

  async function handleRun(job: HubCronJob) {
    runningId = job.id;
    try {
      const result = await runCronJob(job.id);
      if (result.success) {
        toast.success(`Done in ${result.duration_ms}ms`);
        const refreshed = await fetchCronJobs();
        jobs = refreshed;
      } else {
        toast.error(result.error ?? result.output ?? 'Run failed');
      }
    } catch {
      toast.error('Run failed');
    } finally {
      runningId = null;
    }
  }

  async function handleDelete(job: HubCronJob) {
    if (!confirm(`Delete "${job.name}"?`)) return;
    deletingId = job.id;
    try {
      await deleteCronJob(job.id);
      jobs = jobs.filter((j) => j.id !== job.id);
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      deletingId = null;
    }
  }
</script>

<svelte:head><title>Cron Jobs - Hub - MyTrend</title></svelte:head>

<div class="cron-page">
  <div class="page-header">
    <div>
      <h2 class="comic-heading">Cron Jobs</h2>
      <p class="subtitle">{jobs.length} scheduled job{jobs.length !== 1 ? 's' : ''}</p>
    </div>
    <ComicButton variant="primary" onclick={openCreate}>+ New Job</ComicButton>
  </div>

  {#if isLoading}
    <div class="list">
      {#each Array(3) as _}<ComicSkeleton variant="card" height="90px" />{/each}
    </div>
  {:else if jobs.length === 0}
    <ComicEmptyState
      illustration="inbox"
      message="No cron jobs"
      description="Schedule Claude prompts to run automatically."
      actionLabel="New Cron Job"
    />
  {:else}
    <div class="list">
      {#each jobs as job (job.id)}
        <ComicCard variant="standard">
          <div class="job-row">
            <div class="job-main">
              <div class="job-title-row">
                <span class="job-name">{job.name}</span>
                <ComicBadge color={job.enabled ? 'green' : 'yellow'} size="sm">
                  {job.enabled ? 'enabled' : 'paused'}
                </ComicBadge>
              </div>
              <div class="job-meta">
                <span class="schedule">⏱ {formatCron(job.schedule)}</span>
                {#if job.last_run}
                  <span class="muted">last ran {formatRelative(job.last_run)}</span>
                {/if}
                <span class="muted">× {job.run_count}</span>
              </div>
              {#if job.last_result}
                <p class="last-result">{job.last_result.slice(0, 120)}{job.last_result.length > 120 ? '…' : ''}</p>
              {/if}
            </div>
            <div class="job-actions">
              <button class="icon-btn" onclick={() => handleToggle(job)} aria-label="Toggle enabled" title={job.enabled ? 'Pause' : 'Enable'}>
                {job.enabled ? '⏸' : '▶'}
              </button>
              <button
                class="icon-btn run-btn"
                onclick={() => handleRun(job)}
                disabled={runningId === job.id}
                aria-label="Run now"
                title="Run now"
              >
                {runningId === job.id ? '⏳' : '▶▶'}
              </button>
              <button class="icon-btn" onclick={() => openEdit(job)} aria-label="Edit" title="Edit">✏️</button>
              <button
                class="icon-btn del-btn"
                onclick={() => handleDelete(job)}
                disabled={deletingId === job.id}
                aria-label="Delete"
                title="Delete"
              >🗑</button>
            </div>
          </div>
        </ComicCard>
      {/each}
    </div>
  {/if}
</div>

<!-- Create / Edit Drawer -->
<ComicDialog bind:open={dialogOpen} title={editingJob ? 'Edit Cron Job' : 'New Cron Job'} mode="drawer" onclose={() => { dialogOpen = false; }}>
  {#snippet children()}
    <div class="form">
      <ComicInput bind:value={fName} label="Name" placeholder="Daily summary at 9am" />

      <!-- Schedule -->
      <div class="field">
        <div class="schedule-label-row">
          <label class="label" for="schedule-input">Schedule</label>
          <button
            class="nl-toggle"
            class:active={nlMode}
            onclick={() => { nlMode = !nlMode; nlResult = null; }}
            aria-label="Toggle natural language mode"
          >NL mode</button>
        </div>

        {#if nlMode}
          <input
            id="nl-input"
            class="comic-input"
            placeholder='e.g. "every day at 9am" or "every Monday at 10am"'
            bind:value={nlText}
            oninput={handleNLInput}
            aria-label="Natural language schedule"
          />
          {#if nlParsing}
            <p class="nl-hint muted">Parsing…</p>
          {:else if nlResult}
            {#if 'error' in nlResult}
              <p class="nl-hint error">{nlResult.error}</p>
            {:else}
              <div class="nl-result">
                <span class="nl-cron">{nlResult.cron}</span>
                <span class="nl-desc muted">{nlResult.description}</span>
                <button class="nl-accept" onclick={acceptNL}>Use this →</button>
              </div>
            {/if}
          {/if}
        {/if}

        <input
          id="schedule-input"
          class="comic-input"
          placeholder="0 9 * * *"
          bind:value={fSchedule}
          aria-label="Cron expression"
        />
        {#if fSchedule}
          <p class="nl-hint muted">= {formatCron(fSchedule)}</p>
        {/if}
      </div>

      <!-- Prompt -->
      <div class="field">
        <label class="label" for="prompt-input">Prompt</label>
        <textarea
          id="prompt-input"
          class="comic-input textarea"
          rows={5}
          placeholder="Summarize my activities from yesterday and send key highlights…"
          bind:value={fPrompt}
          aria-label="Claude prompt"
        ></textarea>
      </div>

      <!-- Environment -->
      {#if environments.length > 0}
        <div class="field">
          <label class="label" for="env-select">Environment (optional)</label>
          <select id="env-select" class="comic-input" bind:value={fEnv} aria-label="Environment">
            <option value="">Default</option>
            {#each environments as env (env.id)}
              <option value={env.id}>{env.name} — {env.model}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Enabled -->
      <label class="toggle-row">
        <input type="checkbox" bind:checked={fEnabled} aria-label="Enabled" />
        <span>Enabled</span>
      </label>
    </div>
  {/snippet}
  {#snippet actions()}
    <ComicButton variant="outline" onclick={() => { dialogOpen = false; }}>Cancel</ComicButton>
    <ComicButton variant="primary" loading={isSaving} onclick={handleSave}>
      {editingJob ? 'Save' : 'Create'}
    </ComicButton>
  {/snippet}
</ComicDialog>

<style>
  .cron-page {
    flex: 1;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    overflow-y: auto;
    max-width: 760px;
  }
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
  }
  .subtitle {
    font-size: var(--font-size-md);
    color: var(--text-muted);
    margin: var(--spacing-xs) 0 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .job-row {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-md);
  }
  .job-main { flex: 1; min-width: 0; }
  .job-title-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: 4px;
  }
  .job-name {
    font-weight: 700;
    font-size: var(--font-size-lg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: var(--font-size-sm);
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .schedule { color: var(--accent-blue); font-family: var(--font-mono); }
  .muted { color: var(--text-muted); }
  .last-result {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .job-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    align-items: flex-start;
  }
  .icon-btn {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 4px 6px;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-secondary);
    transition: all 150ms;
    min-width: 30px;
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover:not(:disabled) { border-color: var(--accent-blue); color: var(--accent-blue); }
  .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .run-btn:hover:not(:disabled) { border-color: var(--accent-green); color: var(--accent-green); }
  .del-btn:hover:not(:disabled) { border-color: var(--accent-red); color: var(--accent-red); }

  /* Form */
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-family: var(--font-comic); font-size: 0.875rem; font-weight: 700; }
  .schedule-label-row { display: flex; align-items: center; justify-content: space-between; }
  .textarea {
    resize: vertical;
    min-height: 100px;
    font-family: var(--font-comic);
    line-height: 1.5;
    font-size: var(--font-size-sm);
  }
  .nl-toggle {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    transition: all 150ms;
  }
  .nl-toggle.active { color: var(--accent-green); border-color: var(--accent-green); background: rgba(0,210,106,0.08); }
  .nl-hint { font-size: 0.75rem; margin: 0; }
  .nl-hint.error { color: var(--accent-red); }
  .nl-result {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: 6px 10px;
    background: rgba(0,210,106,0.06);
    border: 1px solid rgba(0,210,106,0.2);
    border-radius: 4px;
    font-size: 0.75rem;
  }
  .nl-cron { font-family: var(--font-mono); font-weight: 700; color: var(--accent-green); }
  .nl-desc { flex: 1; }
  .nl-accept {
    background: none;
    border: 1px solid var(--accent-green);
    color: var(--accent-green);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-family: var(--font-comic);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
