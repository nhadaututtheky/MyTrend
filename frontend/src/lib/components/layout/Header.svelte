<script lang="ts">
  import { currentUser } from '$lib/stores/auth';
  import { logout } from '$lib/stores/auth';
  import ThemeToggle from './ThemeToggle.svelte';
  import { goto } from '$app/navigation';

  interface Props {
    onToggleSidebar?: () => void;
  }

  const { onToggleSidebar }: Props = $props();

  let user = $state<{ display_name?: string; email?: string } | null>(null);

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
</script>

<header class="header" data-testid="header">
  <div class="header-left">
    <button class="menu-btn" onclick={onToggleSidebar} aria-label="Toggle sidebar">
      &#9776;
    </button>
    <a href="/" class="logo">
      <span class="logo-text">MyTrend</span>
    </a>
  </div>

  <div class="header-right">
    <a href="/search" class="icon-btn" aria-label="Search">&#128269;</a>
    <ThemeToggle />
    {#if user}
      <div class="user-menu">
        <span class="user-name">{user.display_name ?? user.email}</span>
        <button class="icon-btn" onclick={handleLogout} aria-label="Logout">
          &#10140;
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
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
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
    font-family: var(--font-comic);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent-green);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .icon-btn {
    background: none;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: 4px;
    text-decoration: none;
    transition: color 150ms ease;
  }

  .icon-btn:hover {
    color: var(--text-primary);
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .user-name {
    font-family: var(--font-comic);
    font-size: 0.875rem;
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
  }
</style>
