# NM Auto-Ingest Pipeline — Design Doc

> Date: 2026-02-24 | Status: Draft | Author: Brainstorm session

## Problem

MyTrend's goal: local AI brain trained from project data. Reality:

1. **2 NM instances disconnected** — Host `laptop-brain` (Claude Code agents) and Docker `mytrend` (PB hooks) don't share data
2. **Dumb encoding** — PB hooks dump everything as `type: 'fact'`, no classification
3. **No training** — `nmem_train` (docs) and `nmem_index` (code) never run
4. **No proactive recall** — NM only queried manually, never auto-suggests

## Architecture

```
                    ┌─────────────────────────────┐
                    │     Neural Memory Brain      │
                    │   (unified via sync)         │
                    │                              │
                    │  Decisions  Insights  Facts   │
                    │  Workflows  Errors   Context  │
                    │  Code Index  Doc Training     │
                    └──────────┬──────────────────┘
                               │ recall / query
                    ┌──────────┴──────────────────┐
                    │                              │
              ┌─────┴─────┐              ┌────────┴────────┐
              │Claude Code │              │  MyTrend Web    │
              │  Agents    │              │  Dashboard      │
              │(host NM)   │              │(Docker NM API)  │
              └─────┬─────┘              └────────┬────────┘
                    │                              │
         writes to laptop-brain           queries via /memory/query
                    │                              │
              ┌─────┴──────────────────────────────┘
              │         Sources (auto-ingest)
              │
    ┌─────────┼──────────┬──────────────┐
    │         │          │              │
PB Hooks   nmem_train  nmem_index   Telegram
(records)  (docs)      (code)      (URLs/msgs)
```

## Layer 1: Sync — Unify 2 NM Instances

### Goal
Host NM (`laptop-brain`) and Docker NM (`mytrend`) share knowledge bidirectionally.

### Implementation
- Configure Docker NM as sync hub server (already on port 8001)
- Host NM sets `hub_url=http://localhost:8001`, `auto_sync=true`, `sync_interval_seconds=300`
- Conflict strategy: `prefer_recent` (newest memory wins)
- Run initial `nmem_sync full` to merge existing data

### Brain Name Handling
- NM sync is device-to-device for the same logical brain
- If brain names must match: rename Docker NM brain to `laptop-brain` (env var change)
- If NM handles cross-brain sync: keep names as-is, test first
- Either way: test sync, verify memories appear on both sides

### Verification
1. Create memory on host via `nmem_remember`
2. Wait 5 min (or force `nmem_sync push`)
3. Query Docker NM via `curl localhost:8001/memory/query` — should find it
4. Vice versa: PB hook encodes record → query from host NM

### Files
- `docker-compose.yml` — env vars for sync config
- Host NM config via `nmem_sync_config set`

---

## Layer 2: Enrich — Smart Memory Classification

### Goal
Replace dumb `type: 'fact'` encoding with intelligent classification.

### Memory Type Rules

| Pattern in Content | Memory Type | Priority |
|-------------------|-------------|----------|
| "decided to", "chose", "went with", "will use" | `decision` | 8 |
| "learned", "lesson", "mistake", "never again" | `insight` | 8 |
| "error", "failed", "bug", "crashed", "broke" | `error` | 7 |
| "workflow", "process", "pattern", "always do" | `workflow` | 6 |
| "todo", "need to", "should", "must" | `todo` | 5 |
| "prefer", "like", "dislike", "better" | `preference` | 5 |
| Default (no pattern match) | `fact` | 4 |

### Collection-Specific Overrides

| Collection | Default Type | Override Logic |
|-----------|-------------|----------------|
| ideas (status=planned/done) | `decision` | Status change = decision was made |
| plans (any) | `decision` | Plans are inherently decisions |
| activities (commit/pr) | `workflow` | Development workflow data |
| conversations | Pattern-match | Analyze content for type |
| projects | `fact` | Project DNA is factual |

### Enhanced Tags
```javascript
tags: [
  'project:MyTrend',           // existing
  'collection:conversations',  // existing
  'domain:frontend',           // NEW: inferred from content keywords
  'session:2026-02-24',        // NEW: date-based grouping
  'source:telegram',           // NEW: origin channel
]
```

### Domain Inference Keywords
```javascript
const DOMAIN_KEYWORDS = {
  'frontend': ['svelte', 'component', 'css', 'layout', 'page', 'route'],
  'backend': ['pocketbase', 'hook', 'api', 'endpoint', 'collection'],
  'infra': ['docker', 'nginx', 'deploy', 'compose', 'build'],
  'ai': ['neural', 'memory', 'model', 'claude', 'prompt'],
  'telegram': ['telegram', 'bot', 'message', 'chat'],
};
```

### Files
- `pocketbase/pb_hooks/neural_bridge.pb.js` — rewrite encoding logic

---

## Layer 3: Train — Project Knowledge Pipeline

### Goal
Feed NM from docs, code, and extracted conversation insights.

### A. Document Training

**Trigger:** Daily cron (9:30 AM, after digest) + manual endpoint

**Sources:**
- `LESSONS.md` — incident post-mortems (tag: `lessons`)
- `CLAUDE.md` — project conventions (tag: `conventions`)
- `ROADMAP.md` — plans and priorities (tag: `roadmap`)
- `docs/**/*.md` — design docs (tag: `design`)

**Implementation:**
```
PB cron → check file checksums vs stored checksums
  → if changed: call NM /memory/encode with file content
  → store new checksums in PB (key-value or user_settings)
```

Alternative: Call `nmem_train` MCP tool via companion REST endpoint.

### B. Codebase Indexing

**Trigger:** Daily cron (10 AM) or after git push

**Sources:**
- `companion/src/**/*.ts` — WebSocket bridge, Telegram bot
- `frontend/src/lib/**/*.ts` — API clients, utilities
- `frontend/src/routes/**/*.svelte` — page components
- `pocketbase/pb_hooks/**/*.js` — server hooks

**Implementation:**
- Companion exposes `POST /api/nm/index-codebase` endpoint
- Calls `nmem_index` via NM HTTP API
- Or: PB cron triggers companion endpoint

### C. Conversation Insight Extraction

**Trigger:** On conversation create/update (existing neural_bridge hook)

**Current:** Dumps raw title + summary + first 10 messages as single `fact`

**New:** Extract multiple typed memories from conversation:
1. Parse messages for decision/insight/error patterns
2. Create separate memory for each extracted item
3. Link back to conversation via `metadata.record_id`

Example: A conversation about Docker migration yields:
- `decision`: "Companion must run natively, not in Docker"
- `error`: "Docker companion breaks MCP/skills/Kanban sync"
- `insight`: "When fix #2 doesn't work, STOP and re-evaluate"
- `fact`: "Conversation: Docker companion migration attempt"

### Files
- `pocketbase/pb_hooks/daily_digest.pb.js` — add training cron after digest
- `pocketbase/pb_hooks/neural_bridge.pb.js` — conversation extraction rewrite
- `companion/src/routes.ts` — new `/api/nm/index-codebase` endpoint (optional)

---

## Implementation Order

1. **Layer 1: Sync** — Configure and test NM sync between instances
2. **Layer 2: Enrich** — Rewrite `neural_bridge.pb.js` encoding
3. **Layer 3A: Doc Training** — PB cron for LESSONS/CLAUDE/ROADMAP
4. **Layer 3B: Code Indexing** — Companion endpoint for codebase index
5. **Layer 3C: Conversation Extraction** — Smart parsing in neural_bridge

## Success Criteria

- [ ] `nmem_recall "Docker companion lesson"` returns the LESSONS.md insight from ANY instance
- [ ] New PB records get classified correctly (not all `fact`)
- [ ] Host NM can query MyTrend PB data (via sync)
- [ ] Docker NM can query agent learnings (via sync)
- [ ] LESSONS.md, CLAUDE.md trained into NM with proper tags
- [ ] Codebase indexed — `nmem_recall "WebSocket bridge"` returns relevant code context

## Risks

- **Sync brain name mismatch** — May need both instances to use same brain name. Test first.
- **Sync conflict storms** — High-frequency PB hooks + agent writes could create many conflicts. Monitor.
- **Encoding spam** — Every PB record update triggers encode. May need debounce or change-detection.
- **Training staleness** — Docs change rarely. Daily cron is fine. Code changes frequently — need smart diffing.
