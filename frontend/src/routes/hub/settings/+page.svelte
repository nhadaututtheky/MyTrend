<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchEnvironments, createEnvironment } from '$lib/api/hub';
  import { toast } from '$lib/stores/toast';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import type { HubEnvironment } from '$lib/types';

  let environments = $state<HubEnvironment[]>([]);
  let isLoading = $state(true);

  // New environment form
  let newEnvName = $state('');
  let newEnvModel = $state('claude-sonnet-4-5-20250929');
  let isCreating = $state(false);

  onMount(async () => {
    try {
      environments = await fetchEnvironments();
    } catch (err: unknown) {
      console.error('[Hub/Settings]', err);
    } finally {
      isLoading = false;
    }
  });

  async function handleCreateEnv(): Promise<void> {
    if (!newEnvName.trim()) return;
    isCreating = true;
    try {
      const env = await createEnvironment({
        name: newEnvName,
        slug: newEnvName.toLowerCase().replace(/\s+/g, '-'),
        model: newEnvModel,
        system_prompt: '',
        max_tokens: 4096,
        temperature: 1.0,
        tools_enabled: [],
        api_key_encrypted: '',
      });
      environments = [...environments, env];
      newEnvName = '';
      toast.success('Environment created!');
    } catch (err: unknown) {
      console.error('[Hub/Settings]', err);
      toast.error('Failed to create environment');
    } finally {
      isCreating = false;
    }
  }
</script>

<svelte:head>
  <title>Hub Settings - MyTrend</title>
</svelte:head>

<div class="hub-settings">
  <h2 class="comic-heading">Hub Settings</h2>

  <ComicCard>
    <h3 class="section-title">API Configuration</h3>
    <p class="hint">
      Set your Anthropic API key in the .env file (ANTHROPIC_API_KEY).
      The key is used server-side only and never exposed to the browser.
    </p>
  </ComicCard>

  <ComicCard>
    <h3 class="section-title">Environments</h3>
    {#if isLoading}
      <p class="loading">Loading...</p>
    {:else}
      <div class="env-list">
        {#each environments as env (env.id)}
          <div class="env-item">
            <div class="env-header">
              <strong>{env.name}</strong>
              <ComicBadge color="blue" size="sm">{env.model}</ComicBadge>
            </div>
            <div class="env-details">
              <span>Max tokens: {env.max_tokens}</span>
              <span>Temp: {env.temperature}</span>
            </div>
          </div>
        {:else}
          <p class="empty">No environments configured. Create one below.</p>
        {/each}
      </div>

      <div class="new-env-form">
        <h4>New Environment</h4>
        <div class="form-row">
          <ComicInput bind:value={newEnvName} placeholder="Environment name" />
          <select class="comic-input" bind:value={newEnvModel}>
            <option value="claude-sonnet-4-5-20250929">Sonnet 4.5</option>
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
          </select>
          <ComicButton variant="primary" loading={isCreating} onclick={handleCreateEnv}>
            Add
          </ComicButton>
        </div>
      </div>
    {/if}
  </ComicCard>
</div>

<style>
  .hub-settings {
    flex: 1;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    max-width: 700px;
  }

  .section-title {
    font-size: 1rem;
    text-transform: uppercase;
    margin: 0 0 var(--spacing-md);
  }

  .hint {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .env-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-lg);
  }

  .env-item {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--bg-secondary);
    border-radius: var(--radius-sm);
  }

  .env-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .env-details {
    font-size: 0.75rem;
    color: var(--text-muted);
    display: flex;
    gap: var(--spacing-md);
  }

  .new-env-form h4 {
    font-size: 0.875rem;
    margin-bottom: var(--spacing-sm);
  }

  .form-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-end;
  }

  .loading, .empty {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
</style>
