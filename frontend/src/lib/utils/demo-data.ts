import type {
  Project,
  Activity,
  HeatmapDay,
  TimeSeriesPoint,
  WeeklyInsights,
  WeekComparison,
  TrendingTopic,
} from '$lib/types/index';

const DEMO_DISMISSED_KEY = 'mytrend_demo_dismissed';

export function isDemoMode(
  projects: Project[],
  activities: Activity[],
  heatmapData: HeatmapDay[],
): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_DISMISSED_KEY) === '1') {
    return false;
  }
  const noProjects = projects.length === 0;
  const noActivities = activities.length === 0;
  const noHeatmap = heatmapData.every((d) => d.count === 0) || heatmapData.length === 0;
  return noProjects && noActivities && noHeatmap;
}

export function dismissDemo(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEMO_DISMISSED_KEY, '1');
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function dateStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

function fakeId(prefix: string): string {
  return `${prefix}_demo_${Math.random().toString(36).slice(2, 9)}`;
}

const BASE: Pick<
  Project,
  | 'collectionId'
  | 'collectionName'
  | 'user'
  | 'dna'
  | 'tech_stack'
  | 'github_repo'
  | 'github_last_synced'
  | 'slug'
> = {
  collectionId: 'demo',
  collectionName: 'projects',
  user: 'demo',
  slug: 'demo',
  dna: {
    vision: '',
    stack: [],
    phase: 'active',
    challenges: [],
    decisions: [],
  },
  tech_stack: [],
  github_repo: '',
  github_last_synced: null,
};

// ─── Demo Projects ───────────────────────────────────────────────────────────

export const DEMO_PROJECTS: Project[] = [
  {
    ...BASE,
    id: 'demo_proj_1',
    created: daysAgo(45),
    updated: daysAgo(1),
    collectionName: 'projects',
    name: 'MyTrend',
    slug: 'mytrend',
    description: 'Personal knowledge & activity trend platform',
    color: '#00D26A',
    icon: '📊',
    status: 'active',
    total_conversations: 24,
    total_ideas: 12,
    total_minutes: 840,
    last_activity: daysAgo(1),
  },
  {
    ...BASE,
    id: 'demo_proj_2',
    created: daysAgo(30),
    updated: daysAgo(6),
    collectionName: 'projects',
    name: 'Future Bot',
    slug: 'future-bot',
    description: 'AI-powered trading signal assistant',
    color: '#4ECDC4',
    icon: '🤖',
    status: 'active',
    total_conversations: 10,
    total_ideas: 5,
    total_minutes: 360,
    last_activity: daysAgo(6),
  },
  {
    ...BASE,
    id: 'demo_proj_3',
    created: daysAgo(60),
    updated: daysAgo(20),
    collectionName: 'projects',
    name: 'Side Experiment',
    slug: 'side-experiment',
    description: 'Weekend hacking and exploration',
    color: '#FFE66D',
    icon: '🧪',
    status: 'active',
    total_conversations: 3,
    total_ideas: 2,
    total_minutes: 90,
    last_activity: daysAgo(20),
  },
];

// ─── Demo Activities ─────────────────────────────────────────────────────────

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: fakeId('act'),
    created: daysAgo(0),
    updated: daysAgo(0),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'coding',
    action: 'Implemented FTS5 global search in CommandPalette',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(0),
    duration_sec: 3600,
  },
  {
    id: fakeId('act'),
    created: daysAgo(0),
    updated: daysAgo(0),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'conversation',
    action: 'Discussed project health indicators',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(0),
    duration_sec: 900,
  },
  {
    id: fakeId('act'),
    created: daysAgo(1),
    updated: daysAgo(1),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_2',
    conversation: null,
    type: 'idea',
    action: 'New idea: auto-backtest signal strategies',
    device_name: 'iPhone',
    metadata: {},
    timestamp: daysAgo(1),
    duration_sec: 300,
  },
  {
    id: fakeId('act'),
    created: daysAgo(1),
    updated: daysAgo(1),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'commit',
    action: 'feat: add project health signals to dashboard',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(1),
    duration_sec: 120,
  },
  {
    id: fakeId('act'),
    created: daysAgo(2),
    updated: daysAgo(2),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'conversation',
    action: 'Sprint planning for Roadmap v2',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(2),
    duration_sec: 1800,
  },
  {
    id: fakeId('act'),
    created: daysAgo(2),
    updated: daysAgo(2),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_2',
    conversation: null,
    type: 'review',
    action: 'Reviewed WebSocket reconnection logic',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(2),
    duration_sec: 600,
  },
  {
    id: fakeId('act'),
    created: daysAgo(3),
    updated: daysAgo(3),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'idea',
    action: 'New idea: bi-directional Telegram ↔ Web',
    device_name: 'iPhone',
    metadata: {},
    timestamp: daysAgo(3),
    duration_sec: 200,
  },
  {
    id: fakeId('act'),
    created: daysAgo(3),
    updated: daysAgo(3),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'coding',
    action: 'Fixed Telegram channel_post detection',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(3),
    duration_sec: 2400,
  },
  {
    id: fakeId('act'),
    created: daysAgo(4),
    updated: daysAgo(4),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_3',
    conversation: null,
    type: 'search',
    action: 'Researched Rough.js animation techniques',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(4),
    duration_sec: 450,
  },
  {
    id: fakeId('act'),
    created: daysAgo(5),
    updated: daysAgo(5),
    collectionId: 'demo',
    collectionName: 'activities',
    user: 'demo',
    project: 'demo_proj_1',
    conversation: null,
    type: 'pr',
    action: 'Merged PR: theme system overhaul',
    device_name: 'MacBook Pro',
    metadata: {},
    timestamp: daysAgo(5),
    duration_sec: 180,
  },
];

// ─── Demo Heatmap (90 days) ──────────────────────────────────────────────────

export function generateDemoHeatmap(): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  // Realistic pattern: active weekdays, sparse weekends, some streaks
  const pattern = [
    4, 6, 5, 7, 3, 1, 0, 5, 8, 6, 4, 2, 0, 0, 7, 5, 6, 8, 4, 1, 0, 3, 6, 5, 4, 2, 0, 0, 5, 7,
  ];
  for (let i = 89; i >= 0; i--) {
    const base = pattern[i % pattern.length] ?? 0;
    // Add slight randomness
    const jitter = Math.floor(Math.random() * 3) - 1;
    const count = Math.max(0, base + jitter);
    const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
    days.push({
      date: dateStr(i),
      count,
      level: level as 0 | 1 | 2 | 3 | 4,
    });
  }
  return days;
}

// ─── Demo Trend (30 days) ───────────────────────────────────────────────────

export function generateDemoTrend(heatmap: HeatmapDay[]): TimeSeriesPoint[] {
  return heatmap.slice(-30).map((d) => ({ date: d.date, value: d.count }));
}

// ─── Demo Weekly Insights ───────────────────────────────────────────────────

export const DEMO_WEEKLY_INSIGHTS: WeeklyInsights = {
  period: { start: dateStr(7), end: dateStr(0) },
  activity_summary: {
    total: 34,
    hours: 14,
    avg_per_day: 4.8,
    vs_last_week_pct: 18,
    breakdown: { coding: 12, conversation: 10, idea: 6, commit: 4, review: 2 },
  },
  top_topics: [
    { name: 'SvelteKit', count: 8 },
    { name: 'Claude AI', count: 7 },
    { name: 'PocketBase', count: 5 },
    { name: 'TypeScript', count: 4 },
    { name: 'WebSockets', count: 3 },
  ],
  peak_hours: [
    { hour: 9, count: 5 },
    { hour: 10, count: 8 },
    { hour: 11, count: 7 },
    { hour: 14, count: 6 },
    { hour: 15, count: 9 },
    { hour: 16, count: 6 },
    { hour: 21, count: 4 },
    { hour: 22, count: 5 },
  ],
  focus_breakdown: [
    { project_id: 'demo_proj_1', project_name: 'MyTrend', minutes: 480, count: 20, pct: 60 },
    { project_id: 'demo_proj_2', project_name: 'Future Bot', minutes: 240, count: 10, pct: 30 },
    { project_id: 'demo_proj_3', project_name: 'Side Experiment', minutes: 80, count: 4, pct: 10 },
  ],
  streak: { current: 5, longest: 12 },
  new_ideas_count: 4,
  conversation_stats: { total: 10, avg_messages: 18, avg_tokens: 2400 },
};

// ─── Demo Week Comparison ───────────────────────────────────────────────────

export const DEMO_WEEK_COMPARISON: WeekComparison = {
  period: 'week',
  days: 7,
  activities: { this_period: 34, last_period: 29, change_pct: 17 },
  hours: { this_period: 14, last_period: 11, change_pct: 27 },
  conversations: { this_period: 10, last_period: 8, change_pct: 25 },
  ideas: { this_period: 4, last_period: 3, change_pct: 33 },
};

// ─── Demo Trending Topics ───────────────────────────────────────────────────

export const DEMO_TRENDING_TOPICS: TrendingTopic[] = [
  {
    id: 'demo_topic_1',
    name: 'SvelteKit',
    slug: 'sveltekit',
    category: 'framework',
    mention_count: 24,
    direction: 'rising',
    change_pct: 40,
    last_7d_count: 8,
    sparkline: [2, 3, 2, 4, 5, 6, 8],
  },
  {
    id: 'demo_topic_2',
    name: 'Claude AI',
    slug: 'claude-ai',
    category: 'ai',
    mention_count: 18,
    direction: 'rising',
    change_pct: 28,
    last_7d_count: 7,
    sparkline: [3, 3, 4, 4, 5, 6, 7],
  },
  {
    id: 'demo_topic_3',
    name: 'PocketBase',
    slug: 'pocketbase',
    category: 'backend',
    mention_count: 15,
    direction: 'stable',
    change_pct: 0,
    last_7d_count: 5,
    sparkline: [4, 3, 5, 4, 5, 4, 5],
  },
  {
    id: 'demo_topic_4',
    name: 'TypeScript',
    slug: 'typescript',
    category: 'language',
    mention_count: 12,
    direction: 'stable',
    change_pct: 5,
    last_7d_count: 4,
    sparkline: [3, 4, 3, 4, 3, 4, 4],
  },
  {
    id: 'demo_topic_5',
    name: 'WebSockets',
    slug: 'websockets',
    category: 'protocol',
    mention_count: 8,
    direction: 'falling',
    change_pct: -20,
    last_7d_count: 3,
    sparkline: [5, 4, 4, 3, 3, 2, 3],
  },
];
