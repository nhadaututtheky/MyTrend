<script lang="ts">
  import type { WeekComparison } from '$lib/types';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    comparison: WeekComparison | null;
    topTopics?: Array<{ name: string; count: number }>;
    streak?: number;
  }

  const { comparison, topTopics = [], streak = 0 }: Props = $props();

  function pctColor(pct: number): 'green' | 'red' | 'yellow' {
    if (pct > 0) return 'green';
    if (pct < 0) return 'red';
    return 'yellow';
  }

  function pctArrow(pct: number): string {
    if (pct > 0) return '\u25B2';
    if (pct < 0) return '\u25BC';
    return '\u2022';
  }

  function generateSummary(c: WeekComparison | null): string {
    if (!c) return 'Loading your weekly pulse...';

    const parts: string[] = [];
    const actCount = c.activities.this_period;
    const actChange = c.activities.change_pct;
    const hours = c.hours.this_period;

    if (actCount > 0) {
      parts.push(`${actCount} activities logged (${hours}h)`);
    } else {
      parts.push('No activities this week');
    }

    if (actChange > 0) {
      parts.push(`${actChange}% more than last week`);
    } else if (actChange < 0) {
      parts.push(`${Math.abs(actChange)}% less than last week`);
    }

    if (streak > 3) {
      parts.push(`${streak}-day streak going strong`);
    }

    return parts.join(' · ');
  }

  interface ComparisonChip {
    label: string;
    value: number;
    pct: number;
    color: 'green' | 'red' | 'yellow';
    arrow: string;
  }

  const summary = $derived(generateSummary(comparison));

  const chips = $derived.by((): ComparisonChip[] => {
    if (!comparison) return [];
    const items = [
      { label: 'Activities', value: comparison.activities.this_period, pct: comparison.activities.change_pct },
      { label: 'Hours', value: comparison.hours.this_period, pct: comparison.hours.change_pct },
      { label: 'Ideas', value: comparison.ideas.this_period, pct: comparison.ideas.change_pct },
    ];
    return items.map((item) => ({
      ...item,
      color: pctColor(item.pct),
      arrow: pctArrow(item.pct),
    }));
  });
</script>

<div class="weekly-pulse" data-testid="weekly-pulse">
  <p class="pulse-summary">{summary}</p>

  <div class="pulse-chips">
    {#each chips as chip (chip.label)}
      <div class="chip">
        <span class="chip-label">{chip.label}</span>
        <span class="chip-value">{chip.value}</span>
        <ComicBadge color={chip.color} size="sm">
          {chip.arrow} {Math.abs(chip.pct)}%
        </ComicBadge>
      </div>
    {/each}

    {#if topTopics.length > 0}
      <div class="chip topics-chip">
        <span class="chip-label">Hot</span>
        <span class="chip-topics">
          {topTopics.slice(0, 3).map((t) => t.name).join(', ')}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .weekly-pulse {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .pulse-summary {
    font-family: var(--font-comic);
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--text-primary);
    line-height: var(--leading-relaxed);
    margin: 0;
  }

  .pulse-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px var(--spacing-sm);
    background: var(--bg-secondary);
    border: 1.5px solid var(--border-color);
    border-radius: var(--radius-sketch);
    font-size: var(--font-size-sm);
  }

  .chip-label {
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--font-size-2xs);
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  .chip-value {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    font-size: var(--font-size-sm);
  }

  .topics-chip { border-color: var(--accent-orange); }

  .chip-topics {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--accent-orange);
  }

  @media (max-width: 768px) {
    .pulse-chips {
      overflow-x: auto;
      flex-wrap: nowrap;
    }
    .chip { flex-shrink: 0; }
  }
</style>
