<script lang="ts">
  interface Props {
    peakHours?: Array<{ hour: number; count: number }>;
    allHourData?: Record<string, number>;
  }

  const { peakHours = [], allHourData }: Props = $props();

  type Zone = { label: string; icon: string; hours: number[] };
  const ZONES: [Zone, ...Zone[]] = [
    { label: 'Night', icon: '🌙', hours: [0, 1, 2, 3, 4, 5] },
    { label: 'Morning', icon: '🌅', hours: [6, 7, 8, 9, 10, 11] },
    { label: 'Afternoon', icon: '☀️', hours: [12, 13, 14, 15, 16, 17] },
    { label: 'Evening', icon: '🌆', hours: [18, 19, 20, 21, 22, 23] },
  ];

  // Build 24-slot array
  const hourCounts = $derived.by((): number[] => {
    const arr = Array(24).fill(0) as number[];
    if (allHourData && Object.keys(allHourData).length > 0) {
      for (let h = 0; h < 24; h++) arr[h] = allHourData[String(h)] ?? 0;
      return arr;
    }
    if (peakHours.length > 0) {
      for (const { hour, count } of peakHours) arr[hour] = count;
    }
    return arr;
  });

  const maxCount = $derived(Math.max(...hourCounts, 1));
  const hasData = $derived(hourCounts.some((c) => c > 0));

  // Find peak 3 hours
  const peakTop3 = $derived(
    [...hourCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([, c]) => c > 0)
      .map(([h]) => formatHour(h)),
  );

  function formatHour(h: number): string {
    if (h === 0) return '12am';
    if (h < 12) return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
  }

  function zoneTotal(zone: Zone): number {
    return zone.hours.reduce((sum, h) => sum + (hourCounts[h] ?? 0), 0);
  }

  function peakZone(): Zone {
    return ZONES.reduce((best, z) => (zoneTotal(z) > zoneTotal(best) ? z : best), ZONES[0]);
  }
</script>

<div class="peak-hours" data-testid="peak-hours-chart">
  {#if !hasData}
    <div class="empty-state">
      <div class="empty-zones">
        {#each ZONES as zone}
          <div class="zone-row zone-empty">
            <span class="zone-meta">
              <span class="zone-icon">{zone.icon}</span>
              <span class="zone-name">{zone.label}</span>
            </span>
            <div class="zone-bar-track">
              <div class="zone-bar zone-bar--empty"></div>
            </div>
          </div>
        {/each}
      </div>
      <p class="empty-hint">Activity will appear here as you use the app</p>
    </div>
  {:else}
    <div class="zones">
      {#each ZONES as zone}
        {@const total = zoneTotal(zone)}
        {@const pct = Math.round((total / (hourCounts.reduce((s, c) => s + c, 0) || 1)) * 100)}
        {@const isPeak = zone === peakZone()}
        <div class="zone-row" class:zone-peak={isPeak}>
          <span class="zone-meta">
            <span class="zone-icon">{zone.icon}</span>
            <span class="zone-name">{zone.label}</span>
          </span>
          <div class="zone-bar-track">
            <div
              class="zone-bar"
              class:zone-bar--peak={isPeak}
              style:width="{Math.max(2, pct)}%"
            ></div>
          </div>
          <span class="zone-pct" class:zone-pct--peak={isPeak}>{pct}%</span>
        </div>
      {/each}
    </div>

    <!-- Hour strip heatmap -->
    <div class="hour-strip">
      {#each hourCounts as count, h}
        {@const intensity = count / maxCount}
        <div
          class="hour-block"
          class:hour-block--active={count > 0}
          style:opacity={count > 0 ? 0.2 + intensity * 0.8 : 0.12}
          title="{formatHour(h)}: {count}"
          aria-label="{formatHour(h)}: {count} activities"
        ></div>
      {/each}
    </div>
    <div class="strip-labels">
      <span>12am</span>
      <span>6am</span>
      <span>12pm</span>
      <span>6pm</span>
      <span>11pm</span>
    </div>

    {#if peakTop3.length > 0}
      <p class="peak-label">Peak: {peakTop3.join(' · ')}</p>
    {/if}
  {/if}
</div>

<style>
  .peak-hours {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* Zones */
  .zones {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zone-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 76px;
    flex-shrink: 0;
  }

  .zone-icon {
    font-size: 0.85rem;
    line-height: 1;
  }

  .zone-name {
    font-family: var(--font-comic);
    font-size: 0.68rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .zone-peak .zone-name {
    color: var(--text-primary);
    font-weight: 700;
  }

  .zone-bar-track {
    flex: 1;
    height: 10px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .zone-bar {
    height: 100%;
    background: var(--accent-blue);
    border-radius: 2px;
    transition: width 500ms ease;
    opacity: 0.5;
  }

  .zone-bar--peak {
    background: var(--accent-green);
    opacity: 1;
  }

  .zone-bar--empty {
    width: 0% !important;
  }

  .zone-pct {
    font-family: var(--font-comic);
    font-size: 0.68rem;
    color: var(--text-muted);
    width: 28px;
    text-align: right;
    flex-shrink: 0;
  }

  .zone-pct--peak {
    color: var(--accent-green);
    font-weight: 700;
  }

  /* 24-block heatmap strip */
  .hour-strip {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 2px;
    margin-top: 2px;
  }

  .hour-block {
    height: 12px;
    background: var(--accent-green);
    border-radius: 2px;
    transition: opacity 300ms ease;
  }

  .hour-block--active:hover {
    opacity: 1 !important;
  }

  .strip-labels {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-comic);
    font-size: 0.6rem;
    color: var(--text-muted);
    margin-top: -2px;
  }

  /* Peak label */
  .peak-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .empty-zones {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .zone-empty .zone-bar-track {
    background: var(--bg-secondary);
    opacity: 0.5;
  }

  .empty-hint {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-align: center;
    margin: 0;
    font-style: italic;
  }
</style>
