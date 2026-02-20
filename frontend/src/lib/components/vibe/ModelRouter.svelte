<script lang="ts">
  import { suggestModel } from '$lib/api/tasks';
  import type { ModelSuggestion } from '$lib/types';

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

  function setPreset(preset: 'haiku' | 'sonnet' | 'opus') {
    const texts = {
      haiku: 'search for files matching pattern',
      sonnet: 'write code to implement this feature',
      opus: 'architect the full system design for this application',
    };
    taskDescription = texts[preset];
    suggestion = suggestModel(taskDescription);
  }

  const modelColors: Record<string, string> = {
    haiku: 'green',
    sonnet: 'blue',
    opus: 'purple',
  };

  const modelEmojis: Record<string, string> = {
    haiku: '🍃',
    sonnet: '⚡',
    opus: '🏔️',
  };
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
    <button class="preset-btn preset-haiku" onclick={() => setPreset('haiku')} aria-label="Quick search preset">
      🍃 Search
    </button>
    <button class="preset-btn preset-sonnet" onclick={() => setPreset('sonnet')} aria-label="Write code preset">
      ⚡ Code
    </button>
    <button class="preset-btn preset-opus" onclick={() => setPreset('opus')} aria-label="Architect preset">
      🏔️ Architect
    </button>
  </div>

  {#if suggestion}
    <div class="suggestion" aria-live="polite">
      <!-- Recommended -->
      <div class="rec-header">
        <span class="rec-label">RECOMMENDED</span>
        <span class="model-chip model-{modelColors[suggestion.recommended]}">
          {modelEmojis[suggestion.recommended]} {suggestion.recommended.toUpperCase()}
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
          {#each suggestion.alternatives as alt (alt.model)}
            <button
              class="alt-item"
              onclick={() => { taskDescription = alt.model_id; suggestion = suggestModel(alt.model); }}
              aria-label="Use {alt.model} model"
              title={alt.reason}
            >
              {modelEmojis[alt.model]} {alt.model}
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
      <p class="hint-sub">Uses keyword analysis: simple tasks → Haiku, code → Sonnet, architecture → Opus</p>
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
</style>
