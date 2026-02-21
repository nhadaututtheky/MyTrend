/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Conversation Auto-Sync
// PocketBase Goja JSVM: $os.readFile returns byte array, not string.
// Each routerAdd/cronAdd callback has isolated scope - no shared top-level vars.
// IMPORTANT: b2s() must decode UTF-8 multi-byte sequences (Vietnamese, CJK, emoji).

// ---------------------------------------------------------------------------
// GET /api/mytrend/sync-debug
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/sync-debug', (c) => {
  // UTF-8 byte-array to string decoder (inline - isolated scope)
  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) {
        cp = b; i++;
      } else if ((b & 0xE0) === 0xC0) {
        if (i + 1 >= len) break;
        cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2;
      } else if ((b & 0xF0) === 0xE0) {
        if (i + 2 >= len) break;
        cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3;
      } else if ((b & 0xF8) === 0xF0) {
        if (i + 3 >= len) break;
        cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4;
      } else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  var raw = $os.readFile('/pb/import/claude/history.jsonl');
  var result = b2s(raw);
  var lines = result.split('\n');
  var firstParsed = null;
  for (var k = 0; k < lines.length; k++) {
    if (lines[k].trim()) {
      try { firstParsed = JSON.parse(lines[k]); break; } catch(e) {}
    }
  }
  return c.json(200, {
    rawLen: raw.length, strLen: result.length, lineCount: lines.length,
    firstParsed: firstParsed,
    sampleUtf8: result.substring(0, 500),
  });
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/sync-status
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/sync-status', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var dao = $app.dao();
  var status = { projects: [], total_sessions: 0, already_imported: 0, pending: 0 };

  try {
    var projectDirs = $os.readDir('/pb/import/claude/projects');
    for (var p = 0; p < projectDirs.length; p++) {
      if (!projectDirs[p].isDir()) continue;
      var projName = projectDirs[p].name();
      var projPath = '/pb/import/claude/projects/' + projName;
      var files;
      try { files = $os.readDir(projPath); } catch (e) { continue; }
      var sessionCount = 0, importedCount = 0;
      for (var f = 0; f < files.length; f++) {
        if (files[f].isDir() || !files[f].name().endsWith('.jsonl')) continue;
        sessionCount++;
        var sid = files[f].name().replace('.jsonl', '');
        try { dao.findFirstRecordByFilter('conversations', 'session_id = {:sid}', { sid: sid }); importedCount++; } catch (e) {}
      }
      var parts = projName.split('-');
      status.projects.push({
        name: parts[parts.length - 1] || projName, path: projName,
        total: sessionCount, imported: importedCount, pending: sessionCount - importedCount,
      });
      status.total_sessions += sessionCount;
      status.already_imported += importedCount;
    }
    status.pending = status.total_sessions - status.already_imported;
  } catch (e) {
    return c.json(500, { error: 'Cannot read Claude data: ' + e });
  }
  return c.json(200, status);
});

// ---------------------------------------------------------------------------
// POST /api/mytrend/sync-claude
// Supports ?force=true to re-import (delete + re-create) existing records
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/sync-claude', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var forceReimport = c.queryParam('force') === 'true';
  console.log('[ClaudeSync] Sync triggered by: ' + userId + (forceReimport ? ' (FORCE re-import)' : ''));

  // UTF-8 byte-array to string decoder (inline - isolated scope)
  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) {
        cp = b; i++;
      } else if ((b & 0xE0) === 0xC0) {
        if (i + 1 >= len) break;
        cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2;
      } else if ((b & 0xF0) === 0xE0) {
        if (i + 2 >= len) break;
        cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3;
      } else if ((b & 0xF8) === 0xF0) {
        if (i + 3 >= len) break;
        cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4;
      } else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  var dao = $app.dao();
  var result = { projects_scanned: 0, projects_created: 0, sessions_found: 0, imported: 0, skipped: 0, updated: 0, errors: [] };

  // Auto-create project from directory name and return project ID
  function ensureProject(dirName) {
    // Skip worktree directories - they are not real projects
    if (dirName.indexOf('worktrees') >= 0 || dirName.indexOf('worktree') >= 0) return null;

    // Parse: "C--Users-X-Desktop-Future-MyTrend" -> "MyTrend"
    var parts = dirName.split('-');
    var projectName = parts[parts.length - 1] || dirName;
    if (!projectName || projectName.length < 2) return null;

    var slug = projectName.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return null;

    // Check existing
    try {
      var existing = dao.findFirstRecordByFilter(
        'projects',
        'user = {:uid} && slug = {:slug}',
        { uid: userId, slug: slug }
      );
      return existing.getId();
    } catch (e) { /* not found, create */ }

    try {
      var projCol = dao.findCollectionByNameOrId('projects');
      var projRec = new Record(projCol);
      projRec.set('user', userId);
      projRec.set('name', projectName);
      projRec.set('slug', slug);
      projRec.set('description', 'Auto-created from Claude Code project: ' + dirName);
      projRec.set('color', '#4ECDC4');
      projRec.set('icon', '');
      projRec.set('status', 'active');
      projRec.set('total_conversations', 0);
      projRec.set('total_ideas', 0);
      projRec.set('total_minutes', 0);
      projRec.set('last_activity', new Date().toISOString());
      projRec.set('dna', JSON.stringify({}));
      dao.saveRecord(projRec);
      result.projects_created++;
      console.log('[ClaudeSync] Auto-created project: ' + projectName);
      return projRec.getId();
    } catch (err) {
      console.log('[ClaudeSync] Project create error: ' + err);
      return null;
    }
  }

  // Update project metrics after all conversations are synced
  function updateProjectMetrics(projectId) {
    if (!projectId) return;
    try {
      var convs = dao.findRecordsByFilter(
        'conversations',
        'user = {:uid} && project = {:pid}',
        '', 0, 0,
        { uid: userId, pid: projectId }
      );
      var totalConvs = convs.length;
      var totalMins = 0;
      var lastActivity = '';
      for (var mc = 0; mc < convs.length; mc++) {
        totalMins += convs[mc].getInt('duration_min') || 0;
        var sa = convs[mc].getString('started_at') || convs[mc].getString('created');
        if (sa > lastActivity) lastActivity = sa;
      }
      var projRec2 = dao.findRecordById('projects', projectId);
      projRec2.set('total_conversations', totalConvs);
      projRec2.set('total_minutes', totalMins);
      if (lastActivity) projRec2.set('last_activity', lastActivity);
      dao.saveRecord(projRec2);
    } catch (e) { /* skip */ }
  }

  try {
    var collection = dao.findCollectionByNameOrId('conversations');

    // Build history index for titles
    var historyIndex = {};
    try {
      var histStr = b2s($os.readFile('/pb/import/claude/history.jsonl'));
      var histLines = histStr.split('\n');
      for (var h = 0; h < histLines.length; h++) {
        var hl = histLines[h].trim();
        if (!hl) continue;
        try {
          var hobj = JSON.parse(hl);
          if (hobj.sessionId && !historyIndex[hobj.sessionId]) {
            historyIndex[hobj.sessionId] = hobj.display || '';
          }
        } catch (e) { continue; }
      }
    } catch (e) {
      console.log('[ClaudeSync] Cannot read history: ' + e);
    }
    console.log('[ClaudeSync] History: ' + Object.keys(historyIndex).length + ' entries');

    // Scan projects
    var projectDirs = $os.readDir('/pb/import/claude/projects');
    for (var p = 0; p < projectDirs.length; p++) {
      if (!projectDirs[p].isDir()) continue;
      var projName = projectDirs[p].name();
      var projPath = '/pb/import/claude/projects/' + projName;
      var parts = projName.split('-');
      var tag = parts[parts.length - 1] || projName;
      result.projects_scanned++;

      // Auto-create project from directory name
      var projectId = ensureProject(projName);

      var files;
      try { files = $os.readDir(projPath); } catch (e) { continue; }

      for (var f = 0; f < files.length; f++) {
        if (files[f].isDir() || !files[f].name().endsWith('.jsonl')) continue;
        result.sessions_found++;
        var sessionId = files[f].name().replace('.jsonl', '');

        // Dedup check
        var existingRecord = null;
        try { existingRecord = dao.findFirstRecordByFilter('conversations', 'session_id = {:sid}', { sid: sessionId }); } catch (e) {}

        if (existingRecord && !forceReimport) {
          result.skipped++;
          continue;
        }

        // Parse JSONL
        var fileStr;
        try { fileStr = b2s($os.readFile(projPath + '/' + files[f].name())); } catch (e) { result.errors.push(sessionId + ': read error'); continue; }

        var lines = fileStr.split('\n');
        var messages = [];
        var totalTokens = 0;
        var startedAt = null;
        var endedAt = null;

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line) continue;
          var obj;
          try { obj = JSON.parse(line); } catch (e) { continue; }
          if (!obj.type) continue;
          var ts = obj.timestamp;
          if (ts) { if (!startedAt) startedAt = ts; endedAt = ts; }
          if (obj.type !== 'user' && obj.type !== 'assistant') continue;
          var msg = obj.message;
          if (!msg || !msg.role) continue;

          // Extract text
          var text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            var tp = [];
            for (var t = 0; t < msg.content.length; t++) {
              if (msg.content[t] && msg.content[t].type === 'text' && msg.content[t].text) {
                tp.push(msg.content[t].text);
              }
            }
            text = tp.join('\n');
          }
          if (!text || text.length < 2) continue;

          // Tokens
          var mTok = 0;
          if (obj.type === 'assistant' && msg.usage) {
            mTok = msg.usage.output_tokens || 0;
            totalTokens += (msg.usage.input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + mTok;
          }
          messages.push({ role: msg.role, content: text, timestamp: ts || new Date().toISOString(), tokens: mTok || Math.round(text.length / 4) });
        }

        if (messages.length < 2) { result.skipped++; continue; }

        // Title
        var firstUserText = '';
        for (var m = 0; m < messages.length; m++) { if (messages[m].role === 'user') { firstUserText = messages[m].content; break; } }
        var displayText = historyIndex[sessionId] || firstUserText || 'Untitled Session';
        var title = displayText.replace(/[#*`_~]/g, '').replace(/\s+/g, ' ').trim();
        if (title.length > 200) title = title.substring(0, 197) + '...';
        if (!title) title = 'Untitled Session';

        // Duration
        var durMin = 0;
        if (startedAt && endedAt) {
          try { var s = new Date(startedAt).getTime(), e2 = new Date(endedAt).getTime(); if (!isNaN(s) && !isNaN(e2)) durMin = Math.round((e2 - s) / 60000); } catch (e) {}
        }

        // Detect source from project path
        var source = 'cli';
        var pathDepth = projName.split('-').length;
        if (projName.match(/^C--Users-[^-]+$/) || pathDepth <= 3) {
          source = 'desktop';
        }

        // Save or Update
        try {
          var record;
          if (existingRecord && forceReimport) {
            record = existingRecord;
            result.updated++;
          } else {
            record = new Record(collection);
            result.imported++;
          }
          record.set('user', userId);
          record.set('title', title);
          record.set('source', source);
          record.set('session_id', sessionId);
          record.set('device_name', $os.getenv('HOSTNAME') || 'docker');
          record.set('messages', messages);
          record.set('message_count', messages.length);
          record.set('total_tokens', totalTokens);
          record.set('started_at', startedAt || new Date().toISOString());
          record.set('ended_at', endedAt || '');
          record.set('duration_min', durMin);
          record.set('topics', []);
          record.set('tags', [tag, 'claude-' + source]);
          if (projectId) record.set('project', projectId);
          if (firstUserText) {
            record.set('summary', firstUserText.length > 500 ? firstUserText.substring(0, 497) + '...' : firstUserText);
          }
          dao.saveRecord(record);
          console.log('[ClaudeSync] ' + (existingRecord ? 'Updated' : 'Imported') + ': ' + sessionId + ' (' + messages.length + ' msgs)');
        } catch (err) {
          var es = String(err);
          if (es.indexOf('UNIQUE') >= 0 || es.indexOf('duplicate') >= 0) { result.skipped++; }
          else { result.errors.push(sessionId + ': ' + es.substring(0, 150)); }
        }
      }
    }
    // Update project metrics for all auto-created projects
    try {
      var allProjects = dao.findRecordsByFilter('projects', 'user = {:uid}', '', 0, 0, { uid: userId });
      for (var mp = 0; mp < allProjects.length; mp++) {
        updateProjectMetrics(allProjects[mp].getId());
      }
    } catch (e) { /* skip */ }

    console.log('[ClaudeSync] Done. Imported: ' + result.imported + ', Updated: ' + result.updated + ', Projects: ' + result.projects_created + ', Skipped: ' + result.skipped);
  } catch (fatal) {
    console.log('[ClaudeSync] FATAL: ' + fatal);
    result.errors.push('Fatal: ' + String(fatal));
  }

  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// POST /api/mytrend/recalculate-metrics
// Recalculate total_conversations, total_minutes, total_ideas for all projects.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/recalculate-metrics', (c) => {
  var authRecord = c.get('authRecord');
  var admin = c.get('admin');
  if (!authRecord && !admin) return c.json(401, { error: 'Authentication required' });

  var userId = '';
  if (authRecord) {
    userId = authRecord.getId();
  } else {
    var qUserId = c.queryParam('userId');
    if (qUserId) {
      userId = qUserId;
    } else {
      try {
        var users = $app.dao().findRecordsByFilter('users', '1=1', '', 1, 0);
        if (users && users.length > 0) userId = users[0].getId();
      } catch (e) { return c.json(500, { error: 'Cannot find user' }); }
    }
  }
  if (!userId) return c.json(400, { error: 'No user found' });
  var dao = $app.dao();
  var updates = [];

  try {
    var projects = dao.findRecordsByFilter('projects', 'user = {:uid}', '', 0, 0, { uid: userId });
    for (var i = 0; i < projects.length; i++) {
      var pid = projects[i].getId();
      var pname = projects[i].getString('name');

      // Count conversations
      var convCount = 0;
      var totalMins = 0;
      var lastActivity = '';
      try {
        var convs = dao.findRecordsByFilter(
          'conversations',
          'user = {:uid} && project = {:pid}',
          '', 0, 0,
          { uid: userId, pid: pid }
        );
        convCount = convs.length;
        for (var j = 0; j < convs.length; j++) {
          totalMins += convs[j].getInt('duration_min') || 0;
          var sa = convs[j].getString('started_at') || convs[j].getString('created');
          if (sa > lastActivity) lastActivity = sa;
        }
      } catch (e) { /* */ }

      // Count ideas
      var ideaCount = 0;
      try {
        var ideas = dao.findRecordsByFilter(
          'ideas',
          'user = {:uid} && project = {:pid}',
          '', 0, 0,
          { uid: userId, pid: pid }
        );
        ideaCount = ideas.length;
      } catch (e) { /* */ }

      // Update project
      var old = {
        convos: projects[i].getInt('total_conversations'),
        ideas: projects[i].getInt('total_ideas'),
        mins: projects[i].getInt('total_minutes'),
      };

      projects[i].set('total_conversations', convCount);
      projects[i].set('total_ideas', ideaCount);
      projects[i].set('total_minutes', totalMins);
      if (lastActivity) projects[i].set('last_activity', lastActivity);
      dao.saveRecord(projects[i]);

      updates.push({
        name: pname,
        conversations: { old: old.convos, new: convCount },
        ideas: { old: old.ideas, new: ideaCount },
        minutes: { old: old.mins, new: totalMins },
      });
    }
  } catch (e) {
    return c.json(500, { error: 'Recalculate failed: ' + e });
  }

  console.log('[ClaudeSync] Metrics recalculated for ' + updates.length + ' projects');
  return c.json(200, { projects: updates });
});

// ---------------------------------------------------------------------------
// Cron: Auto-sync every 30 minutes
// ---------------------------------------------------------------------------
try {
  cronAdd('claude_auto_sync', '*/30 * * * *', function() {
    console.log('[ClaudeSync] Cron triggered');

    // UTF-8 byte-array to string decoder (inline - isolated scope)
    function b2s(raw) {
      var s = '';
      var buf = [];
      var i = 0;
      var len = raw.length;
      while (i < len) {
        var b = raw[i];
        var cp;
        if (b < 0x80) {
          cp = b; i++;
        } else if ((b & 0xE0) === 0xC0) {
          if (i + 1 >= len) break;
          cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2;
        } else if ((b & 0xF0) === 0xE0) {
          if (i + 2 >= len) break;
          cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3;
        } else if ((b & 0xF8) === 0xF0) {
          if (i + 3 >= len) break;
          cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4;
        } else { i++; continue; }
        if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
        if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
      }
      if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
      return s;
    }

    var dao = $app.dao();
    var uid = $os.getenv('MYTREND_SYNC_USER_ID') || null;
    if (!uid) { try { var u = dao.findRecordsByFilter('users', '1=1', '', 1, 0); if (u && u.length > 0) uid = u[0].getId(); } catch(e){} }
    if (!uid) { console.log('[ClaudeSync] Cron: no user'); return; }
    var col;
    try { col = dao.findCollectionByNameOrId('conversations'); } catch(e) { return; }

    var hist = {};
    try {
      var hs = b2s($os.readFile('/pb/import/claude/history.jsonl'));
      var hl = hs.split('\n');
      for (var h = 0; h < hl.length; h++) {
        if (!hl[h].trim()) continue;
        try { var ho = JSON.parse(hl[h]); if (ho.sessionId && !hist[ho.sessionId]) hist[ho.sessionId] = ho.display || ''; } catch(e) {}
      }
    } catch(e) {}

    // Auto-create project in cron scope
    function cronEnsureProject(dirName) {
      // Skip worktree directories - they are not real projects
      if (dirName.indexOf('worktrees') >= 0 || dirName.indexOf('worktree') >= 0) return null;

      var cparts = dirName.split('-');
      var cname = cparts[cparts.length - 1] || dirName;
      if (!cname || cname.length < 2) return null;
      var cslug = cname.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!cslug) return null;
      try { var ex = dao.findFirstRecordByFilter('projects', 'user = {:uid} && slug = {:slug}', { uid: uid, slug: cslug }); return ex.getId(); } catch (e) {}
      try {
        var pc = dao.findCollectionByNameOrId('projects');
        var pr = new Record(pc);
        pr.set('user', uid); pr.set('name', cname); pr.set('slug', cslug);
        pr.set('description', 'Auto-created from Claude Code'); pr.set('color', '#4ECDC4');
        pr.set('status', 'active'); pr.set('total_conversations', 0);
        pr.set('total_ideas', 0); pr.set('total_minutes', 0);
        pr.set('last_activity', new Date().toISOString()); pr.set('dna', JSON.stringify({}));
        dao.saveRecord(pr); console.log('[ClaudeSync] Cron: auto-created project: ' + cname);
        return pr.getId();
      } catch (err) { return null; }
    }

    var imp = 0;
    try {
      var pds = $os.readDir('/pb/import/claude/projects');
      for (var p = 0; p < pds.length; p++) {
        if (!pds[p].isDir()) continue;
        var pp = '/pb/import/claude/projects/' + pds[p].name();
        var pts = pds[p].name().split('-');
        var tg = pts[pts.length - 1] || pds[p].name();
        var cronProjId = cronEnsureProject(pds[p].name());
        var fs;
        try { fs = $os.readDir(pp); } catch(e) { continue; }
        for (var f = 0; f < fs.length; f++) {
          if (fs[f].isDir() || !fs[f].name().endsWith('.jsonl')) continue;
          var sid = fs[f].name().replace('.jsonl', '');
          try { dao.findFirstRecordByFilter('conversations', 'session_id={:sid}', {sid:sid}); continue; } catch(e) {}
          try {
            var fc = b2s($os.readFile(pp + '/' + fs[f].name()));
            var ls = fc.split('\n');
            var ms = [], tt = 0, sa = null, ea = null;
            for (var i = 0; i < ls.length; i++) {
              var l = ls[i].trim();
              if (!l) continue;
              var o;
              try { o = JSON.parse(l); } catch(e) { continue; }
              if (!o.type) continue;
              if (o.timestamp) { if (!sa) sa = o.timestamp; ea = o.timestamp; }
              if (o.type !== 'user' && o.type !== 'assistant') continue;
              var mg = o.message;
              if (!mg || !mg.role) continue;
              var tx = '';
              if (typeof mg.content === 'string') tx = mg.content;
              else if (Array.isArray(mg.content)) {
                var tp2 = [];
                for (var t = 0; t < mg.content.length; t++) {
                  if (mg.content[t] && mg.content[t].type === 'text' && mg.content[t].text) tp2.push(mg.content[t].text);
                }
                tx = tp2.join('\n');
              }
              if (!tx || tx.length < 2) continue;
              var mt = 0;
              if (o.type === 'assistant' && mg.usage) {
                mt = mg.usage.output_tokens || 0;
                tt += (mg.usage.input_tokens || 0) + (mg.usage.cache_creation_input_tokens || 0) + (mg.usage.cache_read_input_tokens || 0) + mt;
              }
              ms.push({role: mg.role, content: tx, timestamp: o.timestamp || new Date().toISOString(), tokens: mt || Math.round(tx.length / 4)});
            }
            if (ms.length < 2) continue;
            var fut = '';
            for (var m = 0; m < ms.length; m++) { if (ms[m].role === 'user') { fut = ms[m].content; break; } }
            var dt = hist[sid] || fut || 'Untitled';
            var ti = dt.replace(/[#*`_~]/g, '').replace(/\s+/g, ' ').trim();
            if (ti.length > 200) ti = ti.substring(0, 197) + '...';
            if (!ti) ti = 'Untitled';
            var src = 'cli';
            var pn = pds[p].name();
            if (pn.match(/^C--Users-[^-]+$/) || pn.split('-').length <= 3) src = 'desktop';
            var r = new Record(col);
            r.set('user', uid); r.set('title', ti); r.set('source', src); r.set('session_id', sid);
            r.set('device_name', $os.getenv('HOSTNAME') || 'docker');
            r.set('messages', ms); r.set('message_count', ms.length); r.set('total_tokens', tt);
            r.set('started_at', sa || new Date().toISOString()); r.set('ended_at', ea || '');
            r.set('topics', []); r.set('tags', [tg, 'claude-' + src]);
            if (cronProjId) r.set('project', cronProjId);
            if (fut) r.set('summary', fut.length > 500 ? fut.substring(0, 497) + '...' : fut);
            dao.saveRecord(r); imp++;
            console.log('[ClaudeSync] Cron imported: ' + sid);
          } catch(err) {}
        }
      }
    } catch(e) { console.log('[ClaudeSync] Cron error: ' + e); }
    console.log('[ClaudeSync] Cron done. Imported: ' + imp);
  });
  console.log('[ClaudeSync] Cron registered: */30 * * * *');
} catch (e) {
  console.log('[ClaudeSync] cronAdd not available: ' + e);
}
