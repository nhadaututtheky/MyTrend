<script lang="ts">
  type Color = 'green' | 'blue' | 'purple' | 'yellow' | 'orange';

  interface Props {
    value: number;
    max?: number;
    color?: Color;
    showLabel?: boolean;
    size?: 'sm' | 'md';
  }

  const { value, max = 100, color = 'green', showLabel = true, size = 'md' }: Props = $props();

  const percent = $derived(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);
</script>

<div class="progress-wrap progress-{size}" data-testid="comic-progress">
  <div class="progress-track sketch-border">
    <div
      class="progress-fill fill-{color}"
      style:width="{percent}%"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    ></div>
  </div>
  {#if showLabel}
    <span class="progress-label">{percent}%</span>
  {/if}
</div>

<style>
  .progress-wrap {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .progress-track {
    flex: 1;
    background: var(--bg-secondary);
    overflow: hidden;
    border: 1.5px solid var(--border-color);
  }

  .progress-sm .progress-track { height: 6px; border-radius: 3px; }
  .progress-md .progress-track { height: 10px; border-radius: 5px; }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .fill-green { background: var(--accent-green); }
  .fill-blue { background: var(--accent-blue); }
  .fill-purple { background: var(--accent-purple); }
  .fill-yellow { background: var(--accent-yellow); }
  .fill-orange { background: var(--accent-orange); }

  .progress-label {
    font-family: var(--font-mono, monospace);
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted);
    min-width: 32px;
    text-align: right;
  }
</style>
