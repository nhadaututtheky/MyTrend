// MyTrend Type Definitions

// Base record type from PocketBase
export interface BaseRecord {
  readonly id: string;
  readonly created: string;
  readonly updated: string;
  readonly collectionId: string;
  readonly collectionName: string;
}

// User
export interface User extends BaseRecord {
  email: string;
  display_name: string;
  timezone: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultProject: string | null;
  sidebarCollapsed: boolean;
}

// Project
export type ProjectStatus = 'active' | 'paused' | 'archived' | 'completed';

export interface ProjectDNA {
  vision: string;
  stack: string[];
  phase: string;
  challenges: string[];
  decisions: ProjectDecision[];
}

export interface ProjectDecision {
  date: string;
  title: string;
  description: string;
  outcome: string;
}

export interface Project extends BaseRecord {
  user: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  dna: ProjectDNA;
  tech_stack: readonly string[];
  status: ProjectStatus;
  total_conversations: number;
  total_ideas: number;
  total_minutes: number;
  last_activity: string | null;
}

// Conversation
export type ConversationSource = 'cli' | 'desktop' | 'web' | 'imported' | 'hub';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokens: number;
}

export interface Conversation extends BaseRecord {
  user: string;
  project: string | null;
  title: string;
  summary: string;
  source: ConversationSource;
  device_name: string;
  session_id: string;
  messages: ConversationMessage[];
  message_count: number;
  total_tokens: number;
  topics: readonly string[];
  tags: readonly string[];
  started_at: string;
  ended_at: string | null;
  duration_min: number;
}

// Idea
export type IdeaType = 'feature' | 'bug' | 'design' | 'architecture' | 'optimization' | 'question';
export type IdeaStatus = 'inbox' | 'considering' | 'planned' | 'in_progress' | 'done' | 'rejected';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface Idea extends BaseRecord {
  user: string;
  project: string | null;
  conversation: string | null;
  title: string;
  content: string;
  type: IdeaType;
  status: IdeaStatus;
  priority: Priority;
  tags: readonly string[];
  related_ideas: readonly string[];
  attachments: readonly string[];
}

// Activity
export type ActivityType = 'conversation' | 'coding' | 'idea' | 'search' | 'review';

export interface Activity extends BaseRecord {
  user: string;
  project: string | null;
  conversation: string | null;
  type: ActivityType;
  action: string;
  device_name: string;
  metadata: Record<string, unknown>;
  timestamp: string;
  duration_sec: number;
}

// Activity Aggregate
export type AggregationPeriod = 'hour' | 'day' | 'week' | 'month';

export interface ActivityAggregate extends BaseRecord {
  user: string;
  project: string | null;
  period: AggregationPeriod;
  period_start: string;
  total_count: number;
  total_minutes: number;
  breakdown: Record<string, number>;
  top_topics: readonly string[];
  devices: readonly string[];
}

// Topic
export interface TopicTrendPoint {
  date: string;
  count: number;
}

export interface Topic extends BaseRecord {
  user: string;
  name: string;
  slug: string;
  category: string;
  mention_count: number;
  first_seen: string;
  last_seen: string;
  trend_data: readonly TopicTrendPoint[];
  related: readonly string[];
}

// Hub Session
export type HubSessionStatus = 'active' | 'paused' | 'archived';

export interface HubMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens: number;
  tool_calls?: HubToolCall[];
}

export interface HubToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'approved' | 'denied' | 'completed';
}

export interface HubSession extends BaseRecord {
  user: string;
  project: string | null;
  name: string;
  status: HubSessionStatus;
  model: string;
  system_prompt: string;
  messages: HubMessage[];
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost: number;
  environment: string;
  devices: readonly string[];
  last_message_at: string | null;
}

// Hub Environment
export interface HubEnvironment extends BaseRecord {
  user: string;
  name: string;
  slug: string;
  model: string;
  system_prompt: string;
  max_tokens: number;
  temperature: number;
  tools_enabled: readonly string[];
  api_key_encrypted: string;
}

// Hub Cron Job
export interface HubCronJob extends BaseRecord {
  user: string;
  project: string | null;
  name: string;
  schedule: string;
  prompt: string;
  environment: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  run_count: number;
  last_result: string;
}

// Trending Topics (from /api/mytrend/trending-topics)
export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface TrendingTopic {
  id: string;
  name: string;
  slug: string;
  category: string;
  mention_count: number;
  direction: TrendDirection;
  change_pct: number;
  last_7d_count: number;
  sparkline: number[];
}

// Topic Trend Series (from /api/mytrend/topic-trends)
export interface TopicTrendSeries {
  topic_id: string;
  name: string;
  slug: string;
  color: string;
  data: TopicTrendPoint[];
}

export interface TopicTrendResponse {
  range: string;
  start: string;
  end: string;
  series: TopicTrendSeries[];
}

// Search
export interface SearchResult {
  type: 'conversation' | 'idea' | 'project' | 'topic';
  id: string;
  title: string;
  snippet: string;
  score: number;
  highlight: string;
}

// Chart Data
export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

// Heatmap
export interface HeatmapDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

// PocketBase List Response
export interface PBListResult<T> {
  page: number;
  perPage: number;
  totalPages: number;
  totalItems: number;
  items: T[];
}

// Toast
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

// Navigation
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

// Insights API
export interface WeeklyInsights {
  period: { start: string; end: string };
  activity_summary: {
    total: number;
    hours: number;
    avg_per_day: number;
    vs_last_week_pct: number;
    breakdown: Record<string, number>;
  };
  top_topics: Array<{ name: string; count: number }>;
  peak_hours: Array<{ hour: number; count: number }>;
  focus_breakdown: Array<{
    project_id: string;
    project_name: string;
    minutes: number;
    count: number;
    pct: number;
  }>;
  streak: { current: number; longest: number };
  new_ideas_count: number;
  conversation_stats: {
    total: number;
    avg_messages: number;
    avg_tokens: number;
  };
}

export interface InsightPatterns {
  productive_hours: Array<{ hour: number; count: number }>;
  productive_days: Array<{ day: number; name: string; count: number }>;
  topic_velocity: Array<{
    topic: string;
    this_month: number;
    last_month: number;
    growth_pct: number;
  }>;
  session_patterns: {
    avg_session_minutes: number;
    sessions_per_day: number;
    total_sessions: number;
  };
}

export interface PeriodComparison {
  this_period: number;
  last_period: number;
  change_pct: number;
}

export interface WeekComparison {
  period: string;
  days: number;
  activities: PeriodComparison;
  hours: PeriodComparison;
  conversations: PeriodComparison;
  ideas: PeriodComparison;
}

export interface AskResult {
  answer: string;
  sources: Array<{
    type: string;
    id: string;
    title: string;
    snippet: string;
    relevance: number;
  }>;
  query: string;
}

// Claude Task Viewer
export type ClaudeTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface ClaudeTask {
  id: string;
  subject: string;
  description: string;
  activeForm: string;
  status: ClaudeTaskStatus;
  blocks: readonly string[];
  blockedBy: readonly string[];
}

export interface ClaudeTaskSession {
  sessionId: string;
  subject: string;
  highwatermark: number;
  pending: number;
  inProgress: number;
  completed: number;
  total: number;
}

export interface ClaudeTodoItem {
  content: string;
  status: ClaudeTaskStatus;
  activeForm: string;
}

export interface ClaudeTodoList {
  filename: string;
  sessionId: string;
  todos: ClaudeTodoItem[];
}
