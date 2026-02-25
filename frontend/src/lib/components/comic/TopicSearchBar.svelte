<script lang="ts">
  import type { Topic } from '$lib/types';
  import { searchTopics } from '$lib/api/topics';

  const TOPIC_COLORS = ['#00D26A', '#4ECDC4', '#FF9F43', '#A29BFE', '#FF4757'];

  interface Props {
    selectedTopics?: Topic[];
    maxTopics?: number;
    onselect?: (topic: Topic) => void;
    onremove?: (topic: Topic) => void;
  }

  const { selectedTopics = [], maxTopics = 5, onselect, onremove }: Props = $props();

  let query = $state('');
  let results = $state<Topic[]>([]);
  let isOpen = $state(false);
  let isSearching = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const isFull = $derived(selectedTopics.length >= maxTopics);

  function handleInput(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (query.trim().length < 2) {
      results = [];
      isOpen = false;
      return;
    }
    debounceTimer = setTimeout(async () => {
      isSearching = true;
      try {
        const items = await searchTopics(query.trim());
        results = items.filter((t) => !selectedTopics.some((s) => s.id === t.id));
        isOpen = results.length > 0;
      } catch {
        results = [];
      } finally {
        isSearching = false;
      }
    }, 300);
  }

  function selectTopic(topic: Topic): void {
    query = '';
    results = [];
    isOpen = false;
    if (onselect) onselect(topic);
  }

  function removeTopic(topic: Topic): void {
    if (onremove) onremove(topic);
  }

  function getTopicColor(index: number): string {
    return TOPIC_COLORS[index % TOPIC_COLORS.length] ?? '#A29BFE';
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      isOpen = false;
      query = '';
    }
  }

  function handleBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      isOpen = false;
    }, 200);
  }
</script>

<div class="search-bar" data-testid="topic-search-bar">
  <div class="search-row">
    <div class="input-wrapper">
      <span class="search-icon" aria-hidden="true">&#128269;</span>
      <input
        type="search"
        class="search-input"
        placeholder={isFull ? 'Max topics reached' : 'Add topic to compare...'}
        bind:value={query}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        disabled={isFull}
        aria-label="Search topics"
      />
      {#if isSearching}
        <span class="loading-dot" aria-hidden="true"></span>
      {/if}
    </div>

    {#if selectedTopics.length > 0}
      <div class="chips">
        {#each selectedTopics as topic, i}
          <button
            class="chip"
            style="--chip-color: {getTopicColor(i)}"
            onclick={() => removeTopic(topic)}
            aria-label="Remove {topic.name}"
          >
            <span class="chip-dot"></span>
            {topic.name}
            <span class="chip-x" aria-hidden="true">x</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if isOpen && results.length > 0}
    <ul class="dropdown" role="listbox">
      {#each results as topic}
        <li role="option" aria-selected="false">
          <button class="dropdown-item" onclick={() => selectTopic(topic)}>
            <span class="topic-name">{topic.name}</span>
            <span class="topic-meta">
              <span class="topic-category">{topic.category}</span>
              <span class="topic-count">{topic.mention_count}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search-bar {
    position: relative;
    width: 100%;
  }

  .search-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .input-wrapper {
    position: relative;
    flex: 1;
    min-width: 200px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 14px;
    pointer-events: none;
    opacity: 0.5;
  }

  .search-input {
    font-family: 'Comic Mono', monospace;
    font-size: 0.875rem;
    padding: 8px 12px 8px 34px;
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    color: var(--text-primary);
    width: 100%;
    transition: box-shadow 150ms ease;
  }

  .search-input:focus {
    outline: none;
    box-shadow: var(--shadow-md);
    border-color: var(--accent-green);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-dot {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-green);
    animation: pulse 1s ease infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 2px solid var(--chip-color);
    border-radius: 20px;
    background: transparent;
    color: var(--chip-color);
    font-family: 'Comic Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .chip:hover {
    background: var(--chip-color);
    color: var(--bg-base);
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chip-color);
    flex-shrink: 0;
  }

  .chip:hover .chip-dot {
    background: var(--bg-base);
  }

  .chip-x {
    font-weight: 700;
    opacity: 0.7;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: 0 0 8px 8px;
    box-shadow: var(--shadow-lg);
    z-index: 100;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family: 'Comic Mono', monospace;
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }

  .dropdown-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .topic-name {
    font-weight: 700;
  }

  .topic-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .topic-category {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .topic-count {
    font-size: 0.7rem;
    color: var(--text-muted);
  }
</style>
