# Changelog

All notable changes to MyTrend are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
