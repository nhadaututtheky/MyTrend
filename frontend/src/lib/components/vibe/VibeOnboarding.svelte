<script lang="ts">
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';

  interface ProjectProfile {
    slug: string;
    name: string;
    dir: string;
    defaultModel: string;
    permissionMode: string;
  }

  interface Props {
    projects: ProjectProfile[];
    onlaunch: (slug: string, model: string) => void;
    ondismiss: () => void;
  }

  const { projects, onlaunch, ondismiss }: Props = $props();

  type Step = 'welcome' | 'project' | 'confirm';
  let step = $state<Step>('welcome');
  let selectedSlug = $state('');
  let selectedModel = $state('sonnet');

  const selectedProfile = $derived(projects.find((p) => p.slug === selectedSlug));

  function selectProject(slug: string): void {
    selectedSlug = slug;
    step = 'confirm';
  }

  function handleLaunch(): void {
    if (!selectedSlug) return;
    onlaunch(selectedSlug, selectedModel);
  }

  function handleBack(): void {
    if (step === 'confirm') step = 'project';
    else if (step === 'project') step = 'welcome';
  }
</script>

<div class="onboarding-overlay">
  <div class="onboarding-container">
    {#if step === 'welcome'}
      <div class="step step-welcome">
        <div class="hero-icon" aria-hidden="true">
          <svg width="80" height="80" viewBox="0 0 100 100">
            <path
              d="M 50 15 Q 20 15 15 45 Q 10 75 50 85 Q 90 75 85 45 Q 80 15 50 15"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
            <path
              d="M 35 45 L 35 40"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
            <path
              d="M 65 45 L 65 40"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
            <path
              d="M 38 58 Q 50 68 62 58"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <h2 class="onboarding-title">Welcome to Vibe Terminal</h2>
        <p class="onboarding-desc">
          Your browser-based Claude Code interface. Connect to any project and start coding with AI
          assistance.
        </p>
        <div class="step-actions">
          <ComicButton variant="primary" size="lg" onclick={() => (step = 'project')}>
            Get Started
          </ComicButton>
          <button class="skip-link" onclick={ondismiss}>Skip setup</button>
        </div>
      </div>
    {:else if step === 'project'}
      <div class="step step-project">
        <h2 class="onboarding-title">Pick a Project</h2>
        <p class="onboarding-desc">Choose which project to work on:</p>

        <div class="project-grid">
          {#each projects as p (p.slug)}
            <ComicCard
              variant="interactive"
              neon={selectedSlug === p.slug ? 'green' : false}
              onclick={() => selectProject(p.slug)}
            >
              <div class="project-item">
                <span class="project-name">{p.name}</span>
                <span class="project-dir">{p.dir}</span>
              </div>
            </ComicCard>
          {/each}
        </div>

        <div class="step-actions">
          <ComicButton variant="outline" size="sm" onclick={handleBack}>Back</ComicButton>
        </div>
      </div>
    {:else if step === 'confirm'}
      <div class="step step-confirm">
        <h2 class="onboarding-title">Ready to Launch</h2>

        <ComicCard variant="standard" neon="blue">
          <div class="confirm-details">
            <div class="detail-row">
              <span class="detail-label">Project</span>
              <span class="detail-value">{selectedProfile?.name ?? selectedSlug}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Model</span>
              <select class="model-select" bind:value={selectedModel}>
                <option value="haiku">Haiku 4.5</option>
                <option value="sonnet">Sonnet 4.6</option>
                <option value="opus">Opus 4.6</option>
                <option value="opus-1m">Opus 4.6 (1M)</option>
                <option value="sonnet-1m">Sonnet 4.6 (1M)</option>
              </select>
            </div>
          </div>
        </ComicCard>

        <div class="step-actions">
          <ComicButton variant="outline" size="sm" onclick={handleBack}>Back</ComicButton>
          <ComicButton variant="primary" size="lg" onclick={handleLaunch}>
            Launch Session
          </ComicButton>
        </div>
      </div>
    {/if}

    <!-- Step indicator -->
    <div class="step-dots" aria-hidden="true">
      <span class="dot" class:active={step === 'welcome'}></span>
      <span class="dot" class:active={step === 'project'}></span>
      <span class="dot" class:active={step === 'confirm'}></span>
    </div>
  </div>
</div>

<style>
  .onboarding-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: var(--spacing-lg);
  }

  .onboarding-container {
    max-width: 520px;
    width: 100%;
    text-align: center;
  }

  .step {
    animation: fadeIn 0.3s ease;
  }

  .hero-icon {
    color: var(--accent-green);
    margin-bottom: var(--spacing-lg);
  }

  .onboarding-title {
    font-family: var(--font-display);
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 var(--spacing-sm);
  }

  .onboarding-desc {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xl);
    line-height: 1.6;
  }

  .step-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
  }

  .skip-link {
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-decoration: underline;
    padding: var(--spacing-xs);
  }

  .skip-link:hover {
    color: var(--text-secondary);
  }

  /* Project grid */
  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-md);
    text-align: left;
  }

  .project-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .project-name {
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }

  .project-dir {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    word-break: break-all;
  }

  /* Confirm */
  .confirm-details {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    text-align: left;
  }

  .detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .detail-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .detail-value {
    font-family: var(--font-comic);
    font-weight: 700;
    color: var(--text-primary);
  }

  .model-select {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    padding: var(--spacing-xs) var(--spacing-sm);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    color: var(--text-primary);
    cursor: pointer;
  }

  /* Step dots */
  .step-dots {
    display: flex;
    justify-content: center;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-2xl);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-color);
    opacity: 0.3;
    transition:
      opacity var(--transition-fast),
      background var(--transition-fast);
  }

  .dot.active {
    opacity: 1;
    background: var(--accent-green);
  }
</style>
