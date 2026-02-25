/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Research Knowledge Graph Internal API
// Called by companion service to save auto-captured research items.

var INTERNAL_SECRET = $os.getenv('COMPANION_INTERNAL_SECRET') || '';

function checkResearchSecret(c) {
  var secret = c.request().header.get('X-Internal-Secret');
  return INTERNAL_SECRET && secret === INTERNAL_SECRET;
}

// POST /api/internal/research — save a research record
routerAdd('POST', '/api/internal/research', function (c) {
  if (!checkResearchSecret(c)) return c.json(401, { error: 'Unauthorized' });

  var body = $apis.requestInfo(c).data;
  var userId = body.userId || '';
  if (!userId) return c.json(400, { error: 'userId required' });
  if (!body.url) return c.json(400, { error: 'url required' });

  var dao = $app.dao();

  // Dedup: check if URL already exists for this user
  try {
    var existing = dao.findRecordsByFilter('research', "url = '" + body.url.replace(/'/g, "''") + "'", '', 1, 0);
    if (existing.length > 0) {
      return c.json(200, { id: existing[0].getId(), action: 'exists' });
    }
  } catch (e) {
    // not found, proceed to create
  }

  var collection = dao.findCollectionByNameOrId('research');
  var record = new Record(collection);
  record.set('user', userId);
  record.set('url', body.url);
  record.set('source', body.source || 'other');
  record.set('title', body.title || '');
  record.set('description', body.description || '');
  record.set('stars', body.stars || 0);
  record.set('npm_downloads', body.npm_downloads || 0);
  record.set('tech_tags', body.tech_tags || []);
  record.set('patterns_extracted', body.patterns_extracted || []);
  record.set('applicable_projects', body.applicable_projects || []);
  record.set('verdict', body.verdict || 'partial');
  record.set('ai_summary', body.ai_summary || '');
  record.set('user_comment', body.user_comment || '');
  record.set('raw_metadata', body.raw_metadata || {});
  record.set('processed_at', body.processed_at || new Date().toISOString());

  dao.saveRecord(record);
  return c.json(200, { id: record.getId(), action: 'created' });
});

// GET /api/internal/research/check?url=... — dedup check
routerAdd('GET', '/api/internal/research/check', function (c) {
  if (!checkResearchSecret(c)) return c.json(401, { error: 'Unauthorized' });

  var url = c.queryParam('url');
  if (!url) return c.json(400, { error: 'url required' });

  try {
    var records = $app.dao().findRecordsByFilter(
      'research',
      "url = '" + url.replace(/'/g, "''") + "'",
      '',
      1,
      0,
    );
    if (records.length > 0) {
      return c.json(200, { id: records[0].getId() });
    }
  } catch (e) {
    // not found
  }

  return c.json(200, { id: null });
});

// GET /api/mytrend/research/stats — aggregated stats for frontend
routerAdd('GET', '/api/mytrend/research/stats', function (c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Unauthorized' });
  var userId = authRecord.getId();

  var dao = $app.dao();
  var records = [];
  try {
    records = dao.findRecordsByFilter('research', "user = '" + userId + "'", '-created', 500, 0);
  } catch (e) {
    // empty
  }

  var bySource = { github: 0, npm: 0, blog: 0, docs: 0, other: 0 };
  var byVerdict = { fit: 0, partial: 0, 'concept-only': 0, irrelevant: 0 };
  var tagCounts = {};
  var projectCounts = {};

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var src = rec.getString('source');
    if (bySource[src] !== undefined) bySource[src]++;

    var v = rec.getString('verdict');
    if (byVerdict[v] !== undefined) byVerdict[v]++;

    var tags = rec.get('tech_tags') || [];
    for (var j = 0; j < tags.length; j++) {
      tagCounts[tags[j]] = (tagCounts[tags[j]] || 0) + 1;
    }

    var projects = rec.get('applicable_projects') || [];
    for (var k = 0; k < projects.length; k++) {
      projectCounts[projects[k]] = (projectCounts[projects[k]] || 0) + 1;
    }
  }

  var topTags = Object.keys(tagCounts)
    .map(function (t) {
      return { tag: t, count: tagCounts[t] };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    })
    .slice(0, 20);

  return c.json(200, {
    total: records.length,
    by_source: bySource,
    by_verdict: byVerdict,
    top_tech_tags: topTags,
    applicable_by_project: projectCounts,
  });
});

console.log(
  '[ResearchAPI] Registered: POST /api/internal/research, GET /api/internal/research/check, GET /api/mytrend/research/stats',
);
