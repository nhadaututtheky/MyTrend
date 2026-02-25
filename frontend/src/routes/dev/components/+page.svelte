<script lang="ts">
  import ComicButton from '$lib/components/comic/ComicButton.svelte';
  import ComicCard from '$lib/components/comic/ComicCard.svelte';
  import ComicBadge from '$lib/components/comic/ComicBadge.svelte';
  import ComicInput from '$lib/components/comic/ComicInput.svelte';
  import ComicCallout from '$lib/components/comic/ComicCallout.svelte';
  import ComicProgress from '$lib/components/comic/ComicProgress.svelte';
  import ComicSkeleton from '$lib/components/comic/ComicSkeleton.svelte';
  import ComicEmptyState from '$lib/components/comic/ComicEmptyState.svelte';
  import ComicTabs from '$lib/components/comic/ComicTabs.svelte';
  import ComicTooltip from '$lib/components/comic/ComicTooltip.svelte';
  import ComicDialog from '$lib/components/comic/ComicDialog.svelte';
  import ComicSparkline from '$lib/components/comic/ComicSparkline.svelte';

  let dialogOpen = $state(false);
  let inputValue = $state('');
  let activeTab = $state('tab1');

  const sparkData = [4, 7, 3, 8, 5, 9, 6, 11, 7, 10];
  const sparkData2 = [10, 8, 12, 6, 9, 4, 7, 3, 5, 2];
</script>

<svelte:head>
  <title>Component Gallery | MyTrend Dev</title>
</svelte:head>

<div class="gallery">
  <header class="gallery-header">
    <h1 class="gallery-title">Component Gallery</h1>
    <p class="gallery-desc">All comic UI components and their variants</p>
  </header>

  <!-- ─── Buttons ──────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicButton</h2>
    <p class="section-desc">Variants: primary, secondary, danger, outline | Sizes: sm, md, lg</p>

    <div class="demo-group">
      <h3 class="demo-label">Variants</h3>
      <div class="demo-row">
        <ComicButton variant="primary">Primary</ComicButton>
        <ComicButton variant="secondary">Secondary</ComicButton>
        <ComicButton variant="danger">Danger</ComicButton>
        <ComicButton variant="outline">Outline</ComicButton>
      </div>
    </div>

    <div class="demo-group">
      <h3 class="demo-label">Sizes</h3>
      <div class="demo-row">
        <ComicButton size="sm">Small</ComicButton>
        <ComicButton size="md">Medium</ComicButton>
        <ComicButton size="lg">Large</ComicButton>
      </div>
    </div>

    <div class="demo-group">
      <h3 class="demo-label">States</h3>
      <div class="demo-row">
        <ComicButton loading>Loading</ComicButton>
        <ComicButton disabled>Disabled</ComicButton>
      </div>
    </div>
  </section>

  <!-- ─── Cards ────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicCard</h2>
    <p class="section-desc">
      Variants: standard, skewed, interactive | Neon: green, blue, red, purple, yellow, orange
    </p>

    <div class="demo-group">
      <h3 class="demo-label">Variants</h3>
      <div class="demo-grid-3">
        <ComicCard variant="standard">
          <p class="card-text">Standard card</p>
        </ComicCard>
        <ComicCard variant="skewed">
          <p class="card-text">Skewed card</p>
        </ComicCard>
        <ComicCard variant="interactive" onclick={() => {}}>
          <p class="card-text">Interactive (click me)</p>
        </ComicCard>
      </div>
    </div>

    <div class="demo-group">
      <h3 class="demo-label">Neon Glow (best in dark mode)</h3>
      <div class="demo-grid-3">
        <ComicCard neon="green"><p class="card-text">Green</p></ComicCard>
        <ComicCard neon="blue"><p class="card-text">Blue</p></ComicCard>
        <ComicCard neon="red"><p class="card-text">Red</p></ComicCard>
        <ComicCard neon="purple"><p class="card-text">Purple</p></ComicCard>
        <ComicCard neon="yellow"><p class="card-text">Yellow</p></ComicCard>
        <ComicCard neon="orange"><p class="card-text">Orange</p></ComicCard>
      </div>
    </div>
  </section>

  <!-- ─── Badges ───────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicBadge</h2>
    <p class="section-desc">
      Colors: green, red, yellow, blue, purple, orange | Sizes: sm, md | Animated
    </p>

    <div class="demo-group">
      <div class="demo-row">
        <ComicBadge color="green">Green</ComicBadge>
        <ComicBadge color="red">Red</ComicBadge>
        <ComicBadge color="yellow">Yellow</ComicBadge>
        <ComicBadge color="blue">Blue</ComicBadge>
        <ComicBadge color="purple">Purple</ComicBadge>
        <ComicBadge color="orange">Orange</ComicBadge>
      </div>
    </div>

    <div class="demo-group">
      <h3 class="demo-label">Sizes + Animated</h3>
      <div class="demo-row">
        <ComicBadge size="sm" color="green">Small</ComicBadge>
        <ComicBadge size="md" color="blue">Medium</ComicBadge>
        <ComicBadge color="purple" animated>Animated</ComicBadge>
      </div>
    </div>
  </section>

  <!-- ─── Input ────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicInput</h2>
    <p class="section-desc">Text input with label, icon, error, disabled states</p>

    <div class="demo-group">
      <div class="demo-grid-2">
        <ComicInput label="Default" placeholder="Type something..." bind:value={inputValue} />
        <ComicInput label="With Icon" placeholder="Search..." icon="🔍" />
        <ComicInput label="With Error" value="bad value" error="This field is invalid" />
        <ComicInput label="Disabled" value="Can't edit" disabled />
      </div>
    </div>
  </section>

  <!-- ─── Callout ──────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicCallout</h2>
    <p class="section-desc">Types: tip, note, important, warning</p>

    <div class="demo-group">
      <div class="demo-stack">
        <ComicCallout type="tip">This is a helpful tip for the user.</ComicCallout>
        <ComicCallout type="note">Important note about this feature.</ComicCallout>
        <ComicCallout type="important">Critical information you should know.</ComicCallout>
        <ComicCallout type="warning">Warning: this action cannot be undone.</ComicCallout>
      </div>
    </div>
  </section>

  <!-- ─── Progress ─────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicProgress</h2>
    <p class="section-desc">Colors: green, blue, purple, yellow, orange | Sizes: sm, md</p>

    <div class="demo-group">
      <div class="demo-stack">
        <ComicProgress value={75} color="green" />
        <ComicProgress value={50} color="blue" />
        <ComicProgress value={30} color="purple" />
        <ComicProgress value={90} color="yellow" />
        <ComicProgress value={15} color="orange" size="sm" />
      </div>
    </div>
  </section>

  <!-- ─── Skeleton ─────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicSkeleton</h2>
    <p class="section-desc">Variants: text, card, chart, avatar, button, sparkline</p>

    <div class="demo-group">
      <div class="demo-grid-3">
        <div>
          <h3 class="demo-label">Text (3 lines)</h3>
          <ComicSkeleton variant="text" lines={3} />
        </div>
        <div>
          <h3 class="demo-label">Card</h3>
          <ComicSkeleton variant="card" />
        </div>
        <div>
          <h3 class="demo-label">Chart</h3>
          <ComicSkeleton variant="chart" />
        </div>
      </div>
      <div class="demo-row" style="margin-top: var(--spacing-md);">
        <div>
          <h3 class="demo-label">Avatar</h3>
          <ComicSkeleton variant="avatar" />
        </div>
        <div>
          <h3 class="demo-label">Button</h3>
          <ComicSkeleton variant="button" />
        </div>
        <div>
          <h3 class="demo-label">Sparkline</h3>
          <ComicSkeleton variant="sparkline" />
        </div>
      </div>
    </div>
  </section>

  <!-- ─── EmptyState ───────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicEmptyState</h2>
    <p class="section-desc">Illustrations: empty, search, error, inbox</p>

    <div class="demo-group">
      <div class="demo-grid-2">
        <ComicEmptyState
          illustration="empty"
          message="Nothing here yet"
          description="Create something new"
        />
        <ComicEmptyState
          illustration="search"
          message="No results"
          description="Try different keywords"
        />
        <ComicEmptyState
          illustration="error"
          message="Something went wrong"
          description="Please try again"
        />
        <ComicEmptyState illustration="inbox" message="Inbox empty" description="All caught up!" />
      </div>
    </div>
  </section>

  <!-- ─── Tabs ─────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicTabs</h2>
    <p class="section-desc">Tab navigation with optional badge counts</p>

    <div class="demo-group">
      <ComicTabs
        tabs={[
          { id: 'tab1', label: 'Overview' },
          { id: 'tab2', label: 'Details', badge: 3 },
          { id: 'tab3', label: 'Settings' },
        ]}
        bind:active={activeTab}
      />
      <p class="tab-content">Active tab: <strong>{activeTab}</strong></p>
    </div>
  </section>

  <!-- ─── Tooltip ──────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicTooltip</h2>
    <p class="section-desc">Positions: top, bottom, left, right</p>

    <div class="demo-group">
      <div class="demo-row tooltip-row">
        <ComicTooltip text="Tooltip on top" position="top">
          <ComicButton variant="outline" size="sm">Top</ComicButton>
        </ComicTooltip>
        <ComicTooltip text="Tooltip on bottom" position="bottom">
          <ComicButton variant="outline" size="sm">Bottom</ComicButton>
        </ComicTooltip>
        <ComicTooltip text="Tooltip on left" position="left">
          <ComicButton variant="outline" size="sm">Left</ComicButton>
        </ComicTooltip>
        <ComicTooltip text="Tooltip on right" position="right">
          <ComicButton variant="outline" size="sm">Right</ComicButton>
        </ComicTooltip>
      </div>
    </div>
  </section>

  <!-- ─── Dialog ───────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicDialog</h2>
    <p class="section-desc">Modal dialog with title, content, and action slots</p>

    <div class="demo-group">
      <ComicButton onclick={() => (dialogOpen = true)}>Open Dialog</ComicButton>
      <ComicDialog bind:open={dialogOpen} title="Example Dialog">
        <p>This is the dialog content. It supports any child elements.</p>
        {#snippet actions()}
          <ComicButton variant="outline" size="sm" onclick={() => (dialogOpen = false)}
            >Cancel</ComicButton
          >
          <ComicButton variant="primary" size="sm" onclick={() => (dialogOpen = false)}
            >Confirm</ComicButton
          >
        {/snippet}
      </ComicDialog>
    </div>
  </section>

  <!-- ─── Sparkline ────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">ComicSparkline</h2>
    <p class="section-desc">Mini line chart with color, fill, roughness options</p>

    <div class="demo-group">
      <div class="demo-row">
        <div>
          <h3 class="demo-label">Green (default)</h3>
          <ComicSparkline data={sparkData} width={120} height={32} />
        </div>
        <div>
          <h3 class="demo-label">Red + Fill</h3>
          <ComicSparkline
            data={sparkData2}
            color="var(--accent-red)"
            fill
            width={120}
            height={32}
          />
        </div>
        <div>
          <h3 class="demo-label">Blue + Rough</h3>
          <ComicSparkline
            data={sparkData}
            color="var(--accent-blue)"
            roughness={3}
            width={120}
            height={32}
          />
        </div>
        <div>
          <h3 class="demo-label">Wide</h3>
          <ComicSparkline data={sparkData} color="var(--accent-purple)" width={200} height={40} />
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .gallery {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--spacing-xl) var(--spacing-lg);
  }

  .gallery-header {
    text-align: center;
    margin-bottom: var(--spacing-2xl);
    padding-bottom: var(--spacing-xl);
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .gallery-title {
    font-family: var(--font-display);
    font-size: var(--font-size-4xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .gallery-desc {
    font-family: var(--font-comic);
    color: var(--text-secondary);
    margin: var(--spacing-sm) 0 0;
  }

  .section {
    margin-bottom: var(--spacing-2xl);
    padding: var(--spacing-lg);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--text-primary);
    text-transform: uppercase;
    margin: 0 0 var(--spacing-xs);
  }

  .section-desc {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin: 0 0 var(--spacing-lg);
  }

  .demo-group {
    margin-bottom: var(--spacing-lg);
  }

  .demo-group:last-child {
    margin-bottom: 0;
  }

  .demo-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 var(--spacing-sm);
  }

  .demo-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-md);
  }

  .demo-grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--spacing-md);
  }

  .demo-grid-3 {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--spacing-md);
  }

  .demo-stack {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .card-text {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    margin: 0;
  }

  .tab-content {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    margin-top: var(--spacing-md);
  }

  .tooltip-row {
    padding: var(--spacing-xl) 0;
  }
</style>
