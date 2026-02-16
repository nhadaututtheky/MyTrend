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

export function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export function buildPBFilter(filters: Record<string, string | undefined>): string {
  return Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key} = "${value}"`)
    .join(' && ');
}
