<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    connectToSession,
    checkCompanionHealth,
    listSessions,
    createSession,
    killSession,
    cleanupSessions,
    deleteSession,
    listProjects,
    type CompanionConnection,
    type CompanionSessionState,
    type CompanionSessionListItem,
    type CompanionProjectProfile,
    type BridgeMessage,
    type PermissionRequest,
    type ContentBlock,
  } from '$lib/api/companion';
  import VibeMessage from './VibeMessage.svelte';
  import VibePermission from './VibePermission.svelte';
  import VibeComposer from './VibeComposer.svelte';

  // ─── State ────────────────────────────────────────────────────────────────
  let isHealthy = $state(false);
  let sessions = $state<CompanionSessionListItem[]>([]);
  let projects = $state<CompanionProjectProfile[]>([]);
  let activeSessionId = $state<string | null>(null);
  let sessionState = $state<CompanionSessionState | null>(null);
  let connection = $state<CompanionConnection | null>(null);
  let isCreating = $state(false);
  let errorMsg = $state('');
  let reconnectAttempt = $state(0);
  let healthPollTimer: ReturnType<typeof setInterval> | undefined;

  // Chat state
  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
    model?: string;
    timestamp: number;
    toolName?: string;
  }

  let messages = $state<ChatMessage[]>([]);
  let permissions = $state<PermissionRequest[]>([]);
  let streamingText = $state('');
  let msgCounter = 0; // unique counter to avoid duplicate keys
  const seenIds = new Set<string>(); // dedup message IDs

  // Create session form
  let selectedProject = $state('');
  let selectedModel = $state('sonnet');

  // Auto-approve config
  interface AutoApproveConfig {
    enabled: boolean;
    timeoutSeconds: number;
    allowBash: boolean;
  }
  let autoApproveConfig = $state<AutoApproveConfig>({ enabled: false, timeoutSeconds: 0, allowBash: false });

  // Auto-scroll
  let feedEl: HTMLDivElement | undefined = $state();

  // Session list filter
  let showEnded = $state(false);
  let isCleaningUp = $state(false);

  // Derived
  const isBusy = $derived(sessionState?.status === 'busy' || sessionState?.status === 'starting');
  const isConnected = $derived(sessionState !== null && sessionState.status !== 'ended' && sessionState.status !== 'error');
  const costFormatted = $derived(sessionState ? `$${sessionState.total_cost_usd.toFixed(4)}` : '$0');

  // Group sessions by project
  interface SessionGroup {
    slug: string;
    name: string;
    sessions: CompanionSessionListItem[];
  }

  const groupedSessions = $derived.by(() => {
    const filtered = showEnded ? sessions : sessions.filter((s) => s.status !== 'ended');
    const groups = new Map<string, CompanionSessionListItem[]>();

    for (const s of filtered) {
      const key = s.projectSlug ?? '_unknown';
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }

    const result: SessionGroup[] = [];
    for (const [slug, items] of groups) {
      const profile = projects.find((p) => p.slug === slug);
      result.push({
        slug,
        name: profile?.name ?? slug.replace(/^_/, ''),
        sessions: items,
      });
    }

    // Sort groups alphabetically, _unknown last
    result.sort((a, b) =>
      a.slug === '_unknown' ? 1 : b.slug === '_unknown' ? -1 : a.name.localeCompare(b.name)
    );

    return result;
  });

  const activeCount = $derived(sessions.filter((s) => s.status !== 'ended').length);
  const endedCount = $derived(sessions.filter((s) => s.status === 'ended').length);

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  onMount(async () => {
    isHealthy = await checkCompanionHealth();
    if (isHealthy) {
      await refreshSessions();
      await refreshProjects();
    } else {
      // Auto-poll health when offline
      startHealthPoll();
    }
  });

  onDestroy(() => {
    connection?.disconnect();
    if (healthPollTimer) clearInterval(healthPollTimer);
  });

  function startHealthPoll() {
    if (healthPollTimer) return;
    healthPollTimer = setInterval(async () => {
      const healthy = await checkCompanionHealth();
      if (healthy) {
        isHealthy = true;
        if (healthPollTimer) {
          clearInterval(healthPollTimer);
          healthPollTimer = undefined;
        }
        await refreshSessions();
        await refreshProjects();
      }
    }, 15_000);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function refreshSessions() {
    try {
      sessions = await listSessions();
    } catch {
      // companion not running
    }
  }

  async function refreshProjects() {
    try {
      projects = await listProjects();
      const first = projects[0];
      if (first && !selectedProject) {
        selectedProject = first.slug;
      }
    } catch {
      // companion not running
    }
  }

  async function handleCreate() {
    const profile = projects.find((p) => p.slug === selectedProject);
    if (!profile) return;

    isCreating = true;
    errorMsg = '';
    messages = [];
    seenIds.clear();
    msgCounter = 0;

    try {
      const result = await createSession({
        projectDir: profile.dir,
        model: selectedModel,
        permissionMode: profile.permissionMode,
      });

      activeSessionId = result.session_id;
      connectWS(result.session_id);
      await refreshSessions();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to create session';
    } finally {
      isCreating = false;
    }
  }

  async function handleKill() {
    if (!activeSessionId) return;
    try {
      await killSession(activeSessionId);
      connection?.disconnect();
      connection = null;
      sessionState = null;
      activeSessionId = null;
      await refreshSessions();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to kill session';
    }
  }

  async function handleKillFromList(e: Event, id: string) {
    e.stopPropagation();
    try {
      await killSession(id);
      await refreshSessions();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to kill session';
    }
  }

  async function handleDeleteFromList(e: Event, id: string) {
    e.stopPropagation();
    try {
      await deleteSession(id);
      await refreshSessions();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to delete session';
    }
  }

  async function handleCleanup() {
    isCleaningUp = true;
    try {
      const result = await cleanupSessions();
      if (result.cleaned > 0) {
        await refreshSessions();
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Cleanup failed';
    } finally {
      isCleaningUp = false;
    }
  }

  function handleSelectSession(id: string) {
    // Disconnect current
    connection?.disconnect();
    connection = null;
    messages = [];
    permissions = [];
    streamingText = '';
    sessionState = null;
    seenIds.clear();
    msgCounter = 0;

    activeSessionId = id;
    connectWS(id);
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  function connectWS(sessionId: string) {
    reconnectAttempt = 0;
    connection = connectToSession(
      sessionId,
      handleBridgeMessage,
      () => {
        // on permanent close (after all retries exhausted)
        reconnectAttempt = 0;
        if (sessionState) {
          sessionState = { ...sessionState, status: 'ended' };
        }
      },
      () => {
        errorMsg = 'WebSocket connection failed';
      },
      (attempt: number) => {
        reconnectAttempt = attempt;
      },
    );
  }

  function handleBridgeMessage(msg: BridgeMessage) {
    switch (msg.type) {
      case 'session_init':
        sessionState = msg.session;
        break;

      case 'session_update':
        if (sessionState) {
          sessionState = { ...sessionState, ...msg.session };
        }
        break;

      case 'assistant': {
        const aId = msg.message.id ?? `assistant-${++msgCounter}`;
        // Deduplicate: skip if already seen
        if (seenIds.has(aId)) break;

        // Skip thinking-only messages (no visible text or tool_use content)
        const blocks = msg.message.content;
        if (Array.isArray(blocks)) {
          const hasVisible = blocks.some(
            (b: ContentBlock) =>
              (b.type === 'text' && b.text?.trim()) || b.type === 'tool_use'
          );
          if (!hasVisible) break;
        }

        seenIds.add(aId);
        messages = [
          ...messages,
          {
            id: aId,
            role: 'assistant',
            content: msg.message.content,
            model: msg.message.model,
            timestamp: msg.timestamp,
          },
        ];
        streamingText = '';
        scrollToBottom();
        break;
      }

      case 'stream_event': {
        // Extract streaming text from content_block_delta events
        const event = msg.event as Record<string, unknown>;
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === 'text_delta' && delta.text) {
            streamingText += delta.text;
            scrollToBottom();
          }
        }
        break;
      }

      case 'result':
        if (sessionState) {
          sessionState = {
            ...sessionState,
            total_cost_usd: msg.data.total_cost_usd,
            num_turns: msg.data.num_turns,
            status: 'idle',
          };
        }
        break;

      case 'permission_request':
        permissions = [...permissions, msg.request];
        scrollToBottom();
        break;

      case 'permission_cancelled':
        permissions = permissions.filter((p) => p.request_id !== msg.request_id);
        break;

      case 'tool_progress':
        // Could show a progress indicator - skip for v1
        break;

      case 'status_change':
        if (sessionState) {
          const statusMap: Record<string, CompanionSessionState['status']> = {
            running: 'busy',
            idle: 'idle',
            compacting: 'compacting',
          };
          sessionState = {
            ...sessionState,
            status: statusMap[msg.status] ?? sessionState.status,
          };
        }
        break;

      case 'error':
        errorMsg = msg.message;
        break;

      case 'cli_connected':
        if (sessionState) {
          sessionState = { ...sessionState, status: 'idle' };
        }
        break;

      case 'cli_disconnected':
        if (sessionState) {
          sessionState = { ...sessionState, status: 'ended' };
        }
        break;

      case 'user_message': {
        // Skip if we recently sent a message with the same content (bridge echo).
        // Only add user_message from bridge during history replay.
        const isDuplicate = messages.some(
          (m) => m.role === 'user' && m.content === msg.content
            && Math.abs(m.timestamp - msg.timestamp) < 5000
        );
        if (!isDuplicate) {
          const uId = `user-${msg.timestamp}-${++msgCounter}`;
          seenIds.add(uId);
          messages = [
            ...messages,
            {
              id: uId,
              role: 'user',
              content: msg.content,
              timestamp: msg.timestamp,
            },
          ];
          scrollToBottom();
        }
        break;
      }

      case 'message_history':
        // Replay history
        for (const m of msg.messages) {
          handleBridgeMessage(m);
        }
        break;
    }
  }

  function handleSend(content: string) {
    if (!connection) return;
    connection.send(content);
    const id = `user-${Date.now()}`;
    seenIds.add(id);
    messages = [
      ...messages,
      {
        id,
        role: 'user',
        content,
        timestamp: Date.now(),
      },
    ];
    scrollToBottom();
  }

  function getAutoApproveTimeout(toolName: string): number {
    if (!autoApproveConfig.enabled || autoApproveConfig.timeoutSeconds <= 0) return 0;
    if (toolName === 'Bash' && !autoApproveConfig.allowBash) return 0;
    return autoApproveConfig.timeoutSeconds;
  }

  function handleAutoApproveChange(enabled: boolean, seconds: number, bash: boolean) {
    autoApproveConfig = { enabled, timeoutSeconds: seconds, allowBash: bash };
    connection?.setAutoApprove(autoApproveConfig);
  }

  function handleApprove(requestId: string) {
    connection?.approve(requestId);
    permissions = permissions.filter((p) => p.request_id !== requestId);
  }

  function handleDeny(requestId: string) {
    connection?.deny(requestId);
    permissions = permissions.filter((p) => p.request_id !== requestId);
  }

  function handleInterrupt() {
    connection?.interrupt();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (feedEl) {
        feedEl.scrollTop = feedEl.scrollHeight;
      }
    });
  }
</script>

<div class="terminal">
  {#if !isHealthy}
    <!-- Companion not running -->
    <div class="offline-state">
      <div class="offline-icon">X</div>
      <p class="offline-title">Companion Service Offline</p>
      <p class="offline-sub">
        Start the companion service to use the terminal:
      </p>
      <code class="offline-cmd">cd companion && bun run dev</code>
      <p class="offline-sub" style="font-size: 11px; margin-top: 4px;">
        Auto-checking every 15s...
      </p>
      <button
        class="btn-retry"
        onclick={async () => {
          isHealthy = await checkCompanionHealth();
          if (isHealthy) {
            if (healthPollTimer) { clearInterval(healthPollTimer); healthPollTimer = undefined; }
            await refreshSessions();
            await refreshProjects();
          }
        }}
        aria-label="Retry connection"
      >
        Retry
      </button>
    </div>

  {:else if !activeSessionId}
    <!-- Session selector / creator -->
    <div class="session-panel">
      <div class="create-section">
        <h3 class="section-title">NEW SESSION</h3>

        <div class="create-form">
          <div class="form-row">
            <label class="form-label" for="project-select">Project</label>
            <select id="project-select" class="form-select" bind:value={selectedProject}>
              {#each projects as p (p.slug)}
                <option value={p.slug}>{p.name}</option>
              {/each}
            </select>
          </div>

          <div class="form-row">
            <label class="form-label" for="model-select">Model</label>
            <select id="model-select" class="form-select" bind:value={selectedModel}>
              <option value="haiku">Haiku 4.5</option>
              <option value="sonnet">Sonnet 4.6</option>
              <option value="opus">Opus 4.6</option>
              <option value="opus-1m">Opus 4.6 (1M)</option>
              <option value="sonnet-1m">Sonnet 4.6 (1M)</option>
            </select>
          </div>

          <button
            class="btn-launch"
            onclick={handleCreate}
            disabled={isCreating || !selectedProject}
            aria-label="Launch Claude Code session"
          >
            {isCreating ? 'Launching...' : 'Launch'}
          </button>
        </div>

        {#if errorMsg}
          <p class="error-text" role="alert">{errorMsg}</p>
        {/if}
      </div>

      {#if sessions.length > 0}
        <div class="history-section">
          <div class="session-header">
            <h3 class="section-title">SESSIONS ({activeCount} active)</h3>
            <div class="session-actions">
              <button
                class="btn-cleanup"
                onclick={handleCleanup}
                disabled={isCleaningUp}
                aria-label="Clean up dead sessions"
                title="Force-end stuck sessions"
              >
                {isCleaningUp ? '...' : 'Cleanup'}
              </button>
              <button
                class="btn-toggle-ended"
                class:active={showEnded}
                onclick={() => showEnded = !showEnded}
                aria-label="Toggle ended sessions"
                title="{showEnded ? 'Hide' : 'Show'} ended ({endedCount})"
              >
                {showEnded ? 'Hide ended' : `+${endedCount} ended`}
              </button>
            </div>
          </div>

          {#each groupedSessions as group (group.slug)}
            <div class="session-group">
              <div class="group-label">{group.name}</div>
              <div class="session-list">
                {#each group.sessions as s (s.id)}
                  <button
                    class="session-item"
                    class:active={s.status !== 'ended'}
                    onclick={() => handleSelectSession(s.id)}
                    aria-label="Connect to session {s.id.slice(0, 8)}"
                  >
                    <div class="session-info">
                      <span class="session-model">{s.model}</span>
                      <span class="session-status status-{s.status}">{s.status}</span>
                      <span class="session-actions-inline">
                        {#if s.status !== 'ended'}
                          <span
                            class="btn-kill-inline"
                            role="button"
                            tabindex="0"
                            onclick={(e) => handleKillFromList(e, s.id)}
                            onkeydown={(e) => e.key === 'Enter' && handleKillFromList(e, s.id)}
                            aria-label="Kill session"
                            title="Kill this session"
                          >Kill</span>
                        {:else}
                          <span
                            class="btn-delete-inline"
                            role="button"
                            tabindex="0"
                            onclick={(e) => handleDeleteFromList(e, s.id)}
                            onkeydown={(e) => e.key === 'Enter' && handleDeleteFromList(e, s.id)}
                            aria-label="Delete session"
                            title="Remove from history"
                          >Del</span>
                        {/if}
                      </span>
                    </div>
                    <div class="session-meta">
                      <span>{s.cwd.split(/[\\/]/).pop()}</span>
                      <span class="session-cost">${s.total_cost_usd.toFixed(4)}</span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else}
    <!-- Active terminal -->
    <div class="active-terminal">
      <!-- Status bar -->
      <div class="status-bar">
        <div class="status-left">
          <span class="status-dot" class:live={isConnected}></span>
          <span class="status-model">{sessionState?.model ?? '...'}</span>
          <span class="status-sep">|</span>
          <span class="status-turns">{sessionState?.num_turns ?? 0} turns</span>
          <span class="status-sep">|</span>
          <span class="status-cost">{costFormatted}</span>
        </div>
        <div class="status-right">
          {#if reconnectAttempt > 0}
            <span class="status-reconnecting">reconnecting ({reconnectAttempt})...</span>
          {:else if isBusy}
            <span class="status-busy">working...</span>
          {/if}
          <select
            class="auto-approve-select"
            value={autoApproveConfig.enabled ? String(autoApproveConfig.timeoutSeconds) : '0'}
            onchange={(e) => {
              const target = e.target as HTMLSelectElement;
              const seconds = parseInt(target.value, 10);
              handleAutoApproveChange(seconds > 0, seconds, autoApproveConfig.allowBash);
            }}
            aria-label="Auto-approve timeout"
            title="Auto-approve permissions"
          >
            <option value="0">Auto: Off</option>
            <option value="15">Auto: 15s</option>
            <option value="30">Auto: 30s</option>
            <option value="60">Auto: 60s</option>
          </select>
          <button
            class="btn-disconnect"
            onclick={handleKill}
            aria-label="Kill session"
          >
            Kill
          </button>
          <button
            class="btn-back"
            onclick={() => {
              connection?.disconnect();
              connection = null;
              sessionState = null;
              activeSessionId = null;
              messages = [];
              permissions = [];
            }}
            aria-label="Back to session list"
          >
            Back
          </button>
        </div>
      </div>

      <!-- Message feed -->
      <div class="msg-feed" bind:this={feedEl}>
        {#each messages as msg (msg.id)}
          <VibeMessage
            role={msg.role}
            content={msg.content}
            model={msg.model}
            timestamp={msg.timestamp}
            toolName={msg.toolName}
          />
        {/each}

        {#if streamingText}
          <div class="streaming-block">
            <span class="streaming-label">Claude</span>
            <div class="streaming-text">{streamingText}<span class="cursor">|</span></div>
          </div>
        {/if}

        {#each permissions as perm (perm.request_id)}
          <VibePermission
            request={perm}
            autoApproveTimeout={getAutoApproveTimeout(perm.tool_name)}
            onapprove={handleApprove}
            ondeny={handleDeny}
          />
        {/each}
      </div>

      <!-- Composer -->
      <VibeComposer
        disabled={!isConnected}
        placeholder={isConnected ? 'Send a message to Claude...' : 'Session ended'}
        onsend={handleSend}
        oninterrupt={handleInterrupt}
        {isBusy}
      />
    </div>
  {/if}
</div>

<style>
  .terminal {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Offline state ─────────────────────────────────────────────────────── */
  .offline-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: var(--spacing-2xl);
    gap: var(--spacing-sm);
  }

  .offline-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-comic);
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--accent-red);
    border: 3px solid var(--accent-red);
    border-radius: 50%;
  }

  .offline-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .offline-sub {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .offline-cmd {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--accent-green);
  }

  .btn-retry {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    padding: var(--spacing-xs) var(--spacing-lg);
    background: var(--bg-elevated);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-retry:hover {
    border-color: var(--accent-green);
    color: var(--accent-green);
  }

  /* ── Session panel ─────────────────────────────────────────────────────── */
  .session-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
    overflow-y: auto;
    flex: 1;
  }

  .section-title {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin: 0 0 var(--spacing-sm);
  }

  .create-section {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
  }

  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--text-secondary);
  }

  .form-select {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--bg-elevated);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    outline: none;
    cursor: pointer;
  }

  .form-select:focus {
    border-color: var(--accent-green);
  }

  .btn-launch {
    font-family: var(--font-comic);
    font-size: var(--font-size-base);
    font-weight: 700;
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--accent-green);
    color: #1a1a1a;
    border: 2px solid var(--accent-green);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: var(--spacing-xs);
  }

  .btn-launch:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 3px 3px 0 var(--border-color);
  }

  .btn-launch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-text {
    font-size: var(--font-size-sm);
    color: var(--accent-red);
    margin: var(--spacing-sm) 0 0;
  }

  /* Session list */
  .history-section {
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sketch);
    padding: var(--spacing-md);
  }

  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }

  .session-header .section-title {
    margin: 0;
  }

  .session-actions {
    display: flex;
    gap: 4px;
  }

  .btn-cleanup,
  .btn-toggle-ended {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 1px 6px;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-cleanup:hover:not(:disabled) {
    border-color: var(--accent-yellow);
    color: var(--accent-yellow);
  }

  .btn-cleanup:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-toggle-ended:hover,
  .btn-toggle-ended.active {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  .session-group {
    margin-bottom: var(--spacing-sm);
  }

  .group-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    color: var(--accent-blue);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    padding-left: 2px;
  }

  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .session-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--spacing-sm);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    text-align: left;
    width: 100%;
  }

  .session-item:hover {
    border-color: var(--accent-blue);
    transform: translateY(-1px);
  }

  .session-item.active {
    border-color: var(--accent-green);
  }

  .session-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .session-model {
    font-family: var(--font-comic);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-primary);
  }

  .session-status {
    font-family: var(--font-mono);
    font-size: var(--font-size-2xs);
    padding: 1px 6px;
    border-radius: 3px;
  }

  .status-idle { background: rgba(0, 210, 106, 0.15); color: var(--accent-green); }
  .status-busy { background: rgba(78, 205, 196, 0.15); color: var(--accent-blue); }
  .status-starting { background: rgba(255, 230, 109, 0.15); color: var(--accent-yellow); }
  .status-compacting { background: rgba(255, 230, 109, 0.15); color: var(--accent-yellow); }
  .status-ended { background: var(--bg-card); color: var(--text-muted); }
  .status-error { background: rgba(255, 71, 87, 0.15); color: var(--accent-red); }

  .session-meta {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .session-cost {
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .session-actions-inline {
    margin-left: auto;
  }

  .btn-kill-inline,
  .btn-delete-inline {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 0 5px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-kill-inline {
    color: var(--accent-red);
    border: 1px solid transparent;
  }

  .btn-kill-inline:hover {
    background: var(--accent-red);
    color: #fff;
    border-color: var(--accent-red);
  }

  .btn-delete-inline {
    color: var(--text-muted);
    border: 1px solid transparent;
  }

  .btn-delete-inline:hover {
    border-color: var(--text-muted);
  }

  /* ── Active terminal ───────────────────────────────────────────────────── */
  .active-terminal {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .status-dot.live {
    background: var(--accent-green);
    animation: dotPulse 2s ease-in-out infinite;
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-model {
    font-family: var(--font-comic);
    font-weight: 700;
    color: var(--text-primary);
  }

  .status-sep {
    color: var(--border-color);
  }

  .status-cost {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--accent-green);
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .status-busy {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--accent-blue);
    animation: busyPulse 1.5s ease-in-out infinite;
  }

  @keyframes busyPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .status-reconnecting {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    color: var(--accent-yellow);
    animation: busyPulse 1s ease-in-out infinite;
  }

  .auto-approve-select {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 2px var(--spacing-xs);
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    outline: none;
  }

  .auto-approve-select:focus {
    border-color: var(--accent-green);
  }

  .btn-disconnect,
  .btn-back {
    font-family: var(--font-comic);
    font-size: var(--font-size-2xs);
    font-weight: 700;
    padding: 2px var(--spacing-sm);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .btn-disconnect {
    color: var(--accent-red);
    border-color: var(--accent-red);
  }

  .btn-disconnect:hover {
    background: var(--accent-red);
    color: #fff;
  }

  .btn-back {
    color: var(--text-muted);
  }

  .btn-back:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
  }

  /* Message feed */
  .msg-feed {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
  }

  /* Streaming */
  .streaming-block {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-xs);
    margin-right: var(--spacing-md);
  }

  .streaming-label {
    font-family: var(--font-comic);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted);
    display: block;
    margin-bottom: 4px;
  }

  .streaming-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cursor {
    animation: blink 1s step-end infinite;
    color: var(--accent-green);
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
