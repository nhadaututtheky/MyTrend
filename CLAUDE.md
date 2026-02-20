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
- `nginx/` - Nginx reverse proxy config
- `scripts/` - Setup, backup, seed scripts

## Development Commands
```bash
# Start all services
docker-compose up

# Frontend dev (standalone)
cd frontend && npm run dev

# Validate before commit
cd frontend && npm run validate

# Type check
cd frontend && npm run check

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
hub_sessions, hub_environments, hub_cron_jobs

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
