# MyTrend Roadmap

> Generated: 2026-02-24 | Updated: 2026-02-25
> Priority: P0 = next sprint, P1 = this month, P2 = backlog, P3 = nice-to-have

---

## P1 — This Month

### 4. Research Knowledge Graph — URL Auto-Capture
**Why**: User shares repos/links during conversations (Telegram, Vibe sessions) but they vanish with context. MyTrend's core purpose is capturing ALL knowledge.
**Scope**:
- **PocketBase collection**: `research` — url, source (github/npm/blog), title, description, stars, tech_tags[], patterns_extracted[], applicable_projects[], verdict (fit/partial/concept-only), ai_summary
- **Telegram bot URL detection**: detect GitHub/npm/blog URLs in messages → fetch metadata (GitHub API) → AI summary → save to PocketBase + Neural Memory
- **Cross-project mapping**: AI analyzes each research item against ALL projects (MyTrend, Future Bot, Rune, Thor AI, Neural Memory) — not just current project
- **Dashboard view**: Research activity trends, knowledge graph visualization, "Related research" suggestions when working on a project
- **Caption support**: URL + user comment → use comment as analysis context
**Files**: `companion/src/telegram/telegram-bridge.ts` (URL detection in handleTextMessage), `companion/src/telegram/telegram-research.ts` (new: fetch + analyze + save), `pocketbase/pb_migrations/` (research collection), `frontend/src/routes/research/` (dashboard view)
**Effort**: Medium-High

### 8. Natural Language Cron (deferred — needs Cron UI first)
**Why**: Hub Cron Jobs use cron expressions — technical barrier. "Every morning at 9am, summarize yesterday" is more natural.
**Scope**: NLP → cron parser (Claude API call), save to hub_cron_jobs collection. Requires Hub Cron CRUD UI.
**Effort**: Medium (was Low, re-scoped: no cron UI exists yet)

---

## P2 — Backlog

### 10. GitHub PR/Issue Integration
**Scope**: Webhook/gh CLI sync for PR tracking, issue→idea linking, commit→conversation correlation.
**Effort**: Medium

### 11. Trend Pre-Computation
**Scope**: Materialized views for topic trends (currently real-time aggregation). Only needed at scale.
**Effort**: Medium

### 13. Public Share Links
**Scope**: Read-only, expiring token links for individual items (trend reports, knowledge graphs).
**Effort**: Medium

---

## Completed

### 2026-02-25
- [x] Vibe Terminal Onboarding Wizard: 3-step first-run wizard (welcome → project → launch)
- [x] Component Gallery: dev route `/dev/components` with all comic components + variants
- [x] Telegram Bridge hot-reload: save config applies immediately without restart (commit 8a09ec0)

### 2026-02-24
- [x] Model mapping: opus-1m→opus[1m], sonnet-1m→sonnet[1m], opusplan (commit f7fe464)
- [x] Idle timeout: reset on CLI activity, increased to 60min (commit 9d5ea15)
- [x] Telegram reply race condition: responseOriginMsg lock (commit 0a26e59)
- [x] Companion reverted to native — Docker companion breaks MCP/skills (commit b28d446)
- [x] Docker bind mount fix for profiles + telegram config (commit 16c1d94)
- [x] LESSONS.md workflow established (commit f7fe464)
- [x] Permission UI Redesign: batch 2s, severity, bypassPermissions suppress (commit 57c5ec9)
- [x] PWA: manifest + service worker + icons + Apple meta tags (commit ec3e89d)
- [x] Daily/Weekly Digest: PocketBase cron → Telegram HTML digest (commit 1a8743c)
- [x] NM Auto-Ingest Pipeline: smart classification, doc training, insight extraction (commits cc9b160..3eadf06)
- [x] Auto Backup SQLite: daily cron + manual endpoint + Telegram upload + rotation (keep 7)
- [x] Idea ↔ Plan Auto-Linking + Funnel analytics
- [x] Telegram multi-project topics + notification group support (commit 7cb6368)
