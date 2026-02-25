/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Smart Features
// Sprint 4B: Duplicate idea detection
// Sprint 4C: Smart auto-tags from topics collection
//
// GET /api/mytrend/ideas/similar?text=...   — returns up to 5 similar ideas
// onRecordAfterCreateRequest (ideas) — auto-tag from matching topics

// ---------------------------------------------------------------------------
// Sprint 4B: GET /api/mytrend/ideas/similar
// Returns existing ideas that share keywords with the query text.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/ideas/similar', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var text = c.queryParam('text') || '';
  var excludeId = c.queryParam('exclude') || '';

  if (text.length < 5) return c.json(200, { items: [] });

  // Extract significant words (length > 3, not stopwords)
  var stopWords = { the: 1, and: 1, for: 1, with: 1, that: 1, this: 1, are: 1, was: 1, 'is': 1,
    from: 1, has: 1, have: 1, its: 1, but: 1, not: 1, you: 1, all: 1, can: 1, 'new': 1,
    add: 1, use: 1, 'in': 1, 'on': 1, 'to': 1, 'of': 1, 'a': 1, 'an': 1, 'be': 1 };

  var words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(function(w) { return w.length > 3 && !stopWords[w]; });

  // Deduplicate words
  var seen = {};
  var uniqueWords = [];
  for (var i = 0; i < words.length; i++) {
    if (!seen[words[i]]) { seen[words[i]] = true; uniqueWords.push(words[i]); }
  }
  uniqueWords = uniqueWords.slice(0, 8);

  if (uniqueWords.length === 0) return c.json(200, { items: [] });

  var dao = $app.dao();
  var matchedMap = {}; // ideaId → { idea, score }

  for (var wi = 0; wi < uniqueWords.length; wi++) {
    var word = uniqueWords[wi];
    try {
      var matches = dao.findRecordsByFilter(
        'ideas',
        'user = {:uid} && (title ~ {:q} || content ~ {:q})',
        '-created', 10, 0,
        { uid: userId, q: word }
      );
      for (var mi = 0; mi < matches.length; mi++) {
        var idea = matches[mi];
        var ideaId = idea.getId();
        if (excludeId && ideaId === excludeId) continue;
        if (!matchedMap[ideaId]) {
          matchedMap[ideaId] = { id: ideaId, title: idea.getString('title'), score: 0, status: idea.getString('status'), type: idea.getString('type') };
        }
        matchedMap[ideaId].score++;
      }
    } catch(e) { /* search error */ }
  }

  // Sort by score descending, return top 5
  var results = [];
  var ids = Object.keys(matchedMap);
  for (var ri = 0; ri < ids.length; ri++) {
    results.push(matchedMap[ids[ri]]);
  }
  results.sort(function(a, b) { return b.score - a.score; });
  results = results.slice(0, 5);

  return c.json(200, { items: results });
});

// ---------------------------------------------------------------------------
// Sprint 4C: Smart auto-tags — fires after idea creation
// Matches title + content keywords against existing topics, adds as tags.
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest(function(e) {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var title = record.getString('title') || '';
  var content = record.getString('content') || '';
  var combinedText = (title + ' ' + content).toLowerCase();

  var dao = $app.dao();

  // Load existing topics for this user (top 100 by mention_count)
  var topics = [];
  try {
    topics = dao.findRecordsByFilter(
      'topics',
      'user = {:uid}',
      '-mention_count', 100, 0,
      { uid: userId }
    );
  } catch(e) { return; }

  if (topics.length === 0) return;

  // Get current tags
  var currentTags = [];
  try {
    var rawTags = record.get('tags');
    if (Array.isArray(rawTags)) {
      currentTags = rawTags;
    } else if (typeof rawTags === 'string' && rawTags) {
      currentTags = JSON.parse(rawTags);
    }
  } catch(e) { /* ignore */ }

  // Match topics against the idea text
  var suggestedTags = [];
  var currentTagsLower = currentTags.map(function(t) { return String(t).toLowerCase(); });

  for (var ti = 0; ti < topics.length; ti++) {
    var topicName = topics[ti].getString('name') || '';
    if (topicName.length < 3) continue;
    if (currentTagsLower.indexOf(topicName.toLowerCase()) !== -1) continue;

    // Check if topic name appears as a word boundary in the text
    var regex = new RegExp('\\b' + topicName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (regex.test(combinedText)) {
      suggestedTags.push(topicName);
      if (suggestedTags.length >= 5) break; // cap at 5 auto-suggested tags
    }
  }

  if (suggestedTags.length === 0) return;

  // Merge with existing tags and save
  var merged = currentTags.concat(suggestedTags);
  try {
    record.set('tags', merged);
    dao.saveRecord(record);
    console.log('[AutoTags] Added ' + suggestedTags.length + ' auto-tags to idea ' + record.getId() + ': ' + suggestedTags.join(', '));
  } catch(e) {
    console.log('[AutoTags] Failed to save auto-tags: ' + e);
  }
}, 'ideas');
