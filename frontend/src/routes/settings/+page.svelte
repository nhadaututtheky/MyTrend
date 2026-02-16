<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { currentUser } from '$lib/stores/auth';
  import { theme, toggleTheme } from '$lib/stores/theme';
  import { getDeviceName, setDeviceName } from '$lib/stores/sync';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import type { User } from '$lib/types';

  let displayName = $state('');
  let timezone = $state('');
  let deviceName = $state('');
  let currentTheme = $state('light');
  let isSaving = $state(false);
  let user = $state<User | null>(null);

  $effect(() => {
    const unsub = currentUser.subscribe((u) => {
      user = u;
      if (u) {
        displayName = u.display_name ?? '';
        timezone = u.timezone ?? '';
      }
    });
    return unsub;
  });

  $effect(() => {
    const unsub = theme.subscribe((t) => {
      currentTheme = t;
    });
    return unsub;
  });

  onMount(() => {
    deviceName = getDeviceName();
  });

  async function saveProfile(): Promise<void> {
    if (!user) return;
    isSaving = true;
    try {
      await pb.collection('users').update(user.id, {
        display_name: displayName,
        timezone,
      });
      toast.success('Profile updated!');
    } catch (err: unknown) {
      console.error('[Settings]', err);
      toast.error('Failed to save profile');
    } finally {
      isSaving = false;
    }
  }

  function saveDeviceName(): void {
    setDeviceName(deviceName);
    toast.success('Device name updated!');
  }
</script>

<svelte:head>
  <title>Settings - MyTrend</title>
</svelte:head>

<div class="settings-page">
  <h1 class="comic-heading">Settings</h1>

  <ComicCard>
    <h2 class="section-title">Profile</h2>
    <div class="form-fields">
      <ComicInput bind:value={displayName} label="Display Name" />
      <ComicInput bind:value={timezone} label="Timezone" placeholder="e.g. Asia/Ho_Chi_Minh" />
    </div>
    <div class="actions">
      <ComicButton variant="primary" loading={isSaving} onclick={saveProfile}>
        Save Profile
      </ComicButton>
    </div>
  </ComicCard>

  <ComicCard>
    <h2 class="section-title">Appearance</h2>
    <div class="theme-row">
      <span>Current theme: <strong>{currentTheme}</strong></span>
      <ComicButton variant="outline" onclick={toggleTheme}>
        Switch to {currentTheme === 'light' ? 'Dark' : 'Light'}
      </ComicButton>
    </div>
  </ComicCard>

  <ComicCard>
    <h2 class="section-title">Device</h2>
    <div class="form-fields">
      <ComicInput
        bind:value={deviceName}
        label="Device Name"
        placeholder="My Laptop"
      />
    </div>
    <div class="actions">
      <ComicButton variant="secondary" onclick={saveDeviceName}>
        Save Device Name
      </ComicButton>
    </div>
  </ComicCard>

  <ComicCard>
    <h2 class="section-title">Data</h2>
    <div class="data-actions">
      <ComicButton variant="outline">Export All Data (JSON)</ComicButton>
      <ComicButton variant="danger">Clear All Data</ComicButton>
    </div>
  </ComicCard>
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 600px;
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .data-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }
</style>
