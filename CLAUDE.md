# MyTrend - Personal Knowledge & Activity Trend Platform

## Project Overview
Self-hosted web platform to record ALL history, conversations, ideas, design decisions, and activity trends.
Comic/sketch hand-drawn UI style (Rough.js, Wired Elements). Single docker-compose up deployment.

## Tech Stack
- **Backend**: PocketBase (Go binary, SQLite, auth, real-time, admin UI)
- **Frontend**: SvelteKit (adapter-node) + Svelte 5 runes
- **UI**: Wired Elements + Rough.js + RoughViz.js + Comic Mono font
- **Database**: SQLite (built into PocketBase) + FTS5
- **Deployment**: Docker Compose + Nginx

## Project Structure
- `pocketbase/` - PocketBase backend with hooks and migrations
- `frontend/` - SvelteKit frontend application
- `companion/` - Bun + Hono WebSocket bridge for Vibe Terminal (Claude Code CLI control)
- `nginx/` - Nginx reverse proxy config
- `scripts/` - Setup, backup, seed scripts

## Development Commands
```bash
# Start all services
docker-compose up

# Frontend dev (standalone)
cd frontend && npm run dev

# Companion service (Vibe Terminal bridge)
cd companion && bun run dev

# Validate before commit
cd frontend && npm run validate

# Type check
cd frontend && npm run check
cd companion && bunx tsc --noEmit

# Lint
cd frontend && npm run lint

# Test
cd frontend && npm run test
```

## Key Conventions
- **Svelte 5 runes**: Use $props(), $state(), $derived(), $effect()
- **TypeScript strict**: No `any`, full type coverage
- **Immutability**: Never mutate, always spread/copy
- **Imports**: type imports first, then svelte, lib, components, relative
- **Components**: PascalCase.svelte, max 200 lines
- **CSS**: Use CSS variables from app.css, no inline styles
- **PocketBase**: Always paginate queries, never getFullList()
- **Wired Elements**: Dynamic import in onMount (SSR-safe)
- **Error handling**: Typed catch, never swallow errors
- **Naming**: camelCase vars, PascalCase types, UPPER_SNAKE constants

## PocketBase Collections
users, projects, conversations, ideas, activities, activity_aggregates, topics,
hub_sessions, hub_environments, hub_cron_jobs, claude_tasks

## Vibe Terminal Architecture
Browser-based Claude Code control via WebSocket bridge:

```
Browser (SvelteKit)  ←WS JSON→  Companion (Bun+Hono :3457)  ←WS NDJSON→  Claude Code CLI (--sdk-url)
```

### Companion Service (`companion/`)
- **Runtime**: Bun + Hono
- **Port**: 3457
- **Key files**:
  - `src/index.ts` - Server bootstrap, WS upgrade routing
  - `src/ws-bridge.ts` - Bidirectional message routing (CLI ↔ Browser), keep-alive, persistence
  - `src/cli-launcher.ts` - Spawns `claude` with `--sdk-url`, validates args, detects early exit
  - `src/session-store.ts` - JSON file persistence in `companion/data/`
  - `src/session-types.ts` - All TypeScript types (CLI messages, browser messages, session state)
  - `src/project-profiles.ts` - Project configs (dir, model, permissionMode)
  - `src/routes.ts` - REST API (health, sessions CRUD, projects)

### CLI Launch Flags
```bash
claude --sdk-url ws://localhost:3457/ws/cli/{sessionId} \
  --print --output-format stream-json --input-format stream-json \
  --verbose --model sonnet --permission-mode bypasstool
```
- Valid permission modes: `ask`, `allow-all`, `bypasstool`, `plan`
- NO `-p ""` flag — SDK mode handles I/O via WebSocket

### WebSocket Protocol
- **CLI → Bridge**: NDJSON (system/init, assistant, result, stream_event, control_request, tool_progress, keep_alive)
- **Bridge → Browser**: JSON (session_init, assistant, stream_event, result, permission_request, status_change, error, cli_connected/disconnected, message_history)
- **Browser → Bridge**: JSON (user_message, permission_response, interrupt, set_model)
- **Keep-alive**: Bridge sends heartbeat to CLI every 15s
- **Reconnect**: Browser auto-reconnects with exponential backoff (1s→30s, max 10 attempts)

### Frontend Components (`frontend/src/lib/components/vibe/`)
| Component | Purpose |
|-----------|---------|
| VibeTerminal.svelte | Main terminal: session create/select, chat, status bar |
| SessionSidebar.svelte | Left panel: session list with progress bars |
| VibeMessage.svelte | Chat message display (user/assistant) |
| VibeComposer.svelte | Input textarea + send/interrupt buttons |
| VibePermission.svelte | Tool permission approve/deny cards |
| KanbanBoard.svelte | 3-column task board (pending/in-progress/done) |
| TaskCard.svelte | Individual task with model/project badges |
| ContextMeter.svelte | Token usage meter |
| ModelRouter.svelte | Keyword → model suggestion engine |

## Design System
Comic hand-drawn style with:
- Sketch borders (radius-sketch), hard shadows (no blur)
- Comic Mono font
- Light/dark mode via [data-theme] attribute
- Accent colors: green (#00D26A), red (#FF4757), yellow (#FFE66D), blue (#4ECDC4)

## Git Workflow (BẮT BUỘC)

**Làm việc trực tiếp trên `main` branch. KHÔNG dùng worktrees.**

```bash
# Sau khi code xong mỗi task:
git add <files>
git commit -m "feat/fix: mô tả"
git push
```

**Rules:**
- KHÔNG để uncommitted code sau khi xong task
- Commit ngay sau mỗi feature/fix, không để dồn
- KHÔNG tạo worktree mới — Claude Code worktrees gây mất code khi session hết context
- Docker build từ `./frontend` (main branch) — thay đổi trong worktree không được deploy
