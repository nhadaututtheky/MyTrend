<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { loginWithTelegramToken } from '$lib/stores/auth';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';

  let status = $state<'verifying' | 'success' | 'error'>('verifying');
  let errorMsg = $state('');

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    if (!token) {
      status = 'error';
      errorMsg = 'No token provided';
      return;
    }

    const success = await loginWithTelegramToken(token);
    if (success) {
      status = 'success';
      setTimeout(() => goto('/'), 800);
    } else {
      status = 'error';
      errorMsg = 'Login failed. The link may have expired or already been used.';
    }
  });
</script>

<svelte:head>
  <title>Telegram Login - MyTrend</title>
</svelte:head>

<div class="auth-page">
  <ComicCard variant="standard">
    <div class="auth-form">
      <h1 class="comic-heading">MyTrend</h1>

      {#if status === 'verifying'}
        <div class="status-block">
          <div class="spinner" aria-label="Verifying"></div>
          <p class="status-text">Verifying your login link...</p>
        </div>
      {:else if status === 'success'}
        <div class="status-block">
          <span class="checkmark" aria-hidden="true">&#10003;</span>
          <p class="status-text success">Logged in! Redirecting...</p>
        </div>
      {:else}
        <div class="status-block">
          <span class="error-icon" aria-hidden="true">&#10007;</span>
          <p class="status-text error" role="alert">{errorMsg}</p>
          <a href="/auth/login" class="retry-link">Go to login</a>
        </div>
      {/if}
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
    text-align: center;
  }

  .comic-heading {
    color: var(--accent-green);
    margin-bottom: var(--spacing-xl);
  }

  .status-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xl) 0;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .checkmark {
    font-size: 2.5rem;
    color: var(--accent-green);
    font-weight: 700;
  }

  .error-icon {
    font-size: 2.5rem;
    color: var(--accent-red);
    font-weight: 700;
  }

  .status-text {
    font-size: 0.938rem;
    color: var(--text-secondary);
  }

  .status-text.success {
    color: var(--accent-green);
    font-weight: 700;
  }

  .status-text.error {
    color: var(--accent-red);
    font-weight: 700;
  }

  .retry-link {
    font-size: 0.875rem;
    color: var(--accent-blue);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
