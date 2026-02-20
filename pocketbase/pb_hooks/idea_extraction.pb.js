/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Smart Idea Extraction
// Auto-extracts ideas from conversation user messages using signal phrases.
// Creates ideas with status "inbox" for user review.

// Signal phrases that indicate an idea/task/bug/feature
var IDEA_SIGNALS = {
  feature: [
    'should add', 'need to add', 'let\'s add', 'we need', 'let\'s implement',
    'let\'s build', 'should implement', 'want to add', 'need to implement',
    'feature:', 'feat:', 'can we add', 'would be nice to', 'should have',
    'can them', 'nen them', 'nen lam', 'can lam', 'them tinh nang',
  ],
  bug: [
    'bug:', 'bug nay', 'still broken', 'doesn\'t work', 'not working',
    'is broken', 'error when', 'fails when', 'crash when', 'fix the',
    'phai fix', 'bi loi', 'ko chay', 'khong chay', 'dang loi',
  ],
  optimization: [
    'too slow', 'should optimize', 'need to optimize', 'performance issue',
    'can optimize', 'let\'s optimize', 'refactor', 'clean up',
    'cham qua', 'nen toi uu', 'can refactor',
  ],
  question: [
    'should we', 'what if we', 'how about', 'what do you think',
    'nen dung gi', 'lam sao', 'tai sao',
  ],
};

/**
 * Strip Vietnamese diacritics so "nên thêm" matches signal "nen them".
 */
var VIET_MAP = {
  'à':'a','á':'a','ả':'a','ã':'a','ạ':'a',
  'ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a',
  'â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a',
  'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
  'ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e',
  'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
  'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o',
  'ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o',
  'ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o',
  'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
  'ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u',
  'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
  'đ':'d',
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
  // Find sentence boundaries around the position
  var start = position;
  var end = position;

  // Go back to find sentence start
  while (start > 0 && text[start - 1] !== '.' && text[start - 1] !== '\n' && text[start - 1] !== '!' && text[start - 1] !== '?') {
    start--;
  }
  // Skip whitespace at start
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

// ---------------------------------------------------------------------------
// Extract ideas from new conversations
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var messages = decodeMessagesArray(record.get('messages'));
  var convId = record.getId();
  var projectId = record.getString('project') || '';

  var extractedCount = 0;
  var seenTitles = {}; // Dedup within same conversation

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (!msg || msg.role !== 'user' || !msg.content) continue;
    var content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length < 20) continue;

    var detection = detectIdea(content);
    if (!detection) continue;

    var title = extractSentence(content, detection.position);
    if (!title) continue;

    // Dedup: skip if similar title already extracted
    var titleKey = title.substring(0, 50).toLowerCase();
    if (seenTitles[titleKey]) continue;
    seenTitles[titleKey] = true;

    // Check if idea with similar title already exists
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

    // Max 3 ideas per conversation to avoid noise
    if (extractedCount >= 3) break;
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
}, 'conversations');

console.log('[IdeaExtraction] Registered: auto-extract ideas from conversations');
