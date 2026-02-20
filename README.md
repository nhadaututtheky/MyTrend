# MyTrend

Personal Knowledge & Activity Trend Platform. Self-hosted web app to record conversations, ideas, plans, and track personal activity trends over time.

Comic/sketch hand-drawn UI style built with Rough.js and Comic Mono font.

## Features

- **Dashboard** - Bento grid with stats, streak counter, heatmap calendar, trend charts
- **Projects** - Organize work with DNA cards, tech stack, and sparkline activity
- **Conversations** - Auto-synced from Claude CLI/Desktop/Web sessions every 30min
- **Ideas** - Auto-extracted from conversations, with type/status/priority tracking
- **Plans & Decisions** - Full lifecycle tracking (draft → completed), auto-extracted from Claude conversations and plan files
- **Trends** - Topic frequency analysis, trending topics, bilingual extraction (EN + VI)
- **Knowledge Graph** - Interactive D3 force-directed visualization of topic relationships
- **AI Hub** - Multi-session Claude chat with SSE streaming, environments, and cron jobs
- **Full-Text Search** - FTS5 across all content types
- **Telegram Integration** - File storage via bot, webhook inbox for quick idea capture
- **Neural Memory** - Auto-encode content to Neural Memory MCP for semantic recall

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | PocketBase 0.22 (Go, SQLite, auth, real-time) |
| Frontend | SvelteKit 2 + Svelte 5 (runes) + TypeScript |
| UI | Rough.js + Comic Mono + custom comic components |
| Search | SQLite FTS5 (porter + unicode61 tokenizer) |
| AI | Anthropic Claude API (streaming) |
| Memory | Neural Memory MCP (optional) |
| Deploy | Docker Compose + Nginx |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Anthropic API key (for AI Hub)
- Telegram Bot token (optional, for file storage & webhook)

### Setup

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker-compose up -d

# Access
# Frontend:  http://localhost:3000
# PocketBase: http://localhost:8090/_/
# Nginx:     http://localhost
```

### Development

```bash
# Frontend dev server
cd frontend && npm install && npm run dev

# Validate (format + lint + typecheck + test)
cd frontend && npm run validate

# Individual checks
npm run check    # TypeScript
npm run lint     # ESLint
npm run test     # Vitest
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Nginx (port 80)                   │
├──────────────────────┬──────────────────────────────┤
│   SvelteKit (3000)   │     PocketBase (8090)        │
│   ┌──────────────┐   │   ┌────────────────────┐     │
│   │ Pages/Routes │   │   │ Collections (SQLite)│     │
│   │ Comic UI     │   │   │ Auth & Real-time    │     │
│   │ SSE Stream   │───┤   │ FTS5 Search         │     │
│   └──────────────┘   │   │ Hooks (15 files)    │     │
│                      │   └────────┬───────────┘     │
│                      │            │                  │
│                      │   ┌────────▼───────────┐     │
│                      │   │  Neural Memory MCP  │     │
│                      │   │    (port 8001)      │     │
│                      │   └────────────────────┘     │
└──────────────────────┴──────────────────────────────┘
```

### Services

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| `pocketbase` | mytrend-pb | 8090 | Backend API, auth, database, hooks |
| `frontend` | mytrend-web | 3000 | SvelteKit SSR application |
| `neural-memory` | mytrend-nm | 8001 | Semantic memory encoding (optional) |
| `nginx` | mytrend-nginx | 80/443 | Reverse proxy |

### PocketBase Collections

| Collection | Purpose |
|------------|---------|
| `users` | Auth with display_name, timezone, preferences |
| `projects` | Work organization with DNA metadata |
| `conversations` | Claude session history with messages JSON |
| `ideas` | Extracted insights with type/status/priority |
| `plans` | Decision records with full lifecycle |
| `activities` | Auto-tracked events on all record creation |
| `activity_aggregates` | Hourly/daily rollups for heatmap |
| `topics` | Extracted keywords with trend data |
| `hub_sessions` | AI Hub chat sessions |
| `hub_environments` | AI Hub model configurations |
| `hub_cron_jobs` | Scheduled AI prompts |
| `telegram_files` | Telegram file storage metadata |

### PocketBase Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `claude_sync` | Cron 30min | Sync conversations from ~/.claude/projects/ |
| `plan_sync` | Cron 30min | Sync plan files from ~/.claude/plans/ |
| `idea_extraction` | On conversation create | Auto-extract ideas from messages |
| `plan_extraction` | On conversation create | Auto-extract plans from assistant responses |
| `topic_extraction` | On create (conv/idea/plan) | Extract and track topic keywords |
| `activity_tracking` | On create (all types) | Auto-create activity records |
| `activity_aggregation` | Cron hourly | Aggregate activities for heatmap |
| `neural_bridge` | On create/update | Encode to Neural Memory MCP |
| `search_index` | On create/update/delete | Maintain FTS5 search index |
| `trend_api` | API routes | Topic trends and trending endpoints |
| `plan_api` | API routes | Plan transitions, timeline, stats |
| `telegram_storage` | API routes | File upload/download via Telegram |
| `telegram_webhook` | API routes | Receive Telegram messages as ideas |

### API Endpoints

#### Claude Sync
- `GET /api/mytrend/sync-status` - Current sync state
- `POST /api/mytrend/sync-claude` - Trigger manual sync
- `GET /api/mytrend/sync-debug` - Debug sync pipeline

#### Plans
- `POST /api/mytrend/plans/:id/transition` - Transition plan status
- `GET /api/mytrend/plans/:id/timeline` - Plan stage history
- `GET /api/mytrend/plans/stats` - Aggregate plan statistics
- `POST /api/mytrend/sync-plans` - Sync plan files
- `POST /api/mytrend/backfill-plans` - Retroactive plan creation

#### Trends
- `GET /api/mytrend/topic-trends?topics=a,b&range=30d` - Topic frequency data
- `GET /api/mytrend/trending-topics` - Currently trending topics
- `GET /api/mytrend/heatmap` - Activity heatmap data

#### Search
- `GET /api/mytrend/search?q=query` - Full-text search across all content

#### Telegram
- `GET /api/telegram/status` - Bot connection status
- `POST /api/telegram/upload` - Upload file to storage channel
- `GET /api/telegram/files` - List stored files
- `POST /api/telegram/webhook` - Receive bot updates

#### AI Hub
- `POST /api/hub/stream` - SSE streaming chat with Claude

## Frontend Structure

```
frontend/src/
├── lib/
│   ├── components/
│   │   ├── comic/          # 23 comic-style primitives
│   │   ├── dashboard/      # Dashboard widgets
│   │   ├── hub/            # AI Hub chat components
│   │   ├── layout/         # Header, Sidebar, AIDrawer
│   │   └── telegram/       # File upload/list
│   ├── api/                # PocketBase API clients
│   ├── stores/             # Auth, theme, toast, sync
│   ├── types/              # TypeScript definitions
│   ├── utils/              # Date, color, format helpers
│   └── config/             # PocketBase + Neural Memory clients
└── routes/
    ├── auth/               # Login, Register
    ├── projects/           # List, New, [slug]
    ├── conversations/      # List, [id], Import
    ├── ideas/              # List, New, [id]
    ├── plans/              # List, New, [id]
    ├── trends/             # Trends dashboard
    ├── graph/              # Knowledge graph
    ├── search/             # Full-text search
    ├── settings/           # App settings + Telegram
    └── hub/                # AI Hub sessions
```

## Design System

Comic/hand-drawn aesthetic with Rough.js rendering:

- **Font**: Comic Mono (monospace, hand-drawn feel)
- **Borders**: Sketch-style with `border-radius: var(--radius-sketch)`
- **Shadows**: Hard shadows only (no blur) - `4px 4px 0 var(--border-color)`
- **Themes**: Light (#fffef9 base) and Dark/Neon Sketch (#0d0d1a base)
- **Accents**: Green #00D26A, Blue #4ECDC4, Red #FF4757, Yellow #FFE66D, Orange #FF9F43, Purple #A29BFE
- **Charts**: Rough.js for hand-drawn charts, D3 for force graph

### Comic Components

`ComicButton` `ComicBadge` `ComicCard` `ComicBentoCard` `ComicCallout` `ComicDataTable` `ComicDialog` `ComicEmptyState` `ComicInput` `ComicMarkdown` `ComicSkeleton` `ComicSparkline` `ComicTabs` `ComicTimeline` `ComicToast` `ComicTooltip` `BentoGrid` `HeatmapCalendar` `RoughChart` `RoughGraph` `RoughMultiLineChart` `TopicSearchBar` `TrendingList`

## Environment Variables

```env
# PocketBase
MYTREND_SYNC_USER_ID=       # User ID for cron sync jobs

# Telegram (optional)
TELEGRAM_BOT_TOKEN=          # Bot token from @BotFather
TELEGRAM_STORAGE_CHANNEL_ID= # Channel ID for file storage
TELEGRAM_WEBHOOK_SECRET=     # Webhook verification secret

# AI Hub (frontend)
ANTHROPIC_API_KEY=           # Claude API key for AI Hub

# Neural Memory (optional)
NM_URL=http://neural-memory:8000
NEURALMEMORY_BRAIN=mytrend
```

## Known Quirks

- **PocketBase Goja scope isolation**: Each hook callback (`routerAdd`, `cronAdd`) runs in a completely isolated scope. All helper functions must be inlined per scope.
- **Goja byte-array**: `$os.readFile()` returns `number[]` instead of string. Custom `b2s()` UTF-8 decoder is duplicated across every file-reading scope.
- **Neural Memory optional**: The platform works fully without Neural Memory. All NM calls are wrapped in silent try/catch.

## License

Private project. Not for redistribution.
