<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    badge?: number;
  }

  interface Props {
    tabs: Tab[];
    active?: string;
    onchange?: (tabId: string) => void;
  }

  let { tabs, active = $bindable(''), onchange }: Props = $props();

  $effect(() => {
    if (!active && tabs.length > 0) {
      active = tabs[0]?.id ?? '';
    }
  });

  function selectTab(tabId: string): void {
    active = tabId;
    onchange?.(tabId);
  }
</script>

<div class="tabs" role="tablist" data-testid="comic-tabs">
  {#each tabs as tab (tab.id)}
    <button
      class="tab"
      class:active={active === tab.id}
      role="tab"
      aria-selected={active === tab.id}
      onclick={() => selectTab(tab.id)}
    >
      {tab.label}
      {#if tab.badge !== undefined && tab.badge > 0}
        <span class="badge">{tab.badge}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: var(--border-width) solid var(--border-color);
    overflow-x: auto;
  }

  .tab {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 150ms ease,
      border-color 150ms ease;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent-green);
    border-bottom-color: var(--accent-green);
  }

  .badge {
    font-size: 0.625rem;
    background: var(--accent-green);
    color: #1a1a1a;
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: 4px;
    vertical-align: super;
  }
</style>
