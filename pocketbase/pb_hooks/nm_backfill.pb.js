/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Neural Memory Backfill Endpoint
// POST /api/mytrend/nm-backfill?collection=activities&batch_size=50&offset=0
// Re-encodes existing records to NM in batches.
// NM handles dedup via content hashing (idempotent).
// Must inline encodeToNeuralMemory (Goja scope isolation).

routerAdd('POST', '/api/mytrend/nm-backfill', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Auth required' });

  var collection = (c.queryParam('collection') || '').trim();
  var batchSize = parseInt(c.queryParam('batch_size') || '50', 10);
  var offset = parseInt(c.queryParam('offset') || '0', 10);

  if (batchSize < 1) batchSize = 50;
  if (batchSize > 200) batchSize = 200;
  if (offset < 0) offset = 0;

  var validCollections = ['conversations', 'ideas', 'plans', 'activities', 'claude_tasks', 'projects', 'topics'];

  // If no collection specified, return status
  if (!collection) {
    var dao = $app.dao();
    var status = [];
    for (var vi = 0; vi < validCollections.length; vi++) {
      try {
        var recs = dao.findRecordsByFilter(validCollections[vi], '1=1', '', 0, 0);
        status.push({ collection: validCollections[vi], total: recs.length });
      } catch (e) {
        status.push({ collection: validCollections[vi], total: 0, error: String(e) });
      }
    }
    return c.json(200, { collections: status, message: 'Add ?collection=<name> to start backfill' });
  }

  // Validate collection
  var isValid = false;
  for (var vc = 0; vc < validCollections.length; vc++) {
    if (validCollections[vc] === collection) { isValid = true; break; }
  }
  if (!isValid) {
    return c.json(400, { error: 'Invalid collection. Valid: ' + validCollections.join(', ') });
  }

  // --- Inline encode function (Goja scope isolation) ---
  function _resolveProjectName(dao, projId) {
    if (!projId) return null;
    try {
      var proj = dao.findRecordById('projects', projId);
      return proj.getString('name') || null;
    } catch (e) { return null; }
  }

  function _encode(coll, record) {
    var nmUrl = $os.getenv('NM_URL') || 'http://neural-memory:8000';
    var endpoint = nmUrl + '/memory/encode';

    var content = '';
    var tags = [];
    var metadata = {
      collection: coll,
      record_id: record.getId(),
      user: record.getString('user'),
      type: 'fact',
    };
    var dao = $app.dao();

    if (coll === 'conversations') {
      var title = record.getString('title') || '';
      var summary = record.getString('summary') || '';
      var parts = [];
      if (title) parts.push('Title: ' + title);
      if (summary) parts.push('Summary: ' + summary);
      var messages = record.get('messages') || [];
      var mc = 0;
      for (var mi = 0; mi < messages.length && mc < 10; mi++) {
        var msg = messages[mi];
        if (msg && msg.role && msg.content) {
          var mt = msg.content.length > 500 ? msg.content.substring(0, 497) + '...' : msg.content;
          parts.push(msg.role + ': ' + mt);
          mc++;
        }
      }
      content = parts.join('\n');
      var rt = record.get('tags') || [];
      for (var rti = 0; rti < rt.length; rti++) tags.push(String(rt[rti]));
      tags.push('conversation');
      metadata.title = title;
      var pn = _resolveProjectName(dao, record.getString('project'));
      if (pn) { tags.push('project:' + pn); metadata.project_name = pn; content = 'Project: ' + pn + '\n' + content; }

    } else if (coll === 'ideas') {
      var it = record.getString('title') || '';
      var ic = record.getString('content') || '';
      content = 'Idea: ' + it;
      if (ic) content += '\n' + ic;
      var itags = record.get('tags') || [];
      for (var iti = 0; iti < itags.length; iti++) tags.push(String(itags[iti]));
      tags.push('idea');
      var itype = record.getString('type');
      if (itype) tags.push(itype);
      metadata.title = it;

    } else if (coll === 'plans') {
      var pt = record.getString('title') || '';
      var ptype = record.getString('plan_type') || '';
      var pstat = record.getString('status') || '';
      var pc = record.getString('content') || '';
      var pr = record.getString('reasoning') || '';
      var pa = record.getString('alternatives') || '';
      var pp = ['Plan: ' + pt];
      if (ptype) pp.push('Type: ' + ptype);
      if (pstat) pp.push('Status: ' + pstat);
      if (pc) pp.push(pc);
      if (pr) pp.push('Reasoning: ' + pr);
      if (pa) pp.push('Alternatives: ' + pa);
      content = pp.join('\n');
      var ptags = record.get('tags') || [];
      for (var pti = 0; pti < ptags.length; pti++) tags.push(String(ptags[pti]));
      tags.push('plan');
      if (ptype) tags.push(ptype);
      metadata.title = pt;
      metadata.plan_type = ptype;
      metadata.status = pstat;
      var ppn = _resolveProjectName(dao, record.getString('project'));
      if (ppn) { tags.push('project:' + ppn); metadata.project_name = ppn; }

    } else if (coll === 'activities') {
      var at = record.getString('type') || '';
      var aa = record.getString('action') || '';
      var am = record.get('metadata') || {};
      var ap = ['Activity [' + at + ']: ' + aa];
      if (am.repo) ap.push('Repo: ' + am.repo);
      if (am.commit_hash) ap.push('Commit: ' + String(am.commit_hash).substring(0, 12));
      if (am.pr_number) ap.push('PR #' + am.pr_number);
      if (am.issue_number) ap.push('Issue #' + am.issue_number);
      content = ap.join('\n');
      tags.push('activity');
      tags.push(at);
      if (am.source) tags.push('source:' + am.source);
      metadata.activity_type = at;
      var apn = _resolveProjectName(dao, record.getString('project'));
      if (apn) { tags.push('project:' + apn); metadata.project_name = apn; }

    } else if (coll === 'claude_tasks') {
      var ctc = record.getString('content') || '';
      var cts = record.getString('status') || '';
      var ctm = record.getString('model') || '';
      var ctst = record.getString('session_title') || '';
      var ctp = ['Claude Task: ' + ctc];
      if (cts) ctp.push('Status: ' + cts);
      if (ctm) ctp.push('Model: ' + ctm);
      if (ctst) ctp.push('Session: ' + ctst);
      content = ctp.join('\n');
      tags.push('claude-task');
      if (cts) tags.push('status:' + cts);
      if (ctm) tags.push('model:' + ctm);
      var ctdir = record.getString('project_dir') || '';
      if (ctdir) {
        var dirParts = ctdir.replace(/\\/g, '/').split('/');
        var dn = dirParts[dirParts.length - 1] || '';
        if (dn) tags.push('project:' + dn);
      }
      metadata.title = ctc;
      metadata.task_status = cts;
      metadata.model = ctm;

    } else if (coll === 'projects') {
      var pnv = record.getString('name') || '';
      var pd = record.getString('description') || '';
      var ps = record.getString('status') || '';
      var tst = record.get('tech_stack') || [];
      var dna = record.get('dna') || {};
      var prp = ['Project: ' + pnv];
      if (pd) prp.push(pd);
      if (ps) prp.push('Status: ' + ps);
      if (tst.length) prp.push('Tech stack: ' + tst.join(', '));
      if (dna.vision) prp.push('Vision: ' + dna.vision);
      if (dna.phase) prp.push('Phase: ' + dna.phase);
      if (dna.challenges && dna.challenges.length) prp.push('Challenges: ' + dna.challenges.join('; '));
      content = prp.join('\n');
      tags.push('project');
      tags.push('project:' + pnv);
      for (var tsi = 0; tsi < tst.length; tsi++) tags.push('tech:' + tst[tsi]);
      metadata.title = pnv;
      metadata.project_name = pnv;
      metadata.type = 'context';

    } else if (coll === 'topics') {
      var tn = record.getString('name') || '';
      var tc = record.getString('category') || '';
      var tm = record.getInt('mention_count') || 0;
      var tp = ['Topic: ' + tn];
      if (tc) tp.push('Category: ' + tc);
      tp.push('Mentions: ' + tm);
      content = tp.join('\n');
      tags.push('topic');
      if (tc) tags.push('category:' + tc);
      tags.push(tn);
      metadata.title = tn;
      metadata.category = tc;
      metadata.mention_count = tm;
    }

    if (!content || content.length < 10) return false;
    if (content.length > 50000) content = content.substring(0, 50000);

    var payload = {
      content: content,
      metadata: metadata,
      tags: tags,
    };

    var ts = record.getString('started_at') || record.getString('timestamp') || record.getString('created');
    if (ts) payload.timestamp = ts;

    var res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-ID': 'mytrend' },
      body: JSON.stringify(payload),
      timeout: 10,
    });

    return res.statusCode >= 200 && res.statusCode < 300;
  }
  // --- End inline encode ---

  try {
    var dao = $app.dao();
    var records = dao.findRecordsByFilter(collection, '1=1', 'created', batchSize, offset);

    var encoded = 0;
    var failed = 0;
    for (var ri = 0; ri < records.length; ri++) {
      try {
        if (_encode(collection, records[ri])) {
          encoded++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }

    // Check if more records exist
    var nextOffset = -1;
    if (records.length === batchSize) {
      nextOffset = offset + batchSize;
    }

    return c.json(200, {
      collection: collection,
      batch_size: batchSize,
      offset: offset,
      processed: records.length,
      encoded: encoded,
      failed: failed,
      next_offset: nextOffset,
    });
  } catch (e) {
    console.log('[NMBackfill] Error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

console.log('[NMBackfill] Registered: POST /api/mytrend/nm-backfill');
