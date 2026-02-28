<script lang="ts">
  import { onMount } from 'svelte';
  import pb from '$lib/config/pocketbase';
  import { currentUser } from '$lib/stores/auth';
  import { theme } from '$lib/stores/theme';
  import { getDeviceName, setDeviceName } from '$lib/stores/sync';
  import { toast } from '$lib/stores/toast';
  import { getHubSettings, saveHubApiKey } from '$lib/api/hub';
  import type { HubSettings } from '$lib/api/hub';
  import {
    getTelegramStatus,
    testTelegramConnection,
    resolveChannel,
    setupWebhook,
    removeWebhook,
    getTelegramSettings,
    saveTelegramSettings,
  } from '$lib/api/telegram';
  // TelegramSettings type used implicitly by saveTelegramSettings/getTelegramSettings
  import {
    getTelegramBridgeStatus,
    getTelegramBridgeConfig,
    saveTelegramBridgeConfig,
    startTelegramBridge,
    stopTelegramBridge,
    checkCompanionHealth,
    getCompanionHealth,
    listProjects,
    createCompanionProject,
    updateCompanionProject,
    deleteCompanionProject,
  } from '$lib/api/companion';
  import type {
    TelegramBridgeStatus,
    TelegramBridgeConfigResponse,
    CompanionProjectProfile,
  } from '$lib/api/companion';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import FolderPicker from '$lib/components/comic/FolderPicker.svelte';
  import type { User, TelegramStatus, TelegramChannel } from '$lib/types';

  let activeTab = $state('profile');

  const TABS = [
    { id: 'profile', label: '👤 Profile' },
    { id: 'ai', label: '🤖 AI & Projects' },
    { id: 'integrations', label: '🔌 Integrations' },
    { id: 'data', label: '🗄️ Data' },
  ];

  let displayName = $state('');
  let timezone = $state('');
  let deviceName = $state('');
  let currentTheme = $state('light');
  let isSaving = $state(false);
  let user = $state<User | null>(null);
  let isSeeding = $state(false);
  let nmBrain = $state<string | null>(null);
  let nmOnline = $state(false);

  // Hub API Key state
  let hubSettings = $state<HubSettings | null>(null);
  let hubApiKey = $state('');
  let hubKeyLoading = $state(false);
  let hubKeySaving = $state(false);

  // Telegram state
  let tgStatus = $state<TelegramStatus | null>(null);
  let tgLoading = $state(false);
  let tgTesting = $state(false);
  let tgChannels = $state<TelegramChannel[]>([]);
  let tgResolvingChannel = $state(false);
  let webhookUrl = $state('');

  // Telegram credentials (DB-stored)
  let tgBotToken = $state('');
  let tgChannelId = $state('');
  // tgSettingsLoading removed — was set but never read in template
  let tgSettingsSaving = $state(false);
  let tgEnvTokenSet = $state(false);
  let tgEnvChannelSet = $state(false);
  let webhookSaving = $state(false);

  // Project profiles state
  let projectProfiles = $state<CompanionProjectProfile[]>([]);
  let projectsLoading = $state(false);
  let editingProject = $state<string | null>(null);
  let editName = $state('');
  let editDir = $state('');
  let editModel = $state('sonnet');
  let editPermission = $state('bypassPermissions');
  let newProjectName = $state('');
  let newProjectDir = $state('');
  let newProjectModel = $state('sonnet');
  let newProjectPermission = $state('bypassPermissions');
  let showAddProject = $state(false);
  let projectSaving = $state(false);

  // Claude Bridge state
  let cbStatus = $state<TelegramBridgeStatus | null>(null);
  let cbConfig = $state<TelegramBridgeConfigResponse | null>(null);
  let cbLoading = $state(false);
  let cbSaving = $state(false);
  let cbStarting = $state(false);
  let cbStopping = $state(false);
  let cbBotToken = $state('');
  let cbChatIds = $state('');
  let companionOnline = $state(false);

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
    loadHubSettings();
    loadTelegramStatus();
    loadTelegramSettings();
    loadClaudeBridge();
    loadProjectProfiles();
    loadNmStatus();
  });

  async function loadNmStatus(): Promise<void> {
    const health = await getCompanionHealth();
    if (health) {
      nmBrain = health.nm_brain;
    }

    // Also check NM service directly
    try {
      const res = await fetch('/nm/health', { signal: AbortSignal.timeout(3000) });
      nmOnline = res.ok;
    } catch {
      nmOnline = false;
    }
  }

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

  async function loadHubSettings(): Promise<void> {
    hubKeyLoading = true;
    try {
      hubSettings = await getHubSettings();
    } catch {
      hubSettings = null;
    } finally {
      hubKeyLoading = false;
    }
  }

  async function handleSaveApiKey(): Promise<void> {
    if (!hubApiKey.trim()) {
      toast.warning('Enter your API key');
      return;
    }
    hubKeySaving = true;
    try {
      await saveHubApiKey(hubApiKey.trim());
      toast.success('API key saved!');
      hubApiKey = '';
      await loadHubSettings();
    } catch {
      toast.error('Failed to save API key');
    } finally {
      hubKeySaving = false;
    }
  }

  async function handleRemoveApiKey(): Promise<void> {
    hubKeySaving = true;
    try {
      await saveHubApiKey('');
      toast.success('API key removed');
      await loadHubSettings();
    } catch {
      toast.error('Failed to remove API key');
    } finally {
      hubKeySaving = false;
    }
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

  async function loadTelegramSettings(): Promise<void> {
    try {
      const s = await getTelegramSettings();
      tgBotToken = s.telegram_bot_token;
      tgChannelId = s.telegram_channel_id;
      tgEnvTokenSet = s.env_bot_token_set;
      tgEnvChannelSet = s.env_channel_id_set;
    } catch {
      // ignore — settings may not exist yet
    } finally {
      // loading complete
    }
  }

  async function handleSaveTelegramSettings(): Promise<void> {
    tgSettingsSaving = true;
    try {
      await saveTelegramSettings({
        telegram_bot_token: tgBotToken.trim(),
        telegram_channel_id: tgChannelId.trim(),
        telegram_webhook_secret: '',
      });
      toast.success('Telegram credentials saved!');
      // Refresh status with new credentials
      await loadTelegramStatus();
    } catch {
      toast.error('Failed to save Telegram credentials');
    } finally {
      tgSettingsSaving = false;
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

  // ── Claude Bridge functions ──────────────────────────────────────────────

  async function loadClaudeBridge(): Promise<void> {
    cbLoading = true;
    try {
      companionOnline = await checkCompanionHealth();
      if (!companionOnline) return;

      const [status, config] = await Promise.all([
        getTelegramBridgeStatus(),
        getTelegramBridgeConfig(),
      ]);
      cbStatus = status;
      cbConfig = config;
      if (config.botTokenSet && !cbBotToken) {
        cbBotToken = config.botToken; // masked
      }
      if (config.allowedChatIds.length > 0 && !cbChatIds) {
        cbChatIds = config.allowedChatIds.join(', ');
      }
    } catch {
      companionOnline = false;
    } finally {
      cbLoading = false;
    }
  }

  async function handleSaveClaudeBridgeConfig(): Promise<void> {
    cbSaving = true;
    try {
      const ids = cbChatIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);

      for (const id of ids) {
        if (isNaN(id)) {
          toast.error(`Invalid chat ID: "${id}"`);
          cbSaving = false;
          return;
        }
      }

      const config: Record<string, unknown> = { allowedChatIds: ids };
      // Only send token if it's not the masked version
      if (cbBotToken && !cbBotToken.includes('...')) {
        config.botToken = cbBotToken;
      }

      const result = await saveTelegramBridgeConfig(
        config as { botToken?: string; allowedChatIds?: number[] },
      );
      if (result.ok) {
        toast.success('Claude Bridge config saved!');
        await loadClaudeBridge();
      } else {
        toast.error(result.error ?? 'Save failed');
      }
    } catch {
      toast.error('Failed to save config');
    } finally {
      cbSaving = false;
    }
  }

  async function handleStartBridge(): Promise<void> {
    cbStarting = true;
    try {
      const result = await startTelegramBridge();
      if (result.ok) {
        toast.success('Claude Bridge started!');
        await loadClaudeBridge();
      } else {
        toast.error(result.error ?? 'Start failed');
      }
    } catch {
      toast.error('Failed to start bridge');
    } finally {
      cbStarting = false;
    }
  }

  async function handleStopBridge(): Promise<void> {
    cbStopping = true;
    try {
      await stopTelegramBridge();
      toast.success('Claude Bridge stopped');
      await loadClaudeBridge();
    } catch {
      toast.error('Failed to stop bridge');
    } finally {
      cbStopping = false;
    }
  }

  // ── Project Profile functions ──────────────────────────────────────────────

  async function loadProjectProfiles(): Promise<void> {
    projectsLoading = true;
    try {
      const online = await checkCompanionHealth();
      if (online) {
        projectProfiles = await listProjects();
      }
    } catch {
      projectProfiles = [];
    } finally {
      projectsLoading = false;
    }
  }

  function startEdit(p: CompanionProjectProfile): void {
    editingProject = p.slug;
    editName = p.name;
    editDir = p.dir;
    editModel = p.defaultModel;
    editPermission = p.permissionMode;
  }

  function cancelEdit(): void {
    editingProject = null;
  }

  async function saveEdit(): Promise<void> {
    if (!editingProject) return;
    projectSaving = true;
    try {
      const result = await updateCompanionProject(editingProject, {
        name: editName,
        dir: editDir,
        defaultModel: editModel,
        permissionMode: editPermission,
      });
      if (result.ok) {
        toast.success('Project updated!');
        editingProject = null;
        await loadProjectProfiles();
      } else {
        toast.error(result.error ?? 'Update failed');
      }
    } catch {
      toast.error('Failed to update project');
    } finally {
      projectSaving = false;
    }
  }

  async function handleAddProject(): Promise<void> {
    if (!newProjectName.trim()) {
      toast.warning('Project name is required');
      return;
    }
    projectSaving = true;
    try {
      const result = await createCompanionProject({
        name: newProjectName.trim(),
        dir: newProjectDir.trim(),
        defaultModel: newProjectModel,
        permissionMode: newProjectPermission,
      });
      if (result.ok) {
        toast.success('Project added!');
        newProjectName = '';
        newProjectDir = '';
        newProjectModel = 'sonnet';
        newProjectPermission = 'bypassPermissions';
        showAddProject = false;
        await loadProjectProfiles();
      } else {
        toast.error(result.error ?? 'Create failed');
      }
    } catch {
      toast.error('Failed to add project');
    } finally {
      projectSaving = false;
    }
  }

  async function handleDeleteProject(slug: string, name: string): Promise<void> {
    if (!confirm(`Delete project "${name}"?`)) return;
    try {
      const result = await deleteCompanionProject(slug);
      if (result.ok) {
        toast.success('Project removed');
        await loadProjectProfiles();
      } else {
        toast.error(result.error ?? 'Delete failed');
      }
    } catch {
      toast.error('Failed to delete project');
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function handleSeedProjects(): Promise<void> {
    isSeeding = true;
    try {
      const res = await pb.send('/api/mytrend/seed-projects', { method: 'POST' });
      toast.success(res.message || 'Projects seeded!');
    } catch (err: unknown) {
      console.error('[Settings] Seed projects failed:', err);
      toast.error('Failed to seed projects');
    } finally {
      isSeeding = false;
    }
  }
</script>

<svelte:head>
  <title>Settings - MyTrend</title>
</svelte:head>

<div class="settings-page">
  <div class="settings-header">
    <h1 class="comic-heading">Settings</h1>
  </div>

  <ComicTabs bind:active={activeTab} tabs={TABS} />

  <!-- ── Tab: Profile ─────────────────────────────────────────── -->
  {#if activeTab === 'profile'}
    <div class="tab-grid">
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
        <h2 class="section-title">Device</h2>
        <div class="form-fields">
          <ComicInput bind:value={deviceName} label="Device Name" placeholder="My Laptop" />
        </div>
        <div class="actions">
          <ComicButton variant="secondary" onclick={saveDeviceName}>Save</ComicButton>
        </div>
      </ComicCard>

      <ComicCard>
        <h2 class="section-title">Appearance</h2>
        <p class="tg-hint">
          Use the theme picker <strong>✏️</strong> in the header to switch between Comic, Apple, and Pro
          themes in real time.
        </p>
        <div class="theme-row">
          <span class="theme-current">Active: <strong>{currentTheme}</strong></span>
        </div>
      </ComicCard>
    </div>
  {/if}

  <!-- ── Tab: AI & Projects ────────────────────────────────────── -->
  {#if activeTab === 'ai'}
    <div class="tab-stack">
      <ComicCard>
        <div class="section-header">
          <h2 class="section-title">AI Hub (Claude API)</h2>
          {#if hubKeyLoading}
            <ComicBadge color="blue" size="sm">Loading...</ComicBadge>
          {:else if hubSettings?.env_api_key_set}
            <ComicBadge color="green" size="sm">ENV Set</ComicBadge>
          {:else if hubSettings?.anthropic_api_key_set}
            <ComicBadge color="green" size="sm">DB Set</ComicBadge>
          {:else}
            <ComicBadge color="red" size="sm">Not Configured</ComicBadge>
          {/if}
        </div>

        {#if hubSettings?.env_api_key_set}
          <p class="tg-hint tg-env-note">API Key: set via ANTHROPIC_API_KEY env variable</p>
        {/if}

        {#if hubSettings?.anthropic_api_key_set && !hubSettings?.env_api_key_set}
          <div class="api-key-status">
            <span class="api-key-masked">{hubSettings.anthropic_api_key_masked}</span>
            <ComicButton
              variant="danger"
              size="sm"
              loading={hubKeySaving}
              onclick={handleRemoveApiKey}>Remove</ComicButton
            >
          </div>
        {/if}

        {#if !hubSettings?.env_api_key_set}
          <div class="form-fields">
            <ComicInput
              bind:value={hubApiKey}
              label={hubSettings?.anthropic_api_key_set ? 'Replace API Key' : 'Anthropic API Key'}
              placeholder="sk-ant-api03-..."
              type="password"
            />
          </div>
          <div class="actions">
            <ComicButton variant="primary" loading={hubKeySaving} onclick={handleSaveApiKey}>
              Save API Key
            </ComicButton>
          </div>
          <p class="tg-hint">
            Get your key at <a
              href="https://platform.claude.com/settings/keys"
              target="_blank"
              rel="noopener">platform.claude.com/settings/keys</a
            >
          </p>
        {/if}
      </ComicCard>

      <ComicCard>
        <div class="section-header">
          <h2 class="section-title">Claude Code Projects</h2>
          {#if projectsLoading}
            <ComicBadge color="blue" size="sm">Loading...</ComicBadge>
          {:else if !companionOnline}
            <ComicBadge color="red" size="sm">Companion Offline</ComicBadge>
          {:else}
            <ComicBadge color="green" size="sm">{projectProfiles.length} projects</ComicBadge>
          {/if}
        </div>

        {#if !companionOnline && !projectsLoading}
          <p class="tg-hint">
            Companion service is offline. Start it with <code>cd companion && bun run dev</code>
          </p>
        {:else}
          {#if projectProfiles.length > 0}
            <div class="project-list">
              {#each projectProfiles as p (p.slug)}
                {#if editingProject === p.slug}
                  <div class="project-item project-editing">
                    <div class="form-fields">
                      <ComicInput bind:value={editName} label="Name" />
                      <FolderPicker
                        bind:value={editDir}
                        label="Local Directory"
                        placeholder="Select project folder..."
                      />
                      <div class="project-row">
                        <div class="project-field">
                          <label class="label" for="edit-model">Model</label>
                          <select id="edit-model" class="comic-input" bind:value={editModel}>
                            <option value="haiku">Haiku</option>
                            <option value="sonnet">Sonnet</option>
                            <option value="opus">Opus</option>
                            <option value="opus-1m">Opus 1M</option>
                            <option value="sonnet-1m">Sonnet 1M</option>
                          </select>
                        </div>
                        <div class="project-field">
                          <label class="label" for="edit-perm">Permission</label>
                          <select id="edit-perm" class="comic-input" bind:value={editPermission}>
                            <option value="default">Default</option>
                            <option value="acceptEdits">Accept Edits</option>
                            <option value="bypassPermissions">Bypass All</option>
                            <option value="plan">Plan</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div class="actions">
                      <ComicButton variant="primary" loading={projectSaving} onclick={saveEdit}
                        >Save</ComicButton
                      >
                      <ComicButton variant="outline" onclick={cancelEdit}>Cancel</ComicButton>
                    </div>
                  </div>
                {:else}
                  <div class="project-item">
                    <div class="project-info">
                      <strong class="project-name">{p.name}</strong>
                      <code class="project-dir">{p.dir || '(no directory set)'}</code>
                      <div class="project-meta">
                        <ComicBadge color="blue" size="sm">{p.defaultModel}</ComicBadge>
                        <ComicBadge color="green" size="sm">{p.permissionMode}</ComicBadge>
                      </div>
                    </div>
                    <div class="project-actions">
                      <ComicButton variant="outline" onclick={() => startEdit(p)}>Edit</ComicButton>
                      {#if p.slug !== 'hub'}
                        <ComicButton
                          variant="danger"
                          onclick={() => handleDeleteProject(p.slug, p.name)}>✕</ComicButton
                        >
                      {:else}
                        <ComicBadge color="purple" size="sm">Built-in</ComicBadge>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else if !projectsLoading}
            <p class="tg-hint">No projects configured. Add your first project below.</p>
          {/if}

          {#if showAddProject}
            <div class="project-add-form">
              <h3 class="subsection-title">Add Project</h3>
              <div class="form-fields">
                <ComicInput
                  bind:value={newProjectName}
                  label="Project Name"
                  placeholder="My Awesome Project"
                />
                <FolderPicker
                  bind:value={newProjectDir}
                  label="Local Directory"
                  placeholder="Select project folder..."
                />
                <div class="project-row">
                  <div class="project-field">
                    <label class="label" for="new-model">Model</label>
                    <select id="new-model" class="comic-input" bind:value={newProjectModel}>
                      <option value="haiku">Haiku</option>
                      <option value="sonnet">Sonnet</option>
                      <option value="opus">Opus</option>
                    </select>
                  </div>
                  <div class="project-field">
                    <label class="label" for="new-perm">Permission</label>
                    <select id="new-perm" class="comic-input" bind:value={newProjectPermission}>
                      <option value="default">Default</option>
                      <option value="acceptEdits">Accept Edits</option>
                      <option value="bypassPermissions">Bypass All</option>
                      <option value="plan">Plan</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="actions">
                <ComicButton variant="primary" loading={projectSaving} onclick={handleAddProject}
                  >Add Project</ComicButton
                >
                <ComicButton
                  variant="outline"
                  onclick={() => {
                    showAddProject = false;
                  }}>Cancel</ComicButton
                >
              </div>
            </div>
          {:else}
            <div class="actions" style="margin-top: var(--spacing-md)">
              <ComicButton
                variant="secondary"
                onclick={() => {
                  showAddProject = true;
                }}>+ Add Project</ComicButton
              >
              <ComicButton variant="outline" loading={projectsLoading} onclick={loadProjectProfiles}
                >Refresh</ComicButton
              >
            </div>
          {/if}
        {/if}
      </ComicCard>
    </div>
  {/if}

  <!-- ── Tab: Integrations ─────────────────────────────────────── -->
  {#if activeTab === 'integrations'}
    <div class="tab-grid">
      <!-- Telegram Storage -->
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

        <div class="tg-credentials">
          {#if tgEnvTokenSet}
            <p class="tg-hint tg-env-note">Bot Token: set via env variable</p>
          {:else}
            <ComicInput
              bind:value={tgBotToken}
              label="Bot Token"
              placeholder="123456:ABC-DEF..."
              type="password"
            />
          {/if}
          {#if tgEnvChannelSet}
            <p class="tg-hint tg-env-note">Channel ID: set via env variable</p>
          {:else}
            <ComicInput bind:value={tgChannelId} label="Channel ID" placeholder="-100123456789" />
          {/if}
          {#if !tgEnvTokenSet || !tgEnvChannelSet}
            <div class="actions">
              <ComicButton
                variant="primary"
                loading={tgSettingsSaving}
                onclick={handleSaveTelegramSettings}>Save Credentials</ComicButton
              >
            </div>
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
              <span class="tg-stat-label">Channel</span>
            </div>
          </div>
          {#if tgStatus.error}
            <p class="tg-error">{tgStatus.error}</p>
          {/if}
          <div class="actions">
            <ComicButton variant="primary" loading={tgTesting} onclick={handleTestConnection}
              >Test</ComicButton
            >
            <ComicButton variant="outline" loading={tgLoading} onclick={loadTelegramStatus}
              >Refresh</ComicButton
            >
          </div>
          {#if !tgStatus.channel_id_set}
            <div class="tg-resolve">
              <p class="tg-hint">Add bot to channel as admin, send a message, then detect:</p>
              <ComicButton
                variant="secondary"
                loading={tgResolvingChannel}
                onclick={handleResolveChannel}>Detect Channel ID</ComicButton
              >
              {#if tgChannels.length > 0}
                <div class="tg-channels">
                  {#each tgChannels as ch (ch.id)}
                    <div class="tg-channel-item">
                      <strong>{ch.title}</strong>
                      <code>{ch.id}</code>
                      <span class="tg-channel-type">{ch.type}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          {#if tgStatus?.configured}
            <div class="tg-webhook">
              <h3 class="subsection-title">Knowledge Inbox (Webhook)</h3>
              <p class="tg-hint">Forward messages to bot to auto-create ideas. Needs HTTPS URL.</p>
              <div class="form-fields">
                <ComicInput
                  bind:value={webhookUrl}
                  label="Public URL"
                  placeholder="https://mytrend.example.com"
                />
              </div>
              <div class="actions">
                <ComicButton
                  variant="secondary"
                  loading={webhookSaving}
                  onclick={handleSetupWebhook}>Setup Webhook</ComicButton
                >
                <ComicButton variant="outline" onclick={handleRemoveWebhook}>Remove</ComicButton>
              </div>
            </div>
          {/if}
        {:else if !tgLoading}
          <p class="tg-hint">
            Set TELEGRAM_BOT_TOKEN and TELEGRAM_STORAGE_CHANNEL_ID in docker-compose.yml.
          </p>
        {/if}
      </ComicCard>

      <!-- Claude Bridge -->
      <ComicCard>
        <div class="section-header">
          <h2 class="section-title">Claude Bridge</h2>
          {#if cbLoading}
            <ComicBadge color="blue" size="sm">Loading...</ComicBadge>
          {:else if !companionOnline}
            <ComicBadge color="red" size="sm">Offline</ComicBadge>
          {:else if cbStatus?.running}
            <ComicBadge color="green" size="sm">Running</ComicBadge>
          {:else if cbConfig?.botTokenSet}
            <ComicBadge color="orange" size="sm">Stopped</ComicBadge>
          {:else}
            <ComicBadge color="orange" size="sm">Not Configured</ComicBadge>
          {/if}
        </div>

        {#if !companionOnline && !cbLoading}
          <p class="tg-hint">
            Companion offline. Start with <code>cd companion && bun run dev</code>
          </p>
        {:else if companionOnline}
          {#if cbConfig?.envConfigured}
            <p class="tg-hint tg-env-note">
              Config via env vars (TELEGRAM_BOT_TOKEN + ALLOWED_CHAT_IDS)
            </p>
          {:else}
            <div class="tg-credentials">
              <ComicInput
                bind:value={cbBotToken}
                label="Bot Token"
                placeholder="123456:ABC-DEF..."
                type="password"
              />
              <ComicInput
                bind:value={cbChatIds}
                label="Allowed Chat IDs"
                placeholder="123456789, 987654321"
              />
              <p class="tg-hint">Comma-separated Telegram chat/group IDs.</p>
              <div class="actions">
                <ComicButton
                  variant="primary"
                  loading={cbSaving}
                  onclick={handleSaveClaudeBridgeConfig}>Save Config</ComicButton
                >
              </div>
            </div>
          {/if}

          {#if cbStatus}
            <div class="cb-stats">
              <div class="tg-stat">
                <span class="tg-stat-value">{cbStatus.activeChats}</span>
                <span class="tg-stat-label">Active Chats</span>
              </div>
              <div class="tg-stat">
                <span class="tg-stat-value">{cbConfig?.allowedChatIds.length ?? 0}</span>
                <span class="tg-stat-label">Allowed IDs</span>
              </div>
              <div class="tg-stat">
                <span class="tg-stat-value">{cbStatus.running ? 'Polling' : 'Stopped'}</span>
                <span class="tg-stat-label">Status</span>
              </div>
            </div>
            <div class="actions">
              {#if cbStatus.running}
                <ComicButton variant="danger" loading={cbStopping} onclick={handleStopBridge}
                  >Stop Bridge</ComicButton
                >
              {:else}
                <ComicButton variant="primary" loading={cbStarting} onclick={handleStartBridge}
                  >Start Bridge</ComicButton
                >
              {/if}
              <ComicButton variant="outline" loading={cbLoading} onclick={loadClaudeBridge}
                >Refresh</ComicButton
              >
            </div>
          {/if}
        {/if}
      </ComicCard>
    </div>
  {/if}

  <!-- ── Tab: Data ─────────────────────────────────────────────── -->
  {#if activeTab === 'data'}
    <div class="tab-stack">
      <ComicCard>
        <h2 class="section-title">Neural Memory</h2>
        <div class="nm-status">
          <div class="nm-row">
            <span class="nm-label">Status</span>
            <ComicBadge color={nmOnline ? 'green' : 'red'} size="sm">
              {nmOnline ? 'Online' : 'Offline'}
            </ComicBadge>
          </div>
          <div class="nm-row">
            <span class="nm-label">Brain ID</span>
            <code class="nm-brain">{nmBrain ?? 'unknown'}</code>
          </div>
        </div>
        {#if nmBrain}
          <p class="nm-hint">
            Brain ID is configured via <code>NEURALMEMORY_BRAIN</code> env var. Change it in
            <code>.env</code>
            or <code>docker-compose.yml</code> and restart.
          </p>
        {/if}
      </ComicCard>

      <ComicCard>
        <h2 class="section-title">Data Management</h2>
        <div class="data-actions">
          <ComicButton variant="outline" onclick={handleSeedProjects} loading={isSeeding}>
            Seed Default Projects
          </ComicButton>
          <ComicButton variant="outline">Export All Data (JSON)</ComicButton>
          <ComicButton variant="danger">Clear All Data</ComicButton>
        </div>
        <p class="seed-hint">
          Seed creates: Neural Memory, MyTrend, Future Bot, Companion projects if missing.
        </p>
      </ComicCard>
    </div>
  {/if}
</div>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 960px;
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  /* 2-column grid for balanced sections */
  .tab-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-lg);
    align-items: start;
  }

  /* single-column stack for complex full-width sections */
  .tab-stack {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  @media (max-width: 768px) {
    .tab-grid {
      grid-template-columns: 1fr;
    }
  }

  .section-title {
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 var(--spacing-md);
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

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .theme-current {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .theme-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-sm);
  }

  .data-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
    margin-bottom: var(--spacing-sm);
  }

  .seed-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: var(--spacing-xs) 0 0;
  }

  /* Neural Memory */
  .nm-status {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .nm-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .nm-label {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .nm-brain {
    font-family: 'Comic Mono', monospace;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--accent-blue);
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .nm-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: var(--spacing-sm) 0 0;
    line-height: 1.5;
  }

  .nm-hint code {
    font-family: 'Comic Mono', monospace;
    font-size: 0.7rem;
    background: var(--bg-secondary);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Telegram / stats */
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
    gap: 2px;
  }

  .tg-stat-value {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--accent-green);
  }

  .tg-stat-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .cb-stats {
    display: flex;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-md);
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
    line-height: 1.5;
  }

  .tg-credentials {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-md);
    border-bottom: 1px dashed var(--border-color);
  }

  .tg-env-note {
    background: var(--bg-secondary);
    padding: 4px var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    font-family: var(--font-comic);
    font-size: 0.72rem;
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
    font-size: 0.8rem;
  }

  .tg-channel-item code {
    font-family: var(--font-comic);
    font-size: 0.72rem;
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .tg-channel-type {
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .tg-webhook {
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px dashed var(--border-color);
  }

  .subsection-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 4px;
  }

  /* Project list */
  .project-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }

  .project-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
  }

  .project-editing {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .project-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .project-name {
    font-family: var(--font-comic);
    font-size: 0.9rem;
  }

  .project-dir {
    font-family: var(--font-comic);
    font-size: 0.68rem;
    color: var(--text-secondary);
    word-break: break-all;
    background: none;
    padding: 0;
  }

  .project-meta {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .project-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .project-row {
    display: flex;
    gap: var(--spacing-md);
  }

  .project-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .project-field .label {
    font-family: var(--font-comic);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .api-key-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }

  .api-key-masked {
    font-family: var(--font-comic);
    font-size: 0.82rem;
    background: var(--bg-secondary);
    padding: 4px var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
  }

  .project-add-form {
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px dashed var(--border-color);
  }
</style>
