# MyTrend Roadmap

> Generated: 2026-02-24 | Source: Opus review + session analysis + Neural Memory TODOs
> Priority: P0 = next sprint, P1 = this month, P2 = backlog, P3 = nice-to-have

---

## P0 — Immediate (Next Sprint)

### 1. PWA — Mobile Install + Push Notifications
**Why**: MyTrend is a daily-use tool but has no mobile presence beyond Telegram. No install, no offline, no push.
**Scope**:
- `manifest.json` + service worker for SvelteKit
- Installable on home screen (Android/iOS)
- Offline cache for dashboard static pages
- Push notifications via Web Push API (new ideas, plan status changes)
**Files**: `frontend/static/manifest.json`, `frontend/src/service-worker.ts`, `frontend/src/app.html`
**Effort**: Low (SvelteKit has built-in service worker support)

### 2. Daily/Weekly Digest via Telegram
**Why**: User must open dashboard to see insights. "Dashboard anh phải mở" → "assistant tự tìm đến anh".
**Scope**:
- Hub Cron Job: daily 9am → generate digest
- Digest content: unreviewed ideas count, stuck plans (>3 days in_progress), trending topics, cost summary
- Weekly: activity heatmap summary, top conversations, idea→plan conversion rate
- Send via existing Telegram bot API
**Files**: `pocketbase/pb_hooks/digest.pb.js` (cron), `companion/src/telegram/telegram-digest.ts` (formatter + sender)
**Effort**: Low (infra exists: Telegram bot + Hub Cron + PocketBase queries)

### 3. Telegram Permission UI Redesign
**Why**: Current permission messages are noisy and unclear. ExitPlanMode doesn't need approval but other tools flood chat.
**Scope**:
- Show auto-approve vs manual clearly per tool (green auto, red lock for Bash)
- Suppress permission UI entirely for `bypassPermissions` mode sessions
- Batch permissions in 2s window → single grouped message with [Allow all] / [Review individually]
- Severity indicators: Read/Glob (safe) vs Bash/Write (caution)
**Files**: `companion/src/telegram/telegram-bridge.ts`, `companion/src/telegram/telegram-formatter.ts`, `companion/src/ws-bridge.ts`
**Effort**: Medium

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

### 5. Auto Backup SQLite
**Why**: PocketBase SQLite is single point of failure. No scheduled backup, no export.
**Scope**:
- PocketBase hook: daily backup SQLite → `backups/` folder (timestamped, keep last 7)
- Optional: upload backup to Telegram storage channel (bot already has file upload API)
- Export endpoint: JSON/CSV for conversations, ideas, activities
**Files**: `pocketbase/pb_hooks/backup.pb.js`, `scripts/backup.sh`
**Effort**: Low

### 6. Idea ↔ Plan Auto-Linking + Funnel
**Why**: Ideas flow (inbox→considering→planned→done) is disconnected from Plans. No automation, no conversion metrics.
**Scope**:
- Auto-link: when Idea status → "planned", prompt to create/link a Plan
- Auto-close: when Plan → "completed", mark related Ideas "done"
- Funnel analytics: ideas→plans→done conversion rate on Dashboard
- PocketBase hook for status change cascading
**Files**: `pocketbase/pb_hooks/idea-plan-link.pb.js`, `frontend/src/lib/components/FunnelChart.svelte`
**Effort**: Medium

---

## P2 — Backlog

### 7. Discord/Slack Push Notifications
**Why**: Dev communities live on Discord/Slack. Push activity summaries, idea notifications.
**Scope**: Webhook integration for outbound notifications (not full 2-way chat). Reuse digest templates from #2.
**Effort**: Medium

### 8. Natural Language Cron
**Why**: Hub Cron Jobs use cron expressions — technical barrier. "Every morning at 9am, summarize yesterday" is more natural.
**Scope**: NLP → cron parser (Claude API call), save to hub_cron_jobs collection.
**Effort**: Low

### 9. Vibe Terminal Onboarding Wizard
**Why**: First-run experience is complex (project profiles, session management).
**Scope**: 3-step wizard: choose project → auto-detect directory → start session.
**Effort**: Low

---

## P3 — Nice-to-Have

### 10. GitHub PR/Issue Integration
**Scope**: Webhook/gh CLI sync for PR tracking, issue→idea linking, commit→conversation correlation.
**Effort**: Medium

### 11. Trend Pre-Computation
**Scope**: Materialized views for topic trends (currently real-time aggregation). Only needed at scale.
**Effort**: Medium

### 12. Component Gallery
**Scope**: Dev-only route `/dev/components` showing all comic components with variations.
**Effort**: Low

### 13. Public Share Links
**Scope**: Read-only, expiring token links for individual items (trend reports, knowledge graphs).
**Effort**: Medium

---

## Completed (2026-02-24)

- [x] Model mapping: opus-1m→opus[1m], sonnet-1m→sonnet[1m], opusplan (commit f7fe464)
- [x] Idle timeout: reset on CLI activity, increased to 60min (commit 9d5ea15)
- [x] Telegram reply race condition: responseOriginMsg lock (commit 0a26e59)
- [x] Companion reverted to native — Docker companion breaks MCP/skills (commit b28d446)
- [x] Docker bind mount fix for profiles + telegram config (commit 16c1d94)
- [x] LESSONS.md workflow established (commit f7fe464)
- [x] Permission UI Redesign: batch 2s, severity, bypassPermissions suppress (commit 57c5ec9)
- [x] PWA: manifest + service worker + icons + Apple meta tags (commit ec3e89d)
- [x] Daily/Weekly Digest: PocketBase cron → Telegram HTML digest (commit 1a8743c)
