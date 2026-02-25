<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fetchCronJobs, fetchCronJobHistory, runCronJob } from '$lib/api/hub';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import { toast } from '$lib/stores/toast';
  import { formatDateTime, formatRelative } from '$lib/utils/date';
  import type { HubCronJob, HubCronHistory } from '$lib/types';

  let jobId = $derived($page.params['id'] ?? '');
  let job = $state<HubCronJob | null>(null);
  let history = $state<HubCronHistory[]>([]);
  let isLoading = $state(true);
  let isRunning = $state(false);

  onMount(async () => {
    try {
      const [jobs, hist] = await Promise.all([fetchCronJobs(), fetchCronJobHistory(jobId)]);
      job = jobs.find((j) => j.id === jobId) ?? null;
      history = hist.items;
    } catch (err: unknown) {
      console.error('[Cron/Detail]', err);
    } finally {
      isLoading = false;
    }
  });

  async function handleRun() {
    if (!job) return;
    isRunning = true;
    try {
      const result = await runCronJob(job.id);
      if (result.success) {
        toast.success(`Done in ${result.duration_ms}ms`);
        // Refresh history
        const hist = await fetchCronJobHistory(jobId);
        history = hist.items;
        // Refresh job stats
        const jobs = await fetchCronJobs();
        job = jobs.find((j) => j.id === jobId) ?? job;
      } else {
        toast.error(result.error ?? result.output ?? 'Run failed');
      }
    } catch {
      toast.error('Run failed');
    } finally {
      isRunning = false;
    }
  }

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
</script>

<svelte:head><title>{job?.name ?? 'Cron Job'} — Hub — MyTrend</title></svelte:head>

<div class="detail-page">
  <div class="back-row">
    <button class="back-btn" onclick={() => goto('/hub/cron')} aria-label="Back to cron jobs">← Cron Jobs</button>
  </div>

  {#if isLoading}
    <ComicSkeleton variant="card" height="120px" />
    <ComicSkeleton variant="card" height="200px" />
  {:else if !job}
    <ComicEmptyState illustration="error" message="Cron job not found" actionLabel="Back" actionHref="/hub/cron" />
  {:else}
    <ComicCard>
      <div class="job-header">
        <div>
          <h2 class="job-title">{job.name}</h2>
          <div class="job-meta">
            <ComicBadge color={job.enabled ? 'green' : 'yellow'} size="sm">{job.enabled ? 'enabled' : 'paused'}</ComicBadge>
            <span class="schedule">⏱ {formatCron(job.schedule)}</span>
            {#if job.last_run}<span class="muted">last ran {formatRelative(job.last_run)}</span>{/if}
            <span class="muted">× {job.run_count} runs</span>
          </div>
        </div>
        <ComicButton variant="primary" loading={isRunning} onclick={handleRun}>▶ Run Now</ComicButton>
      </div>

      <div class="prompt-section">
        <h4 class="section-label">Prompt</h4>
        <pre class="prompt-text">{job.prompt}</pre>
      </div>

      {#if job.last_result}
        <div class="last-result-section">
          <h4 class="section-label">Last Output</h4>
          <pre class="output-text">{job.last_result}</pre>
        </div>
      {/if}
    </ComicCard>

    <ComicCard>
      <h3 class="section-title">Run History</h3>
      {#if history.length === 0}
        <p class="empty">No runs yet. Click "Run Now" to execute.</p>
      {:else}
        <div class="history-list">
          {#each history as run (run.id)}
            <div class="history-row">
              <div class="history-meta">
                <ComicBadge color={run.status === 'success' ? 'green' : 'red'} size="sm">{run.status}</ComicBadge>
                <span class="muted">{formatDateTime(run.ran_at)}</span>
                <span class="muted">{run.duration_ms}ms</span>
              </div>
              {#if run.output}
                <pre class="run-output">{run.output.slice(0, 300)}{run.output.length > 300 ? '…' : ''}</pre>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </ComicCard>
  {/if}
</div>

<style>
  .detail-page {
    flex: 1;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    overflow-y: auto;
    max-width: 760px;
  }
  .back-btn {
    background: none;
    border: none;
    color: var(--accent-blue);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }
  .back-btn:hover { text-decoration: underline; }
  .job-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }
  .job-title { font-size: var(--font-size-3xl); font-weight: 700; margin: 0 0 var(--spacing-xs); }
  .job-meta { display: flex; gap: var(--spacing-sm); align-items: center; flex-wrap: wrap; font-size: var(--font-size-sm); }
  .schedule { color: var(--accent-blue); font-family: var(--font-mono); }
  .muted { color: var(--text-muted); }
  .section-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin: var(--spacing-md) 0 var(--spacing-xs); }
  .prompt-text, .output-text, .run-output {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: var(--spacing-sm) var(--spacing-md);
    margin: 0;
    line-height: 1.6;
  }
  .section-title { font-size: 0.875rem; text-transform: uppercase; margin: 0 0 var(--spacing-md); }
  .history-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }
  .history-row {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }
  .history-meta { display: flex; gap: var(--spacing-sm); align-items: center; margin-bottom: 6px; font-size: var(--font-size-sm); }
  .empty { font-size: var(--font-size-sm); color: var(--text-muted); }
  .back-row { padding-bottom: 0; }
</style>
