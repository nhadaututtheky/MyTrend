/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Trend API
// Endpoints for topic trend comparison and trending topics.
// NOTE: PocketBase Goja isolates each routerAdd callback scope.
// All helper functions MUST be defined inside each callback.

// ---------------------------------------------------------------------------
// GET /api/mytrend/topic-trends
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/topic-trends', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function decodeTrendData(raw) {
    var arr = [];
    if (!raw) return arr;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') { arr = raw; }
    else if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
      try { var s = ''; for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]); var p = JSON.parse(s); if (Array.isArray(p)) arr = p; } catch (e) {}
    } else if (typeof raw === 'string') {
      try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) arr = p2; } catch (e) {}
    }
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && typeof arr[i].date === 'string' && typeof arr[i].count === 'number') {
        result.push({ date: arr[i].date, count: arr[i].count });
      }
    }
    return result;
  }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().substring(0, 10); }
  function fillDateRange(data, startDate, endDate) {
    var dateMap = {};
    for (var i = 0; i < data.length; i++) dateMap[data[i].date] = data[i].count;
    var result = [];
    var current = new Date(startDate + 'T00:00:00Z');
    var end = new Date(endDate + 'T00:00:00Z');
    while (current <= end) {
      var key = current.toISOString().substring(0, 10);
      result.push({ date: key, count: dateMap[key] || 0 });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }
  var COLORS = ['#00D26A', '#4ECDC4', '#FF9F43', '#A29BFE', '#FF4757'];
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var topicSlugs = (c.queryParam('topics') || '').split(',').filter(function(s) { return s.trim().length > 0; });
    if (topicSlugs.length === 0) return c.json(400, { error: 'Provide at least 1 topic slug' });
    if (topicSlugs.length > 5) topicSlugs = topicSlugs.slice(0, 5);

    var range = c.queryParam('range') || '30d';
    var daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    var days = daysMap[range] || 30;
    var startDate = daysAgo(days);
    var endDate = new Date().toISOString().substring(0, 10);
    var dao = $app.dao();
    var series = [];

    for (var i = 0; i < topicSlugs.length; i++) {
      var slug = topicSlugs[i].trim().toLowerCase();
      try {
        var topic = dao.findFirstRecordByFilter('topics', 'user = {:uid} && slug = {:slug}', { uid: userId, slug: slug });
        var trendData = decodeTrendData(topic.get('trend_data'));
        var filtered = trendData.filter(function(d) { return d.date >= startDate; });
        var filled = fillDateRange(filtered, startDate, endDate);
        series.push({
          topic_id: topic.getId(), name: topic.getString('name'),
          slug: slug, color: COLORS[i % COLORS.length], data: filled,
        });
      } catch (e) { console.log('[TrendAPI] Topic not found: ' + slug); }
    }

    return c.json(200, { range: range, start: startDate, end: endDate, series: series });
  } catch (e) {
    console.log('[TrendAPI] topic-trends error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/trending-topics
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/trending-topics', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function decodeTrendData(raw) {
    var arr = [];
    if (!raw) return arr;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') { arr = raw; }
    else if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
      try { var s = ''; for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]); var p = JSON.parse(s); if (Array.isArray(p)) arr = p; } catch (e) {}
    } else if (typeof raw === 'string') {
      try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) arr = p2; } catch (e) {}
    }
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && typeof arr[i].date === 'string' && typeof arr[i].count === 'number') {
        result.push({ date: arr[i].date, count: arr[i].count });
      }
    }
    return result;
  }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().substring(0, 10); }
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var limit = parseInt(c.queryParam('limit') || '20', 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    var dao = $app.dao();
    var allTopics;
    try {
      allTopics = dao.findRecordsByFilter('topics', 'user = {:uid}', '-mention_count', 0, 0, { uid: userId });
    } catch (e) {
      return c.json(200, { topics: [] });
    }

    var today = new Date();
    var day7ago = daysAgo(7);
    var day14ago = daysAgo(14);
    var results = [];

    for (var i = 0; i < allTopics.length; i++) {
      var topic = allTopics[i];
      var trendData = decodeTrendData(topic.get('trend_data'));
      var last7 = 0;
      var prev7 = 0;
      var sparkline = [0, 0, 0, 0, 0, 0, 0];

      for (var d = 0; d < trendData.length; d++) {
        var entry = trendData[d];
        if (entry.date >= day7ago) {
          last7 += entry.count;
          var daysFromToday = Math.floor((today.getTime() - new Date(entry.date + 'T00:00:00Z').getTime()) / 86400000);
          var sparkIdx = 6 - daysFromToday;
          if (sparkIdx >= 0 && sparkIdx < 7) sparkline[sparkIdx] += entry.count;
        } else if (entry.date >= day14ago) {
          prev7 += entry.count;
        }
      }

      var direction = 'stable';
      var changePct = 0;
      if (prev7 > 0) {
        changePct = Math.round(((last7 - prev7) / prev7) * 100);
        if (changePct >= 25) direction = 'rising';
        else if (changePct <= -25) direction = 'falling';
      } else if (last7 > 0) {
        direction = 'rising';
        changePct = 100;
      }

      results.push({
        id: topic.getId(),
        name: topic.getString('name'),
        slug: topic.getString('slug'),
        category: topic.getString('category') || 'general',
        mention_count: topic.getInt('mention_count') || 0,
        direction: direction,
        change_pct: changePct,
        last_7d_count: last7,
        sparkline: sparkline,
      });
    }

    results.sort(function(a, b) {
      if (a.direction === 'rising' && b.direction !== 'rising') return -1;
      if (b.direction === 'rising' && a.direction !== 'rising') return 1;
      if (a.change_pct !== b.change_pct) return b.change_pct - a.change_pct;
      return b.mention_count - a.mention_count;
    });

    return c.json(200, { topics: results.slice(0, limit) });
  } catch (e) {
    console.log('[TrendAPI] trending-topics error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

console.log('[TrendAPI] Registered: /api/mytrend/topic-trends, /api/mytrend/trending-topics');
