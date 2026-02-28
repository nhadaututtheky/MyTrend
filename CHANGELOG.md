# Changelog

All notable changes to MyTrend are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.4.0] - 2026-03-01

### Added

#### Telegram Magic Link Login
- `/start` bot command generates magic link with inline keyboard button
- `auth_tokens` collection (64-char token, 5-min expiry, single-use)
- `telegram_user_id` field on users collection for account linking
- `/api/auth/telegram/request` (internal) + `/api/auth/telegram/verify` (public) endpoints
- Frontend `/auth/telegram` page with auto-verify → redirect flow
- `loginWithTelegramToken()` auth store helper
- Daily cron cleanup for expired/used tokens
- "Login with Telegram" hint on login page

#### Research Data Pipeline
- Research knowledge graph with URL auto-capture from Telegram
- Claude CLI analysis for research items (no API key needed)
- Channel post detection for research URL ingestion
- Actionable research insights extraction

#### Security Hardening
- SQL injection prevention in PB hooks (parameterized queries)
- XSS prevention (HTML sanitization in Telegram formatter)
- Filter validation across all API endpoints
- Auth hardening (localStorage persist, char limits)

### Fixed
- Goja JSVM `Intl` crash — replaced with static 'UTC' for timezone
- Vibe Terminal plan mode getting stuck (ExitPlanMode handling)
- Thinking-only assistant messages rendering as empty bubbles
- Telegram bot /start UX and group notification flow

---

## [0.3.0] - 2026-02-26

### Added

#### Hub Cron Management (v3 Sprint 1)
- Full CRUD UI for hub cron jobs at `/hub/cron` + `/hub/cron/[id]`
- Natural language cron schedule parser
- Cron execution history with duration and output tracking

#### Plans Kanban (v3 Sprint 2)
- 3-column Kanban board (PlanKanban.svelte) for plan lifecycle
- Milestones checklist with completion tracking
- Related content linking (ideas, conversations, research)

#### GitHub Integration (v3 Sprint 3)
- Webhook receiver in companion for push/PR/issue events
- PB ingest hook for GitHub activity records
- PR → Idea auto-linking with conversion tracking

#### Smart Ideas (v3 Sprint 4)
- Duplicate idea detection via `/api/mytrend/ideas/similar`
- Smart auto-tags from existing topics on idea creation
- Yellow warning banner for potential duplicates in UI

### Fixed
- Migration Goja pointer issue with `.all()` — use SQLite JSON functions
- Migration `db.saveCollection` → `Dao(db).saveCollection`
- Null-safe tags, task 404 handling, research auth headers
- Telegram bot inline URLs, menu UX, pinned controls
- CI/CD: prettier smart quotes, ESLint errors, PeakHoursChart types

---

## [0.2.0] - 2026-02-24

### Added

#### Vibe Terminal
- Browser-based Claude Code control via WebSocket bridge
- Companion service (Bun + Hono, port 3457) with stdin/stdout pipe transport
- Session management with create/select/reconnect
- VibeComposer with Vi→En auto-translate
- Permission request cards (approve/deny)
- KanbanBoard for claude_tasks (pending/in-progress/done)
- ContextMeter for token usage tracking
- ModelRouter with keyword → model suggestion
- Onboarding wizard and component gallery

#### Telegram Claude Bridge
- Mobile Claude Code access via Telegram bot
- Multi-project support with /switch command
- Inline keyboards for permissions, model selection
- Auto-translate Vi→En for messages ≥ 30 chars
- Tool result display (Bash output, file diffs)
- .md file auto-send as Telegram documents
- Cost alerts and pinned status messages
- /timeout command for per-session idle control

#### Comic Neobrutalism Design System
- Colored panels, display font, stagger animations
- Sidebar hard shadows, stat color-blocks, logo font
- Icons overhaul, compact dashboard, command palette
- Dark mode tuning across all components

#### Agent & User Experience (ROADMAP v2)
- Sprint 1: Cmd+K FTS5 search, project health signals, auto session summary to NM
- Sprint 2: Daily context snapshot for CLI sessions, demo data mode
- Sprint 3: Large Bash output as file attachment, cross-collection related content
- Sprint 4: Bi-directional Telegram ↔ Web sync

#### Infrastructure
- Daily/weekly digest via Telegram cron job
- Auto-backup SQLite with daily cron + manual endpoint + Telegram upload
- PWA setup with icons and Apple meta tags
- Portable setup: publish NM image, project config via Settings UI
- Folder browser for project directory picker
- GitHub sync hook (PAT polling every 30min)
- NM sync hub with Docker bridge IP patch
- Smart memory classification in neural bridge

### Fixed
- Companion reverted to native (Docker sandboxed MCP/skills/filesystem)
- Idle timeout tracks CLI activity, increased to 60min
- Telegram reply race condition with `responseOriginMsg` lock
- Model name mapping (opus-1m → opus[1m], etc.)
- Permission mode alignment with Claude Code SDK
- ExitPlanMode auto-approval flow
- Project detail crash when tech_stack/dna is null
- Private chat session jumping between Project and HQ

---

## [0.1.0] - 2026-02-18

### Added

#### Telegram Integration
- File upload/download via Telegram Bot API with storage channel
- Webhook inbox - send messages to bot, auto-creates ideas
- Telegram settings UI in Settings page (bot token, channel ID, webhook setup)
- telegram_files collection for tracking uploaded files
- APIs: /api/telegram/upload, /api/telegram/files, /api/telegram/webhook

#### Plans & Decision Records
- Full lifecycle tracking: draft > approved > in_progress > review > completed/abandoned/superseded
- Auto-extraction from Claude conversations with confidence scoring
- Auto-sync from ~/.claude/plans/ directory (cron every 30min)
- Plan types: implementation, architecture, design, refactor, bugfix, investigation, migration
- Priority (low to critical) and complexity (trivial to epic) classification
- Stage transition history with timestamps and notes
- Timeline view per plan, global stats dashboard
- Backfill endpoint for retroactive plan creation
- APIs: /api/mytrend/plans/:id/transition, /api/mytrend/plans/:id/timeline, /api/mytrend/plans/stats

#### Personal Trends Engine
- Unified Trends dashboard with topic frequency over time
- Trending topics endpoint with configurable time range
- Topic auto-extraction from conversations, ideas, and plans (bilingual EN + VI)
- Topic relationship mapping and trend_data tracking
- APIs: /api/mytrend/topic-trends, /api/mytrend/trending-topics

#### Knowledge Graph
- Interactive D3 force-directed graph visualization
- Draggable nodes with zoom/pan controls
- Nodes represent topics, edges represent co-occurrence relationships

#### AI Hub (Vibe Companion)
- Multi-session chat interface with Claude API (Anthropic SDK)
- SSE streaming responses via SvelteKit API route
- Environments: configurable model, system prompt, temperature, max tokens
- Cron jobs: scheduled prompts with environment binding
- Device indicator and token counter per session
- Docker integration for native Claude Task Viewer

#### Claude Auto-Sync
- Auto-sync conversations from ~/.claude/projects/ every 30min
- Source detection from project path depth (cli/desktop/web)
- Sync status and debug APIs
- Custom UTF-8 b2s() decoder for PocketBase Goja byte-array handling

#### Neural Memory Integration
- Auto-encode conversations, ideas, and plans to Neural Memory MCP on create/update
- Silent-fail when Neural Memory service is unreachable
- Configurable brain name via NEURALMEMORY_BRAIN env var

#### Full-Text Search
- FTS5 virtual tables with porter + unicode61 tokenizer
- Search across conversations, ideas, projects, and plans
- Dedicated search page with instant results

#### Dashboard and UI
- Bento grid layout with stats, streak counter, 30-day trend chart
- Heatmap calendar (GitHub-style activity visualization)
- Active plans overview on dashboard
- Projects grid with DNA cards and sparkline charts
- Activity timeline component
- Sidebar navigation with collapsible sections
- Header with search and theme toggle
- AI Drawer (slide-out panel)

#### Comic Design System
- 23 reusable comic-style components (ComicButton, ComicCard, ComicDialog, etc.)
- Neon Sketch theme (dark mode) with hand-drawn borders
- Comic Mono font (woff2)
- Rough.js chart components (RoughChart, RoughGraph, RoughMultiLineChart)
- Hard shadows (no blur), sketch border radius
- Light/dark mode via [data-theme] attribute
- Accent colors: green (#00D26A), blue (#4ECDC4), red (#FF4757), yellow (#FFE66D)

#### Core Features
- Projects CRUD with slug, color, icon, tech stack, DNA metadata
- Conversations CRUD with message history, token tracking, device info
- Ideas CRUD with type/status/priority, auto-extraction from conversations
- Activities auto-tracking on all record creation
- Activity aggregation (hourly/daily) via cron job
- Heatmap data API
- Conversation import page

#### Auth and Infrastructure
- PocketBase auth with login/register/logout
- Docker Compose deployment (PocketBase + Neural Memory + SvelteKit + Nginx)
- Service worker for offline support
- PWA manifest

### Fixed
- PocketBase Goja byte-array bug: readFile returns number[] not string - fixed with custom UTF-8 decoder
- PocketBase Goja scope isolation: each routerAdd/cronAdd callback has isolated scope, inlined all helpers
- PocketBase realtime subscribe wrapped in try/catch across all pages
- Conversation source detection from project path depth
- Lint, type, and CSS warnings stabilized in phase-0

---

## Development Phases

The initial release was built across 11 phases:

| Phase | Focus |
|-------|-------|
| 0 | Codebase stabilization (lint, types, CSS) |
| 1 | Neon Sketch design system + ComicSkeleton |
| 2-3 | BentoGrid, Sparkline, DataTable, EmptyState components |
| 4 | Dashboard Bento redesign, Sidebar/Header, AI Drawer |
| 5 | Page-level upgrades across all routes |
| 6 | Detail page polish - skeleton loading, empty states |
| 7 | Neural Memory integration, UTF-8 encoding fixes |
| 8 | Claude auto-sync pipeline |
| 9 | Trends engine, draggable Graph, auto-project sync |
| 10 | Plans and Decision Records system |
| 11 | Telegram storage integration |
