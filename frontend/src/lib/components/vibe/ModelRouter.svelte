<script lang="ts">
  import { suggestModel } from '$lib/api/tasks';
  import type { ModelSuggestion, ModelTier } from '$lib/types';
  import { MODEL_CATALOG } from '$lib/types';

  let taskDescription = $state('');
  let suggestion = $state<ModelSuggestion | null>(null);
  let copySuccess = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function onInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    taskDescription = target.value;
    clearTimeout(debounceTimer);
    if (taskDescription.trim().length < 3) {
      suggestion = null;
      return;
    }
    debounceTimer = setTimeout(() => {
      suggestion = suggestModel(taskDescription);
    }, 300);
  }

  async function copyCommand() {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion.cli_command);
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch {
      // fallback
    }
  }

  function pickModel(tier: ModelTier) {
    const info = MODEL_CATALOG.find((m) => m.tier === tier);
    if (!info) return;
    taskDescription = taskDescription || info.reason;
    suggestion = suggestModel(taskDescription);
    // Override recommendation to picked tier
    suggestion = {
      ...suggestion,
      recommended: tier,
      model_id: info.model_id,
      model_info: info,
      reason: info.reason,
      alternatives: MODEL_CATALOG.filter((m) => m.tier !== tier),
      cli_command: `claude --model ${info.model_id}`,
      estimated_cost_note: `~$${info.input_price}/M input, $${info.output_price}/M output`,
    };
  }

  function setPreset(preset: 'search' | 'code' | 'architect') {
    const texts = {
      search: 'search for files matching pattern',
      code: 'write code to implement this feature',
      architect: 'architect the full system design for this application',
    };
    taskDescription = texts[preset];
    suggestion = suggestModel(taskDescription);
  }
</script>

<div class="router">
  <div class="router-header">
    <span class="router-title">MODEL ROUTER</span>
    <span class="router-sub">Keyword analysis for optimal model selection</span>
  </div>

  <textarea
    class="task-input"
    placeholder="Describe your task... (e.g., 'search for all TypeScript files' or 'architect a new auth system')"
    rows={3}
    value={taskDescription}
    oninput={onInput}
    aria-label="Task description for model routing"
  ></textarea>

  <!-- Quick presets -->
  <div class="presets">
    <span class="presets-label">Quick:</span>
    <button class="preset-btn preset-haiku" onclick={() => setPreset('search')} aria-label="Quick search preset">
      🍃 Search
    </button>
    <button class="preset-btn preset-sonnet" onclick={() => setPreset('code')} aria-label="Write code preset">
      ⚡ Code
    </button>
    <button class="preset-btn preset-opus" onclick={() => setPreset('architect')} aria-label="Architect preset">
      🏔️ Architect
    </button>
  </div>

  <!-- Model catalog: pick directly -->
  <div class="model-grid">
    {#each MODEL_CATALOG as m (m.tier)}
      <button
        class="model-tile model-{m.color}"
        class:active={suggestion?.recommended === m.tier}
        onclick={() => pickModel(m.tier)}
        aria-label="Pick {m.label}"
        title={m.reason}
      >
        <span class="tile-emoji">{m.emoji}</span>
        <span class="tile-label">{m.label}</span>
        <span class="tile-price">${m.input_price}/M in</span>
      </button>
    {/each}
  </div>

  {#if suggestion}
    <div class="suggestion" aria-live="polite">
      <!-- Recommended -->
      <div class="rec-header">
        <span class="rec-label">RECOMMENDED</span>
        <span class="model-chip model-{suggestion.model_info.color}">
          {suggestion.model_info.emoji} {suggestion.model_info.label}
        </span>
      </div>

      <p class="rec-reason">{suggestion.reason}</p>

      <!-- CLI command -->
      <div class="cli-block">
        <code class="cli-code">{suggestion.cli_command}</code>
        <button
          class="copy-btn"
          onclick={copyCommand}
          aria-label="Copy CLI command"
        >
          {copySuccess ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <!-- Cost note -->
      <p class="cost-note">{suggestion.estimated_cost_note}</p>

      <!-- Alternatives -->
      {#if suggestion.alternatives.length > 0}
        <div class="alternatives">
          <span class="alt-label">Alternatives:</span>
          {#each suggestion.alternatives as alt (alt.tier)}
            <button
              class="alt-item"
              onclick={() => pickModel(alt.tier)}
              aria-label="Use {alt.label}"
              title="{alt.reason} — ${alt.input_price}/M in, ${alt.output_price}/M out"
            >
              {alt.emoji} {alt.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if taskDescription.trim().length > 0 && taskDescription.trim().length < 3}
    <p class="hint">Type more to get a suggestion...</p>
  {:else if !taskDescription.trim()}
    <div class="empty-state">
      <p>Describe your task to get a model recommendation and launch command.</p>
      <p class="hint-sub">Pick a model tile or type to auto-route: search → Haiku, code → Sonnet 4.6, complex → Opus</p>
    </div>
  {/if}
</div>

<style>
  .router {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
    max-width: 600px;
  }

  .router-header {
    margin-bottom: var(--spacing-md);
  }

  .router-title {
    display: block;
    font-family: var(--font-comic);
    font-weight: 700;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    margin-bottom: 2px;
  }

  .router-sub {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .task-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--spacing-sm);
    background: var(--bg-elevated);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    resize: vertical;
    outline: none;
    transition: border-color 200ms ease;
  }

  .task-input:focus {
    border-color: var(--accent-green);
  }

  .presets {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin: var(--spacing-sm) 0 var(--spacing-md);
    flex-wrap: wrap;
  }

  .presets-label {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .preset-btn {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    padding: 4px var(--spacing-sm);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .preset-btn:hover { transform: translateY(-1px); }
  .preset-haiku:hover { border-color: var(--accent-green); color: var(--accent-green); }
  .preset-sonnet:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
  .preset-opus:hover { border-color: var(--accent-purple); color: var(--accent-purple); }

  .model-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-md);
  }

  .model-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--spacing-sm) var(--spacing-xs);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .model-tile:hover { transform: translateY(-1px); }
  .model-tile.model-green:hover, .model-tile.model-green.active { border-color: var(--accent-green); }
  .model-tile.model-blue:hover, .model-tile.model-blue.active { border-color: var(--accent-blue); }
  .model-tile.model-purple:hover, .model-tile.model-purple.active { border-color: var(--accent-purple); }
  .model-tile.model-orange:hover, .model-tile.model-orange.active { border-color: var(--accent-yellow, #FFE66D); }

  .model-tile.active {
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .tile-emoji { font-size: 1rem; }

  .tile-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    color: var(--text-primary);
    text-align: center;
  }

  .tile-price {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    color: var(--text-muted);
  }

  .suggestion {
    border-top: 2px solid var(--border-color);
    padding-top: var(--spacing-md);
  }

  .rec-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .rec-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .model-chip {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    font-weight: 700;
    padding: 4px var(--spacing-md);
    border-radius: var(--radius-sm);
    border: 2px solid;
  }

  .model-green { background: rgba(0, 210, 106, 0.15); color: var(--accent-green); border-color: var(--accent-green); }
  .model-blue { background: rgba(78, 205, 196, 0.15); color: var(--accent-blue); border-color: var(--accent-blue); }
  .model-purple { background: rgba(162, 155, 254, 0.15); color: var(--accent-purple); border-color: var(--accent-purple); }
  .model-orange { background: rgba(255, 230, 109, 0.15); color: var(--accent-yellow, #FFE66D); border-color: var(--accent-yellow, #FFE66D); }

  .rec-reason {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-sm);
  }

  .cli-block {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }

  .cli-code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--accent-green);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    padding: 2px var(--spacing-sm);
    background: var(--accent-green);
    color: #1a1a1a;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: transform 150ms ease;
    flex-shrink: 0;
  }

  .copy-btn:hover { transform: scale(1.05); }

  .cost-note {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin: 0 0 var(--spacing-sm);
  }

  .alternatives {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .alt-label {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .alt-item {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    padding: 2px var(--spacing-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .alt-item:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin: var(--spacing-sm) 0 0;
  }

  .empty-state {
    padding: var(--spacing-md) 0 0;
  }

  .empty-state p {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
  }

  .hint-sub {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  @media (max-width: 480px) {
    .model-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
