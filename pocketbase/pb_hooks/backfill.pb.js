/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Backfill Hook
// POST /api/mytrend/backfill
// Retroactively creates activities + topics from existing conversations.
// Also cleans up bad topic data from byte-array bug.
// Safe to run multiple times (upserts, checks for duplicates).

routerAdd('POST', '/api/mytrend/backfill', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var dao = $app.dao();

  var stats = {
    activities_created: 0,
    activities_skipped: 0,
    topics_created: 0,
    topics_cleaned: 0,
    conversations_processed: 0,
    days_aggregated: 0,
    errors: [],
  };

  // --- Step 0: Clean up bad topics (numeric names from byte-array bug) ---
  try {
    var allTopics = dao.findRecordsByFilter('topics', 'user = {:uid}', '', 0, 0, { uid: userId });
    for (var ct = 0; ct < allTopics.length; ct++) {
      var topicName = allTopics[ct].getString('name');
      // Delete topics that are just numbers (byte values) or single chars
      if (/^\d+$/.test(topicName) || topicName.length <= 1) {
        dao.deleteRecord(allTopics[ct]);
        stats.topics_cleaned++;
      }
    }
    if (stats.topics_cleaned > 0) {
      console.log('[Backfill] Cleaned ' + stats.topics_cleaned + ' bad topics');
    }
  } catch (e) {
    stats.errors.push('cleanup: ' + e);
  }

  // 1. Fetch all conversations for this user
  var conversations = [];
  try {
    conversations = dao.findRecordsByFilter(
      'conversations',
      'user = {:uid}',
      '-created',
      0, 0,
      { uid: userId }
    );
  } catch (e) {
    return c.json(500, { error: 'Failed to fetch conversations: ' + e });
  }

  console.log('[Backfill] Processing ' + conversations.length + ' conversations for user ' + userId);

  // --- Helper: safely get tags array from record ---
  // PocketBase Goja returns JSON fields as byte arrays for imported data.
  // We need to detect this and parse properly.
  function getTagsArray(record) {
    var raw = record.get('tags');
    if (!raw) return [];

    // If it's already a proper array of strings
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
      return raw;
    }

    // If it looks like a byte array (array of numbers), decode it
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
      try {
        var jsonStr = '';
        for (var b = 0; b < raw.length; b++) {
          jsonStr += String.fromCharCode(raw[b]);
        }
        var parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* fall through */ }
    }

    // If it's a string, try parsing as JSON
    if (typeof raw === 'string') {
      try {
        var parsed2 = JSON.parse(raw);
        if (Array.isArray(parsed2)) return parsed2;
      } catch (e) { /* fall through */ }
      // Maybe comma-separated
      return raw.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    }

    return [];
  }

  // --- Helper: check if activity already exists for this conversation ---
  function activityExists(convId) {
    try {
      var found = dao.findFirstRecordByFilter(
        'activities',
        'user = {:uid} && type = "conversation" && metadata ~ {:convId}',
        { uid: userId, convId: convId }
      );
      return !!found;
    } catch (e) {
      return false;
    }
  }

  // --- STOP_WORDS for topic extraction ---
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
    cua:1, va:1, la:1, cho:1, voi:1, den:1, nhu:1, duoc:1, nhung:1,
    cac:1, mot:1, nay:1, trong:1, tren:1, theo:1, bao:1, day:1,
    toi:1, ban:1, chung:1, minh:1, dang:1, roi:1, nhi:1, bro:1, luon:1,
  };

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
    return result.slice(0, 10);
  }

  function slugify(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 200);
  }

  function upsertTopic(topicName, category) {
    var slug = slugify(topicName);
    if (!slug || slug.length < 2) return null;

    var existing = null;
    try {
      existing = dao.findFirstRecordByFilter(
        'topics',
        'user = {:uid} && slug = {:slug}',
        { uid: userId, slug: slug }
      );
    } catch (e) { /* not found */ }

    if (existing) {
      var count = existing.getInt('mention_count') || 0;
      existing.set('mention_count', count + 1);
      existing.set('last_seen', new Date().toISOString());
      try { dao.saveRecord(existing); } catch (err) { /* skip */ }
      return existing.getId();
    }

    try {
      var col = dao.findCollectionByNameOrId('topics');
      var record = new Record(col);
      record.set('user', userId);
      record.set('name', topicName.substring(0, 200));
      record.set('slug', slug);
      record.set('category', category || 'general');
      record.set('mention_count', 1);
      record.set('first_seen', new Date().toISOString());
      record.set('last_seen', new Date().toISOString());
      record.set('trend_data', []);
      record.set('related', []);
      dao.saveRecord(record);
      stats.topics_created++;
      return record.getId();
    } catch (err) {
      return null;
    }
  }

  // Process each conversation
  var actCol;
  try { actCol = dao.findCollectionByNameOrId('activities'); } catch (e) {
    return c.json(500, { error: 'activities collection not found' });
  }

  for (var i = 0; i < conversations.length; i++) {
    var conv = conversations[i];
    var convId = conv.getId();
    stats.conversations_processed++;

    // --- Create activity record ---
    if (!activityExists(convId)) {
      try {
        var activity = new Record(actCol);
        activity.set('user', userId);
        var proj = conv.getString('project');
        if (proj) activity.set('project', proj);
        activity.set('type', 'conversation');
        var title = conv.getString('title') || '';
        activity.set('action', 'Created conversation: ' + title.substring(0, 200));
        activity.set('device_name', conv.getString('device_name') || '');
        activity.set('metadata', JSON.stringify({
          source: conv.getString('source') || '',
          message_count: conv.getInt('message_count') || 0,
          tokens: conv.getInt('total_tokens') || 0,
          session_id: conv.getString('session_id') || '',
          conversation_id: convId,
        }));
        activity.set('timestamp', conv.getString('started_at') || conv.getString('created'));
        activity.set('duration_sec', (conv.getInt('duration_min') || 0) * 60);
        dao.saveRecord(activity);
        stats.activities_created++;
      } catch (err) {
        stats.errors.push('activity/' + convId + ': ' + err);
      }
    } else {
      stats.activities_skipped++;
    }

    // --- Extract topics ---
    var topicIds = [];

    // From tags (using safe getter that handles byte arrays)
    var tags = getTagsArray(conv);
    for (var t = 0; t < tags.length; t++) {
      var tag = String(tags[t]).trim();
      if (tag && tag.length >= 2 && tag !== 'claude-cli') {
        var tid = upsertTopic(tag, 'tag');
        if (tid) topicIds.push(tid);
      }
    }

    // From title keywords
    var convTitle = conv.getString('title') || '';
    var keywords = extractKeywords(convTitle);
    for (var k = 0; k < keywords.length; k++) {
      var kid = upsertTopic(keywords[k], 'keyword');
      if (kid && topicIds.indexOf(kid) === -1) topicIds.push(kid);
    }

    // Link related topics (co-occurring in same conversation)
    if (topicIds.length >= 2) {
      for (var ri = 0; ri < topicIds.length; ri++) {
        try {
          var topicRec2 = dao.findRecordById('topics', topicIds[ri]);
          // Decode related field (handles Goja byte-array bug)
          var rawRelated = topicRec2.get('related');
          var existing = [];
          if (Array.isArray(rawRelated) && rawRelated.length > 0 && typeof rawRelated[0] === 'string') {
            existing = rawRelated;
          } else if (Array.isArray(rawRelated) && rawRelated.length > 0 && typeof rawRelated[0] === 'number') {
            try {
              var jsonStr2 = '';
              for (var b2 = 0; b2 < rawRelated.length; b2++) jsonStr2 += String.fromCharCode(rawRelated[b2]);
              var parsed3 = JSON.parse(jsonStr2);
              if (Array.isArray(parsed3)) existing = parsed3.filter(function(x) { return typeof x === 'string'; });
            } catch (e2) { existing = []; }
          }

          var relatedSet = {};
          for (var rs = 0; rs < existing.length; rs++) relatedSet[existing[rs]] = true;
          var changed = false;
          for (var rj = 0; rj < topicIds.length; rj++) {
            if (ri === rj) continue;
            if (!relatedSet[topicIds[rj]]) {
              existing.push(topicIds[rj]);
              changed = true;
            }
          }
          if (changed) {
            if (existing.length > 50) existing = existing.slice(existing.length - 50);
            topicRec2.set('related', JSON.stringify(existing));
            dao.saveRecord(topicRec2);
          }
        } catch (e) { /* skip */ }
      }
    }

    // Update conversation topics field with topic names
    if (topicIds.length > 0) {
      try {
        var topicNames = [];
        for (var tn = 0; tn < topicIds.length; tn++) {
          try {
            var topicRec = dao.findRecordById('topics', topicIds[tn]);
            topicNames.push(topicRec.getString('name'));
          } catch (e) { /* skip */ }
        }
        conv.set('topics', topicNames);
        dao.saveRecord(conv);
      } catch (e) {
        stats.errors.push('topics/' + convId + ': ' + e);
      }
    }
  }

  // --- Run aggregation for all days that have activities ---
  try {
    var allActivities = dao.findRecordsByFilter(
      'activities',
      'user = {:uid}',
      'timestamp',
      0, 0,
      { uid: userId }
    );

    var dayMap = {};
    for (var a = 0; a < allActivities.length; a++) {
      var ts = allActivities[a].getString('timestamp') || allActivities[a].getString('created');
      var dayKey = ts.substring(0, 10);
      if (!dayMap[dayKey]) dayMap[dayKey] = [];
      dayMap[dayKey].push(allActivities[a]);
    }

    var aggCol2;
    try { aggCol2 = dao.findCollectionByNameOrId('activity_aggregates'); } catch (e) { aggCol2 = null; }

    if (aggCol2) {
      var days = Object.keys(dayMap);
      for (var d = 0; d < days.length; d++) {
        var dayStr = days[d];
        var dayActivities = dayMap[dayStr];
        var periodStart = dayStr + ' 00:00:00';

        var totalCount = dayActivities.length;
        var totalMinutes = 0;
        var breakdown = {};
        var devicesMap = {};

        for (var da = 0; da < dayActivities.length; da++) {
          var act = dayActivities[da];
          var durSec = act.getFloat('duration_sec') || 0;
          var mins = durSec / 60;
          totalMinutes += mins;

          var actType = act.getString('type') || 'unknown';
          breakdown[actType] = (breakdown[actType] || 0) + 1;

          var device = act.getString('device_name');
          if (device) devicesMap[device] = (devicesMap[device] || 0) + 1;
        }

        var existingAgg = null;
        try {
          existingAgg = dao.findFirstRecordByFilter(
            'activity_aggregates',
            'user = {:uid} && period = "day" && period_start = {:ps}',
            { uid: userId, ps: periodStart }
          );
        } catch (e) { /* not found */ }

        if (existingAgg) {
          existingAgg.set('total_count', totalCount);
          existingAgg.set('total_minutes', Math.round(totalMinutes * 100) / 100);
          existingAgg.set('breakdown', breakdown);
          existingAgg.set('devices', Object.keys(devicesMap));
          try { dao.saveRecord(existingAgg); } catch (e) { /* skip */ }
        } else {
          var aggRec = new Record(aggCol2);
          aggRec.set('user', userId);
          aggRec.set('period', 'day');
          aggRec.set('period_start', periodStart);
          aggRec.set('total_count', totalCount);
          aggRec.set('total_minutes', Math.round(totalMinutes * 100) / 100);
          aggRec.set('breakdown', breakdown);
          aggRec.set('top_topics', []);
          aggRec.set('devices', Object.keys(devicesMap));
          try { dao.saveRecord(aggRec); } catch (e) { stats.errors.push('agg/' + dayStr + ': ' + e); }
        }
      }
      stats.days_aggregated = days.length;
    }
  } catch (e) {
    stats.errors.push('aggregation: ' + e);
  }

  // --- Step: Populate trend_data for all topics ---
  try {
    // Build topic-name -> [dates] map from all conversations
    var topicDayMap = {}; // topicName -> { "2026-01-15": count }
    for (var td = 0; td < conversations.length; td++) {
      var tdConv = conversations[td];
      var tdDate = (tdConv.getString('started_at') || tdConv.getString('created') || '').substring(0, 10);
      if (!tdDate || tdDate.length !== 10) continue;

      // Get topics from conversation (already set by previous step)
      var rawTopics = tdConv.get('topics');
      var convTopics = [];
      if (Array.isArray(rawTopics) && rawTopics.length > 0 && typeof rawTopics[0] === 'string') {
        convTopics = rawTopics;
      } else if (Array.isArray(rawTopics) && rawTopics.length > 0 && typeof rawTopics[0] === 'number') {
        try {
          var js3 = '';
          for (var b3 = 0; b3 < rawTopics.length; b3++) js3 += String.fromCharCode(rawTopics[b3]);
          var p4 = JSON.parse(js3);
          if (Array.isArray(p4)) convTopics = p4;
        } catch (e) { /* skip */ }
      } else if (typeof rawTopics === 'string') {
        try { var p5 = JSON.parse(rawTopics); if (Array.isArray(p5)) convTopics = p5; } catch (e) { /* */ }
      }

      for (var ct2 = 0; ct2 < convTopics.length; ct2++) {
        var tName = String(convTopics[ct2]).trim().toLowerCase();
        if (!tName) continue;
        if (!topicDayMap[tName]) topicDayMap[tName] = {};
        topicDayMap[tName][tdDate] = (topicDayMap[tName][tdDate] || 0) + 1;
      }
    }

    // Now update each topic's trend_data
    var updatedTopics = dao.findRecordsByFilter('topics', 'user = {:uid}', '', 0, 0, { uid: userId });
    var trendPopulated = 0;
    for (var ut = 0; ut < updatedTopics.length; ut++) {
      var topicRec3 = updatedTopics[ut];
      var tNameLower = topicRec3.getString('name').toLowerCase();
      var dayCountMap = topicDayMap[tNameLower];
      if (!dayCountMap) continue;

      // Build sorted trend_data array
      var trendArr = [];
      var dateKeys = Object.keys(dayCountMap).sort();
      for (var dk = 0; dk < dateKeys.length; dk++) {
        trendArr.push({ date: dateKeys[dk], count: dayCountMap[dateKeys[dk]] });
      }

      if (trendArr.length > 0) {
        topicRec3.set('trend_data', JSON.stringify(trendArr));
        try { dao.saveRecord(topicRec3); trendPopulated++; } catch (e) { /* skip */ }
      }
    }
    stats.topics_trend_populated = trendPopulated;
    console.log('[Backfill] Populated trend_data for ' + trendPopulated + ' topics');
  } catch (e) {
    stats.errors.push('trend_data: ' + e);
  }

  console.log('[Backfill] Done: ' + JSON.stringify(stats));
  return c.json(200, stats);
});
