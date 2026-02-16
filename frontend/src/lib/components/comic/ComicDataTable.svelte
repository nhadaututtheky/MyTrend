<script lang="ts">
  import type { Snippet } from 'svelte';
  import ComicButton from './ComicButton.svelte';

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
  }

  interface Props {
    columns: Column[];
    rows: Record<string, unknown>[];
    page?: number;
    totalPages?: number;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    onSort?: (key: string) => void;
    onPageChange?: (page: number) => void;
    onRowClick?: (row: Record<string, unknown>) => void;
    renderCell?: Snippet<[{ row: Record<string, unknown>; column: Column; value: unknown }]>;
    emptyMessage?: string;
  }

  const {
    columns,
    rows,
    page = 1,
    totalPages = 1,
    sortKey = '',
    sortDir = 'asc',
    onSort,
    onPageChange,
    onRowClick,
    renderCell,
    emptyMessage = 'No data found',
  }: Props = $props();

  function getSortLabel(dir: 'asc' | 'desc'): 'ascending' | 'descending' {
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  function handleSort(col: Column): void {
    if (col.sortable && onSort) onSort(col.key);
  }

  function handleKeydown(e: KeyboardEvent, row: Record<string, unknown>): void {
    if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  }
</script>

<div class="table-wrapper sketch-border" data-testid="data-table">
  <div class="table-scroll">
    <table class="comic-table">
      <thead>
        <tr>
          {#each columns as col}
            <th
              class:sortable={col.sortable}
              class:active={sortKey === col.key}
              style:width={col.width}
              onclick={() => handleSort(col)}
              onkeydown={(e) => { if (e.key === 'Enter' && col.sortable) handleSort(col); }}
              tabindex={col.sortable ? 0 : undefined}
              role={col.sortable ? 'button' : undefined}
              aria-sort={sortKey === col.key ? getSortLabel(sortDir) : undefined}
            >
              <span class="th-content">
                {col.label}
                {#if col.sortable && sortKey === col.key}
                  <span class="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if rows.length === 0}
          <tr>
            <td colspan={columns.length} class="empty-row">
              {emptyMessage}
            </td>
          </tr>
        {:else}
          {#each rows as row, i}
            <tr
              class="data-row"
              class:clickable={!!onRowClick}
              onclick={() => onRowClick?.(row)}
              onkeydown={(e) => handleKeydown(e, row)}
              tabindex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              style="animation-delay: {i * 30}ms"
            >
              {#each columns as col}
                <td>
                  {#if renderCell}
                    {@render renderCell({ row, column: col, value: row[col.key] })}
                  {:else}
                    {String(row[col.key] ?? '')}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  {#if totalPages > 1}
    <div class="pagination">
      <ComicButton
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onclick={() => onPageChange?.(page - 1)}
      >
        Prev
      </ComicButton>
      <span class="page-info">{page} / {totalPages}</span>
      <ComicButton
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onclick={() => onPageChange?.(page + 1)}
      >
        Next
      </ComicButton>
    </div>
  {/if}
</div>

<style>
  .table-wrapper {
    background: var(--bg-card);
    overflow: hidden;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .comic-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-comic);
    font-size: 0.8rem;
  }

  thead {
    border-bottom: 2px solid var(--border-color);
  }

  th {
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    white-space: nowrap;
    user-select: none;
  }

  th.sortable {
    cursor: pointer;
  }

  th.sortable:hover {
    color: var(--text-primary);
  }

  th.active {
    color: var(--accent-green);
  }

  .th-content {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sort-arrow {
    font-size: 0.8rem;
  }

  td {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px dashed var(--border-color);
    vertical-align: middle;
  }

  .data-row {
    animation: sketchFadeIn 0.3s ease forwards;
    opacity: 0;
    transition: background var(--transition-fast);
  }

  .data-row:hover {
    background: var(--bg-secondary);
  }

  .data-row.clickable {
    cursor: pointer;
  }

  .data-row.clickable:hover {
    background: var(--bg-secondary);
    transform: translateX(2px);
  }

  .empty-row {
    text-align: center;
    color: var(--text-muted);
    padding: var(--spacing-2xl) var(--spacing-md);
    font-style: italic;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    border-top: 1.5px dashed var(--border-color);
  }

  .page-info {
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-weight: 700;
  }
</style>
