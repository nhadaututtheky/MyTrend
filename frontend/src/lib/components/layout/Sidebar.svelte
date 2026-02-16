<script lang="ts">
  import { page } from '$app/stores';
  import type { NavItem } from '$lib/types';

  interface Props {
    collapsed?: boolean;
  }

  const { collapsed = false }: Props = $props();

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/', icon: '&#9881;' },
    { label: 'Projects', href: '/projects', icon: '&#128196;' },
    { label: 'Conversations', href: '/conversations', icon: '&#128172;' },
    { label: 'Ideas', href: '/ideas', icon: '&#128161;' },
    { label: 'Trends', href: '/trends', icon: '&#128200;' },
    { label: 'Hub', href: '/hub', icon: '&#9889;' },
    { label: 'Search', href: '/search', icon: '&#128269;' },
    { label: 'Graph', href: '/graph', icon: '&#127760;' },
    { label: 'Settings', href: '/settings', icon: '&#9881;' },
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
    <ul class="nav-list">
      {#each navItems as item (item.href)}
        <li>
          <a
            href={item.href}
            class="nav-link"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <span class="nav-icon">{item.icon}</span>
            {#if !collapsed}
              <span class="nav-label">{item.label}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
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
    transition: width 250ms ease;
    flex-shrink: 0;
  }

  .collapsed {
    width: 56px;
  }

  .nav-list {
    list-style: none;
    padding: var(--spacing-sm);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    text-decoration: none;
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
    transition:
      background 150ms ease,
      color 150ms ease;
    white-space: nowrap;
  }

  .nav-link:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .nav-link.active {
    background: var(--accent-green);
    color: #1a1a1a;
    box-shadow: var(--shadow-sm);
  }

  .nav-icon {
    font-size: 1.1rem;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      z-index: 50;
      transform: translateX(-100%);
      transition: transform 250ms ease;
    }

    .sidebar:not(.collapsed) {
      transform: translateX(0);
    }
  }
</style>
