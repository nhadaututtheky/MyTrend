<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';

  const COMPANION_URL = env.PUBLIC_COMPANION_URL ?? '/companion/';

  let isAvailable = $state(false);
  let isChecking = $state(true);
  let iframeEl = $state<HTMLIFrameElement | null>(null);

  async function checkCompanion(): Promise<void> {
    isChecking = true;
    try {
      const res = await fetch(COMPANION_URL, { mode: 'no-cors' });
      isAvailable = res.type === 'opaque' || res.ok;
    } catch {
      isAvailable = false;
    } finally {
      isChecking = false;
    }
  }

  function refreshIframe(): void {
    if (iframeEl) {
      iframeEl.src = COMPANION_URL;
    }
  }

  onMount(() => {
    void checkCompanion();
  });
</script>

<svelte:head>
  <title>Vibe Companion - MyTrend</title>
</svelte:head>

<div class="vibe-page">
  <div class="page-header">
    <h1 class="comic-heading">Vibe Companion</h1>
    <div class="header-actions">
      {#if isAvailable}
        <ComicButton size="sm" variant="outline" onclick={refreshIframe}>
          Refresh
        </ComicButton>
        <a href={COMPANION_URL} target="_blank" rel="noopener noreferrer" class="external-link">
          <ComicButton size="sm" variant="outline">
            Open External
          </ComicButton>
        </a>
      {/if}
    </div>
  </div>

  {#if isChecking}
    <div class="loading-state">
      <span class="pulse-dot"></span>
      <span class="loading-text">Checking Companion status...</span>
    </div>
  {:else if !isAvailable}
    <ComicEmptyState
      illustration="empty"
      message="Companion not running"
      description="Start Companion with: docker compose --profile companion up"
    />
    <div class="retry-row">
      <ComicButton size="sm" onclick={checkCompanion}>
        Retry Connection
      </ComicButton>
    </div>
  {:else}
    <div class="iframe-container sketch-border">
      <iframe
        bind:this={iframeEl}
        src={COMPANION_URL}
        title="Vibe Companion"
        class="companion-iframe"
        allow="clipboard-read; clipboard-write"
      ></iframe>
    </div>
  {/if}
</div>

<style>
  .vibe-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    height: calc(100vh - var(--header-height) - var(--spacing-lg) * 2);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .external-link {
    text-decoration: none;
  }

  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    justify-content: center;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-green);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .loading-text {
    font-family: var(--font-comic);
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .retry-row {
    display: flex;
    justify-content: center;
    margin-top: var(--spacing-md);
  }

  .iframe-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-card);
  }

  .companion-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
