# MyTrend Roadmap v2 — Agent + User Experience
*Generated: 2026-02-25 | Based on dual-perspective analysis (Agent + People)*

---

## Already Done ✅
- PWA manifest + home screen shortcut
- Weekly digest (daily_digest.pb.js cron)
- Permission UX redesign (batch, severity, countdown)
- Bash tool_result output visible in Telegram
- .md file auto-send after Claude writes them
- Channel post URL capture (research graph)
- Theme system: comic/apple/pro × light/dark

---

## Sprint 1 — Daily Impact (Start here)
*Highest frequency use, quick wins*

### 1A. Global Search Cmd+K — FTS5 Integration `[M]`
**Problem:** CommandPalette only has static nav commands. FTS5 search at `/search` is disconnected.
**Fix:** Add `hybridSearch()` call with 300ms debounce inside CommandPalette when query >= 2 chars.
- Modify: `frontend/src/lib/components/layout/CommandPalette.svelte`
- No backend changes needed (FTS5 endpoint already exists)

### 1B. Project Health Signals `[S]`
**Problem:** No way to tell which projects are stalling/dead.
**Fix:** Color dot (green/yellow/red) based on `last_activity` age (< 3d / 3-14d / > 14d).
- Create: `frontend/src/lib/utils/project-health.ts`
- Modify: `ProjectCard.svelte`, `projects/+page.svelte`

### 1C. Auto Session Summary → Neural Memory `[S]`
**Problem:** Agent starts fresh every session, no memory of previous work.
**Fix:** On `result` message in `ws-bridge.ts`, compose summary from conversation history + metadata → save to Neural Memory.
- Modify: `companion/src/ws-bridge.ts` (add `summarizeAndSaveSession()`)

---

## Sprint 2 — Agent Context Awareness
*Agent knows what user is working on before responding*

### 2A. Daily Context Snapshot `[M]`
**Problem:** Claude CLI has no idea what user is focused on today.
**Fix:** PB cron builds daily snapshot (active projects, pending ideas, recent conversations, active plans) → companion injects into CLI system prompt at session start.
- Create: `pocketbase/pb_hooks/context_snapshot.pb.js`
- Create: PB migration `context_snapshots` collection
- Modify: `companion/src/cli-launcher.ts` (fetch + inject before spawn)
- Modify: `companion/src/routes.ts` (add `GET /api/context/latest`)

### 2B. Research Graph Pre-Task Lookup `[S]`
**Problem:** 50 captured URLs in Research KG — agent never sees them.
**Fix:** Context snapshot includes top 5 research entries relevant to the current project.
- Modify: `context_snapshot.pb.js` (depends on 2A)

### 2C. Demo Data for Dashboard `[S]`
**Problem:** Fresh install → all widgets empty → user doesn't see the value.
**Fix:** Detect "no real data" (all stats = 0) → inject clearly-marked demo data with dismissible banner.
- Create: `frontend/src/lib/utils/demo-data.ts`
- Modify: `frontend/src/routes/+page.svelte`

---

## Sprint 3 — Content Intelligence
*System connects dots automatically*

### 3A. Related Content Surfacing `[L]`
**Problem:** Idea/conversation/research are isolated islands.
**Fix:** FTS5 cross-collection query → show "Related" panel on idea/conversation/project detail pages.
- Create: `frontend/src/lib/components/comic/RelatedContent.svelte`
- Create: `frontend/src/lib/api/related.ts`
- Modify: `pocketbase/pb_hooks/search_index.pb.js` (add `GET /api/mytrend/related`)
- Modify: ideas, conversations, projects detail pages

### 3B. Large Bash Output → Send as File `[S]`
**Problem:** Bash output > 1500 chars still gets truncated.
**Fix:** If stdout > 3000 chars → send as `.txt` document instead of inline message.
- Modify: `companion/src/telegram/telegram-bridge.ts`
- Modify: `companion/src/telegram/telegram-api.ts`

---

## Sprint 4 — Cross-Channel Unification
*Web and Telegram work together, not separately*

### 4A. Bi-directional Telegram ↔ Web `[L]`
**Problem:** Telegram is input-only, Web is output-only. Can't continue sessions across channels.
**Fix:**
- Telegram: "Open in Web" inline button → `mytrend.local/vibe?session=<id>`
- Web: "Discuss with Claude" button on idea/conversation pages → pre-loaded context
- Web: "Send to Telegram" action on content pages
- Modify: `telegram-formatter.ts`, `companion/src/routes.ts`, `vibe/+page.svelte`, detail pages

---

## Critical Path

```
Sprint 1 (parallel, no deps):
  1A Cmd+K ─────────────────────────────────────┐
  1B Health signals                              │
  1C Session summary                             │
                                                 │
Sprint 2 (2A first, rest parallel):              │
  2A Context snapshot ──┬──────────────────────── enables 2B
  2B Research lookup ───┘ (depends on 2A)       │
  2C Demo data (independent)                     │
                                                 │
Sprint 3:                                        │
  3A Related content ────────────────────────────┘ (uses FTS5 patterns from 1A)
  3B Large output file (independent)

Sprint 4:
  4A Telegram ↔ Web (independent, complex)
```

## Effort Summary

| Item | Effort | Sprint |
|------|--------|--------|
| 1A. Cmd+K FTS5 | M (~80 LOC) | 1 |
| 1B. Project health | S (~60 LOC) | 1 |
| 1C. Session summary | S (~80 LOC) | 1 |
| 2A. Context snapshot | M (~250 LOC) | 2 |
| 2B. Research in context | S (~30 LOC) | 2 |
| 2C. Demo data dashboard | S (~130 LOC) | 2 |
| 3A. Related content | L (~420 LOC) | 3 |
| 3B. Large output file | S (~60 LOC) | 3 |
| 4A. Telegram ↔ Web | L (~300 LOC) | 4 |

**Total estimate: ~1,410 LOC across 4 sprints**

---

## Notes
- Each sprint is self-contained — can ship incrementally
- Sprint 1 items are all < 1 day each → start immediately
- 2A (context snapshot) is the highest-leverage single item for agent experience
- 3A (related content) is the biggest "wow" user feature
