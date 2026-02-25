<script lang="ts">
  import { currentUser } from '$lib/stores/auth';
  import { logout } from '$lib/stores/auth';
  import ThemeToggle from './ThemeToggle.svelte';
  import { goto } from '$app/navigation';
  import { Search, Sparkles, LogOut, Menu, X } from 'lucide-svelte';

  interface Props {
    onToggleSidebar?: () => void;
    onToggleDrawer?: () => void;
  }

  const { onToggleSidebar, onToggleDrawer }: Props = $props();

  let user = $state<{ display_name?: string; email?: string } | null>(null);
  let searchExpanded = $state(false);
  let searchValue = $state('');

  $effect(() => {
    const unsub = currentUser.subscribe((u) => {
      user = u;
    });
    return unsub;
  });

  function handleLogout(): void {
    logout();
    goto('/auth/login');
  }

  function handleSearchSubmit(): void {
    if (searchValue.trim().length >= 2) {
      goto(`/search?q=${encodeURIComponent(searchValue.trim())}`);
      searchExpanded = false;
      searchValue = '';
    }
  }

  function handleSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      searchExpanded = false;
      searchValue = '';
    }
  }
</script>

<header class="header" data-testid="header">
  <div class="header-left">
    <button class="menu-btn" onclick={onToggleSidebar} aria-label="Toggle sidebar">
      <Menu size={20} />
    </button>
    <a href="/" class="logo">
      <span class="logo-text">MyTrend</span>
    </a>
  </div>

  <div class="header-center">
    {#if searchExpanded}
      <form
        class="search-form"
        onsubmit={(e) => {
          e.preventDefault();
          handleSearchSubmit();
        }}
      >
        <input
          class="search-input"
          type="search"
          placeholder="Search everything..."
          bind:value={searchValue}
          onkeydown={handleSearchKeydown}
        />
        <button
          type="button"
          class="search-close"
          onclick={() => {
            searchExpanded = false;
            searchValue = '';
          }}
          aria-label="Close search"
        >
          <X size={16} />
        </button>
      </form>
    {/if}
  </div>

  <div class="header-right">
    {#if !searchExpanded}
      <button
        class="icon-btn"
        onclick={() => {
          searchExpanded = true;
        }}
        aria-label="Search"
        title="Search (Ctrl+K)"
      >
        <Search size={18} />
      </button>
    {/if}
    {#if onToggleDrawer}
      <button
        class="icon-btn ai-btn"
        onclick={onToggleDrawer}
        aria-label="Toggle AI assistant"
        title="AI Assistant"
      >
        <Sparkles size={18} />
      </button>
    {/if}
    <ThemeToggle />
    {#if user}
      <div class="user-menu">
        <span class="user-name">{user.display_name ?? user.email}</span>
        <button class="icon-btn" onclick={handleLogout} aria-label="Logout" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  .header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-lg);
    background: var(--bg-card);
    border-bottom: var(--border-width) solid var(--border-color);
    position: sticky;
    top: 0;
    z-index: 100;
    gap: var(--spacing-md);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    flex-shrink: 0;
  }

  .header-center {
    flex: 1;
    max-width: 480px;
    margin: 0 auto;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .menu-btn {
    display: none;
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: var(--text-primary);
    padding: 4px;
  }

  .logo {
    text-decoration: none;
  }

  .logo-text {
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--accent-green);
    letter-spacing: -0.02em;
  }

  :global([data-theme='dark']) .logo-text {
    text-shadow: 0 0 12px rgba(0, 210, 106, 0.3);
  }

  /* Search */
  .search-form {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    animation: sketchFadeIn 0.2s ease forwards;
  }

  .search-input {
    font-family: var(--font-comic);
    font-size: 0.85rem;
    padding: var(--spacing-xs) var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-primary);
    color: var(--text-primary);
    width: 100%;
    outline: none;
  }

  .search-input:focus {
    box-shadow: var(--shadow-sm);
  }

  .search-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 4px;
    flex-shrink: 0;
  }

  /* Buttons */
  .icon-btn {
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: 4px;
    text-decoration: none;
    transition:
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--text-primary);
    transform: scale(1.1);
  }

  .ai-btn {
    color: var(--accent-purple);
  }

  :global([data-theme='dark']) .ai-btn:hover {
    text-shadow: 0 0 8px rgba(162, 155, 254, 0.5);
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .user-name {
    font-family: var(--font-comic);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  @media (max-width: 768px) {
    .menu-btn {
      display: block;
    }

    .user-name {
      display: none;
    }

    .header-center {
      max-width: none;
    }
  }
</style>
