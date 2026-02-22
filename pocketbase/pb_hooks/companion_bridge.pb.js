/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Companion Bridge API
// Internal endpoints called by the companion service (Vibe Terminal / Telegram Claude Bridge).
// Protected by X-Internal-Secret header (env: COMPANION_INTERNAL_SECRET).
//
// POST /api/internal/idea   – Create an idea from Telegram Claude Bridge user message

// ---------------------------------------------------------------------------
// Signal phrases + helpers (duplicated here since hooks have isolated scope)
// ---------------------------------------------------------------------------
var BRIDGE_SIGNALS = {
  feature: [
    'should add', 'need to add', "let's add", 'we need', "let's implement",
    "let's build", 'should implement', 'want to add', 'need to implement',
    'feature:', 'feat:', 'can we add', 'would be nice to', 'should have',
    'i want to', 'we should', "let's create", 'need to create', 'add a',
    'build a', 'implement a', 'create a new',
    'can them', 'nen them', 'nen lam', 'can lam', 'them tinh nang',
    'them cai', 'lam them', 'tao them', 'lam cai', 'tao cai',
    'lam di', 'them di', 'build di', 'implement di',
    'muon them', 'muon lam', 'muon tao',
  ],
  bug: [
    'bug:', 'still broken', "doesn't work", 'not working',
    'is broken', 'error when', 'fails when', 'crash when', 'fix the',
    'fix this', 'broken:', 'issue:', 'problem:',
    'phai fix', 'bi loi', 'ko chay', 'khong chay', 'dang loi',
    'fix cai', 'fix di', 'sua cai', 'sua di', 'loi nay',
    'ko duoc', 'khong duoc', 'bi bug', 'bi hong', 'hong roi',
    'chet roi', 'ko hoat dong', 'khong hoat dong',
  ],
  optimization: [
    'too slow', 'should optimize', 'need to optimize', 'performance issue',
    'can optimize', "let's optimize", 'refactor', 'clean up',
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

var BRIDGE_VIET_MAP = {
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
  '\u1ef3':'y','\u00fd':'y','\u1ef7':'y','\u1ef9':'y','\u1ef5':'y','\u0111':'d',
};

function bridgeStrip(str) {
  var out = '';
  for (var i = 0; i < str.length; i++) { out += BRIDGE_VIET_MAP[str[i]] || str[i]; }
  return out;
}

function bridgeDetect(text) {
  var lower = bridgeStrip(text.toLowerCase());
  var types = Object.keys(BRIDGE_SIGNALS);
  for (var t = 0; t < types.length; t++) {
    var phrases = BRIDGE_SIGNALS[types[t]];
    for (var p = 0; p < phrases.length; p++) {
      var idx = lower.indexOf(phrases[p]);
      if (idx >= 0) return { type: types[t], phrase: phrases[p], position: idx };
    }
  }
  return null;
}

function bridgeExtractTitle(text, position) {
  var start = position;
  var end = position;
  while (start > 0 && text[start - 1] !== '.' && text[start - 1] !== '\n' && text[start - 1] !== '!' && text[start - 1] !== '?') start--;
  while (start < position && (text[start] === ' ' || text[start] === '\n')) start++;
  while (end < text.length && text[end] !== '.' && text[end] !== '\n' && text[end] !== '!' && text[end] !== '?') end++;
  var sentence = text.substring(start, end).trim();
  if (sentence.length > 200) sentence = sentence.substring(0, 197) + '...';
  if (sentence.length < 10) return null;
  return sentence;
}

// ---------------------------------------------------------------------------
// POST /api/internal/idea - Create idea from Telegram Claude Bridge message
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/internal/idea', (c) => {
  // Auth check
  var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
  if (secret) {
    var headerSecret = '';
    try { headerSecret = c.request().header.get('X-Internal-Secret') || ''; } catch (e) {}
    if (headerSecret !== secret) {
      return c.json(403, { error: 'Forbidden' });
    }
  }

  var body = $apis.requestInfo(c).data;
  var content = (body.content || '').trim();
  var userId = (body.userId || '').trim();

  if (!content || !userId) {
    return c.json(400, { error: 'Missing content or userId' });
  }

  // Detect signal phrase
  var detection = bridgeDetect(content);
  if (!detection) {
    return c.json(200, { skipped: true, reason: 'No signal phrase detected' });
  }

  var title = bridgeExtractTitle(content, detection.position);
  if (!title) {
    return c.json(200, { skipped: true, reason: 'Could not extract title' });
  }

  var dao = $app.dao();

  // Global title dedup
  try {
    dao.findFirstRecordByFilter(
      'ideas',
      'user = {:uid} && title ~ {:title}',
      { uid: userId, title: title.substring(0, 50) }
    );
    return c.json(200, { skipped: true, reason: 'Duplicate title' });
  } catch (e) { /* not found, proceed */ }

  try {
    var col = dao.findCollectionByNameOrId('ideas');
    var idea = new Record(col);
    idea.set('user', userId);
    idea.set('title', title);
    idea.set('type', detection.type);
    idea.set('status', 'inbox');
    idea.set('priority', detection.type === 'bug' ? 'high' : 'medium');
    idea.set('content', 'Auto-extracted from Telegram Claude Bridge.\nSignal: "' + detection.phrase + '"\n\nOriginal message:\n' + content.substring(0, 500));
    idea.set('tags', [detection.type, 'telegram-bridge', 'auto-extracted']);
    idea.set('related_ideas', []);
    dao.saveRecord(idea);

    console.log('[CompanionBridge] Created idea: ' + title);
    return c.json(200, { id: idea.getId(), title });
  } catch (err) {
    console.log('[CompanionBridge] Idea create error: ' + err);
    return c.json(500, { error: String(err) });
  }
});

console.log('[CompanionBridge] Registered: POST /api/internal/idea');

// ---------------------------------------------------------------------------
// POST /api/internal/conversation - Save Vibe Bot conversation to PocketBase
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/internal/conversation', (c) => {
  // Auth check
  var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
  if (secret) {
    var headerSecret = '';
    try { headerSecret = c.request().header.get('X-Internal-Secret') || ''; } catch (e) {}
    if (headerSecret !== secret) {
      return c.json(403, { error: 'Forbidden' });
    }
  }

  var body = $apis.requestInfo(c).data;
  var userId = (body.userId || '').trim();
  var title = (body.title || '').trim();
  var content = (body.content || '').trim();
  var projectSlug = (body.projectSlug || '').trim();
  var tags = body.tags || [];
  var model = (body.model || '').trim();
  var sessionId = (body.sessionId || '').trim();

  if (!userId || !content || content.length < 20) {
    return c.json(400, { error: 'Missing userId or content too short' });
  }

  if (!title) title = content.substring(0, 100);

  var dao = $app.dao();

  // Deduplicate by sessionId
  if (sessionId) {
    try {
      dao.findFirstRecordByFilter(
        'conversations',
        'user = {:uid} && tags ~ {:sid}',
        { uid: userId, sid: 'session:' + sessionId.substring(0, 8) }
      );
      return c.json(200, { skipped: true, reason: 'Session already synced' });
    } catch (e) { /* not found, proceed */ }
  }

  // Resolve project relation
  var projectId = '';
  if (projectSlug && projectSlug !== 'hub') {
    try {
      var proj = dao.findFirstRecordByFilter('projects', 'user = {:uid} && slug = {:slug}', { uid: userId, slug: projectSlug });
      projectId = proj.getId();
    } catch (e) { /* project not found, skip relation */ }
  }

  // Add session tag for dedup
  if (sessionId) {
    tags.push('session:' + sessionId.substring(0, 8));
  }
  if (model) tags.push('model:' + model);

  try {
    var col = dao.findCollectionByNameOrId('conversations');
    var rec = new Record(col);
    rec.set('user', userId);
    rec.set('title', title);
    rec.set('content', content);
    rec.set('source', 'vibe-bot');
    rec.set('tags', tags);
    if (projectId) rec.set('project', projectId);
    dao.saveRecord(rec);

    console.log('[CompanionBridge] Conversation saved: ' + title.substring(0, 50));
    return c.json(200, { id: rec.getId(), title: title });
  } catch (err) {
    console.log('[CompanionBridge] Conversation save error: ' + err);
    return c.json(500, { error: String(err) });
  }
});

console.log('[CompanionBridge] Registered: POST /api/internal/conversation');
