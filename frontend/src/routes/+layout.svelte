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
  import '../app.css';

  const { children } = $props();

  let sidebarCollapsed = $state(false);
  let drawerOpen = $state(false);
  let loggedIn = $state(false);
  let currentPath = $state('/');

  const PUBLIC_ROUTES = ['/auth/login', '/auth/register'];

  $effect(() => {
    const unsub = isLoggedIn.subscribe((v) => {
      loggedIn = v;
    });
    return unsub;
  });

  $effect(() => {
    const unsub = page.subscribe((p) => {
      currentPath = p.url.pathname;
    });
    return unsub;
  });

  $effect(() => {
    if (!loggedIn && !PUBLIC_ROUTES.includes(currentPath)) {
      goto('/auth/login');
    }
  });

  onMount(() => {
    initTheme();
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
