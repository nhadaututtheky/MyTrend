<script lang="ts">
  import type { ProjectDNA } from '$lib/types';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    dna: ProjectDNA;
    projectName?: string;
  }

  let { dna, projectName = 'Project' }: Props = $props();
</script>

<ComicCard variant="interactive">
  <div class="dna-card" data-testid="dna-card">
    <h3 class="comic-heading">{projectName} DNA</h3>

    {#if dna.vision}
      <div class="section">
        <h4 class="section-title">Vision</h4>
        <p class="section-text">{dna.vision}</p>
      </div>
    {/if}

    {#if dna.stack.length > 0}
      <div class="section">
        <h4 class="section-title">Stack</h4>
        <div class="tags">
          {#each dna.stack as tech (tech)}
            <ComicBadge color="blue" size="sm">{tech}</ComicBadge>
          {/each}
        </div>
      </div>
    {/if}

    {#if dna.phase}
      <div class="section">
        <h4 class="section-title">Current Phase</h4>
        <ComicBadge color="green">{dna.phase}</ComicBadge>
      </div>
    {/if}

    {#if dna.challenges.length > 0}
      <div class="section">
        <h4 class="section-title">Challenges</h4>
        <ul class="list">
          {#each dna.challenges as challenge (challenge)}
            <li>{challenge}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if dna.decisions.length > 0}
      <div class="section">
        <h4 class="section-title">Key Decisions</h4>
        {#each dna.decisions.slice(0, 3) as decision (decision.date + decision.title)}
          <div class="decision">
            <span class="decision-date">{decision.date}</span>
            <strong>{decision.title}</strong>
            <p class="decision-desc">{decision.outcome}</p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</ComicCard>

<style>
  .dna-card {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin: 0;
  }

  .section-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .list {
    font-size: 0.875rem;
    color: var(--text-secondary);
    padding-left: var(--spacing-lg);
    margin: 0;
  }

  .decision {
    font-size: 0.8rem;
    padding: var(--spacing-xs) 0;
    border-bottom: 1px dashed var(--border-color);
  }

  .decision:last-child {
    border-bottom: none;
  }

  .decision-date {
    font-size: 0.625rem;
    color: var(--text-muted);
  }

  .decision-desc {
    color: var(--text-secondary);
    margin: 2px 0 0;
  }
</style>
