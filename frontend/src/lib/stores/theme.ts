import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mytrend-theme';

function getInitialTheme(): Theme {
  if (!browser) return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const theme = writable<Theme>(getInitialTheme());

export function toggleTheme(): void {
  theme.update((current) => {
    const next: Theme = current === 'light' ? 'dark' : 'light';
    if (browser) {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
    }
    return next;
  });
}

export function initTheme(): void {
  if (!browser) return;
  const current = getInitialTheme();
  document.documentElement.setAttribute('data-theme', current);
  theme.set(current);
}
