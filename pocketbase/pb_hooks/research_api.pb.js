/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Research Knowledge Graph Internal API
// Called by companion service to save auto-captured research items.
// NOTE: routerAdd has ISOLATED scope - must inline all helpers (no top-level vars/functions).

// POST /api/mytrend/research/internal — save a research record
routerAdd('POST', '/api/mytrend/research/internal', function (c) {
  try {
    // Auth check (inline — fail-closed: reject if secret not configured)
    var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
    if (!secret) return c.json(503, { error: 'Internal secret not configured' });
    var headerSecret = '';
    try { headerSecret = c.request().header.get('X-Internal-Secret') || ''; } catch (e) {}
    if (headerSecret !== secret) return c.json(401, { error: 'Unauthorized' });

    var body = $apis.requestInfo(c).data;
    var userId = body.userId || '';
    if (!userId) return c.json(400, { error: 'userId required' });
    if (!body.url) return c.json(400, { error: 'url required' });

    var dao = $app.dao();

    // Dedup: check if URL already exists (parameterized to prevent injection)
    try {
      var existing = dao.findRecordsByFilter('research', 'url = {:url}', '', 1, 0, { url: body.url });
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
    record.set('title', body.title || body.url);
    record.set('description', body.description || '');
    record.set('stars', parseInt(body.stars) || 0);
    record.set('npm_downloads', parseInt(body.npm_downloads) || 0);
    record.set('tech_tags', body.tech_tags || []);
    record.set('patterns_extracted', body.patterns_extracted || []);
    record.set('applicable_projects', body.applicable_projects || []);
    record.set('verdict', body.verdict || 'partial');
    record.set('ai_summary', body.ai_summary || '');
    record.set('user_comment', body.user_comment || '');
    record.set('raw_metadata', body.raw_metadata || {});

    dao.saveRecord(record);
    return c.json(200, { id: record.getId(), action: 'created' });
  } catch (e) {
    console.error('[ResearchAPI] Save error:', String(e));
    return c.json(500, { error: String(e) });
  }
});

// GET /api/mytrend/research/internal/check?url=... — dedup check
routerAdd('GET', '/api/mytrend/research/internal/check', function (c) {
  try {
    // Auth check (inline — fail-closed)
    var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
    if (!secret) return c.json(503, { error: 'Internal secret not configured' });
    var headerSecret = '';
    try { headerSecret = c.request().header.get('X-Internal-Secret') || ''; } catch (e) {}
    if (headerSecret !== secret) return c.json(401, { error: 'Unauthorized' });

    var url = c.queryParam('url');
    if (!url) return c.json(400, { error: 'url required' });

    try {
      var records = $app.dao().findRecordsByFilter(
        'research',
        'url = {:url}',
        '', 1, 0,
        { url: url }
      );
      if (records.length > 0) {
        return c.json(200, { id: records[0].getId() });
      }
    } catch (e) {
      // not found
    }

    return c.json(200, { id: null });
  } catch (e) {
    console.error('[ResearchAPI] Check error:', String(e));
    return c.json(500, { error: String(e) });
  }
});

// GET /api/mytrend/research/stats — aggregated stats for frontend
routerAdd('GET', '/api/mytrend/research/stats', function (c) {
  try {
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
      .map(function (t) { return { tag: t, count: tagCounts[t] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 20);

    return c.json(200, {
      total: records.length,
      by_source: bySource,
      by_verdict: byVerdict,
      top_tech_tags: topTags,
      applicable_by_project: projectCounts,
    });
  } catch (e) {
    console.error('[ResearchAPI] Stats error:', String(e));
    return c.json(500, { error: String(e) });
  }
});

// GET /api/mytrend/research/trends — monthly tag/source trends for radar visualization
routerAdd('GET', '/api/mytrend/research/trends', function (c) {
  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Unauthorized' });
    var userId = authRecord.getId();

    var dao = $app.dao();

    // Fetch last 6 months of research
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var startStr = sixMonthsAgo.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

    var records = [];
    try {
      records = dao.findRecordsByFilter(
        'research',
        'user = {:uid} && created >= {:start}',
        '-created', 1000, 0,
        { uid: userId, start: startStr }
      );
    } catch (e) {}

    // Group by month
    var monthlyTags = {};   // { "2026-01": { svelte: 2, react: 1 } }
    var monthlySources = {}; // { "2026-01": { github: 3, npm: 1 } }
    var allTagCounts = {};   // overall tag counts for current + previous month comparison
    var allPatterns = {};    // pattern → count

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var created = rec.getString('created');
      var month = created.substring(0, 7); // "2026-01"

      // Source
      var src = rec.getString('source');
      if (!monthlySources[month]) monthlySources[month] = {};
      monthlySources[month][src] = (monthlySources[month][src] || 0) + 1;

      // Tags
      var tags = rec.get('tech_tags') || [];
      if (!monthlyTags[month]) monthlyTags[month] = {};
      for (var j = 0; j < tags.length; j++) {
        monthlyTags[month][tags[j]] = (monthlyTags[month][tags[j]] || 0) + 1;
        allTagCounts[tags[j]] = (allTagCounts[tags[j]] || 0) + 1;
      }

      // Patterns
      var patterns = rec.get('patterns_extracted') || [];
      for (var p = 0; p < patterns.length; p++) {
        allPatterns[patterns[p]] = (allPatterns[patterns[p]] || 0) + 1;
      }
    }

    // Build sorted month keys
    var months = Object.keys(monthlyTags).concat(Object.keys(monthlySources));
    var monthSet = {};
    for (var m = 0; m < months.length; m++) monthSet[months[m]] = true;
    var sortedMonths = Object.keys(monthSet).sort();

    // Tag trends: array of { month, tags: {} }
    var tagTrends = [];
    for (var mi = 0; mi < sortedMonths.length; mi++) {
      tagTrends.push({ month: sortedMonths[mi], tags: monthlyTags[sortedMonths[mi]] || {} });
    }

    // Source trends
    var sourceTrends = [];
    for (var si = 0; si < sortedMonths.length; si++) {
      sourceTrends.push({ month: sortedMonths[si], sources: monthlySources[sortedMonths[si]] || {} });
    }

    // Rising tags: compare current month vs previous month
    var rising = [];
    if (sortedMonths.length >= 2) {
      var curMonth = sortedMonths[sortedMonths.length - 1];
      var prevMonth = sortedMonths[sortedMonths.length - 2];
      var curTags = monthlyTags[curMonth] || {};
      var prevTags = monthlyTags[prevMonth] || {};
      var allCurKeys = Object.keys(curTags);
      for (var ri = 0; ri < allCurKeys.length; ri++) {
        var tag = allCurKeys[ri];
        if ((curTags[tag] || 0) > (prevTags[tag] || 0)) {
          rising.push(tag);
        }
      }
    }

    // Top patterns (sorted by count)
    var topPatterns = Object.keys(allPatterns)
      .map(function (p) { return { pattern: p, count: allPatterns[p] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 15);

    return c.json(200, {
      tag_trends: tagTrends,
      source_trends: sourceTrends,
      rising: rising.slice(0, 10),
      top_patterns: topPatterns,
    });
  } catch (e) {
    console.error('[ResearchAPI] Trends error:', String(e));
    return c.json(500, { error: String(e) });
  }
});

console.log(
  '[ResearchAPI] Registered: POST /api/mytrend/research/internal, GET check, GET stats, GET trends',
);
