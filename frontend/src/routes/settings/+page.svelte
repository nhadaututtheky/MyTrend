<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { currentUser } from '$lib/stores/auth';
  import { theme, toggleTheme } from '$lib/stores/theme';
  import { getDeviceName, setDeviceName } from '$lib/stores/sync';
  import { toast } from '$lib/stores/toast';
  import { getTelegramStatus, testTelegramConnection, resolveChannel, setupWebhook, removeWebhook } from '$lib/api/telegram';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import type { User, TelegramStatus, TelegramChannel } from '$lib/types';

  let displayName = $state('');
  let timezone = $state('');
  let deviceName = $state('');
  let currentTheme = $state('light');
  let isSaving = $state(false);
  let user = $state<User | null>(null);

  // Telegram state
  let tgStatus = $state<TelegramStatus | null>(null);
  let tgLoading = $state(false);
  let tgTesting = $state(false);
  let tgChannels = $state<TelegramChannel[]>([]);
  let tgResolvingChannel = $state(false);
  let webhookUrl = $state('');
  let webhookSaving = $state(false);

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
    loadTelegramStatus();
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

  async function loadTelegramStatus(): Promise<void> {
    tgLoading = true;
    try {
      tgStatus = await getTelegramStatus();
    } catch {
      tgStatus = null;
    } finally {
      tgLoading = false;
    }
  }

  async function handleTestConnection(): Promise<void> {
    tgTesting = true;
    try {
      const result = await testTelegramConnection();
      if (result.success) {
        toast.success('Telegram connection OK!');
      } else {
        toast.error(result.error || 'Connection failed');
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      tgTesting = false;
    }
  }

  async function handleResolveChannel(): Promise<void> {
    tgResolvingChannel = true;
    try {
      const result = await resolveChannel();
      tgChannels = result.channels;
      if (result.channels.length === 0) {
        toast.info('No channels found. Send a message in the channel first, then try again.');
      }
    } catch {
      toast.error('Failed to resolve channel');
    } finally {
      tgResolvingChannel = false;
    }
  }

  async function handleSetupWebhook(): Promise<void> {
    if (!webhookUrl.trim()) {
      toast.warning('Enter your public URL first');
      return;
    }
    webhookSaving = true;
    try {
      const result = await setupWebhook(webhookUrl.trim());
      if (result.success) {
        toast.success('Webhook registered!');
      } else {
        toast.error(result.error || 'Setup failed');
      }
    } catch {
      toast.error('Webhook setup failed');
    } finally {
      webhookSaving = false;
    }
  }

  async function handleRemoveWebhook(): Promise<void> {
    try {
      await removeWebhook();
      toast.success('Webhook removed');
    } catch {
      toast.error('Failed to remove webhook');
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
    <div class="section-header">
      <h2 class="section-title">Telegram Storage</h2>
      {#if tgLoading}
        <ComicBadge color="blue" size="sm">Loading...</ComicBadge>
      {:else if tgStatus?.configured}
        <ComicBadge color="green" size="sm">Connected</ComicBadge>
      {:else}
        <ComicBadge color="orange" size="sm">Not Configured</ComicBadge>
      {/if}
    </div>

    {#if tgStatus}
      {#if tgStatus.bot_info}
        <p class="tg-bot-info">Bot: <strong>@{tgStatus.bot_info.username}</strong></p>
      {/if}

      <div class="tg-stats">
        <div class="tg-stat">
          <span class="tg-stat-value">{tgStatus.total_files}</span>
          <span class="tg-stat-label">Files</span>
        </div>
        <div class="tg-stat">
          <span class="tg-stat-value">{formatSize(tgStatus.total_size)}</span>
          <span class="tg-stat-label">Total Size</span>
        </div>
        <div class="tg-stat">
          <span class="tg-stat-value">{tgStatus.channel_id_set ? 'Set' : 'Missing'}</span>
          <span class="tg-stat-label">Channel ID</span>
        </div>
      </div>

      {#if tgStatus.error}
        <p class="tg-error">{tgStatus.error}</p>
      {/if}

      <div class="actions">
        <ComicButton variant="primary" loading={tgTesting} onclick={handleTestConnection}>
          Test Connection
        </ComicButton>
        <ComicButton variant="outline" loading={tgLoading} onclick={loadTelegramStatus}>
          Refresh
        </ComicButton>
      </div>

      {#if !tgStatus.channel_id_set}
        <div class="tg-resolve">
          <p class="tg-hint">Add the bot to your channel as admin, send a message, then click Detect:</p>
          <ComicButton variant="secondary" loading={tgResolvingChannel} onclick={handleResolveChannel}>
            Detect Channel ID
          </ComicButton>
          {#if tgChannels.length > 0}
            <div class="tg-channels">
              {#each tgChannels as ch (ch.id)}
                <div class="tg-channel-item">
                  <strong>{ch.title}</strong>
                  <code>{ch.id}</code>
                  <span class="tg-channel-type">{ch.type}</span>
                </div>
              {/each}
              <p class="tg-hint">Set TELEGRAM_STORAGE_CHANNEL_ID in docker-compose.yml to one of these IDs.</p>
            </div>
          {/if}
        </div>
      {/if}
    {:else if !tgLoading}
      <p class="tg-hint">Set TELEGRAM_BOT_TOKEN and TELEGRAM_STORAGE_CHANNEL_ID in docker-compose.yml to enable.</p>
    {/if}

    <!-- Webhook setup (Knowledge Inbox) -->
    {#if tgStatus?.configured}
      <div class="tg-webhook">
        <h3 class="subsection-title">Knowledge Inbox (Webhook)</h3>
        <p class="tg-hint">Forward messages to the bot to auto-create ideas. Requires a public HTTPS URL.</p>
        <div class="form-fields">
          <ComicInput bind:value={webhookUrl} label="Public URL" placeholder="https://mytrend.example.com" />
        </div>
        <div class="actions">
          <ComicButton variant="secondary" loading={webhookSaving} onclick={handleSetupWebhook}>
            Setup Webhook
          </ComicButton>
          <ComicButton variant="outline" onclick={handleRemoveWebhook}>
            Remove Webhook
          </ComicButton>
        </div>
      </div>
    {/if}
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

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }

  .section-header .section-title {
    margin: 0;
  }

  .tg-bot-info {
    font-size: 0.85rem;
    margin: 0 0 var(--spacing-sm);
  }

  .tg-stats {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
  }

  .tg-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .tg-stat-value {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--accent-green);
  }

  .tg-stat-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .tg-error {
    font-size: 0.8rem;
    color: var(--accent-red);
    margin: 0 0 var(--spacing-sm);
  }

  .tg-hint {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: var(--spacing-sm) 0;
  }

  .tg-resolve {
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px dashed var(--border-color);
  }

  .tg-channels {
    margin-top: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tg-channel-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 0.85rem;
  }

  .tg-channel-item code {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .tg-channel-type {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .tg-webhook {
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px dashed var(--border-color);
  }

  .subsection-title {
    font-size: 0.875rem;
    text-transform: uppercase;
    margin: 0 0 4px;
  }
</style>
