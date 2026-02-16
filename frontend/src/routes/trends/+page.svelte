<script lang="ts">
  import { goto } from '$app/navigation';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';

  const sections = [
    {
      id: 'activity',
      label: 'Activity',
      icon: '📊',
      description: 'Track your daily activity breakdown, hours worked, and productivity trends.',
      href: '/trends/activity',
    },
    {
      id: 'topics',
      label: 'Topics',
      icon: '💬',
      description: 'See which topics appear most in your conversations and ideas.',
      href: '/trends/topics',
    },
    {
      id: 'heatmap',
      label: 'Heatmap',
      icon: '🗓',
      description: 'GitHub-style heatmap of your activity over the past year.',
      href: '/trends/heatmap',
    },
  ];
</script>

<svelte:head>
  <title>Trends - MyTrend</title>
</svelte:head>

<div class="trends-page">
  <h1 class="comic-heading">Trends</h1>

  <div class="trends-grid">
    {#each sections as section (section.id)}
      <button class="trend-card" onclick={() => goto(section.href)}>
        <ComicCard>
          <div class="card-inner">
            <span class="card-icon">{section.icon}</span>
            <h2 class="card-title">{section.label}</h2>
            <p class="card-desc">{section.description}</p>
          </div>
        </ComicCard>
      </button>
    {/each}
  </div>
</div>

<style>
  .trends-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .trends-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--spacing-md);
  }

  .trend-card {
    all: unset;
    cursor: pointer;
    display: block;
    transition: transform var(--transition-fast);
  }

  .trend-card:hover {
    transform: translateY(-2px);
  }

  .card-inner {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    text-align: center;
    padding: var(--spacing-md);
  }

  .card-icon {
    font-size: 2rem;
  }

  .card-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0;
  }

  .card-desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0;
  }
</style>
