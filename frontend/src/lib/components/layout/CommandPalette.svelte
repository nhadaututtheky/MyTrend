<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    LayoutDashboard, FolderOpen, MessageCircle, Lightbulb, ClipboardList,
    TrendingUp, Globe, Search, Terminal, Zap, Settings, Plus,
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  const { open = false, onclose }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  interface CommandItem {
    id: string;
    label: string;
    section: string;
    icon: ComponentType;
    href?: string;
    action?: () => void;
    keywords?: string;
  }

  const commands: CommandItem[] = [
    { id: 'dashboard', label: 'Dashboard', section: 'Navigate', icon: LayoutDashboard, href: '/', keywords: 'home overview' },
    { id: 'projects', label: 'Projects', section: 'Navigate', icon: FolderOpen, href: '/projects', keywords: 'folder' },
    { id: 'conversations', label: 'Conversations', section: 'Navigate', icon: MessageCircle, href: '/conversations', keywords: 'chat messages' },
    { id: 'ideas', label: 'Ideas', section: 'Navigate', icon: Lightbulb, href: '/ideas', keywords: 'brainstorm' },
    { id: 'plans', label: 'Plans', section: 'Navigate', icon: ClipboardList, href: '/plans', keywords: 'tasks todo' },
    { id: 'trends', label: 'Trends', section: 'Navigate', icon: TrendingUp, href: '/trends', keywords: 'analytics stats' },
    { id: 'graph', label: 'Knowledge Graph', section: 'Navigate', icon: Globe, href: '/graph', keywords: 'network nodes' },
    { id: 'search', label: 'Search', section: 'Navigate', icon: Search, href: '/search', keywords: 'find query' },
    { id: 'vibe', label: 'Vibe Terminal', section: 'Tools', icon: Terminal, href: '/vibe', keywords: 'claude code cli' },
    { id: 'hub', label: 'Claude Hub', section: 'Tools', icon: Zap, href: '/hub', keywords: 'ai chat assistant' },
    { id: 'settings', label: 'Settings', section: 'Tools', icon: Settings, href: '/settings', keywords: 'preferences config' },
    { id: 'new-idea', label: 'New Idea', section: 'Actions', icon: Plus, href: '/ideas/new', keywords: 'create add' },
    { id: 'new-project', label: 'New Project', section: 'Actions', icon: Plus, href: '/projects/new', keywords: 'create add' },
  ];

  const filtered = $derived(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        (c.keywords?.toLowerCase().includes(q) ?? false),
    );
  });

  const groupedResults = $derived(() => {
    const items = filtered();
    const groups: Record<string, CommandItem[]> = {};
    for (const item of items) {
      const existing = groups[item.section];
      if (existing) {
        existing.push(item);
      } else {
        groups[item.section] = [item];
      }
    }
    return groups;
  });

  function handleSelect(item: CommandItem): void {
    if (item.href) {
      goto(item.href);
    } else if (item.action) {
      item.action();
    }
    close();
  }

  function close(): void {
    query = '';
    selectedIndex = 0;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent): void {
    const items = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) handleSelect(item);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  $effect(() => {
    if (open && inputEl) {
      window.requestAnimationFrame(() => {
        if (inputEl) inputEl.focus();
      });
    }
  });

  $effect(() => {
    // Reset selection when query changes
    if (query !== undefined) {
      selectedIndex = 0;
    }
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown}>
      <div class="search-row">
        <Search size={16} />
        <input
          bind:this={inputEl}
          bind:value={query}
          class="palette-input"
          type="text"
          placeholder="Type a command or search..."
          spellcheck="false"
          autocomplete="off"
        />
        <kbd class="kbd">ESC</kbd>
      </div>

      <div class="results">
        {#each Object.entries(groupedResults()) as [section, items]}
          <div class="section">
            <span class="section-label">{section}</span>
            {#each items as item}
              {@const globalIndex = filtered().indexOf(item)}
              <button
                class="result-item"
                class:selected={globalIndex === selectedIndex}
                onclick={() => handleSelect(item)}
                onmouseenter={() => { selectedIndex = globalIndex; }}
              >
                <span class="result-icon"><item.icon size={16} /></span>
                <span class="result-label">{item.label}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="no-results">No results for "{query}"</div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    animation: fadeIn 100ms ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .palette {
    width: 100%;
    max-width: 520px;
    background: var(--bg-card);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
    animation: slideDown 150ms ease;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border-color);
    color: var(--text-muted);
  }

  .palette-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-family: var(--font-body);
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }

  .palette-input::placeholder {
    color: var(--text-muted);
  }

  .kbd {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-muted);
  }

  .results {
    max-height: 360px;
    overflow-y: auto;
    padding: var(--spacing-sm) 0;
  }

  .section {
    padding: 0 var(--spacing-sm);
  }

  .section-label {
    display: block;
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: var(--font-size-base);
    text-align: left;
    transition: background var(--transition-fast);
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--bg-secondary);
  }

  .result-item.selected {
    box-shadow: inset 3px 0 0 var(--accent-green);
  }

  .result-icon {
    color: var(--text-muted);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .result-item.selected .result-icon,
  .result-item:hover .result-icon {
    color: var(--accent-green);
  }

  .no-results {
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    padding: var(--spacing-xl);
  }
</style>
