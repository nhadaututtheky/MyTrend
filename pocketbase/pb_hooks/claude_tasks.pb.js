/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Task Viewer API
// Reads ~/.claude/tasks/ and ~/.claude/todos/ from mounted volume
// Docker mount: C:/Users/X/.claude -> /pb/import/claude

// ---------------------------------------------------------------------------
// GET /api/mytrend/tasks/sessions
// List all task sessions (directories under /pb/import/claude/tasks/)
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/tasks/sessions', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) { cp = b; i++; }
      else if ((b & 0xE0) === 0xC0) { if (i + 1 >= len) break; cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2; }
      else if ((b & 0xF0) === 0xE0) { if (i + 2 >= len) break; cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3; }
      else if ((b & 0xF8) === 0xF0) { if (i + 3 >= len) break; cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4; }
      else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  var sessions = [];
  var basePath = '/pb/import/claude/tasks';

  try {
    var dirs = $os.readDir(basePath);
    for (var d = 0; d < dirs.length; d++) {
      if (!dirs[d].isDir()) continue;
      var sessionId = dirs[d].name();
      var sessionPath = basePath + '/' + sessionId;

      // Read highwatermark
      var hwm = 0;
      try {
        var hwmRaw = b2s($os.readFile(sessionPath + '/.highwatermark'));
        hwm = parseInt(hwmRaw.trim(), 10) || 0;
      } catch (e) {}

      // Count task files and read statuses
      var pending = 0, inProgress = 0, completed = 0;
      var taskFiles;
      try { taskFiles = $os.readDir(sessionPath); } catch (e) { continue; }

      var latestTimestamp = '';
      var sessionSubject = '';

      for (var f = 0; f < taskFiles.length; f++) {
        var fn = taskFiles[f].name();
        if (taskFiles[f].isDir() || !fn.endsWith('.json')) continue;

        try {
          var taskRaw = b2s($os.readFile(sessionPath + '/' + fn));
          var task = JSON.parse(taskRaw);
          if (task.status === 'pending') pending++;
          else if (task.status === 'in_progress') inProgress++;
          else if (task.status === 'completed') completed++;

          if (!sessionSubject && task.subject) {
            sessionSubject = task.subject;
          }
        } catch (e) { continue; }
      }

      // Completed tasks count from hwm minus remaining on disk
      var totalCompleted = hwm - (pending + inProgress);
      if (totalCompleted < completed) totalCompleted = completed;

      sessions.push({
        sessionId: sessionId,
        subject: sessionSubject || 'Session ' + sessionId.substring(0, 8),
        highwatermark: hwm,
        pending: pending,
        inProgress: inProgress,
        completed: totalCompleted,
        total: hwm > 0 ? hwm : pending + inProgress + totalCompleted,
      });
    }
  } catch (e) {
    return c.json(500, { error: 'Cannot read tasks directory: ' + e });
  }

  return c.json(200, { sessions: sessions });
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/tasks/:sessionId
// Get all tasks for a specific session
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/tasks/:sessionId', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) { cp = b; i++; }
      else if ((b & 0xE0) === 0xC0) { if (i + 1 >= len) break; cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2; }
      else if ((b & 0xF0) === 0xE0) { if (i + 2 >= len) break; cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3; }
      else if ((b & 0xF8) === 0xF0) { if (i + 3 >= len) break; cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4; }
      else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  var sessionId = c.pathParam('sessionId');
  var sessionPath = '/pb/import/claude/tasks/' + sessionId;
  var tasks = [];

  try {
    var files = $os.readDir(sessionPath);
    for (var f = 0; f < files.length; f++) {
      var fn = files[f].name();
      if (files[f].isDir() || !fn.endsWith('.json')) continue;

      try {
        var raw = b2s($os.readFile(sessionPath + '/' + fn));
        var task = JSON.parse(raw);
        tasks.push(task);
      } catch (e) { continue; }
    }
  } catch (e) {
    return c.json(404, { error: 'Session not found: ' + sessionId });
  }

  // Read highwatermark for completed count
  var hwm = 0;
  try {
    var hwmRaw = b2s($os.readFile(sessionPath + '/.highwatermark'));
    hwm = parseInt(hwmRaw.trim(), 10) || 0;
  } catch (e) {}

  return c.json(200, { sessionId: sessionId, highwatermark: hwm, tasks: tasks });
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/tasks/todos
// Read current TodoWrite state from ~/.claude/todos/
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/tasks/todos', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) { cp = b; i++; }
      else if ((b & 0xE0) === 0xC0) { if (i + 1 >= len) break; cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2; }
      else if ((b & 0xF0) === 0xE0) { if (i + 2 >= len) break; cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3; }
      else if ((b & 0xF8) === 0xF0) { if (i + 3 >= len) break; cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4; }
      else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  var todosPath = '/pb/import/claude/todos';
  var todoLists = [];

  try {
    var files = $os.readDir(todosPath);
    for (var f = 0; f < files.length; f++) {
      var fn = files[f].name();
      if (files[f].isDir() || !fn.endsWith('.json')) continue;

      try {
        var raw = b2s($os.readFile(todosPath + '/' + fn));
        var todos = JSON.parse(raw);
        if (!Array.isArray(todos)) continue;

        // Extract session ID from filename pattern: {sessionId}-agent-{agentId}.json
        var parts = fn.replace('.json', '').split('-agent-');
        var sessionId = parts[0] || fn;

        todoLists.push({
          filename: fn,
          sessionId: sessionId,
          todos: todos,
        });
      } catch (e) { continue; }
    }
  } catch (e) {
    return c.json(200, { todoLists: [] });
  }

  return c.json(200, { todoLists: todoLists });
});
