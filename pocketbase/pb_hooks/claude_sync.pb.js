/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Conversation Auto-Sync
// Reads Claude Code CLI session logs from mounted volume and imports them.
//
// Data sources (mounted read-only at /pb/import/claude/):
//   - projects/<encoded-path>/<sessionId>.jsonl  (full conversation transcripts)
//   - history.jsonl                               (user prompt index with display names)
//
// JSONL line types: user, assistant, system, progress, file-history-snapshot
// We only extract type=user and type=assistant for conversation records.

var CLAUDE_BASE = '/pb/import/claude';
var PROJECTS_DIR = CLAUDE_BASE + '/projects';
var HISTORY_FILE = CLAUDE_BASE + '/history.jsonl';
var MIN_MESSAGES_FOR_IMPORT = 2; // Skip incomplete sessions (user-only or empty)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode project name from encoded directory name.
 * e.g. "C--Users-X-Desktop-Future-MyTrend" => "MyTrend"
 */
function decodeProjectName(dirName) {
  var parts = dirName.split('-');
  // Take the last meaningful segment
  var name = parts[parts.length - 1];
  return name || dirName;
}

/**
 * Extract text content from a message content field.
 * Content can be a string or an array of content blocks.
 */
function extractTextContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    var texts = [];
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (block && block.type === 'text' && block.text) {
        texts.push(block.text);
      }
    }
    return texts.join('\n');
  }
  return String(content);
}

/**
 * Parse a session JSONL file and extract conversation data.
 * Returns: { messages, totalInputTokens, totalOutputTokens, startedAt, endedAt, sessionId, cwd, gitBranch, version }
 */
function parseSessionJsonl(filePath) {
  var content;
  try {
    var raw = $os.readFile(filePath);
    try {
      content = new TextDecoder('utf-8').decode(raw);
    } catch (e) {
      content = String(raw);
    }
  } catch (e) {
    return null;
  }

  var lines = content.split('\n');
  var messages = [];
  var totalInputTokens = 0;
  var totalOutputTokens = 0;
  var startedAt = null;
  var endedAt = null;
  var sessionId = null;
  var cwd = null;
  var gitBranch = null;
  var version = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      continue;
    }

    var msgType = obj.type;
    if (!msgType) continue;

    // Extract metadata from any message
    if (!sessionId && obj.sessionId) sessionId = obj.sessionId;
    if (!cwd && obj.cwd) cwd = obj.cwd;
    if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
    if (!version && obj.version) version = obj.version;

    // Track timestamps
    var ts = obj.timestamp;
    if (ts) {
      if (!startedAt) startedAt = ts;
      endedAt = ts;
    }

    // Only extract user and assistant messages
    if (msgType !== 'user' && msgType !== 'assistant') continue;

    var msg = obj.message;
    if (!msg || !msg.role) continue;

    var text = extractTextContent(msg.content);
    // Skip empty messages and tool results (they start with tool_use_id references)
    if (!text || text.length < 2) continue;

    // Extract token usage from assistant messages
    if (msgType === 'assistant' && msg.usage) {
      var usage = msg.usage;
      totalInputTokens += (usage.input_tokens || 0);
      totalInputTokens += (usage.cache_creation_input_tokens || 0);
      totalInputTokens += (usage.cache_read_input_tokens || 0);
      totalOutputTokens += (usage.output_tokens || 0);
    }

    messages.push({
      role: msg.role,
      content: text,
      timestamp: ts || new Date().toISOString(),
      tokens: (msg.usage && msg.usage.output_tokens) ? msg.usage.output_tokens : Math.round(text.length / 4),
    });
  }

  if (messages.length === 0) return null;

  return {
    messages: messages,
    totalInputTokens: totalInputTokens,
    totalOutputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    startedAt: startedAt,
    endedAt: endedAt,
    sessionId: sessionId,
    cwd: cwd,
    gitBranch: gitBranch,
    version: version,
  };
}

/**
 * Build a session display map from history.jsonl.
 * Maps sessionId => { display (first user prompt text), project, timestamp }
 */
function buildHistoryIndex() {
  var index = {};
  try {
    var raw = $os.readFile(HISTORY_FILE);
    var content;
    try {
      content = new TextDecoder('utf-8').decode(raw);
    } catch (e) {
      content = String(raw);
    }

    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      try {
        var obj = JSON.parse(line);
        var sid = obj.sessionId;
        if (!sid) continue;
        // Only store first entry per session (the initial prompt = best title)
        if (!index[sid]) {
          index[sid] = {
            display: obj.display || '',
            project: obj.project || '',
            timestamp: obj.timestamp || 0,
          };
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.log('[ClaudeSync] Cannot read history.jsonl: ' + e);
  }
  return index;
}

/**
 * Generate a clean title from display text or first user message.
 */
function generateTitle(display, firstUserMessage) {
  var raw = display || firstUserMessage || 'Untitled Session';
  // Clean up: remove markdown, trim, max 200 chars
  var clean = raw.replace(/[#*`_~]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length > 200) clean = clean.substring(0, 197) + '...';
  return clean || 'Untitled Session';
}

/**
 * Calculate duration in minutes between two timestamps.
 */
function calcDurationMin(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0;
  try {
    var start = new Date(startedAt).getTime();
    var end = new Date(endedAt).getTime();
    if (isNaN(start) || isNaN(end)) return 0;
    return Math.round((end - start) / 60000);
  } catch (e) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

/**
 * Run the sync process. Scans all Claude projects for session JSONL files
 * and imports new conversations into PocketBase.
 * @param {string|null} userId - User ID to assign records to. If null, uses env or first user.
 */
function syncClaudeSessions(userId) {
  var dao = $app.dao();
  var collection;
  try {
    collection = dao.findCollectionByNameOrId('conversations');
  } catch (e) {
    return { error: 'Conversations collection not found: ' + e };
  }

  var result = {
    projects_scanned: 0,
    sessions_found: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  // Resolve target user ID
  var targetUserId = userId || $os.getenv('MYTREND_SYNC_USER_ID') || null;
  if (!targetUserId) {
    try {
      var users = dao.findRecordsByFilter('users', '1=1', '', 1, 0);
      if (users && users.length > 0) {
        targetUserId = users[0].getId();
      }
    } catch (e) {
      console.log('[ClaudeSync] Cannot find any user: ' + e);
    }
  }
  if (!targetUserId) {
    return { error: 'No user found. Set MYTREND_SYNC_USER_ID env var or create a user first.' };
  }

  // Build history index for display names
  var historyIndex = buildHistoryIndex();
  console.log('[ClaudeSync] History index: ' + Object.keys(historyIndex).length + ' entries');

  // Read projects directory
  var projectDirs;
  try {
    projectDirs = $os.readDir(PROJECTS_DIR);
  } catch (e) {
    console.log('[ClaudeSync] Cannot read projects dir: ' + e);
    result.errors.push('Cannot read projects directory: ' + e);
    return result;
  }

  for (var p = 0; p < projectDirs.length; p++) {
    var projEntry = projectDirs[p];
    if (!projEntry.isDir()) continue;

    var projName = projEntry.name();
    var projPath = PROJECTS_DIR + '/' + projName;
    var decodedProject = decodeProjectName(projName);
    result.projects_scanned++;

    // List JSONL files in this project
    var files;
    try {
      files = $os.readDir(projPath);
    } catch (e) {
      result.errors.push(projName + ': cannot read directory');
      continue;
    }

    for (var f = 0; f < files.length; f++) {
      var fileEntry = files[f];
      var fileName = fileEntry.name();

      // Only process .jsonl files (not directories like UUID session dirs)
      if (fileEntry.isDir() || !fileName.endsWith('.jsonl')) continue;

      result.sessions_found++;
      var sessionId = fileName.replace('.jsonl', '');

      // Check if already imported (dedup by session_id)
      try {
        var existing = dao.findFirstRecordByFilter(
          'conversations',
          'session_id = {:sid}',
          { sid: sessionId }
        );
        if (existing) {
          result.skipped++;
          continue;
        }
      } catch (e) {
        // Not found = good, proceed to import
      }

      // Parse the session JSONL
      var filePath = projPath + '/' + fileName;
      var parsed = parseSessionJsonl(filePath);
      if (!parsed || parsed.messages.length < MIN_MESSAGES_FOR_IMPORT) {
        result.skipped++;
        continue;
      }

      try {
        // Get display title from history index or first user message
        var historyEntry = historyIndex[sessionId];
        var firstUserText = '';
        for (var m = 0; m < parsed.messages.length; m++) {
          if (parsed.messages[m].role === 'user') {
            firstUserText = parsed.messages[m].content;
            break;
          }
        }
        var title = generateTitle(
          historyEntry ? historyEntry.display : null,
          firstUserText
        );

        // Create conversation record
        var record = new Record(collection);
        record.set('title', title);
        record.set('source', 'cli');
        record.set('session_id', sessionId);
        record.set('device_name', $os.getenv('HOSTNAME') || 'docker');
        record.set('messages', parsed.messages);
        record.set('message_count', parsed.messages.length);
        record.set('total_tokens', parsed.totalTokens);
        record.set('started_at', parsed.startedAt || new Date().toISOString());
        record.set('ended_at', parsed.endedAt || '');
        record.set('duration_min', calcDurationMin(parsed.startedAt, parsed.endedAt));
        record.set('topics', []);
        record.set('tags', [decodedProject, 'claude-cli']);

        // Summary from first user message
        if (firstUserText) {
          var summary = firstUserText.length > 500
            ? firstUserText.substring(0, 497) + '...'
            : firstUserText;
          record.set('summary', summary);
        }

        record.set('user', targetUserId);
        dao.saveRecord(record);
        result.imported++;
        console.log('[ClaudeSync] Imported: ' + sessionId + ' (' + parsed.messages.length + ' msgs, ' + decodedProject + ')');

      } catch (err) {
        var errStr = String(err);
        if (errStr.indexOf('UNIQUE') >= 0 || errStr.indexOf('duplicate') >= 0) {
          result.skipped++;
          console.log('[ClaudeSync] Duplicate session (race): ' + sessionId);
        } else {
          console.log('[ClaudeSync] Error importing ' + sessionId + ': ' + err);
          result.errors.push(sessionId + ': ' + errStr.substring(0, 200));
        }
      }
    }
  }

  console.log('[ClaudeSync] Sync complete. Imported: ' + result.imported + ', Skipped: ' + result.skipped + ', Errors: ' + result.errors.length);
  return result;
}

// ---------------------------------------------------------------------------
// API Endpoint: POST /api/mytrend/sync-claude
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/sync-claude', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) {
    return c.json(401, { error: 'Authentication required' });
  }

  console.log('[ClaudeSync] Manual sync triggered by user: ' + authRecord.getId());
  var result = syncClaudeSessions(authRecord.getId());
  if (result.error) {
    return c.json(500, result);
  }
  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// API Endpoint: GET /api/mytrend/sync-status
// Returns info about available sessions without importing.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/sync-status', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) {
    return c.json(401, { error: 'Authentication required' });
  }

  var dao = $app.dao();
  var status = {
    projects: [],
    total_sessions: 0,
    already_imported: 0,
    pending: 0,
  };

  try {
    var projectDirs = $os.readDir(PROJECTS_DIR);
    for (var p = 0; p < projectDirs.length; p++) {
      var projEntry = projectDirs[p];
      if (!projEntry.isDir()) continue;

      var projName = projEntry.name();
      var projPath = PROJECTS_DIR + '/' + projName;
      var files = $os.readDir(projPath);
      var sessionCount = 0;
      var importedCount = 0;

      for (var f = 0; f < files.length; f++) {
        if (files[f].isDir() || !files[f].name().endsWith('.jsonl')) continue;
        sessionCount++;
        var sid = files[f].name().replace('.jsonl', '');
        try {
          dao.findFirstRecordByFilter('conversations', 'session_id = {:sid}', { sid: sid });
          importedCount++;
        } catch (e) {
          // Not imported
        }
      }

      status.projects.push({
        name: decodeProjectName(projName),
        path: projName,
        total: sessionCount,
        imported: importedCount,
        pending: sessionCount - importedCount,
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
// Cron: Auto-sync every 30 minutes
// ---------------------------------------------------------------------------
cronAdd('claude_auto_sync', '*/30 * * * *', () => {
  console.log('[ClaudeSync] Cron auto-sync triggered');
  syncClaudeSessions();
});
