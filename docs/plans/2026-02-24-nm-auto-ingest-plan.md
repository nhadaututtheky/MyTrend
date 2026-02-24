# NM Auto-Ingest Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify two disconnected Neural Memory instances and feed them intelligently from PocketBase records, project docs, and codebase.

**Architecture:** Three layers — (1) Sync host NM ↔ Docker NM via hub protocol, (2) Enrich PB hook encoding with smart type classification and domain tags, (3) Train NM from project docs via daily cron + conversation insight extraction.

**Tech Stack:** PocketBase Goja hooks (JS), NM HTTP API (FastAPI), companion Bun+Hono routes, `nmem_sync` MCP tools.

---

## Task 1: Configure NM Sync — Docker as Hub

**Files:**
- Modify: `docker-compose.yml` (neural-memory env vars)

**Step 1: Add sync hub env vars to Docker NM**

The Docker NM instance needs to act as the sync hub server. Add environment variables to enable hub mode.

```yaml
# In docker-compose.yml, neural-memory service, environment section, add:
      - NEURAL_MEMORY_HUB_ENABLED=true
```

**Step 2: Rebuild Docker NM**

Run: `docker-compose up -d neural-memory`
Expected: Container restarts with hub enabled.

**Step 3: Verify hub endpoint is accessible**

Run: `curl -s http://localhost:8001/hub/status/mytrend`
Expected: JSON response (may be 404 if no devices registered yet — that's OK).

Run: `curl -s http://localhost:8001/hub/devices/mytrend`
Expected: JSON response (empty list is fine).

**Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: enable NM sync hub on Docker instance"
```

---

## Task 2: Configure Host NM Sync to Docker Hub

**Files:**
- None (MCP tool configuration only)

**Step 1: Set host NM sync config to point to Docker NM**

Current host config: `hub_url=http://127.0.0.1:8000` (points to itself — wrong).
Need: `hub_url=http://localhost:8001` (Docker NM exposed port).

Use: `nmem_sync_config set` with:
- `hub_url`: `http://localhost:8001`
- `auto_sync`: `true`
- `sync_interval_seconds`: `300`
- `conflict_strategy`: `prefer_recent`

**Step 2: Register host device with hub**

Run: `nmem_sync push` to trigger initial registration.
Check: `curl -s http://localhost:8001/hub/devices/laptop-brain` — should show host device.

**Step 3: Test bidirectional sync**

Test A — Host → Docker:
1. `nmem_remember "Test sync: host to Docker NM"` (on host)
2. `nmem_sync push`
3. `curl -s -X POST http://localhost:8001/memory/query -H "Content-Type: application/json" -d '{"query":"test sync host to Docker"}'` — should find it

Test B — Docker → Host:
1. `curl -s -X POST http://localhost:8001/memory/encode -H "Content-Type: application/json" -H "X-Brain-ID: mytrend" -d '{"content":"Test sync: Docker to host NM","tags":["sync-test"]}'`
2. `nmem_sync pull`
3. `nmem_recall "test sync Docker to host"` — should find it

**Step 4: Handle brain name mismatch**

Host brain = `laptop-brain`, Docker brain = `mytrend`.
NM sync is brain-to-brain. If sync doesn't find memories cross-brain, either:
- Option A: Change Docker brain env to `NEURALMEMORY_BRAIN=laptop-brain` in `docker-compose.yml`
- Option B: Use NM brain merge API: `POST /brain/{brain_id}/merge`

Test first, fix if needed. If brain rename is needed, update `docker-compose.yml` and `neural_bridge.pb.js` `X-Brain-ID` header.

**Step 5: Document outcome**

Note in commit message whether brain rename was needed and what was done.

---

## Task 3: Rewrite neural_bridge.pb.js — Smart Classification

**Files:**
- Modify: `pocketbase/pb_hooks/neural_bridge.pb.js`

**Step 1: Add classification helper functions**

Add these functions at the top of `neural_bridge.pb.js`, before `encodeToNeuralMemory`:

```javascript
/**
 * Classify memory type from content using keyword patterns.
 * Returns { type: string, priority: number }
 */
function classifyMemoryType(content, collection, record) {
  var text = (content || '').toLowerCase();

  // Collection-specific overrides first
  if (collection === 'plans') return { type: 'decision', priority: 8 };
  if (collection === 'activities') return { type: 'workflow', priority: 6 };
  if (collection === 'projects') return { type: 'fact', priority: 4 };
  if (collection === 'topics') return { type: 'fact', priority: 4 };

  // Ideas: status-based
  if (collection === 'ideas') {
    var status = record ? (record.getString('status') || '') : '';
    if (status === 'planned' || status === 'done') return { type: 'decision', priority: 8 };
    return { type: 'fact', priority: 4 };
  }

  // Pattern matching (highest priority first)
  var patterns = [
    { words: ['decided to', 'chose', 'went with', 'will use', 'switched to', 'migrated to'], type: 'decision', priority: 8 },
    { words: ['learned', 'lesson', 'mistake', 'never again', 'insight', 'realized', 'turns out'], type: 'insight', priority: 8 },
    { words: ['error', 'failed', 'bug', 'crashed', 'broke', 'exception', 'stacktrace'], type: 'error', priority: 7 },
    { words: ['workflow', 'process', 'pattern', 'always do', 'convention', 'standard'], type: 'workflow', priority: 6 },
    { words: ['todo', 'need to', 'should', 'must', 'plan to', 'next step'], type: 'todo', priority: 5 },
    { words: ['prefer', 'like', 'dislike', 'better', 'worse', 'favorite'], type: 'preference', priority: 5 },
  ];

  for (var i = 0; i < patterns.length; i++) {
    for (var j = 0; j < patterns[i].words.length; j++) {
      if (text.indexOf(patterns[i].words[j]) !== -1) {
        return { type: patterns[i].type, priority: patterns[i].priority };
      }
    }
  }

  return { type: 'fact', priority: 4 };
}

/**
 * Infer domain tags from content keywords.
 * Returns array of domain tag strings like 'domain:frontend'.
 */
function inferDomainTags(content) {
  var text = (content || '').toLowerCase();
  var domains = {
    'frontend': ['svelte', 'component', 'css', 'layout', 'page', 'route', 'html', 'ui'],
    'backend': ['pocketbase', 'hook', 'api', 'endpoint', 'collection', 'migration', 'cron'],
    'infra': ['docker', 'nginx', 'deploy', 'compose', 'build', 'ci', 'pipeline'],
    'ai': ['neural', 'memory', 'model', 'claude', 'prompt', 'llm', 'embedding'],
    'telegram': ['telegram', 'bot', 'webhook', 'chat_id'],
  };
  var result = [];
  var keys = Object.keys(domains);
  for (var i = 0; i < keys.length; i++) {
    var words = domains[keys[i]];
    for (var j = 0; j < words.length; j++) {
      if (text.indexOf(words[j]) !== -1) {
        result.push('domain:' + keys[i]);
        break;
      }
    }
  }
  return result;
}
```

**Step 2: Update encodeToNeuralMemory to use classification**

Replace the hardcoded `type: 'fact'` in metadata with dynamic classification. In the `encodeToNeuralMemory` function, after building `content` for each collection, add:

```javascript
// After content is built, before the HTTP call:
var classified = classifyMemoryType(content, collection, record);
metadata.type = classified.type;
metadata.priority = classified.priority;

// Add domain tags
var domainTags = inferDomainTags(content);
for (var dt = 0; dt < domainTags.length; dt++) {
  tags.push(domainTags[dt]);
}

// Add session date tag
var now = new Date();
tags.push('session:' + now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate()));

// Add collection tag
tags.push('collection:' + collection);
```

Also add the `padTwo` helper inside `encodeToNeuralMemory`:
```javascript
function padTwo(n) { return n < 10 ? '0' + n : '' + n; }
```

**Step 3: Test classification locally**

Verify by creating test records:
1. Create idea with status "planned" → should get `type: 'decision'`
2. Create conversation with "learned" in summary → should get `type: 'insight'`
3. Create activity (commit) → should get `type: 'workflow'`

Check Docker NM logs: `docker logs mytrend-pb 2>&1 | grep NeuralBridge | tail -20`

**Step 4: Commit**

```bash
git add pocketbase/pb_hooks/neural_bridge.pb.js
git commit -m "feat: smart memory classification in neural bridge hooks"
```

---

## Task 4: Update nm_backfill.pb.js with Same Classification

**Files:**
- Modify: `pocketbase/pb_hooks/nm_backfill.pb.js`

**Step 1: Add same classifyMemoryType and inferDomainTags to backfill**

Copy the `classifyMemoryType` and `inferDomainTags` functions into the backfill endpoint's `_encode` function scope (Goja requires inline due to scope isolation).

**Step 2: Update _encode to use classification**

Same pattern as Task 3: after building content, call `classifyMemoryType` and `inferDomainTags`, update `metadata.type`, `metadata.priority`, and push domain/session/collection tags.

**Step 3: Test backfill with classification**

Run: `curl -X POST "http://localhost:8090/api/mytrend/nm-backfill?collection=ideas&batch_size=5" -H "Authorization: ..."`
Check NM query results have correct types.

**Step 4: Commit**

```bash
git add pocketbase/pb_hooks/nm_backfill.pb.js
git commit -m "feat: add smart classification to NM backfill endpoint"
```

---

## Task 5: Doc Training Cron — Train NM from Project Docs

**Files:**
- Modify: `pocketbase/pb_hooks/daily_digest.pb.js` (add training cron after digest)

**Step 1: Add doc training cron**

Add a new cron job in `daily_digest.pb.js` that runs after the digest (e.g., at DIGEST_HOUR + 0.5h = :30 mark):

```javascript
// Doc Training Cron — trains NM from project markdown files
// Runs daily at :30 of digest hour
cronAdd('nm_doc_training', '30 * * * *', function () {
  var now = new Date();
  var digestHour = 9;
  try {
    var dh = $os.getenv('DIGEST_HOUR');
    if (dh) digestHour = parseInt(dh, 10);
  } catch (e) {}
  if (now.getHours() !== digestHour) return;

  var nmUrl = $os.getenv('NM_URL') || 'http://neural-memory:8000';
  var dao = $app.dao();

  // Doc sources to train
  var docs = [
    { path: 'LESSONS.md', tag: 'lessons', domain: 'project-meta' },
    { path: 'CLAUDE.md', tag: 'conventions', domain: 'project-meta' },
    { path: 'ROADMAP.md', tag: 'roadmap', domain: 'project-meta' },
  ];

  // Read file via PB's mounted volume or check stored checksums
  // PB hooks can't read host filesystem directly — use NM's /memory/encode
  // with content fetched from stored settings

  // Strategy: Store doc content in user_settings as checksum.
  // If checksum changed, re-encode the doc.
  // Since PB hooks can't read files, we encode docs from a companion endpoint
  // or manually trigger. For now, encode doc training metadata.

  // Alternative: Use companion endpoint to read files and POST to NM
  // This is Task 6.

  console.log('[NMDocTraining] Cron triggered — will be handled by companion endpoint');

  // Trigger companion's doc training endpoint (fire-and-forget)
  try {
    $http.send({
      url: 'http://host.docker.internal:3457/api/nm/train-docs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      timeout: 30,
    });
    console.log('[NMDocTraining] Triggered companion doc training');
  } catch (e) {
    console.log('[NMDocTraining] Companion unreachable: ' + e);
  }
});

console.log('[NMDocTraining] Cron registered: nm_doc_training');
```

**Step 2: Commit**

```bash
git add pocketbase/pb_hooks/daily_digest.pb.js
git commit -m "feat: add NM doc training cron trigger in daily digest"
```

---

## Task 6: Companion Doc Training Endpoint

**Files:**
- Modify: `companion/src/routes.ts`

**Step 1: Add `/api/nm/train-docs` endpoint**

This endpoint reads project markdown files from the host filesystem and sends them to NM for encoding.

```typescript
app.post("/api/nm/train-docs", async (c) => {
  const { readFile } = await import("node:fs/promises");
  const { resolve, basename } = await import("node:path");
  const { createHash } = await import("node:crypto");

  const NM_URL = process.env.NM_URL || "http://localhost:8001";
  const PROJECT_DIR = process.env.PROJECT_DIR || "D:\\Project\\MyTrend";

  const docs = [
    { file: "LESSONS.md", tag: "lessons" },
    { file: "CLAUDE.md", tag: "conventions" },
    { file: "ROADMAP.md", tag: "roadmap" },
  ];

  // Simple checksum store (in-memory for now — resets on restart)
  // Could persist to companion/data/doc-checksums.json
  const checksumFile = resolve("data", "doc-checksums.json");
  let storedChecksums: Record<string, string> = {};
  try {
    const raw = await readFile(checksumFile, "utf-8");
    storedChecksums = JSON.parse(raw);
  } catch {
    // First run or file missing
  }

  const results: { file: string; status: string }[] = [];

  for (const doc of docs) {
    const filePath = resolve(PROJECT_DIR, doc.file);
    try {
      const content = await readFile(filePath, "utf-8");
      const checksum = createHash("md5").update(content).digest("hex");

      if (storedChecksums[doc.file] === checksum) {
        results.push({ file: doc.file, status: "unchanged" });
        continue;
      }

      // Encode to NM
      const res = await fetch(`${NM_URL}/memory/encode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Brain-ID": "mytrend" },
        body: JSON.stringify({
          content: `[${doc.tag.toUpperCase()}] ${basename(doc.file)}\n\n${content}`,
          tags: [doc.tag, "doc-training", "project:MyTrend", `source:${doc.file}`],
          metadata: {
            type: doc.tag === "lessons" ? "insight" : doc.tag === "conventions" ? "reference" : "fact",
            source: doc.file,
            collection: "doc-training",
            checksum,
          },
        }),
      });

      if (res.ok) {
        storedChecksums[doc.file] = checksum;
        results.push({ file: doc.file, status: "encoded" });
      } else {
        results.push({ file: doc.file, status: `error: ${res.status}` });
      }
    } catch (err) {
      results.push({ file: doc.file, status: `error: ${err}` });
    }
  }

  // Persist checksums
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(resolve("data"), { recursive: true });
    await writeFile(checksumFile, JSON.stringify(storedChecksums, null, 2));
  } catch {
    // Non-critical
  }

  return c.json({ ok: true, results });
});
```

**Step 2: Add `PROJECT_DIR` to companion start config**

Ensure companion has `PROJECT_DIR` env var pointing to MyTrend root.

**Step 3: Test endpoint**

Run: `curl -X POST http://localhost:3457/api/nm/train-docs`
Expected: JSON with each doc's status (encoded or unchanged).

Run again: All should show "unchanged" (checksum dedup).

**Step 4: Commit**

```bash
git add companion/src/routes.ts
git commit -m "feat: add companion endpoint for NM doc training"
```

---

## Task 7: Conversation Insight Extraction

**Files:**
- Modify: `pocketbase/pb_hooks/neural_bridge.pb.js`

**Step 1: Add conversation insight extraction**

Replace the simple conversation encoding with multi-memory extraction. In the `conversations` branch of `encodeToNeuralMemory`, after building the basic `content`, add extraction logic:

```javascript
// After building base conversation content...
// Extract typed insights from messages
function extractInsights(messages, maxInsights) {
  var insights = [];
  var patterns = [
    { words: ['decided to', 'chose', 'went with', 'will use', 'switched to'], type: 'decision', priority: 8 },
    { words: ['learned', 'lesson', 'mistake', 'never again', 'realized', 'turns out'], type: 'insight', priority: 8 },
    { words: ['error', 'failed', 'bug', 'crashed', 'broke'], type: 'error', priority: 7 },
    { words: ['workflow', 'process', 'always do', 'convention'], type: 'workflow', priority: 6 },
  ];

  for (var mi = 0; mi < messages.length && insights.length < maxInsights; mi++) {
    var msg = messages[mi];
    if (!msg || !msg.content || msg.role !== 'assistant') continue;
    var text = msg.content.toLowerCase();

    for (var pi = 0; pi < patterns.length; pi++) {
      var matched = false;
      for (var wi = 0; wi < patterns[pi].words.length; wi++) {
        if (text.indexOf(patterns[pi].words[wi]) !== -1) {
          matched = true;
          break;
        }
      }
      if (matched) {
        // Extract sentence around the keyword (up to 300 chars)
        var snippet = msg.content.substring(0, 300);
        insights.push({
          content: snippet,
          type: patterns[pi].type,
          priority: patterns[pi].priority,
        });
        break; // One type per message
      }
    }
  }
  return insights;
}
```

Then encode each insight as a separate memory, in addition to the main conversation fact:

```javascript
var extracted = extractInsights(messages, 5);
for (var ei = 0; ei < extracted.length; ei++) {
  var insightPayload = {
    content: extracted[ei].content,
    metadata: {
      collection: 'conversations',
      record_id: record.getId(),
      type: extracted[ei].type,
      priority: extracted[ei].priority,
      extracted_from: 'conversation',
      title: title,
    },
    tags: tags.concat(['extracted', extracted[ei].type]),
  };
  try {
    $http.send({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-ID': 'mytrend' },
      body: JSON.stringify(insightPayload),
      timeout: 5,
    });
  } catch (e) { /* silent */ }
}
```

**Step 2: Test with a real conversation**

Create/update a conversation that contains "decided to use SvelteKit" in messages.
Check NM for a `decision` type memory linked to that conversation.

**Step 3: Commit**

```bash
git add pocketbase/pb_hooks/neural_bridge.pb.js
git commit -m "feat: extract typed insights from conversations in neural bridge"
```

---

## Task 8: Rebuild Docker & End-to-End Verification

**Files:**
- None (verification only)

**Step 1: Rebuild and restart all Docker services**

Run: `docker-compose up -d --build`
Wait for all services healthy.

**Step 2: Verify sync (Layer 1)**

1. `nmem_remember "E2E test: sync verification from host"`
2. `nmem_sync push`
3. `curl -s -X POST http://localhost:8001/memory/query -H "Content-Type: application/json" -d '{"query":"E2E sync verification"}'`
Expected: Found on Docker NM.

**Step 3: Verify classification (Layer 2)**

1. Create a test idea via PB API with status "planned"
2. Query Docker NM — should have `type: 'decision'`, domain tags present
3. Create a test conversation with "learned that Docker companion breaks MCP"
4. Query — should have `type: 'insight'` extracted memory

**Step 4: Verify doc training (Layer 3)**

1. `curl -X POST http://localhost:3457/api/nm/train-docs`
2. `nmem_recall "Docker companion lesson"` — should find LESSONS.md content
3. `nmem_recall "project conventions SvelteKit"` — should find CLAUDE.md content

**Step 5: Run full backfill with new classification**

```bash
# Re-encode existing records with smart classification
curl -X POST "http://localhost:8090/api/mytrend/nm-backfill?collection=conversations&batch_size=50"
curl -X POST "http://localhost:8090/api/mytrend/nm-backfill?collection=ideas&batch_size=50"
curl -X POST "http://localhost:8090/api/mytrend/nm-backfill?collection=plans&batch_size=50"
```

**Step 6: Final commit and push**

```bash
git add -A
git commit -m "feat: NM auto-ingest pipeline — sync, classify, train"
git push
```

---

## Success Criteria Checklist

- [ ] Host NM and Docker NM are syncing bidirectionally
- [ ] New PB records get classified with correct types (not all `fact`)
- [ ] Domain tags (`domain:frontend`, `domain:backend`, etc.) are inferred
- [ ] `nmem_recall "Docker companion lesson"` returns LESSONS.md insight from host
- [ ] CLAUDE.md and ROADMAP.md trained into NM with proper tags
- [ ] Conversation insights are extracted as separate typed memories
- [ ] Backfill re-encodes existing records with new classification

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Brain name mismatch blocks sync | Test in Task 2 Step 4, rename if needed |
| Encoding spam on updates | NM dedup handles it via content hashing |
| Companion offline when PB cron fires | Silent fail, retry next hour |
| Doc checksum file lost on restart | Re-encodes all docs (NM dedup prevents duplicates) |
