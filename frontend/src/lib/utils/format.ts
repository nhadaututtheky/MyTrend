/**
 * Number formatting utilities using Intl.NumberFormat.
 * Consistent number display across the app.
 */

const standardFormatter = new Intl.NumberFormat('en-US');

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format number with commas: 1234 → "1,234" */
export function formatNumber(n: number): string {
  return standardFormatter.format(n);
}

/** Format compact: 1234567 → "1.2M", 1234 → "1.2K" */
export function formatCompact(n: number): string {
  return compactFormatter.format(n);
}

/** Format percent: 0.855 → "85.5%" */
export function formatPercent(n: number): string {
  return percentFormatter.format(n);
}

/** Auto-compact above threshold: below 10k use standard, above use compact */
export function formatCount(n: number, threshold = 10_000): string {
  return n >= threshold ? formatCompact(n) : formatNumber(n);
}
