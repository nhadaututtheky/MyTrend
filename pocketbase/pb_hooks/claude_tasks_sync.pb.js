/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Code Tasks Sync
// Reads ~/.claude/todos/{sessionId}-agent-{agentId}.json files
// and JSONL session files for token/model data.
// Volume mount: C:/Users/X/.claude:/pb/import/claude:ro
//
// Each routerAdd/cronAdd callback has isolated scope - inline all helpers.

// ---------------------------------------------------------------------------
// POST /api/mytrend/sync-tasks
// Manual trigger to scan and sync Claude Code todo files
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/sync-tasks', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  console.log('[TasksSync] Manual sync triggered by: ' + userId);

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

  // Simple hash for dedup: length|first100|last100
  function fileHash(content) {
    var f = content.length < 100 ? content : content.substring(0, 100);
    var l = content.length < 100 ? '' : content.substring(content.length - 100);
    return content.length + '|' + f + '|' + l;
  }

  // Parse JSONL session file for token/model data
  function parseSessionJsonl(todosDir, sessionId) {
    var result = {
      model: '',
      project_dir: '',
      session_title: '',
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      started_at: '',
      ended_at: '',
    };

    // Try to find JSONL in /pb/import/claude/projects/*/sessionId.jsonl
    var projectsDir = '/pb/import/claude/projects';
    try {
      var projDirs = $os.readDir(projectsDir);
      for (var pd = 0; pd < projDirs.length; pd++) {
        if (!projDirs[pd].isDir()) continue;
        var projectDirName = projDirs[pd].name();
        var jsonlPath = projectsDir + '/' + projectDirName + '/' + sessionId + '.jsonl';
        var raw;
        try { raw = b2s($os.readFile(jsonlPath)); } catch(e) { continue; }
        if (!raw) continue;

        // Store project dir (decode from folder name: encoded path)
        result.project_dir = projectDirName.replace(/-[A-Za-z0-9_]+$/, '').replace(/-/g, '/');

        var lines = raw.split('\n');
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          if (!line) continue;
          var entry;
          try { entry = JSON.parse(line); } catch(e) { continue; }

          // Extract model
          if (!result.model && entry.message && entry.message.model) {
            result.model = entry.message.model;
          }

          // Extract timestamps
          if (entry.timestamp) {
            if (!result.started_at) result.started_at = entry.timestamp;
            result.ended_at = entry.timestamp;
          }

          // Extract session title from first human message
          if (!result.session_title && entry.message && entry.message.role === 'user') {
            var content = entry.message.content;
            if (typeof content === 'string') {
              result.session_title = content.substring(0, 200);
            } else if (Array.isArray(content)) {
              for (var ci = 0; ci < content.length; ci++) {
                if (content[ci].type === 'text') {
                  result.session_title = String(content[ci].text || '').substring(0, 200);
                  break;
                }
              }
            }
          }

          // Accumulate tokens from usage
          if (entry.message && entry.message.usage) {
            var usage = entry.message.usage;
            result.input_tokens += (usage.input_tokens || 0);
            result.output_tokens += (usage.output_tokens || 0);
            result.cache_read_tokens += (usage.cache_read_input_tokens || 0);
            result.cache_create_tokens += (usage.cache_creation_input_tokens || 0);
          }
        }
        break; // Found the JSONL
      }
    } catch(e) {
      console.log('[TasksSync] JSONL parse error for ' + sessionId + ': ' + e);
    }

    return result;
  }

  // Send Telegram notification (inline, best-effort)
  function sendTelegramNotify(text) {
    var botToken = $os.getenv('TELEGRAM_BOT_TOKEN');
    var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID');
    if (!botToken || !channelId) return;
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: channelId, text: text, parse_mode: 'Markdown' }),
        timeout: 10,
      });
    } catch(e) { /* non-fatal */ }
  }

  var dao = $app.dao();
  var todosDir = '/pb/import/claude/todos';
  var result = { files_scanned: 0, tasks_synced: 0, tasks_updated: 0, skipped: 0, errors: [] };

  try {
    var files = $os.readDir(todosDir);

    for (var fi = 0; fi < files.length; fi++) {
      if (files[fi].isDir()) continue;
      var fname = files[fi].name();
      if (fname.indexOf('.json') < 0) continue;
      result.files_scanned++;

      // Parse filename: {sessionId}-agent-{agentId}.json
      var baseName = fname.replace('.json', '');
      var parts = baseName.split('-agent-');
      if (parts.length < 2) {
        result.errors.push(fname + ': unexpected filename format');
        continue;
      }
      var sessionId = parts[0];
      var agentId = parts.slice(1).join('-agent-');

      // Read file content
      var rawContent;
      try {
        rawContent = b2s($os.readFile(todosDir + '/' + fname));
      } catch(e) {
        result.errors.push(fname + ': read error - ' + e);
        continue;
      }

      if (!rawContent || rawContent.trim().length < 2) {
        result.skipped++;
        continue;
      }

      // Parse JSON tasks array
      var tasks;
      try {
        tasks = JSON.parse(rawContent);
      } catch(e) {
        result.errors.push(fname + ': JSON parse error - ' + e);
        continue;
      }

      if (!Array.isArray(tasks) || tasks.length === 0) {
        result.skipped++;
        continue;
      }

      // Compute hash for change detection
      var hash = fileHash(rawContent);

      // Check if any task in this file has changed by looking at file_hash
      var anyChanged = false;
      for (var ti = 0; ti < tasks.length; ti++) {
        var existingTask = null;
        try {
          existingTask = dao.findFirstRecordByFilter(
            'claude_tasks',
            'session_id = {:sid} && agent_id = {:aid} && task_index = {:idx}',
            { sid: sessionId, aid: agentId, idx: ti }
          );
        } catch(e) {}

        if (!existingTask) { anyChanged = true; break; }
        if (existingTask.getString('file_hash') !== hash) { anyChanged = true; break; }
      }

      if (!anyChanged) {
        result.skipped++;
        continue;
      }

      // Load JSONL session data (token/model info)
      var sessionData = parseSessionJsonl(todosDir, sessionId);

      // Upsert each task
      var col = dao.findCollectionByNameOrId('claude_tasks');
      var prevStatuses = {}; // track status changes for notifications

      for (var tj = 0; tj < tasks.length; tj++) {
        var task = tasks[tj];
        if (!task || !task.content) continue;

        var taskStatus = task.status || 'pending';
        var taskContent = String(task.content || '').substring(0, 2000);
        var taskActiveForm = String(task.activeForm || '').substring(0, 2000);

        var existing = null;
        try {
          existing = dao.findFirstRecordByFilter(
            'claude_tasks',
            'session_id = {:sid} && agent_id = {:aid} && task_index = {:idx}',
            { sid: sessionId, aid: agentId, idx: tj }
          );
        } catch(e) {}

        var oldStatus = existing ? existing.getString('status') : '';
        prevStatuses[tj] = oldStatus;

        try {
          var rec = existing || new Record(col);
          rec.set('user', userId);
          rec.set('session_id', sessionId);
          rec.set('agent_id', agentId);
          rec.set('content', taskContent);
          rec.set('active_form', taskActiveForm);
          rec.set('status', taskStatus);
          rec.set('task_index', tj);
          rec.set('model', sessionData.model);
          rec.set('project_dir', sessionData.project_dir);
          rec.set('session_title', sessionData.session_title.substring(0, 500));
          rec.set('input_tokens', sessionData.input_tokens);
          rec.set('output_tokens', sessionData.output_tokens);
          rec.set('cache_read_tokens', sessionData.cache_read_tokens);
          rec.set('cache_create_tokens', sessionData.cache_create_tokens);
          rec.set('started_at', sessionData.started_at);
          rec.set('ended_at', sessionData.ended_at);
          rec.set('file_hash', hash);
          rec.set('source_file', fname);
          dao.saveRecord(rec);

          if (existing) { result.tasks_updated++; } else { result.tasks_synced++; }
        } catch(err) {
          var es = String(err);
          if (es.indexOf('UNIQUE') < 0) {
            result.errors.push(fname + '[' + tj + ']: ' + es.substring(0, 150));
          }
        }
      }

      // Telegram notification: task started (status -> in_progress)
      for (var tn = 0; tn < tasks.length; tn++) {
        var task = tasks[tn];
        if (!task) continue;
        if (prevStatuses[tn] !== 'in_progress' && task.status === 'in_progress') {
          var notifyText = '*Task Started*\n';
          notifyText += '`' + String(task.activeForm || task.content || '').substring(0, 100) + '`\n';
          if (sessionData.model) notifyText += 'Model: ' + sessionData.model + '\n';
          if (sessionData.session_title) notifyText += 'Session: ' + sessionData.session_title.substring(0, 80);
          sendTelegramNotify(notifyText);
        }
      }

      // Telegram notification: session complete (all tasks done)
      var allDone = true;
      for (var tc = 0; tc < tasks.length; tc++) {
        if (!tasks[tc] || tasks[tc].status !== 'completed') { allDone = false; break; }
      }
      var anyWasNotDone = false;
      for (var tp = 0; tp < Object.keys(prevStatuses).length; tp++) {
        if (prevStatuses[tp] !== 'completed') { anyWasNotDone = true; break; }
      }
      if (allDone && anyWasNotDone && tasks.length > 0) {
        var doneText = '*Session Complete*\n';
        var projName = sessionData.project_dir ? sessionData.project_dir.split('/').pop() : 'Unknown';
        doneText += 'Project: `' + projName + '`\n';
        doneText += tasks.length + ' tasks completed\n';
        if (sessionData.model) doneText += 'Model: ' + sessionData.model;
        sendTelegramNotify(doneText);
      }
    }
  } catch(e) {
    console.log('[TasksSync] Error reading todos dir: ' + e);
    result.errors.push('Cannot read ' + todosDir + ': ' + e);
  }

  console.log('[TasksSync] Done. Synced: ' + result.tasks_synced + ', Updated: ' + result.tasks_updated + ', Skipped: ' + result.skipped);
  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/sync-tasks/status
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/sync-tasks/status', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var dao = $app.dao();
  var todosDir = '/pb/import/claude/todos';
  var totalFiles = 0;

  try {
    var files = $os.readDir(todosDir);
    for (var i = 0; i < files.length; i++) {
      if (!files[i].isDir() && files[i].name().indexOf('.json') >= 0) totalFiles++;
    }
  } catch(e) {}

  var totalTasks = 0;
  var activeSessions = 0;
  var lastSync = '';

  try {
    // Count total tasks
    var taskRecords = dao.findRecordsByFilter('claude_tasks', 'user = {:uid}', '-updated', 1, 0, { uid: authRecord.getId() });
    if (taskRecords && taskRecords.length > 0) {
      lastSync = taskRecords[0].getString('updated');
    }

    // Get counts via separate queries
    var allTasks = dao.findRecordsByFilter('claude_tasks', 'user = {:uid}', '', 0, 0, { uid: authRecord.getId() });
    totalTasks = allTasks ? allTasks.length : 0;

    // Count distinct active sessions (has in_progress tasks)
    var activeTasks = dao.findRecordsByFilter('claude_tasks', 'user = {:uid} && status = "in_progress"', '', 0, 0, { uid: authRecord.getId() });
    var activeSessionIds = {};
    if (activeTasks) {
      for (var at = 0; at < activeTasks.length; at++) {
        activeSessionIds[activeTasks[at].getString('session_id')] = true;
      }
    }
    activeSessions = Object.keys(activeSessionIds).length;
  } catch(e) {
    console.log('[TasksSync] Status query error: ' + e);
  }

  return c.json(200, {
    last_sync: lastSync,
    total_files: totalFiles,
    total_tasks: totalTasks,
    active_sessions: activeSessions,
  });
});

// ---------------------------------------------------------------------------
// Cron: Auto-sync tasks every 5 minutes
// ---------------------------------------------------------------------------
try {
  cronAdd('claude_tasks_sync', '*/5 * * * *', function() {
    console.log('[TasksSync] Cron triggered');

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

    function fileHash(content) {
      var f = content.length < 100 ? content : content.substring(0, 100);
      var l = content.length < 100 ? '' : content.substring(content.length - 100);
      return content.length + '|' + f + '|' + l;
    }

    function parseSessionJsonl(sessionId) {
      var result = { model: '', project_dir: '', session_title: '', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_create_tokens: 0, started_at: '', ended_at: '' };
      var projectsDir = '/pb/import/claude/projects';
      try {
        var projDirs = $os.readDir(projectsDir);
        for (var pd = 0; pd < projDirs.length; pd++) {
          if (!projDirs[pd].isDir()) continue;
          var jsonlPath = projectsDir + '/' + projDirs[pd].name() + '/' + sessionId + '.jsonl';
          var raw;
          try { raw = b2s($os.readFile(jsonlPath)); } catch(e) { continue; }
          if (!raw) continue;
          result.project_dir = projDirs[pd].name();
          var lines = raw.split('\n');
          for (var li = 0; li < lines.length; li++) {
            var line = lines[li].trim();
            if (!line) continue;
            var entry;
            try { entry = JSON.parse(line); } catch(e) { continue; }
            if (!result.model && entry.message && entry.message.model) result.model = entry.message.model;
            if (entry.timestamp) { if (!result.started_at) result.started_at = entry.timestamp; result.ended_at = entry.timestamp; }
            if (!result.session_title && entry.message && entry.message.role === 'user') {
              var content = entry.message.content;
              if (typeof content === 'string') { result.session_title = content.substring(0, 200); }
              else if (Array.isArray(content)) { for (var ci = 0; ci < content.length; ci++) { if (content[ci].type === 'text') { result.session_title = String(content[ci].text || '').substring(0, 200); break; } } }
            }
            if (entry.message && entry.message.usage) {
              var u = entry.message.usage;
              result.input_tokens += (u.input_tokens || 0);
              result.output_tokens += (u.output_tokens || 0);
              result.cache_read_tokens += (u.cache_read_input_tokens || 0);
              result.cache_create_tokens += (u.cache_creation_input_tokens || 0);
            }
          }
          break;
        }
      } catch(e) {}
      return result;
    }

    function sendTelegramNotify(text) {
      var botToken = $os.getenv('TELEGRAM_BOT_TOKEN');
      var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID');
      if (!botToken || !channelId) return;
      try { $http.send({ url: 'https://api.telegram.org/bot' + botToken + '/sendMessage', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: channelId, text: text, parse_mode: 'Markdown' }), timeout: 10 }); } catch(e) {}
    }

    var dao = $app.dao();
    var uid = $os.getenv('MYTREND_SYNC_USER_ID') || null;
    if (!uid) { try { var u = dao.findRecordsByFilter('users', '1=1', '', 1, 0); if (u && u.length > 0) uid = u[0].getId(); } catch(e) {} }
    if (!uid) { console.log('[TasksSync] Cron: no user found'); return; }

    var todosDir = '/pb/import/claude/todos';
    var synced = 0;

    try {
      var files = $os.readDir(todosDir);
      for (var fi = 0; fi < files.length; fi++) {
        if (files[fi].isDir()) continue;
        var fname = files[fi].name();
        if (fname.indexOf('.json') < 0) continue;

        var baseName = fname.replace('.json', '');
        var parts = baseName.split('-agent-');
        if (parts.length < 2) continue;
        var sessionId = parts[0];
        var agentId = parts.slice(1).join('-agent-');

        var rawContent;
        try { rawContent = b2s($os.readFile(todosDir + '/' + fname)); } catch(e) { continue; }
        if (!rawContent || rawContent.trim().length < 2) continue;

        var tasks;
        try { tasks = JSON.parse(rawContent); } catch(e) { continue; }
        if (!Array.isArray(tasks) || tasks.length === 0) continue;

        var hash = fileHash(rawContent);

        // Check if changed
        var anyChanged = false;
        for (var ti = 0; ti < tasks.length; ti++) {
          var ex = null;
          try { ex = dao.findFirstRecordByFilter('claude_tasks', 'session_id = {:sid} && agent_id = {:aid} && task_index = {:idx}', { sid: sessionId, aid: agentId, idx: ti }); } catch(e) {}
          if (!ex || ex.getString('file_hash') !== hash) { anyChanged = true; break; }
        }
        if (!anyChanged) continue;

        var sessionData = parseSessionJsonl(sessionId);
        var col = dao.findCollectionByNameOrId('claude_tasks');
        var prevStatuses = {};

        for (var tj = 0; tj < tasks.length; tj++) {
          var task = tasks[tj];
          if (!task || !task.content) continue;
          var existing = null;
          try { existing = dao.findFirstRecordByFilter('claude_tasks', 'session_id = {:sid} && agent_id = {:aid} && task_index = {:idx}', { sid: sessionId, aid: agentId, idx: tj }); } catch(e) {}
          prevStatuses[tj] = existing ? existing.getString('status') : '';

          try {
            var rec = existing || new Record(col);
            rec.set('user', uid);
            rec.set('session_id', sessionId);
            rec.set('agent_id', agentId);
            rec.set('content', String(task.content || '').substring(0, 2000));
            rec.set('active_form', String(task.activeForm || '').substring(0, 2000));
            rec.set('status', task.status || 'pending');
            rec.set('task_index', tj);
            rec.set('model', sessionData.model);
            rec.set('project_dir', sessionData.project_dir);
            rec.set('session_title', sessionData.session_title.substring(0, 500));
            rec.set('input_tokens', sessionData.input_tokens);
            rec.set('output_tokens', sessionData.output_tokens);
            rec.set('cache_read_tokens', sessionData.cache_read_tokens);
            rec.set('cache_create_tokens', sessionData.cache_create_tokens);
            rec.set('started_at', sessionData.started_at);
            rec.set('ended_at', sessionData.ended_at);
            rec.set('file_hash', hash);
            rec.set('source_file', fname);
            dao.saveRecord(rec);
            synced++;
          } catch(err) {}
        }

        // Notifications
        for (var tn = 0; tn < tasks.length; tn++) {
          if (!tasks[tn]) continue;
          if (prevStatuses[tn] !== 'in_progress' && tasks[tn].status === 'in_progress') {
            var notifyText = '*Task Started*\n`' + String(tasks[tn].activeForm || tasks[tn].content || '').substring(0, 100) + '`';
            if (sessionData.model) notifyText += '\nModel: ' + sessionData.model;
            sendTelegramNotify(notifyText);
          }
        }

        var allDone = true;
        for (var tc = 0; tc < tasks.length; tc++) { if (!tasks[tc] || tasks[tc].status !== 'completed') { allDone = false; break; } }
        var anyWasNotDone = false;
        for (var tp in prevStatuses) { if (prevStatuses[tp] !== 'completed') { anyWasNotDone = true; break; } }
        if (allDone && anyWasNotDone && tasks.length > 0) {
          var projName = sessionData.project_dir ? sessionData.project_dir.split('/').pop() : 'Unknown';
          sendTelegramNotify('*Session Complete*\nProject: `' + projName + '`\n' + tasks.length + ' tasks done');
        }
      }
    } catch(e) {
      console.log('[TasksSync] Cron error: ' + e);
    }

    console.log('[TasksSync] Cron done. Synced: ' + synced);
  });
  console.log('[TasksSync] Cron registered: */5 * * * *');
} catch(e) {
  console.log('[TasksSync] cronAdd not available: ' + e);
}

console.log('[TasksSync] Hooks registered: sync-tasks, sync-tasks/status, cron');
