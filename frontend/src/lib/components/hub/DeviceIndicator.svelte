<script lang="ts">
  interface Props {
    devices: readonly string[];
  }

  let { devices }: Props = $props();
</script>

<div class="device-indicator" data-testid="device-indicator">
  {#if devices.length > 0}
    <span class="dot connected"></span>
    <span class="count">{devices.length} device{devices.length > 1 ? 's' : ''}</span>
    <span class="device-list" title={devices.join(', ')}>
      {devices.slice(0, 3).join(', ')}{devices.length > 3 ? '...' : ''}
    </span>
  {:else}
    <span class="dot"></span>
    <span class="count">No devices</span>
  {/if}
</div>

<style>
  .device-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.625rem;
    color: var(--text-muted);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .dot.connected {
    background: var(--accent-green);
    box-shadow: 0 0 4px var(--accent-green);
  }

  .count {
    font-weight: 700;
  }

  .device-list {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }
</style>
