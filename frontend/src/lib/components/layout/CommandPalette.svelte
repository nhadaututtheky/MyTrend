<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    LayoutDashboard,
    FolderOpen,
    MessageCircle,
    Lightbulb,
    ClipboardList,
    TrendingUp,
    Globe,
    Search,
    Terminal,
    Zap,
    Settings,
    Plus,
    FileText,
    Cpu,
    Activity,
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';
  import { hybridSearch } from '$lib/api/search';
  import type { SearchResult } from '$lib/types';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  const { open = false, onclose }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let searchResults = $state<SearchResult[]>([]);
  let searching = $state(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

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

  const TYPE_ICON: Record<string, ComponentType> = {
    conversation: MessageCircle,
    idea: Lightbulb,
    project: FolderOpen,
    plan: ClipboardList,
    topic: TrendingUp,
    activity: Activity,
    claude_task: Cpu,
  };

  const TYPE_BADGE: Record<string, string> = {
    conversation: 'blue',
    idea: 'yellow',
    project: 'green',
    plan: 'purple',
    topic: 'teal',
    activity: 'orange',
    claude_task: 'red',
  };

  function getResultHref(r: SearchResult): string {
    switch (r.type) {
      case 'conversation': return `/conversations/${r.id}`;
      case 'idea': return `/ideas/${r.id}`;
      case 'project': return `/projects/${r.id}`;
      case 'plan': return `/plans/${r.id}`;
      case 'topic': return `/trends`;
      case 'activity': return `/`;
      case 'claude_task': return `/vibe`;
      default: return `/search?q=${encodeURIComponent(query)}`;
    }
  }

  const filteredCommands = $derived.by(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        (c.keywords?.toLowerCase().includes(q) ?? false),
    );
  });

  // Combined flat list for keyboard navigation
  const allItems = $derived.by(() => [
    ...filteredCommands,
    ...searchResults.map((r) => ({ _isResult: true as const, result: r })),
  ]);

  const groupedCommands = $derived.by(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filteredCommands) {
      (groups[item.section] ??= []).push(item);
    }
    return groups;
  });

  // Debounced FTS5 search
  $effect(() => {
    const q = query.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 2) {
      searchResults = [];
      searching = false;
      return;
    }
    searching = true;
    searchTimer = setTimeout(async () => {
      try {
        searchResults = await hybridSearch(q);
      } catch {
        searchResults = [];
      } finally {
        searching = false;
      }
    }, 300);
  });

  function handleSelectCommand(item: CommandItem): void {
    if (item.href) goto(item.href);
    else item.action?.();
    close();
  }

  function handleSelectResult(r: SearchResult): void {
    goto(getResultHref(r));
    close();
  }

  function close(): void {
    query = '';
    selectedIndex = 0;
    searchResults = [];
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent): void {
    const items = allItems;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIndex];
      if (!item) return;
      if ('_isResult' in item) handleSelectResult(item.result);
      else handleSelectCommand(item);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  $effect(() => {
    if (open && inputEl) {
      window.requestAnimationFrame(() => inputEl?.focus());
    }
  });

  $effect(() => {
    if (query !== undefined) selectedIndex = 0;
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
        {#if searching}
          <span class="spinner" aria-label="Searching..."></span>
        {:else}
          <kbd class="kbd">ESC</kbd>
        {/if}
      </div>

      <div class="results">
        <!-- Command groups -->
        {#each Object.entries(groupedCommands) as [section, items]}
          <div class="section">
            <span class="section-label">{section}</span>
            {#each items as item}
              {@const globalIndex = allItems.findIndex((i) => !('_isResult' in i) && i.id === item.id)}
              <button
                class="result-item"
                class:selected={globalIndex === selectedIndex}
                onclick={() => handleSelectCommand(item)}
                onmouseenter={() => { selectedIndex = globalIndex; }}
              >
                <span class="result-icon"><item.icon size={16} /></span>
                <span class="result-label">{item.label}</span>
              </button>
            {/each}
          </div>
        {/each}

        <!-- FTS5 search results -->
        {#if searchResults.length > 0}
          <div class="section results-section">
            <span class="section-label">Results</span>
            {#each searchResults as result, i}
              {@const globalIndex = filteredCommands.length + i}
              {@const IconComp = TYPE_ICON[result.type] ?? FileText}
              <button
                class="result-item result-item--search"
                class:selected={globalIndex === selectedIndex}
                onclick={() => handleSelectResult(result)}
                onmouseenter={() => { selectedIndex = globalIndex; }}
              >
                <span class="result-icon"><IconComp size={16} /></span>
                <span class="result-body">
                  <span class="result-label">{result.title}</span>
                  {#if result.snippet}
                    <span class="result-snippet">{result.snippet.slice(0, 80)}</span>
                  {/if}
                </span>
                <span class="type-badge type-badge--{TYPE_BADGE[result.type] ?? 'blue'}">{result.type}</span>
              </button>
            {/each}
          </div>
        {:else if query.length >= 2 && !searching}
          <div class="no-results">No results for "{query}"</div>
        {:else if filteredCommands.length === 0 && query.length < 2}
          <div class="no-results">No commands match "{query}"</div>
        {/if}
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
    max-width: 540px;
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

  .palette-input::placeholder { color: var(--text-muted); }

  .kbd {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-muted);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-green);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .results {
    max-height: 400px;
    overflow-y: auto;
    padding: var(--spacing-sm) 0;
  }

  .section { padding: 0 var(--spacing-sm); }

  .results-section {
    border-top: 1px solid var(--border-color);
    padding-top: var(--spacing-sm);
    margin-top: var(--spacing-xs);
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

  /* Search result layout */
  .result-item--search { align-items: flex-start; }

  .result-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .result-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-snippet {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .type-badge {
    font-family: var(--font-comic);
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    align-self: center;
  }

  .type-badge--blue    { background: rgba(78,205,196,0.15); color: var(--accent-blue); }
  .type-badge--yellow  { background: rgba(255,230,109,0.15); color: #b8a020; }
  .type-badge--green   { background: rgba(0,210,106,0.15);  color: var(--accent-green); }
  .type-badge--purple  { background: rgba(162,155,254,0.15); color: #a29bfe; }
  .type-badge--teal    { background: rgba(78,205,196,0.15);  color: #4ecdc4; }
  .type-badge--orange  { background: rgba(255,159,67,0.15);  color: #ff9f43; }
  .type-badge--red     { background: rgba(255,71,87,0.15);   color: var(--accent-red); }

  .no-results {
    text-align: center;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    padding: var(--spacing-xl);
  }
</style>
