<script lang="ts">
  import ComicCard from '$lib/components/comic/ComicCard.svelte';

  interface StatItem {
    label: string;
    value: string | number;
    change?: string;
    color?: string;
    icon?: string;
  }

  interface Props {
    stats: StatItem[];
  }

  let { stats }: Props = $props();
</script>

<div class="stats-grid" data-testid="stats-grid">
  {#each stats as stat (stat.label)}
    <ComicCard variant="standard">
      <div class="stat-item">
        {#if stat.icon}
          <span class="stat-icon">{stat.icon}</span>
        {/if}
        <div class="stat-value" style:color={stat.color}>{stat.value}</div>
        <div class="stat-label">{stat.label}</div>
        {#if stat.change}
          <div class="stat-change" class:positive={stat.change.startsWith('+')}>
            {stat.change}
          </div>
        {/if}
      </div>
    </ComicCard>
  {/each}
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--spacing-md);
  }

  .stat-item {
    text-align: center;
  }

  .stat-icon {
    font-size: 1.5rem;
    display: block;
    margin-bottom: var(--spacing-xs);
  }

  .stat-value {
    font-family: var(--font-comic);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-top: 2px;
  }

  .stat-change {
    font-size: 0.75rem;
    font-weight: 700;
    margin-top: 4px;
    color: var(--accent-red);
  }

  .stat-change.positive {
    color: var(--accent-green);
  }
</style>
