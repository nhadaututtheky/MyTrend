import pb from '$lib/config/pocketbase';
import type {
  ClaudeTask,
  ClaudeTaskStatus,
  VibeSession,
  ModelSuggestion,
  ModelTier,
  VibeSyncStatus,
  PBListResult,
} from '$lib/types';
import { MODEL_CONTEXT_WINDOWS, MODEL_PRICING, MODEL_CATALOG } from '$lib/types';

function getPbUrl(): string {
  return typeof window !== 'undefined'
    ? pb.baseUrl
    : import.meta.env.VITE_PB_URL || 'http://pocketbase:8090';
}

// ---------------------------------------------------------------------------
// Keyword routing for model suggestions
// ---------------------------------------------------------------------------

// Model tier routing: task keywords → recommended tier
const TIER_KEYWORDS: Record<ModelTier, string[]> = {
  'haiku-4.5': [
    'search',
    'find',
    'grep',
    'read',
    'check',
    'list',
    'look',
    'show',
    'status',
    'count',
    'format',
    'lint',
    'simple',
    'quick',
    'basic',
    'trivial',
    'glob',
    'what',
    'where',
    'which',
    'verify',
    'confirm',
    'view',
    'display',
  ],
  'sonnet-4.5': [], // not auto-routed, manual pick only
  'sonnet-4.6': [
    'write',
    'implement',
    'code',
    'fix',
    'bug',
    'test',
    'refactor',
    'build',
    'create',
    'add',
    'update',
    'feature',
    'component',
    'function',
    'module',
  ],
  'opus-4.6': [
    'architect',
    'design',
    'plan',
    'security',
    'audit',
    'refactor large',
    'complex',
    'multi-file',
    'system design',
    'strategy',
    'performance review',
    'comprehensive',
    'deep dive',
    'full analysis',
    'restructure',
    'overhaul',
  ],
  'opus-4.6-1m': [], // manual pick — 1M context for massive codebases
  'sonnet-4.6-1m': [], // manual pick — 1M context for large files
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
export async function fetchTasks(options?: {
  sessionId?: string;
  status?: ClaudeTaskStatus;
  search?: string;
  projectDir?: string;
  page?: number;
  perPage?: number;
}): Promise<PBListResult<ClaudeTask>> {
  const filters: string[] = [];
  if (options?.sessionId) filters.push(`session_id = "${options.sessionId}"`);
  if (options?.status) filters.push(`status = "${options.status}"`);
  if (options?.projectDir) filters.push(`project_dir ~ "${options.projectDir}"`);

  const filter = filters.join(' && ');

  const result = await pb
    .collection('claude_tasks')
    .getList<ClaudeTask>(options?.page ?? 1, options?.perPage ?? 500, { sort: '-updated', filter });

  if (options?.search) {
    const q = options.search.toLowerCase();
    result.items = result.items.filter(
      (t) =>
        t.content.toLowerCase().includes(q) ||
        t.session_title.toLowerCase().includes(q) ||
        t.project_dir.toLowerCase().includes(q),
    );
  }

  return result;
}

export async function syncTasks(): Promise<VibeSyncStatus> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/sync-tasks`, {
    method: 'POST',
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
  return response.json() as Promise<VibeSyncStatus>;
}

export async function getSyncStatus(): Promise<VibeSyncStatus> {
  const response = await fetch(`${getPbUrl()}/api/mytrend/sync-tasks/status`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!response.ok) throw new Error(`Status failed: ${response.status}`);
  return response.json() as Promise<VibeSyncStatus>;
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------
export function calcCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreateTokens: number,
  model: string,
): number {
  const [inputRate, outputRate] = MODEL_PRICING[model] ?? MODEL_PRICING['default'] ?? [15, 75];
  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * (inputRate * 0.1);
  const cacheCreateCost = (cacheCreateTokens / 1_000_000) * (inputRate * 1.25);
  return inputCost + outputCost + cacheReadCost + cacheCreateCost;
}

// ---------------------------------------------------------------------------
// Group tasks into VibeSession[]
// ---------------------------------------------------------------------------
export function groupTasksBySessions(tasks: ClaudeTask[]): VibeSession[] {
  const sessionMap = new Map<string, VibeSession>();

  for (const task of tasks) {
    const key = `${task.session_id}::${task.agent_id}`;

    if (!sessionMap.has(key)) {
      // Extract clean project name from path.
      // Claude Code encodes project_dir: ':' and '\' each become '-'
      //   "C:\Users\X\Desktop\Future\MyTrend"              -> "C--Users-X-Desktop-Future-MyTrend"
      //   "C:\...\MyTrend\.claude\worktrees\pensive"        -> "C--Users-...-MyTrend--claude-worktrees-pensive"
      // The last path segment before "--claude" or "--worktrees" is the project name.
      // Within a segment, '-' is used for both '\' separators AND '-' chars in folder names.
      // Strategy: strip worktree suffix, then take the last '-'-token that looks like a project name.
      // Slash format (older data): "C//Users/X/Desktop/Future/MyTrend//claude/worktrees/pensive"
      function extractProjectName(dir: string): string {
        if (!dir) return 'Unknown';

        // Dash-encoded format: no slashes at all
        if (!dir.includes('/') && !dir.includes('\\')) {
          // Strip worktree suffix: --claude-worktrees-* or --.claude-worktrees-*
          const stripped = dir.replace(/--\.?claude-worktrees-.+$/, '');
          // Decode: replace '--' with '/' to recover path separators
          // "C--Users-X-Desktop-Future-MyTrend" -> "C/Users-X-Desktop-Future-MyTrend"
          // Single dashes between segments are ambiguous but '--' is always a path separator
          const decoded = stripped.replace(/--/g, '/');
          // Now split by '/' and take last segment
          const parts = decoded.split('/').filter(Boolean);
          const last = parts[parts.length - 1]; // e.g. "Users-X-Desktop-Future-MyTrend"
          // Within last segment, '-' could be '\' or part of name — take the last '-' token
          const tokens = last ? last.split('-').filter(Boolean) : [];
          return tokens[tokens.length - 1] ?? stripped ?? dir;
        }

        // Slash format: normalize backslash + collapse multiple slashes
        const normalized = dir.replace(/\\/g, '/').replace(/\/+/g, '/');
        // Strip worktree suffix: /.claude/worktrees/... or /worktrees/...
        const stripped = normalized.replace(/\/\.?claude\/worktrees\/[^/]*\/?$/, '');
        // Get last non-empty path segment
        const parts = stripped.split('/').filter(Boolean);
        return parts[parts.length - 1] ?? dir;
      }
      const projectName = extractProjectName(task.project_dir);

      sessionMap.set(key, {
        session_id: task.session_id,
        agent_id: task.agent_id,
        session_title: task.session_title || 'Untitled',
        model: task.model || 'unknown',
        project_dir: task.project_dir || '',
        project_name: projectName,
        tasks: [],
        total_tasks: 0,
        pending_count: 0,
        in_progress_count: 0,
        completed_count: 0,
        progress_pct: 0,
        input_tokens: task.input_tokens || 0,
        output_tokens: task.output_tokens || 0,
        cache_read_tokens: task.cache_read_tokens || 0,
        cache_create_tokens: task.cache_create_tokens || 0,
        total_tokens: 0,
        context_pct: 0,
        estimated_cost: 0,
        started_at: task.started_at || '',
        ended_at: task.ended_at || '',
        duration_min: 0,
        is_active: false,
      });
    }

    const session = sessionMap.get(key);
    if (!session) continue;
    session.tasks.push(task);

    // Update counts
    if (task.status === 'pending') session.pending_count++;
    else if (task.status === 'in_progress') session.in_progress_count++;
    else if (task.status === 'completed') session.completed_count++;
  }

  // Compute derived fields
  const sessions: VibeSession[] = [];
  for (const session of sessionMap.values()) {
    session.total_tasks = session.tasks.length;
    session.progress_pct =
      session.total_tasks > 0
        ? Math.round((session.completed_count / session.total_tasks) * 100)
        : 0;
    session.is_active = session.in_progress_count > 0;

    // Token totals come from the task (all tasks in session share same JSONL data)
    const first = session.tasks[0];
    if (first) {
      session.input_tokens = first.input_tokens || 0;
      session.output_tokens = first.output_tokens || 0;
      session.cache_read_tokens = first.cache_read_tokens || 0;
      session.cache_create_tokens = first.cache_create_tokens || 0;
    }

    const contextWindow =
      MODEL_CONTEXT_WINDOWS[session.model] ?? MODEL_CONTEXT_WINDOWS['default'] ?? 200_000;
    session.total_tokens =
      session.input_tokens +
      session.output_tokens +
      session.cache_read_tokens +
      session.cache_create_tokens;
    session.context_pct = Math.min(100, Math.round((session.total_tokens / contextWindow) * 100));

    session.estimated_cost = calcCost(
      session.input_tokens,
      session.output_tokens,
      session.cache_read_tokens,
      session.cache_create_tokens,
      session.model,
    );

    // Duration
    if (session.started_at && session.ended_at) {
      const start = new Date(session.started_at).getTime();
      const end = new Date(session.ended_at).getTime();
      session.duration_min = Math.round((end - start) / 60_000);
    }

    // Sort tasks by index
    session.tasks.sort((a, b) => a.task_index - b.task_index);
    sessions.push(session);
  }

  // Sort: active first, then by ended_at desc
  return sessions.sort((a, b) => {
    if (a.is_active && !b.is_active) return -1;
    if (!a.is_active && b.is_active) return 1;
    return b.ended_at.localeCompare(a.ended_at);
  });
}

// ---------------------------------------------------------------------------
// Model suggestion via keyword analysis
// ---------------------------------------------------------------------------
export function suggestModel(taskContent: string): ModelSuggestion {
  const text = taskContent.toLowerCase();

  // Priority: opus > sonnet > haiku (check most expensive first)
  const tierPriority: ModelTier[] = ['opus-4.6', 'sonnet-4.6', 'haiku-4.5'];
  let matchedTier: ModelTier = 'sonnet-4.6'; // default

  for (const tier of tierPriority) {
    const keywords = TIER_KEYWORDS[tier];
    if (keywords.length === 0) continue;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matchedTier = tier;
        break;
      }
    }
    if (matchedTier === tier) break;
  }

  const modelInfo = MODEL_CATALOG.find((m) => m.tier === matchedTier);
  if (!modelInfo) throw new Error(`Unknown model tier: ${matchedTier}`);
  const alternatives = MODEL_CATALOG.filter((m) => m.tier !== matchedTier);
  const costNote = `~$${modelInfo.input_price}/M input, $${modelInfo.output_price}/M output`;

  return {
    recommended: matchedTier,
    model_id: modelInfo.model_id,
    model_info: modelInfo,
    reason: modelInfo.reason,
    alternatives,
    cli_command: `claude --model ${modelInfo.model_id}`,
    estimated_cost_note: costNote,
  };
}

// ---------------------------------------------------------------------------
// fetchSessionTasks — compat for tasks/[sessionId] page (cool-pasteur)
// ---------------------------------------------------------------------------
export async function fetchSessionTasks(
  sessionId: string,
): Promise<{ tasks: ClaudeTask[]; highwatermark: number }> {
  const result = await fetchTasks({ sessionId, perPage: 500 });
  const tasks = result.items;
  const highwatermark = tasks.length;
  return { tasks, highwatermark };
}
