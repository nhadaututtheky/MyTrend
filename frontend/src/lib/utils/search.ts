const DEBOUNCE_MS = 300;

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number = DEBOUNCE_MS,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapeHtml(escapedQuery)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

export function sanitizeFilterValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

export function buildPBFilter(filters: Record<string, string | undefined>): string {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key} = "${value}"`)
    .join(' && ');
}
