/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Topic Extraction
// Extracts topics from conversation tags + title keywords.
// Upserts into topics collection, tracks mention_count, builds related field.

var STOP_WORDS = {
  the:1, a:1, an:1, is:1, are:1, was:1, were:1, be:1, been:1, being:1,
  have:1, has:1, had:1, do:1, does:1, did:1, will:1, would:1, could:1,
  should:1, may:1, might:1, can:1, shall:1, must:1, need:1, to:1, of:1,
  in:1, for:1, on:1, with:1, at:1, by:1, from:1, as:1, into:1, through:1,
  during:1, before:1, after:1, above:1, below:1, between:1, out:1, off:1,
  over:1, under:1, again:1, further:1, then:1, once:1, and:1, but:1, or:1,
  nor:1, not:1, so:1, yet:1, both:1, either:1, neither:1, each:1, every:1,
  all:1, any:1, few:1, more:1, most:1, other:1, some:1, such:1, no:1,
  only:1, own:1, same:1, than:1, too:1, very:1, just:1, because:1, if:1,
  when:1, while:1, where:1, how:1, what:1, which:1, who:1, whom:1, this:1,
  that:1, these:1, those:1, it:1, its:1, my:1, your:1, his:1, her:1,
  our:1, their:1, me:1, him:1, us:1, them:1, i:1, you:1, he:1, she:1,
  we:1, they:1, about:1, up:1, down:1, here:1, there:1, now:1, also:1,
  like:1, get:1, got:1, make:1, made:1, use:1, used:1, using:1, file:1,
  code:1, new:1, add:1, fix:1, update:1, create:1, delete:1, remove:1,
  change:1, set:1, run:1, test:1, check:1, want:1, look:1, see:1, know:1,
  think:1, try:1, help:1, let:1, sure:1, right:1, well:1, good:1, work:1,
  time:1, way:1, first:1, last:1, next:1, back:1, still:1, already:1,
  don:1, doesn:1, didn:1, won:1, can:1, couldn:1, shouldn:1, wouldn:1,
  // Vietnamese stop words
  cua:1, va:1, la:1, cho:1, voi:1, den:1, nhu:1, duoc:1, nhung:1,
  cac:1, mot:1, nay:1, cua:1, trong:1, tren:1, theo:1, bao:1, day:1,
  toi:1, ban:1, chung:1, minh:1, dang:1, roi:1, nhi:1, bro:1, luon:1,
};

/**
 * Extract keyword topics from a title string.
 */
function extractKeywords(title) {
  if (!title) return [];
  var words = title.toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\s\-]/g, ' ')
    .split(/\s+/);
  var seen = {};
  var result = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i].trim();
    if (w.length < 3 || STOP_WORDS[w] || seen[w]) continue;
    seen[w] = true;
    result.push(w);
  }
  return result.slice(0, 10); // max 10 keywords per title
}

/**
 * Generate slug from topic name.
 */
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

/**
 * Upsert a topic and return its ID.
 */
function upsertTopic(dao, userId, topicName, category) {
  var slug = slugify(topicName);
  if (!slug) return null;

  var existing = null;
  try {
    existing = dao.findFirstRecordByFilter(
      'topics',
      'user = {:uid} && slug = {:slug}',
      { uid: userId, slug: slug }
    );
  } catch (e) { /* not found */ }

  if (existing) {
    // Increment mention_count + trend_data
    var count = existing.getInt('mention_count') || 0;
    existing.set('mention_count', count + 1);
    existing.set('last_seen', new Date().toISOString());
    appendTrendData(existing, dao);
    try {
      dao.saveRecord(existing);
      return existing.getId();
    } catch (err) {
      console.log('[TopicExtraction] Update error: ' + err);
      return existing.getId();
    }
  }

  // Create new topic
  try {
    var today = new Date().toISOString().substring(0, 10);
    var col = dao.findCollectionByNameOrId('topics');
    var record = new Record(col);
    record.set('user', userId);
    record.set('name', topicName.substring(0, 200));
    record.set('slug', slug);
    record.set('category', category || 'general');
    record.set('mention_count', 1);
    record.set('first_seen', new Date().toISOString());
    record.set('last_seen', new Date().toISOString());
    record.set('trend_data', JSON.stringify([{ date: today, count: 1 }]));
    record.set('related', JSON.stringify([]));
    dao.saveRecord(record);
    console.log('[TopicExtraction] Created topic: ' + topicName);
    return record.getId();
  } catch (err) {
    console.log('[TopicExtraction] Create error for "' + topicName + '": ' + err);
    return null;
  }
}

/**
 * Add related topic IDs to each other.
 */
function linkRelatedTopics(dao, topicIds) {
  if (topicIds.length < 2) return;

  for (var i = 0; i < topicIds.length; i++) {
    var tid = topicIds[i];
    try {
      var rec = dao.findRecordById('topics', tid);
      // Decode related field (handles Goja byte-array bug)
      var rawRel = rec.get('related');
      var related = [];
      if (Array.isArray(rawRel) && rawRel.length > 0 && typeof rawRel[0] === 'string') {
        related = rawRel;
      } else if (Array.isArray(rawRel) && rawRel.length > 0 && typeof rawRel[0] === 'number') {
        try {
          var s = '';
          for (var b = 0; b < rawRel.length; b++) s += String.fromCharCode(rawRel[b]);
          var p = JSON.parse(s);
          if (Array.isArray(p)) related = p.filter(function(x) { return typeof x === 'string'; });
        } catch (e) { related = []; }
      }

      var relatedSet = {};
      for (var r = 0; r < related.length; r++) { relatedSet[related[r]] = true; }

      var changed = false;
      for (var j = 0; j < topicIds.length; j++) {
        if (i === j) continue;
        if (!relatedSet[topicIds[j]]) {
          related.push(topicIds[j]);
          changed = true;
        }
      }

      if (changed) {
        if (related.length > 50) related = related.slice(related.length - 50);
        rec.set('related', JSON.stringify(related));
        dao.saveRecord(rec);
      }
    } catch (e) { /* skip */ }
  }
}

/**
 * Decode a JSON array field safely (handles Goja byte-array bug).
 */
function decodeJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw;
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
 * Decode trend_data field: returns array of {date, count} objects.
 */
function decodeTrendData(raw) {
  var arr = decodeJsonArray(raw);
  // Validate entries are {date, count} objects
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && typeof arr[i].date === 'string' && typeof arr[i].count === 'number') {
      result.push(arr[i]);
    }
  }
  return result;
}

/**
 * Append or increment today's count in trend_data.
 */
function appendTrendData(record, dao) {
  var trendData = decodeTrendData(record.get('trend_data'));
  var today = new Date().toISOString().substring(0, 10);
  var last = trendData.length > 0 ? trendData[trendData.length - 1] : null;
  if (last && last.date === today) {
    last.count = (last.count || 0) + 1;
  } else {
    trendData.push({ date: today, count: 1 });
  }
  // Cap at 365 days
  if (trendData.length > 365) trendData = trendData.slice(trendData.length - 365);
  record.set('trend_data', JSON.stringify(trendData));
}

/**
 * Safely get tags as string array (handles Goja byte-array bug).
 */
function getTagsArray(record) {
  var raw = record.get('tags');
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw;
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
// Extract topics from conversations
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var topicIds = [];

  // 1. Extract from tags (safe getter handles byte arrays)
  var tags = getTagsArray(record);
  for (var i = 0; i < tags.length; i++) {
    var tag = String(tags[i]).trim();
    if (tag && tag.length >= 2 && tag !== 'claude-cli') {
      var id = upsertTopic(dao, userId, tag, 'tag');
      if (id) topicIds.push(id);
    }
  }

  // 2. Extract keywords from title
  var title = record.getString('title') || '';
  var keywords = extractKeywords(title);
  for (var k = 0; k < keywords.length; k++) {
    var id2 = upsertTopic(dao, userId, keywords[k], 'keyword');
    if (id2 && topicIds.indexOf(id2) === -1) topicIds.push(id2);
  }

  // 3. Link related topics (topics that co-occur in same conversation)
  if (topicIds.length >= 2) {
    linkRelatedTopics(dao, topicIds);
  }

  // 4. Update conversation's topics field with topic names
  if (topicIds.length > 0) {
    try {
      var topicNames = [];
      for (var t = 0; t < topicIds.length; t++) {
        try {
          var topicRec = dao.findRecordById('topics', topicIds[t]);
          topicNames.push(topicRec.getString('name'));
        } catch (e) { /* skip */ }
      }
      record.set('topics', topicNames);
      dao.saveRecord(record);
    } catch (e) {
      console.log('[TopicExtraction] Failed to update conversation topics: ' + e);
    }
  }

  console.log('[TopicExtraction] Extracted ' + topicIds.length + ' topics from conversation: ' + record.getId());
}, 'conversations');

// ---------------------------------------------------------------------------
// Extract topics from ideas
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var topicIds = [];

  // 1. Extract from tags (safe getter handles byte arrays)
  var tags = getTagsArray(record);
  for (var i = 0; i < tags.length; i++) {
    var tag = String(tags[i]).trim();
    if (tag && tag.length >= 2) {
      var id = upsertTopic(dao, userId, tag, 'tag');
      if (id) topicIds.push(id);
    }
  }

  // 2. Extract from idea type as category
  var ideaType = record.getString('type');
  if (ideaType) {
    var id2 = upsertTopic(dao, userId, ideaType, 'idea-type');
    if (id2 && topicIds.indexOf(id2) === -1) topicIds.push(id2);
  }

  // 3. Extract keywords from title
  var title = record.getString('title') || '';
  var keywords = extractKeywords(title);
  for (var k = 0; k < keywords.length; k++) {
    var id3 = upsertTopic(dao, userId, keywords[k], 'keyword');
    if (id3 && topicIds.indexOf(id3) === -1) topicIds.push(id3);
  }

  // 4. Link related
  if (topicIds.length >= 2) {
    linkRelatedTopics(dao, topicIds);
  }

  console.log('[TopicExtraction] Extracted ' + topicIds.length + ' topics from idea: ' + record.getId());
}, 'ideas');

// ---------------------------------------------------------------------------
// Extract topics from plans
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var topicIds = [];

  // 1. Extract from tags
  var tags = getTagsArray(record);
  for (var i = 0; i < tags.length; i++) {
    var tag = String(tags[i]).trim();
    if (tag && tag.length >= 2 && tag !== 'auto-extracted' && tag !== 'backfill') {
      var id = upsertTopic(dao, userId, tag, 'tag');
      if (id) topicIds.push(id);
    }
  }

  // 2. Extract from plan_type as category
  var planType = record.getString('plan_type');
  if (planType) {
    var id2 = upsertTopic(dao, userId, planType, 'plan-type');
    if (id2 && topicIds.indexOf(id2) === -1) topicIds.push(id2);
  }

  // 3. Extract keywords from title
  var title = record.getString('title') || '';
  var keywords = extractKeywords(title);
  for (var k = 0; k < keywords.length; k++) {
    var id3 = upsertTopic(dao, userId, keywords[k], 'keyword');
    if (id3 && topicIds.indexOf(id3) === -1) topicIds.push(id3);
  }

  // 4. Link related
  if (topicIds.length >= 2) {
    linkRelatedTopics(dao, topicIds);
  }

  console.log('[TopicExtraction] Extracted ' + topicIds.length + ' topics from plan: ' + record.getId());
}, 'plans');
