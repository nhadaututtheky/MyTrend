<script lang="ts">
  import type { VibeSession } from '$lib/types';
  import { MODEL_CONTEXT_WINDOWS } from '$lib/types';

  interface Props {
    session?: VibeSession | null;
    sessions?: VibeSession[];
  }

  const { session = null, sessions = [] }: Props = $props();

  // If a specific session is passed, use it; otherwise aggregate all
  const aggregated = $derived(() => {
    if (session) return session;
    if (sessions.length === 0) return null;

    const agg = {
      session_id: 'aggregate',
      agent_id: '',
      session_title: 'All Sessions',
      model: sessions[0]?.model ?? '',
      project_dir: '',
      project_name: 'All',
      tasks: [],
      total_tasks: 0,
      pending_count: 0,
      in_progress_count: 0,
      completed_count: 0,
      progress_pct: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      total_tokens: 0,
      context_pct: 0,
      estimated_cost: 0,
      started_at: '',
      ended_at: '',
      duration_min: 0,
      is_active: false,
    };

    for (const s of sessions) {
      agg.input_tokens += s.input_tokens;
      agg.output_tokens += s.output_tokens;
      agg.cache_read_tokens += s.cache_read_tokens;
      agg.cache_create_tokens += s.cache_create_tokens;
      agg.total_tokens += s.total_tokens;
      agg.estimated_cost += s.estimated_cost;
    }

    const cw = MODEL_CONTEXT_WINDOWS['default'] ?? 200_000;
    agg.context_pct = Math.round((agg.total_tokens / cw) * 100);
    return agg;
  });

  const data = $derived(aggregated());

  function formatNum(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function pctOf(part: number, total: number): number {
    if (!total) return 0;
    return (part / total) * 100;
  }

  // Context window for display
  const contextWindow = $derived(
    data
      ? (MODEL_CONTEXT_WINDOWS[data.model] ?? MODEL_CONTEXT_WINDOWS['default'] ?? 200_000)
      : 200_000,
  );

  const isWarning = $derived(data ? data.context_pct >= 80 : false);
  const isCritical = $derived(data ? data.context_pct >= 95 : false);
</script>

<div class="context-meter" class:warning={isWarning} class:critical={isCritical}>
  {#if !data}
    <p class="no-data">No session data yet.</p>
  {:else}
    <div class="meter-header">
      <span class="meter-label">CONTEXT USAGE</span>
      <span class="context-pct" class:pct-warn={isWarning} class:pct-crit={isCritical}>
        {data.context_pct}%
      </span>
      {#if isWarning}
        <span class="warn-badge" aria-label="Context usage warning">
          {isCritical ? '🔴 CRITICAL' : '⚠️ HIGH'}
        </span>
      {/if}
    </div>

    <!-- Segmented bar -->
    <div
      class="seg-bar"
      role="progressbar"
      aria-valuenow={data.context_pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="{data.context_pct}% context used"
    >
      <div
        class="seg-input"
        style="width: {pctOf(data.input_tokens, contextWindow)}%"
        title="Input: {formatNum(data.input_tokens)}"
      ></div>
      <div
        class="seg-output"
        style="width: {pctOf(data.output_tokens, contextWindow)}%"
        title="Output: {formatNum(data.output_tokens)}"
      ></div>
      <div
        class="seg-cache-read"
        style="width: {pctOf(data.cache_read_tokens, contextWindow)}%"
        title="Cache Read: {formatNum(data.cache_read_tokens)}"
      ></div>
      <div
        class="seg-cache-create"
        style="width: {pctOf(data.cache_create_tokens, contextWindow)}%"
        title="Cache Create: {formatNum(data.cache_create_tokens)}"
      ></div>
    </div>

    <p class="context-summary">
      {formatNum(data.total_tokens)} / {formatNum(contextWindow)} tokens used
    </p>

    <!-- Legend -->
    <div class="legend">
      <span class="legend-item"><span class="dot dot-input"></span>Input</span>
      <span class="legend-item"><span class="dot dot-output"></span>Output</span>
      <span class="legend-item"><span class="dot dot-cache-read"></span>Cache R</span>
      <span class="legend-item"><span class="dot dot-cache-create"></span>Cache W</span>
    </div>

    <!-- Breakdown table -->
    <div class="breakdown-table">
      <div class="row">
        <span class="row-label">Input</span>
        <span class="row-val">{formatNum(data.input_tokens)}</span>
        <span class="row-pct">{pctOf(data.input_tokens, contextWindow).toFixed(1)}%</span>
      </div>
      <div class="row">
        <span class="row-label">Output</span>
        <span class="row-val">{formatNum(data.output_tokens)}</span>
        <span class="row-pct">{pctOf(data.output_tokens, contextWindow).toFixed(1)}%</span>
      </div>
      <div class="row">
        <span class="row-label">Cache Read</span>
        <span class="row-val">{formatNum(data.cache_read_tokens)}</span>
        <span class="row-pct">{pctOf(data.cache_read_tokens, contextWindow).toFixed(1)}%</span>
      </div>
      <div class="row">
        <span class="row-label">Cache Create</span>
        <span class="row-val">{formatNum(data.cache_create_tokens)}</span>
        <span class="row-pct">{pctOf(data.cache_create_tokens, contextWindow).toFixed(1)}%</span>
      </div>
      <div class="row row-total">
        <span class="row-label">TOTAL</span>
        <span class="row-val">{formatNum(data.total_tokens)}</span>
        <span class="row-pct">{data.context_pct}%</span>
      </div>
    </div>

    {#if data.estimated_cost > 0}
      <div class="cost">
        <span class="cost-label">Estimated Cost</span>
        <span class="cost-val">${data.estimated_cost.toFixed(4)} USD</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .context-meter {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
  }

  .context-meter.warning {
    border-color: var(--accent-orange);
  }

  .context-meter.critical {
    border-color: var(--accent-red);
    animation: criticalGlow 1.5s ease-in-out infinite;
  }

  @keyframes criticalGlow {
    0%,
    100% {
      box-shadow: 0 0 0 rgba(255, 71, 87, 0);
    }
    50% {
      box-shadow: 0 0 16px rgba(255, 71, 87, 0.3);
    }
  }

  .meter-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .meter-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    flex: 1;
  }

  .context-pct {
    font-family: var(--font-comic);
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--accent-green);
  }

  .pct-warn {
    color: var(--accent-orange);
  }
  .pct-crit {
    color: var(--accent-red);
  }

  .warn-badge {
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 71, 87, 0.15);
    color: var(--accent-red);
    border: 1px solid rgba(255, 71, 87, 0.4);
  }

  .seg-bar {
    height: 12px;
    border-radius: 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    display: flex;
    overflow: hidden;
    margin-bottom: var(--spacing-xs);
  }

  .seg-input {
    background: var(--accent-blue);
    transition: width 500ms ease;
  }
  .seg-output {
    background: var(--accent-green);
    transition: width 500ms ease;
  }
  .seg-cache-read {
    background: var(--accent-yellow);
    transition: width 500ms ease;
  }
  .seg-cache-create {
    background: var(--accent-purple, #a29bfe);
    transition: width 500ms ease;
  }

  .context-summary {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin: 0 0 var(--spacing-sm);
  }

  .legend {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    margin-bottom: var(--spacing-md);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .dot-input {
    background: var(--accent-blue);
  }
  .dot-output {
    background: var(--accent-green);
  }
  .dot-cache-read {
    background: var(--accent-yellow);
  }
  .dot-cache-create {
    background: var(--accent-purple, #a29bfe);
  }

  .breakdown-table {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--spacing-md);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--spacing-sm);
    font-size: var(--font-size-sm);
    padding: 4px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .row-total {
    font-weight: 700;
    color: var(--text-primary);
    border-bottom: 2px solid var(--border-color);
  }

  .row-label {
    color: var(--text-secondary);
  }
  .row-val {
    font-family: var(--font-mono);
    color: var(--text-primary);
    text-align: right;
  }
  .row-pct {
    font-family: var(--font-mono);
    color: var(--text-muted);
    text-align: right;
    min-width: 45px;
  }

  .cost {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) 0;
  }

  .cost-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .cost-val {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--accent-green);
  }

  .no-data {
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--spacing-lg);
  }
</style>
