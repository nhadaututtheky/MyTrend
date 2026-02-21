<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PermissionRequest } from '$lib/api/companion';

  interface Props {
    request: PermissionRequest;
    autoApproveTimeout?: number; // seconds, 0 = no countdown
    onapprove: (requestId: string) => void;
    ondeny: (requestId: string) => void;
  }

  let { request, autoApproveTimeout = 0, onapprove, ondeny }: Props = $props();

  const inputPreview = $derived(
    JSON.stringify(request.input, null, 2).slice(0, 400)
  );

  const time = $derived(
    new Date(request.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  // ─── Countdown logic ───────────────────────────────────────────────────
  let remaining = $state(0);
  let countdownTimer: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    // Track prop reactively and reset
    remaining = autoApproveTimeout;

    if (autoApproveTimeout > 0) {
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimer) clearInterval(countdownTimer);
          countdownTimer = undefined;
          onapprove(request.request_id);
        }
      }, 1000);
    }

    return () => {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = undefined;
    };
  });

  onDestroy(() => {
    if (countdownTimer) clearInterval(countdownTimer);
  });

  const countdownPercent = $derived(
    autoApproveTimeout > 0 ? (remaining / autoApproveTimeout) * 100 : 0
  );
</script>

<div class="perm-card" role="alert" aria-live="assertive">
  <div class="perm-header">
    <span class="perm-icon">?</span>
    <span class="perm-label">PERMISSION REQUEST</span>
    <span class="perm-time">{time}</span>
  </div>

  <div class="perm-tool">
    <span class="tool-badge">{request.tool_name}</span>
    {#if request.description}
      <span class="tool-desc">{request.description}</span>
    {/if}
  </div>

  <pre class="perm-input">{inputPreview}</pre>

  {#if autoApproveTimeout > 0 && remaining > 0}
    <div class="countdown-bar" aria-label="Auto-approve in {remaining} seconds">
      <div class="countdown-fill" style="width: {countdownPercent}%"></div>
      <span class="countdown-text">Auto-approve in {remaining}s</span>
    </div>
  {/if}

  <div class="perm-actions">
    <button
      class="btn-approve"
      onclick={() => onapprove(request.request_id)}
      aria-label="Approve {request.tool_name}"
    >
      Allow
    </button>
    <button
      class="btn-deny"
      onclick={() => ondeny(request.request_id)}
      aria-label="Deny {request.tool_name}"
    >
      Deny
    </button>
  </div>
</div>

<style>
  .perm-card {
    background: rgba(255, 159, 67, 0.08);
    border: 2px solid var(--accent-orange);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    margin-bottom: var(--spacing-xs);
    animation: permPulse 2s ease-in-out infinite;
  }

  @keyframes permPulse {
    0%, 100% { border-color: var(--accent-orange); }
    50% { border-color: var(--accent-yellow); }
  }

  .perm-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-xs);
  }

  .perm-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: var(--accent-orange);
    color: #1a1a1a;
    border-radius: 50%;
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
  }

  .perm-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-orange);
  }

  .perm-time {
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    margin-left: auto;
  }

  .perm-tool {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }

  .tool-badge {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: 2px 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
  }

  .tool-desc {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .perm-input {
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    margin: 0 0 var(--spacing-sm);
    max-height: 150px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* ── Countdown bar ──────────────────────────────────────────────────── */
  .countdown-bar {
    position: relative;
    height: 22px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-sm);
    overflow: hidden;
  }

  .countdown-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: rgba(0, 210, 106, 0.25);
    border-radius: var(--radius-sm);
    transition: width 1s linear;
  }

  .countdown-text {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    color: var(--accent-green);
    z-index: 1;
  }

  .perm-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .btn-approve,
  .btn-deny {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    border: 2px solid;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-approve {
    background: rgba(0, 210, 106, 0.15);
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  .btn-approve:hover {
    background: var(--accent-green);
    color: #1a1a1a;
    transform: translateY(-1px);
  }

  .btn-deny {
    background: rgba(255, 71, 87, 0.15);
    border-color: var(--accent-red);
    color: var(--accent-red);
  }

  .btn-deny:hover {
    background: var(--accent-red);
    color: #fff;
    transform: translateY(-1px);
  }
</style>
