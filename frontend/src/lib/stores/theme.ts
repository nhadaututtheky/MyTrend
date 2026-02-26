import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeStyle = 'comic' | 'apple' | 'pro';
export type ColorScheme = 'light' | 'dark';

const STYLE_KEY = 'mytrend-theme-style';
const SCHEME_KEY = 'mytrend-color-scheme';
const LEGACY_KEY = 'mytrend-theme';

function getInitialStyle(): ThemeStyle {
  if (!browser) return 'comic';
  const stored = localStorage.getItem(STYLE_KEY) as ThemeStyle | null;
  if (stored === 'comic' || stored === 'apple' || stored === 'pro') return stored;
  // Migrate legacy: apple/pro were separate themes
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === 'apple') return 'apple';
  if (legacy === 'pro') return 'pro';
  return 'comic';
}

function getInitialScheme(): ColorScheme {
  if (!browser) return 'light';
  const stored = localStorage.getItem(SCHEME_KEY) as ColorScheme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  // Migrate legacy: dark/pro were dark themes
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === 'dark' || legacy === 'pro') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const themeStyle = writable<ThemeStyle>(getInitialStyle());
export const colorScheme = writable<ColorScheme>(getInitialScheme());

/** Legacy convenience: combined theme identifier */
export type Theme = `${ThemeStyle}-${ColorScheme}`;

function applyToDom(style: ThemeStyle, scheme: ColorScheme): void {
  document.documentElement.setAttribute('data-theme', style);
  document.documentElement.setAttribute('data-color-scheme', scheme);
}

export function setThemeStyle(style: ThemeStyle): void {
  if (!browser) return;
  localStorage.setItem(STYLE_KEY, style);
  themeStyle.set(style);
  let scheme: ColorScheme = 'light';
  colorScheme.subscribe((s) => {
    scheme = s;
  })();
  applyToDom(style, scheme);
}

export function setColorScheme(scheme: ColorScheme): void {
  if (!browser) return;
  localStorage.setItem(SCHEME_KEY, scheme);
  colorScheme.set(scheme);
  let style: ThemeStyle = 'comic';
  themeStyle.subscribe((s) => {
    style = s;
  })();
  applyToDom(style, scheme);
}

export function toggleColorScheme(): void {
  if (!browser) return;
  colorScheme.update((current) => {
    const next: ColorScheme = current === 'light' ? 'dark' : 'light';
    localStorage.setItem(SCHEME_KEY, next);
    let style: ThemeStyle = 'comic';
    themeStyle.subscribe((s) => {
      style = s;
    })();
    applyToDom(style, next);
    return next;
  });
}

export function initTheme(): void {
  if (!browser) return;
  const style = getInitialStyle();
  const scheme = getInitialScheme();
  applyToDom(style, scheme);
  themeStyle.set(style);
  colorScheme.set(scheme);
}

function themeDisplayValue(style: ThemeStyle, scheme: ColorScheme): string {
  if (scheme === 'dark') return style === 'comic' ? 'dark' : style;
  return style === 'comic' ? 'light' : style;
}

// Legacy compat: keep `theme` store as derived combined value for any old subscribers
export const theme = {
  subscribe: (run: (value: string) => void) => {
    return themeStyle.subscribe((s) => {
      let sc: ColorScheme = 'light';
      colorScheme.subscribe((c) => {
        sc = c as ColorScheme;
      })();
      run(themeDisplayValue(s, sc));
    });
  },
};

/** Legacy setTheme — maps old flat values to new dual system */
export function setTheme(value: string): void {
  if (value === 'light') {
    setThemeStyle('comic');
    setColorScheme('light');
  } else if (value === 'dark') {
    setThemeStyle('comic');
    setColorScheme('dark');
  } else if (value === 'apple') {
    setThemeStyle('apple');
    setColorScheme('light');
  } else if (value === 'pro') {
    setThemeStyle('pro');
    setColorScheme('dark');
  }
}

/** Legacy toggleTheme */
export function toggleTheme(): void {
  toggleColorScheme();
}
