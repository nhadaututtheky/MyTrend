/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Smart Idea Extraction
// Auto-extracts ideas from conversation user messages using signal phrases.
// Creates ideas with status "inbox" for user review.
// Triggers on both CREATE and UPDATE of conversations.

// Signal phrases that indicate an idea/task/bug/feature
var IDEA_SIGNALS = {
  feature: [
    // English
    'should add', 'need to add', 'let\'s add', 'we need', 'let\'s implement',
    'let\'s build', 'should implement', 'want to add', 'need to implement',
    'feature:', 'feat:', 'can we add', 'would be nice to', 'should have',
    'i want to', 'we should', 'let\'s create', 'need to create', 'add a',
    'build a', 'implement a', 'create a new',
    // Vietnamese (stripped diacritics)
    'can them', 'nen them', 'nen lam', 'can lam', 'them tinh nang',
    'them cai', 'lam them', 'tao them', 'lam cai', 'tao cai',
    'lam di', 'them di', 'build di', 'implement di',
    'muon them', 'muon lam', 'muon tao',
  ],
  bug: [
    // English
    'bug:', 'bug nay', 'still broken', 'doesn\'t work', 'not working',
    'is broken', 'error when', 'fails when', 'crash when', 'fix the',
    'fix this', 'broken:', 'issue:', 'problem:',
    // Vietnamese
    'phai fix', 'bi loi', 'ko chay', 'khong chay', 'dang loi',
    'fix cai', 'fix di', 'sua cai', 'sua di', 'loi nay',
    'ko duoc', 'khong duoc', 'bi bug', 'bi hong', 'hong roi',
    'chet roi', 'ko hoat dong', 'khong hoat dong',
  ],
  optimization: [
    // English
    'too slow', 'should optimize', 'need to optimize', 'performance issue',
    'can optimize', 'let\'s optimize', 'refactor', 'clean up',
    'speed up', 'make faster', 'improve performance',
    // Vietnamese
    'cham qua', 'nen toi uu', 'can refactor', 'nhanh hon',
    'toi uu di', 'refactor di', 'clean di', 'don dep',
  ],
  question: [
    // English
    'should we', 'what if we', 'how about', 'what do you think',
    'do you think', 'which is better',
    // Vietnamese
    'nen dung gi', 'lam sao', 'tai sao', 'dung cai nao',
    'chon cai nao', 'theo bro', 'bro nghi sao',
  ],
};

/**
 * Strip Vietnamese diacritics so "nen them" matches signal "nen them".
 */
var VIET_MAP = {
  '\u00e0':'a','\u00e1':'a','\u1ea3':'a','\u00e3':'a','\u1ea1':'a',
  '\u0103':'a','\u1eb1':'a','\u1eaf':'a','\u1eb3':'a','\u1eb5':'a','\u1eb7':'a',
  '\u00e2':'a','\u1ea7':'a','\u1ea5':'a','\u1ea9':'a','\u1eab':'a','\u1ead':'a',
  '\u00e8':'e','\u00e9':'e','\u1ebb':'e','\u1ebd':'e','\u1eb9':'e',
  '\u00ea':'e','\u1ec1':'e','\u1ebf':'e','\u1ec3':'e','\u1ec5':'e','\u1ec7':'e',
  '\u00ec':'i','\u00ed':'i','\u1ec9':'i','\u0129':'i','\u1ecb':'i',
  '\u00f2':'o','\u00f3':'o','\u1ecf':'o','\u00f5':'o','\u1ecd':'o',
  '\u00f4':'o','\u1ed3':'o','\u1ed1':'o','\u1ed5':'o','\u1ed7':'o','\u1ed9':'o',
  '\u01a1':'o','\u1edd':'o','\u1edb':'o','\u1edf':'o','\u1ee1':'o','\u1ee3':'o',
  '\u00f9':'u','\u00fa':'u','\u1ee7':'u','\u0169':'u','\u1ee5':'u',
  '\u01b0':'u','\u1eeb':'u','\u1ee9':'u','\u1eed':'u','\u1eef':'u','\u1ef1':'u',
  '\u1ef3':'y','\u00fd':'y','\u1ef7':'y','\u1ef9':'y','\u1ef5':'y',
  '\u0111':'d',
};

function stripDiacritics(str) {
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    out += VIET_MAP[c] || c;
  }
  return out;
}

/**
 * Check if text contains any signal phrase and return the type + matched phrase.
 */
function detectIdea(text) {
  var lower = stripDiacritics(text.toLowerCase());
  var types = Object.keys(IDEA_SIGNALS);
  for (var t = 0; t < types.length; t++) {
    var phrases = IDEA_SIGNALS[types[t]];
    for (var p = 0; p < phrases.length; p++) {
      var idx = lower.indexOf(phrases[p]);
      if (idx >= 0) {
        return { type: types[t], phrase: phrases[p], position: idx };
      }
    }
  }
  return null;
}

/**
 * Extract the sentence containing the signal phrase.
 */
function extractSentence(text, position) {
  var start = position;
  var end = position;

  // Go back to find sentence start
  while (start > 0 && text[start - 1] !== '.' && text[start - 1] !== '\n' && text[start - 1] !== '!' && text[start - 1] !== '?') {
    start--;
  }
  while (start < position && (text[start] === ' ' || text[start] === '\n')) start++;

  // Go forward to find sentence end
  while (end < text.length && text[end] !== '.' && text[end] !== '\n' && text[end] !== '!' && text[end] !== '?') {
    end++;
  }

  var sentence = text.substring(start, end).trim();
  if (sentence.length > 200) sentence = sentence.substring(0, 197) + '...';
  if (sentence.length < 10) return null;
  return sentence;
}

/**
 * Decode JSON array field (Goja byte-array safe).
 */
function decodeMessagesArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
    try {
      var s = '';
      for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]);
      var p = JSON.parse(s);
      if (Array.isArray(p)) return p;
    } catch (e) { /* fall through */ }
  }
  if (typeof raw === 'string') {
    try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) return p2; } catch (e) { /* */ }
  }
  return [];
}

/**
 * Core extraction logic - shared between create and update handlers.
 * @param {Object} record - The conversation record
 * @param {number} startIndex - Index to start scanning messages from (0 for create, old count for update)
 */
function extractIdeasFromMessages(record, startIndex) {
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var messages = decodeMessagesArray(record.get('messages'));
  var convId = record.getId();
  var projectId = record.getString('project') || '';

  if (messages.length <= startIndex) return;

  // Count existing ideas for this conversation to respect max limit
  var existingIdeaCount = 0;
  try {
    var existing = dao.findRecordsByFilter(
      'ideas',
      'conversation = {:cid}',
      '-created', 10, 0,
      { cid: convId }
    );
    existingIdeaCount = existing.length;
  } catch (e) { /* no existing ideas */ }

  if (existingIdeaCount >= 3) return; // Already at max

  var extractedCount = 0;
  var seenTitles = {};
  var maxNew = 3 - existingIdeaCount;

  for (var i = startIndex; i < messages.length; i++) {
    var msg = messages[i];
    if (!msg || msg.role !== 'user' || !msg.content) continue;
    var content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length < 15) continue; // Lowered from 20 to catch shorter Vietnamese phrases

    var detection = detectIdea(content);
    if (!detection) continue;

    var title = extractSentence(content, detection.position);
    if (!title) continue;

    // Dedup within this batch
    var titleKey = stripDiacritics(title.substring(0, 50).toLowerCase());
    if (seenTitles[titleKey]) continue;
    seenTitles[titleKey] = true;

    // Check if idea with similar title already exists globally
    try {
      dao.findFirstRecordByFilter(
        'ideas',
        'user = {:uid} && title ~ {:title}',
        { uid: userId, title: title.substring(0, 50) }
      );
      continue; // Already exists
    } catch (e) { /* not found, create */ }

    try {
      var ideaCol = dao.findCollectionByNameOrId('ideas');
      var idea = new Record(ideaCol);
      idea.set('user', userId);
      idea.set('title', title);
      idea.set('type', detection.type);
      idea.set('status', 'inbox');
      idea.set('priority', detection.type === 'bug' ? 'high' : 'medium');
      idea.set('content', 'Auto-extracted from conversation. Signal: "' + detection.phrase + '"');
      idea.set('tags', [detection.type, 'auto-extracted']);
      if (convId) idea.set('conversation', convId);
      if (projectId) idea.set('project', projectId);
      dao.saveRecord(idea);
      extractedCount++;
    } catch (err) {
      console.log('[IdeaExtraction] Create error: ' + err);
    }

    if (extractedCount >= maxNew) break;
  }

  if (extractedCount > 0) {
    console.log('[IdeaExtraction] Extracted ' + extractedCount + ' ideas from conversation: ' + convId);

    // Update project's total_ideas count
    if (projectId) {
      try {
        var projRec = dao.findRecordById('projects', projectId);
        var currentIdeas = projRec.getInt('total_ideas') || 0;
        projRec.set('total_ideas', currentIdeas + extractedCount);
        dao.saveRecord(projRec);
      } catch (e) { /* skip */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Hub session extraction - same logic but uses 'vibe-terminal' source tag
// and no conversation relation (hub_sessions are not conversations).
// ---------------------------------------------------------------------------
function extractIdeasFromHub(record, startIndex) {
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var messages = decodeMessagesArray(record.get('messages'));
  var projectId = record.getString('project') || '';

  if (messages.length <= startIndex) return;

  var existingCount = 0;
  try {
    // Dedup by scanning title similarity globally (no per-hub-session limit)
    var recId = record.getId();
    var existing = dao.findRecordsByFilter(
      'ideas',
      'user = {:uid} && tags ~ "vibe-terminal"',
      '-created', 50, 0,
      { uid: userId }
    );
    // Count ideas created in last hour from this session (rough guard against spam)
    var oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    for (var x = 0; x < existing.length; x++) {
      if (existing[x].getString('created') >= oneHourAgo) existingCount++;
    }
  } catch (e) { /* no existing */ }

  if (existingCount >= 10) return; // Max 10 auto-ideas per hour from Vibe Terminal

  var extractedCount = 0;
  var seenTitles = {};
  var maxNew = 10 - existingCount;

  for (var i = startIndex; i < messages.length; i++) {
    var msg = messages[i];
    if (!msg || msg.role !== 'user' || !msg.content) continue;
    var content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length < 15) continue;

    var detection = detectIdea(content);
    if (!detection) continue;

    var title = extractSentence(content, detection.position);
    if (!title) continue;

    var titleKey = stripDiacritics(title.substring(0, 50).toLowerCase());
    if (seenTitles[titleKey]) continue;
    seenTitles[titleKey] = true;

    // Global title dedup for this user
    try {
      dao.findFirstRecordByFilter(
        'ideas',
        'user = {:uid} && title ~ {:title}',
        { uid: userId, title: title.substring(0, 50) }
      );
      continue; // Already exists
    } catch (e) { /* not found, create */ }

    try {
      var ideaCol = dao.findCollectionByNameOrId('ideas');
      var idea = new Record(ideaCol);
      idea.set('user', userId);
      idea.set('title', title);
      idea.set('type', detection.type);
      idea.set('status', 'inbox');
      idea.set('priority', detection.type === 'bug' ? 'high' : 'medium');
      idea.set('content', 'Auto-extracted from Vibe Terminal session. Signal: "' + detection.phrase + '"');
      idea.set('tags', [detection.type, 'vibe-terminal', 'auto-extracted']);
      if (projectId) idea.set('project', projectId);
      dao.saveRecord(idea);
      extractedCount++;
    } catch (err) {
      console.log('[IdeaExtraction] Hub create error: ' + err);
    }

    if (extractedCount >= maxNew) break;
  }

  if (extractedCount > 0) {
    console.log('[IdeaExtraction] Extracted ' + extractedCount + ' ideas from hub_session: ' + record.getId());
  }
}

// ---------------------------------------------------------------------------
// Extract ideas from NEW conversations (all messages)
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  try {
    extractIdeasFromMessages(e.record, 0);
  } catch (err) {
    console.log('[IdeaExtraction] Create handler error: ' + err);
  }
}, 'conversations');

// ---------------------------------------------------------------------------
// Extract ideas from UPDATED conversations (only new messages)
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest((e) => {
  try {
    var record = e.record;
    var oldMessages = decodeMessagesArray(record.originalCopy().get('messages'));
    var startIndex = oldMessages.length; // Only scan newly added messages
    extractIdeasFromMessages(record, startIndex);
  } catch (err) {
    console.log('[IdeaExtraction] Update handler error: ' + err);
  }
}, 'conversations');

// ---------------------------------------------------------------------------
// Extract ideas from NEW hub_sessions (Vibe Terminal) - all messages
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  try {
    extractIdeasFromHub(e.record, 0);
  } catch (err) {
    console.log('[IdeaExtraction] Hub create handler error: ' + err);
  }
}, 'hub_sessions');

// ---------------------------------------------------------------------------
// Extract ideas from UPDATED hub_sessions - only new messages
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest((e) => {
  try {
    var record = e.record;
    var oldMessages = decodeMessagesArray(record.originalCopy().get('messages'));
    var startIndex = oldMessages.length;
    extractIdeasFromHub(record, startIndex);
  } catch (err) {
    console.log('[IdeaExtraction] Hub update handler error: ' + err);
  }
}, 'hub_sessions');

// ---------------------------------------------------------------------------
// POST /api/mytrend/re-extract-ideas
// Re-scan ALL existing conversations for ideas (one-time migration/repair).
// NOTE: routerAdd has ISOLATED scope - must inline all helper functions.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/re-extract-ideas', (c) => {
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

  // --- Inline helpers (isolated scope) ---
  var _VIET_MAP = {
    '\u00e0':'a','\u00e1':'a','\u1ea3':'a','\u00e3':'a','\u1ea1':'a',
    '\u0103':'a','\u1eb1':'a','\u1eaf':'a','\u1eb3':'a','\u1eb5':'a','\u1eb7':'a',
    '\u00e2':'a','\u1ea7':'a','\u1ea5':'a','\u1ea9':'a','\u1eab':'a','\u1ead':'a',
    '\u00e8':'e','\u00e9':'e','\u1ebb':'e','\u1ebd':'e','\u1eb9':'e',
    '\u00ea':'e','\u1ec1':'e','\u1ebf':'e','\u1ec3':'e','\u1ec5':'e','\u1ec7':'e',
    '\u00ec':'i','\u00ed':'i','\u1ec9':'i','\u0129':'i','\u1ecb':'i',
    '\u00f2':'o','\u00f3':'o','\u1ecf':'o','\u00f5':'o','\u1ecd':'o',
    '\u00f4':'o','\u1ed3':'o','\u1ed1':'o','\u1ed5':'o','\u1ed7':'o','\u1ed9':'o',
    '\u01a1':'o','\u1edd':'o','\u1edb':'o','\u1edf':'o','\u1ee1':'o','\u1ee3':'o',
    '\u00f9':'u','\u00fa':'u','\u1ee7':'u','\u0169':'u','\u1ee5':'u',
    '\u01b0':'u','\u1eeb':'u','\u1ee9':'u','\u1eed':'u','\u1eef':'u','\u1ef1':'u',
    '\u1ef3':'y','\u00fd':'y','\u1ef7':'y','\u1ef9':'y','\u1ef5':'y',
    '\u0111':'d',
  };

  function _strip(str) {
    var out = '';
    for (var x = 0; x < str.length; x++) { out += _VIET_MAP[str[x]] || str[x]; }
    return out;
  }

  var _SIGNALS = {
    feature: [
      'should add', 'need to add', 'let\'s add', 'we need', 'let\'s implement',
      'let\'s build', 'should implement', 'want to add', 'need to implement',
      'feature:', 'feat:', 'can we add', 'would be nice to', 'should have',
      'i want to', 'we should', 'let\'s create', 'need to create', 'add a',
      'build a', 'implement a', 'create a new',
      'can them', 'nen them', 'nen lam', 'can lam', 'them tinh nang',
      'them cai', 'lam them', 'tao them', 'lam cai', 'tao cai',
      'lam di', 'them di', 'build di', 'implement di',
      'muon them', 'muon lam', 'muon tao',
    ],
    bug: [
      'bug:', 'bug nay', 'still broken', 'doesn\'t work', 'not working',
      'is broken', 'error when', 'fails when', 'crash when', 'fix the',
      'fix this', 'broken:', 'issue:', 'problem:',
      'phai fix', 'bi loi', 'ko chay', 'khong chay', 'dang loi',
      'fix cai', 'fix di', 'sua cai', 'sua di', 'loi nay',
      'ko duoc', 'khong duoc', 'bi bug', 'bi hong', 'hong roi',
      'chet roi', 'ko hoat dong', 'khong hoat dong',
    ],
    optimization: [
      'too slow', 'should optimize', 'need to optimize', 'performance issue',
      'can optimize', 'let\'s optimize', 'refactor', 'clean up',
      'speed up', 'make faster', 'improve performance',
      'cham qua', 'nen toi uu', 'can refactor', 'nhanh hon',
      'toi uu di', 'refactor di', 'clean di', 'don dep',
    ],
    question: [
      'should we', 'what if we', 'how about', 'what do you think',
      'do you think', 'which is better',
      'nen dung gi', 'lam sao', 'tai sao', 'dung cai nao',
      'chon cai nao', 'theo bro', 'bro nghi sao',
    ],
  };

  function _detect(text) {
    var lower = _strip(text.toLowerCase());
    var types = Object.keys(_SIGNALS);
    for (var t = 0; t < types.length; t++) {
      var phrases = _SIGNALS[types[t]];
      for (var p = 0; p < phrases.length; p++) {
        var idx = lower.indexOf(phrases[p]);
        if (idx >= 0) return { type: types[t], phrase: phrases[p], position: idx };
      }
    }
    return null;
  }

  function _sentence(text, pos) {
    var start = pos, end = pos;
    while (start > 0 && text[start-1] !== '.' && text[start-1] !== '\n' && text[start-1] !== '!' && text[start-1] !== '?') start--;
    while (start < pos && (text[start] === ' ' || text[start] === '\n')) start++;
    while (end < text.length && text[end] !== '.' && text[end] !== '\n' && text[end] !== '!' && text[end] !== '?') end++;
    var s = text.substring(start, end).trim();
    if (s.length > 200) s = s.substring(0, 197) + '...';
    if (s.length < 10) return null;
    return s;
  }

  function _decodeMessages(raw) {
    if (!raw) return [];
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
      try { var s = ''; for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]); var p = JSON.parse(s); if (Array.isArray(p)) return p; } catch (e) {}
    }
    if (typeof raw === 'string') { try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) return p2; } catch (e) {} }
    return [];
  }
  // --- End inline helpers ---

  var dao = $app.dao();
  var convs;
  try {
    convs = dao.findRecordsByFilter('conversations', 'user = {:uid}', '-created', 0, 0, { uid: userId });
  } catch (e) {
    return c.json(500, { error: 'Cannot fetch conversations: ' + e });
  }

  var totalExtracted = 0;
  var scanned = 0;
  var errors = [];

  for (var i = 0; i < convs.length; i++) {
    scanned++;
    try {
      var conv = convs[i];
      var convUserId = conv.getString('user');
      if (!convUserId) continue;

      var messages = _decodeMessages(conv.get('messages'));
      if (messages.length === 0) continue;

      var convId = conv.getId();
      var projectId = conv.getString('project') || '';

      var existingIdeaCount = 0;
      try {
        var existing = dao.findRecordsByFilter('ideas', 'conversation = {:cid}', '-created', 10, 0, { cid: convId });
        existingIdeaCount = existing.length;
      } catch (e) { /* */ }

      if (existingIdeaCount >= 3) continue;

      var extractedCount = 0;
      var seenTitles = {};
      var maxNew = 3 - existingIdeaCount;

      for (var j = 0; j < messages.length; j++) {
        var msg = messages[j];
        if (!msg || msg.role !== 'user' || !msg.content) continue;
        var content = typeof msg.content === 'string' ? msg.content : '';
        if (content.length < 15) continue;

        var detection = _detect(content);
        if (!detection) continue;

        var title = _sentence(content, detection.position);
        if (!title) continue;

        var titleKey = _strip(title.substring(0, 50).toLowerCase());
        if (seenTitles[titleKey]) continue;
        seenTitles[titleKey] = true;

        try {
          dao.findFirstRecordByFilter('ideas', 'user = {:uid} && title ~ {:title}', { uid: convUserId, title: title.substring(0, 50) });
          continue;
        } catch (e) { /* not found */ }

        try {
          var ideaCol = dao.findCollectionByNameOrId('ideas');
          var idea = new Record(ideaCol);
          idea.set('user', convUserId);
          idea.set('title', title);
          idea.set('type', detection.type);
          idea.set('status', 'inbox');
          idea.set('priority', detection.type === 'bug' ? 'high' : 'medium');
          idea.set('content', 'Auto-extracted from conversation. Signal: "' + detection.phrase + '"');
          idea.set('tags', [detection.type, 'auto-extracted']);
          if (convId) idea.set('conversation', convId);
          if (projectId) idea.set('project', projectId);
          dao.saveRecord(idea);
          extractedCount++;
        } catch (err) {
          errors.push(convId + ': ' + String(err).substring(0, 100));
        }

        if (extractedCount >= maxNew) break;
      }

      totalExtracted += extractedCount;

      if (extractedCount > 0 && projectId) {
        try {
          var projRec = dao.findRecordById('projects', projectId);
          var currentIdeas = projRec.getInt('total_ideas') || 0;
          projRec.set('total_ideas', currentIdeas + extractedCount);
          dao.saveRecord(projRec);
        } catch (e) { /* skip */ }
      }
    } catch (err) {
      errors.push('conv[' + i + ']: ' + String(err).substring(0, 100));
    }
  }

  console.log('[IdeaExtraction] Re-extraction done. Scanned: ' + scanned + ', Extracted: ' + totalExtracted);
  return c.json(200, { scanned: scanned, extracted: totalExtracted, errors: errors });
});

console.log('[IdeaExtraction] Registered: auto-extract ideas from conversations + hub_sessions (Vibe Terminal)');
