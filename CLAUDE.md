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

**Sau khi code xong trong worktree, PHẢI làm đủ 4 bước:**

```bash
# 1. Commit trong worktree
cd .claude/worktrees/<branch-name>
git add <files>
git commit -m "feat/fix: mô tả"

# 2. Merge về main
cd C:/Users/X/Desktop/Future/MyTrend
git merge claude/<branch-name> --no-ff -m "Merge branch '...'"

# 3. Resolve conflicts nếu có, rồi commit
git add . && git commit -m "merge: resolve conflicts"

# 4. Push
git push

# Kiểm tra tồn đọng định kỳ
git worktree list
git status  # trong TỪNG worktree
```

**Rules:**
- KHÔNG để uncommitted code sau khi xong task
- KHÔNG để worktree chỉ có code mà không có commit
- Check tất cả worktrees trước khi kết thúc session: `git worktree list`
- Conflicts: ưu tiên version có nhiều lines hơn / mới hơn
- `cool-pasteur`, `pensive-lehmann` là pattern đặt tên branch của Claude Code
