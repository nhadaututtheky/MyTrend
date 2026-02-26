<script lang="ts">
  import {
    themeStyle,
    colorScheme,
    setThemeStyle,
    setColorScheme,
    type ThemeStyle,
    type ColorScheme,
  } from '$lib/stores/theme';

  type StyleEntry = { id: ThemeStyle; label: string; icon: string; desc: string };

  const STYLES: StyleEntry[] = [
    { id: 'comic', label: 'Comic', icon: '✏️', desc: 'Sketch + hard shadows' },
    { id: 'apple', label: 'Apple', icon: '🍎', desc: 'Liquid glass · iOS 26' },
    { id: 'pro', label: 'Pro', icon: '⚡', desc: 'OLED fintech terminal' },
  ];

  let currentStyle = $state<ThemeStyle>('comic');
  let currentScheme = $state<ColorScheme>('light');
  let open = $state(false);

  $effect(() => {
    const u1 = themeStyle.subscribe((s) => {
      currentStyle = s;
    });
    const u2 = colorScheme.subscribe((c) => {
      currentScheme = c;
    });
    return () => {
      u1();
      u2();
    };
  });

  function selectStyle(id: ThemeStyle): void {
    setThemeStyle(id);
    open = false;
  }

  function toggleScheme(): void {
    setColorScheme(currentScheme === 'light' ? 'dark' : 'light');
  }

  function toggleOpen(e: MouseEvent): void {
    e.stopPropagation();
    open = !open;
  }

  const DEFAULT_STYLE: StyleEntry = {
    id: 'comic',
    label: 'Comic',
    icon: '✏️',
    desc: 'Sketch + hard shadows',
  };
  const currentEntry = $derived<StyleEntry>(
    STYLES.find((s) => s.id === currentStyle) ?? DEFAULT_STYLE,
  );
  const schemeIcon = $derived(currentScheme === 'dark' ? '🌙' : '☀️');
</script>

<svelte:window
  onclick={() => {
    open = false;
  }}
/>

<div class="theme-picker">
  <div class="trigger-group">
    <!-- Style picker trigger -->
    <button
      class="trigger"
      onclick={toggleOpen}
      aria-label="Change theme style: {currentEntry.label}"
      aria-expanded={open}
      aria-haspopup="menu"
      title="Style: {currentEntry.label}"
    >
      <span class="trigger-icon">{currentEntry.icon}</span>
    </button>

    <!-- Light/Dark toggle -->
    <button
      class="scheme-toggle"
      onclick={toggleScheme}
      aria-label="Switch to {currentScheme === 'light' ? 'dark' : 'light'} mode"
      title="{currentScheme === 'light' ? 'Dark' : 'Light'} mode"
    >
      {schemeIcon}
    </button>
  </div>

  {#if open}
    <div class="dropdown" role="menu" aria-label="Theme style selector">
      <div class="dropdown-header">Style</div>
      {#each STYLES as s (s.id)}
        <button
          class="option"
          class:active={currentStyle === s.id}
          onclick={() => selectStyle(s.id)}
          role="menuitem"
          aria-current={currentStyle === s.id ? 'true' : undefined}
        >
          <span class="option-icon">{s.icon}</span>
          <span class="option-text">
            <span class="option-label">{s.label}</span>
            <span class="option-desc">{s.desc}</span>
          </span>
          {#if currentStyle === s.id}
            <span class="check" aria-hidden="true">✓</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .theme-picker {
    position: relative;
  }

  .trigger-group {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .trigger,
  .scheme-toggle {
    font-size: 1rem;
    background: none;
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: 4px 8px;
    cursor: pointer;
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    min-width: 34px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .trigger:hover,
  .scheme-toggle:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .trigger:focus-visible,
  .scheme-toggle:focus-visible {
    outline: 2px solid var(--accent-blue);
    outline-offset: 2px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 200px;
    overflow: hidden;
    z-index: var(--z-dropdown);
  }

  .dropdown-header {
    padding: 8px 14px 6px;
    font-family: var(--font-body);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 14px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-body);
    color: var(--text-secondary);
    text-align: left;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .option:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .option.active {
    color: var(--text-primary);
    background: var(--bg-secondary);
  }

  .option-icon {
    font-size: 1rem;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }

  .option-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .option-label {
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .option-desc {
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.2;
  }

  .check {
    color: var(--accent-green);
    font-weight: 700;
    font-size: 0.85rem;
    flex-shrink: 0;
  }
</style>
