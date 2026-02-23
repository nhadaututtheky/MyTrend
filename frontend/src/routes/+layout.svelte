<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isLoggedIn } from '$lib/stores/auth';
  import { initTheme } from '$lib/stores/theme';
  import Header from '$lib/components/layout/Header.svelte';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import AIDrawer from '$lib/components/layout/AIDrawer.svelte';
  import ComicToast from '$lib/components/comic/ComicToast.svelte';
  import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
  import '../app.css';

  const { children } = $props();

  let sidebarCollapsed = $state(false);
  let drawerOpen = $state(false);
  let commandPaletteOpen = $state(false);
  let loggedIn = $derived($isLoggedIn);
  let currentPath = $derived($page.url.pathname);

  const PUBLIC_ROUTES = ['/auth/login', '/auth/register'];

  $effect(() => {
    if (!loggedIn && !PUBLIC_ROUTES.includes(currentPath)) {
      goto('/auth/login');
    }
  });

  onMount(() => {
    initTheme();

    function handleGlobalKeydown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        commandPaletteOpen = !commandPaletteOpen;
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  });

  function toggleSidebar(): void {
    sidebarCollapsed = !sidebarCollapsed;
  }

  const isAuthPage = $derived(PUBLIC_ROUTES.includes(currentPath));
</script>

<a href="#main-content" class="skip-link">Skip to content</a>

<ComicToast />

{#if isAuthPage}
  <main id="main-content">
    {@render children()}
  </main>
{:else}
  <Header onToggleSidebar={toggleSidebar} onToggleDrawer={() => { drawerOpen = !drawerOpen; }} />
  <div class="app-layout">
    <Sidebar collapsed={sidebarCollapsed} />
    <main id="main-content" class="main-content">
      {@render children()}
    </main>
  </div>
  <AIDrawer bind:open={drawerOpen} />
  <CommandPalette open={commandPaletteOpen} onclose={() => { commandPaletteOpen = false; }} />
{/if}

<style>
  .app-layout {
    display: flex;
    min-height: calc(100vh - var(--header-height));
  }

  .main-content {
    flex: 1;
    padding: var(--spacing-lg);
    overflow-y: auto;
    min-width: 0;
  }

  @media (max-width: 768px) {
    .main-content {
      padding: var(--spacing-md);
    }
  }
</style>
