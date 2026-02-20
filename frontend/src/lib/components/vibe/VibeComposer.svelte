<script lang="ts">
  interface Props {
    disabled?: boolean;
    placeholder?: string;
    onsend: (content: string) => void;
    oninterrupt?: () => void;
    isBusy?: boolean;
  }

  let { disabled = false, placeholder, onsend, oninterrupt, isBusy = false }: Props = $props();

  let inputValue = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let translatedText = $state('');
  let isTranslating = $state(false);
  let translateEnabled = $state(true);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Vietnamese diacritical marks detection
  const VI_DIACRITICS =
    /[\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01A0-\u01B0\u1EA0-\u1EF9]/;

  function isVietnamese(text: string): boolean {
    return VI_DIACRITICS.test(text);
  }

  async function translateText(text: string) {
    if (!text.trim() || !isVietnamese(text)) {
      translatedText = '';
      return;
    }

    isTranslating = true;
    try {
      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.set('client', 'gtx');
      url.searchParams.set('sl', 'vi');
      url.searchParams.set('tl', 'en');
      url.searchParams.set('dt', 't');
      url.searchParams.set('q', text);

      const res = await fetch(url, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!res.ok) {
        translatedText = '';
        return;
      }

      const result = await res.json();
      translatedText = result[0]?.map((seg: [string]) => seg[0]).join('') ?? '';
    } catch {
      translatedText = '';
    } finally {
      isTranslating = false;
    }
  }

  function handleInput(e: Event) {
    autoResize(e);

    // Debounce translation
    clearTimeout(debounceTimer);
    if (translateEnabled && inputValue.trim()) {
      debounceTimer = setTimeout(() => translateText(inputValue.trim()), 400);
    } else {
      translatedText = '';
    }
  }

  function handleSubmit() {
    const trimmed = inputValue.trim();
    if (!trimmed || disabled) return;

    // Send translated version if available and toggle is on
    const toSend = translateEnabled && translatedText ? translatedText : trimmed;
    onsend(toSend);

    inputValue = '';
    translatedText = '';
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  function sendOriginal() {
    const trimmed = inputValue.trim();
    if (!trimmed || disabled) return;
    onsend(trimmed);
    inputValue = '';
    translatedText = '';
    if (textareaEl) textareaEl.style.height = 'auto';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
</script>

<div class="composer">
  {#if translatedText}
    <div class="translate-bar">
      <span class="translate-label">EN</span>
      <span class="translate-text">{translatedText}</span>
      <button
        class="btn-send-original"
        onclick={sendOriginal}
        aria-label="Send original Vietnamese"
      >
        Send VI
      </button>
    </div>
  {/if}

  <div class="composer-row">
    <div class="input-wrap">
      <textarea
        bind:this={textareaEl}
        class="composer-input"
        rows={1}
        {placeholder}
        {disabled}
        bind:value={inputValue}
        onkeydown={handleKeydown}
        oninput={handleInput}
        aria-label="Message input"
      ></textarea>
      {#if isTranslating}
        <span class="translating-dot"></span>
      {/if}
    </div>

    <div class="composer-actions">
      <button
        class="btn-translate-toggle"
        class:active={translateEnabled}
        onclick={() => { translateEnabled = !translateEnabled; if (!translateEnabled) translatedText = ''; }}
        aria-label="Toggle auto-translate"
        title={translateEnabled ? 'Auto-translate ON' : 'Auto-translate OFF'}
      >
        Vi→En
      </button>

      {#if isBusy && oninterrupt}
        <button
          class="btn-interrupt"
          onclick={oninterrupt}
          aria-label="Interrupt Claude"
        >
          Stop
        </button>
      {/if}

      <button
        class="btn-send"
        onclick={handleSubmit}
        disabled={disabled || !inputValue.trim()}
        aria-label={translatedText ? 'Send English translation' : 'Send message'}
      >
        {translatedText ? 'Send EN' : 'Send'}
      </button>
    </div>
  </div>
</div>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    border-top: 2px solid var(--border-color);
    background: var(--bg-card);
  }

  /* ── Translation preview bar ─────────────────────────────────────────── */
  .translate-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background: rgba(34, 197, 94, 0.06);
    border-bottom: 1px solid rgba(34, 197, 94, 0.15);
    min-height: 32px;
  }

  .translate-label {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-green);
    background: rgba(34, 197, 94, 0.15);
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .translate-text {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--accent-green);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-send-original {
    font-family: var(--font-comic);
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 150ms;
  }

  .btn-send-original:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  /* ── Main composer row ───────────────────────────────────────────────── */
  .composer-row {
    display: flex;
    align-items: flex-end;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .input-wrap {
    flex: 1;
    position: relative;
  }

  .composer-input {
    width: 100%;
    padding: var(--spacing-sm);
    background: var(--bg-elevated);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    resize: none;
    outline: none;
    min-height: 36px;
    max-height: 150px;
    transition: border-color 150ms ease;
  }

  .composer-input:focus {
    border-color: var(--accent-green);
  }

  .composer-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .translating-dot {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-yellow);
    animation: dotPulse 1s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .composer-actions {
    display: flex;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  /* ── Translate toggle ────────────────────────────────────────────────── */
  .btn-translate-toggle {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-sm);
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms;
    white-space: nowrap;
  }

  .btn-translate-toggle.active {
    color: var(--accent-green);
    border-color: var(--accent-green);
    background: rgba(34, 197, 94, 0.1);
  }

  .btn-translate-toggle:hover {
    border-color: var(--accent-green);
  }

  /* ── Send / Interrupt buttons ────────────────────────────────────────── */
  .btn-send {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--accent-green);
    color: #1a1a1a;
    border: 2px solid var(--accent-green);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .btn-send:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 2px 2px 0 var(--border-color);
  }

  .btn-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-interrupt {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-md);
    background: rgba(255, 71, 87, 0.15);
    color: var(--accent-red);
    border: 2px solid var(--accent-red);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
    animation: interruptPulse 1.5s ease-in-out infinite;
  }

  @keyframes interruptPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .btn-interrupt:hover {
    background: var(--accent-red);
    color: #fff;
    transform: translateY(-1px);
  }
</style>
