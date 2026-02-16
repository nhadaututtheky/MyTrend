<script lang="ts">
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';

  let activeTab = $state('activity');

  const tabs = [
    { id: 'activity', label: 'Activity' },
    { id: 'topics', label: 'Topics' },
    { id: 'heatmap', label: 'Heatmap' },
  ];
</script>

<svelte:head>
  <title>Trends - MyTrend</title>
</svelte:head>

<div class="trends-page">
  <h1 class="comic-heading">Trends</h1>

  <ComicTabs {tabs} bind:active={activeTab} />

  <div class="tab-content">
    {#if activeTab === 'activity'}
      <ComicCard>
        <h2 class="section-title">Activity Breakdown</h2>
        <p class="placeholder">Activity charts will load here. Navigate to <a href="/trends/activity">detailed view</a>.</p>
      </ComicCard>
    {:else if activeTab === 'topics'}
      <ComicCard>
        <h2 class="section-title">Topic Trends</h2>
        <p class="placeholder">Topic comparison charts. Navigate to <a href="/trends/topics">detailed view</a>.</p>
      </ComicCard>
    {:else if activeTab === 'heatmap'}
      <ComicCard>
        <h2 class="section-title">Full Heatmap</h2>
        <p class="placeholder">Full-year heatmap. Navigate to <a href="/trends/heatmap">detailed view</a>.</p>
      </ComicCard>
    {/if}
  </div>
</div>

<style>
  .trends-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .tab-content {
    margin-top: var(--spacing-md);
  }

  .placeholder {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
