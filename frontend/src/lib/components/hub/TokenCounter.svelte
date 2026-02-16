<script lang="ts">
  interface Props {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }

  let { inputTokens, outputTokens, estimatedCost }: Props = $props();

  let totalTokens = $derived(inputTokens + outputTokens);

  function formatCost(cost: number): string {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
  }
</script>

<div class="token-counter" data-testid="token-counter">
  <span class="stat">
    <span class="label">In:</span>
    <span class="value">{inputTokens.toLocaleString()}</span>
  </span>
  <span class="stat">
    <span class="label">Out:</span>
    <span class="value">{outputTokens.toLocaleString()}</span>
  </span>
  <span class="stat">
    <span class="label">Total:</span>
    <span class="value">{totalTokens.toLocaleString()}</span>
  </span>
  <span class="stat cost">
    <span class="label">Cost:</span>
    <span class="value">{formatCost(estimatedCost)}</span>
  </span>
</div>

<style>
  .token-counter {
    display: flex;
    gap: var(--spacing-md);
    font-family: var(--font-comic);
    font-size: 0.625rem;
    color: var(--text-muted);
    padding: 4px var(--spacing-md);
    border-top: 1px solid var(--bg-secondary);
  }

  .stat {
    display: flex;
    gap: 2px;
  }

  .label {
    text-transform: uppercase;
  }

  .value {
    font-weight: 700;
    color: var(--text-secondary);
  }

  .cost .value {
    color: var(--accent-orange);
  }
</style>
