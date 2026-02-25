<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, authLoading, authError } from '$lib/stores/auth';
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';

  let displayName = $state('');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const unsub = authLoading.subscribe((v) => {
      loading = v;
    });
    return unsub;
  });

  $effect(() => {
    const unsub = authError.subscribe((v) => {
      error = v;
    });
    return unsub;
  });

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (password.length < 8) {
      authError.set('Password must be at least 8 characters');
      return;
    }
    const success = await register(email, password, displayName);
    if (success) {
      await goto('/');
    }
  }
</script>

<svelte:head>
  <title>Register - MyTrend</title>
</svelte:head>

<div class="auth-page">
  <ComicCard variant="standard">
    <div class="auth-form">
      <h1 class="comic-heading">MyTrend</h1>
      <p class="subtitle">Create your account</p>

      <form onsubmit={handleSubmit}>
        <div class="fields">
          <ComicInput
            bind:value={displayName}
            label="Display Name"
            placeholder="Your name"
            required
          />
          <ComicInput
            bind:value={email}
            type="email"
            label="Email"
            placeholder="you@example.com"
            required
          />
          <ComicInput
            bind:value={password}
            type="password"
            label="Password"
            placeholder="Min 8 characters"
            required
          />
        </div>

        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        <ComicButton variant="primary" type="submit" {loading}>Register</ComicButton>
      </form>

      <p class="link">
        Already have an account? <a href="/auth/login">Login</a>
      </p>
    </div>
  </ComicCard>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
    background: var(--bg-secondary);
  }

  .auth-form {
    width: 360px;
    max-width: 100%;
  }

  .comic-heading {
    text-align: center;
    color: var(--accent-green);
    margin-bottom: var(--spacing-xs);
  }

  .subtitle {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: var(--spacing-xl);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .error {
    color: var(--accent-red);
    font-size: 0.875rem;
    font-weight: 700;
    text-align: center;
  }

  .link {
    text-align: center;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: var(--spacing-lg);
  }
</style>
