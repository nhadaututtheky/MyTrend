<script lang="ts">
  import type { Activity } from '$lib/types';
  import { formatRelative } from '$lib/utils/date';
  import { getActivityTypeColor } from '$lib/utils/colors';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';

  interface Props {
    activities: Activity[];
  }

  const { activities }: Props = $props();

  const TYPE_LABELS: Record<string, string> = {
    conversation: 'Chat',
    coding: 'Code',
    idea: 'Idea',
    search: 'Search',
    review: 'Review',
    commit: 'Commit',
    pr: 'PR',
    issue: 'Issue',
  };
</script>

<div class="timeline" data-testid="activity-timeline">
  {#if activities.length === 0}
    <p class="empty">No recent activity</p>
  {:else}
    {#each activities as activity (activity.id)}
      <div class="timeline-item animate-fadeIn">
        <div class="dot" style:background={getActivityTypeColor(activity.type)}></div>
        <div class="content">
          <div class="header">
            <ComicBadge color="blue" size="sm">
              {TYPE_LABELS[activity.type] ?? activity.type}
            </ComicBadge>
            <span class="time">{formatRelative(activity.timestamp)}</span>
          </div>
          <p class="action">{activity.action}</p>
          {#if activity.device_name}
            <span class="device">{activity.device_name}</span>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
    padding: var(--spacing-xl);
  }

  .timeline-item {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;
    border-left: 2px solid var(--border-color);
    padding-left: var(--spacing-md);
    margin-left: 6px;
    position: relative;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    position: absolute;
    left: -7px;
    top: var(--spacing-md);
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    min-width: 0;
    padding-left: var(--spacing-sm);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: 4px;
  }

  .time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .action {
    font-size: 0.875rem;
    color: var(--text-primary);
    margin: 0;
  }

  .device {
    font-size: 0.625rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }
</style>
