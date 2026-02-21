<script lang="ts">
  import { page } from '$app/stores';
  import type { NavItem } from '$lib/types';
  import type { ComponentType } from 'svelte';
  import {
    LayoutDashboard, FolderOpen, MessageCircle, Lightbulb, ClipboardList,
    FileText,
    TrendingUp, Globe, Search,
    Terminal, Zap, Settings,
  } from 'lucide-svelte';

  interface Props {
    collapsed?: boolean;
  }

  const { collapsed = false }: Props = $props();

  interface NavSection {
    title: string;
    items: Array<NavItem & { lucideIcon: ComponentType }>;
  }

  const navSections: NavSection[] = [
    {
      title: 'Main',
      items: [
        { label: 'Dashboard', href: '/', icon: '', lucideIcon: LayoutDashboard },
        { label: 'Projects', href: '/projects', icon: '', lucideIcon: FolderOpen },
        { label: 'Conversations', href: '/conversations', icon: '', lucideIcon: MessageCircle },
        { label: 'Ideas', href: '/ideas', icon: '', lucideIcon: Lightbulb },
        { label: 'Plans', href: '/plans', icon: '', lucideIcon: ClipboardList },
        { label: 'Files', href: '/files', icon: '', lucideIcon: FileText },
      ],
    },
    {
      title: 'Insights',
      items: [
        { label: 'Trends', href: '/trends', icon: '', lucideIcon: TrendingUp },
        { label: 'Graph', href: '/graph', icon: '', lucideIcon: Globe },
        { label: 'Search', href: '/search', icon: '', lucideIcon: Search },
      ],
    },
    {
      title: 'Tools',
      items: [
        { label: 'Vibe', href: '/vibe', icon: '', lucideIcon: Terminal },
        { label: 'Hub', href: '/hub', icon: '', lucideIcon: Zap },
        { label: 'Settings', href: '/settings', icon: '', lucideIcon: Settings },
      ],
    },
  ];

  let currentPath = $state('/');

  $effect(() => {
    const unsub = page.subscribe((p) => {
      currentPath = p.url.pathname;
    });
    return unsub;
  });

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<aside class="sidebar" class:collapsed data-testid="sidebar">
  <nav aria-label="Main navigation">
    {#each navSections as section, si}
      {#if si > 0}
        <div class="section-divider"></div>
      {/if}
      {#if !collapsed}
        <span class="section-title">{section.title}</span>
      {/if}
      <ul class="nav-list">
        {#each section.items as item (item.href)}
          <li>
            <a
              href={item.href}
              class="nav-link"
              class:active={isActive(item.href)}
              aria-current={isActive(item.href) ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span class="nav-icon" aria-hidden="true">
                <item.lucideIcon size={18} strokeWidth={2.5} />
              </span>
              {#if !collapsed}
                <span class="nav-label">{item.label}</span>
              {/if}
              {#if item.badge && item.badge > 0 && !collapsed}
                <span class="nav-badge">{item.badge}</span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/each}
  </nav>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    height: calc(100vh - var(--header-height));
    position: sticky;
    top: var(--header-height);
    background: var(--bg-card);
    border-right: var(--border-width) solid var(--border-color);
    overflow-y: auto;
    transition: width var(--transition-sketch);
    flex-shrink: 0;
    padding: var(--spacing-sm) 0;
  }

  .collapsed {
    width: 56px;
  }

  .section-title {
    display: block;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    padding: var(--spacing-xs) var(--spacing-md);
    margin-top: var(--spacing-xs);
  }

  .section-divider {
    height: 1px;
    margin: var(--spacing-xs) var(--spacing-md);
    background: var(--border-color);
    opacity: 0.3;
  }

  .nav-list {
    list-style: none;
    padding: 0 var(--spacing-sm);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    border: 1.5px solid transparent;
    color: var(--text-secondary);
    text-decoration: none;
    font-family: var(--font-comic);
    font-size: 0.85rem;
    font-weight: 700;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast),
      border-color var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover:not(.active) {
    background: var(--bg-secondary);
    color: var(--text-primary);
    text-decoration: none;
    border-color: var(--border-color);
    box-shadow: 2px 2px 0 var(--border-color);
    transform: translate(-1px, -1px);
  }

  .nav-link.active {
    background: var(--accent-green);
    color: #1a1a1a;
    border-color: var(--border-color);
    box-shadow: 3px 3px 0 var(--border-color);
    transform: translate(-1px, -1px);
  }

  /* Keep hard shadow in dark mode too */
  :global([data-theme='dark']) .nav-link.active {
    box-shadow: 3px 3px 0 var(--border-color);
  }

  .nav-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: currentColor;
  }

  .nav-badge {
    margin-left: auto;
    font-size: 0.6rem;
    background: var(--accent-red);
    color: #fff;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 700;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      z-index: 50;
      transform: translateX(-100%);
      transition: transform var(--transition-sketch);
    }

    .sidebar:not(.collapsed) {
      transform: translateX(0);
    }
  }
</style>
