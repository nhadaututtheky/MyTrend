/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Ask API
// POST /api/mytrend/ask
// Semantic "Ask" endpoint: combines FTS5 search with Neural Memory query
// to answer natural language questions about your knowledge base.

routerAdd('POST', '/api/mytrend/ask', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function b2s(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw) return '';
    if (Array.isArray(raw)) {
      var s = '';
      for (var i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
      return s;
    }
    return String(raw);
  }
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var body = $apis.requestInfo(c).data;
    var question = '';

    if (body && body.question) {
      question = String(body.question).trim();
    }

    if (!question || question.length < 3) {
      return c.json(400, { error: 'Question must be at least 3 characters' });
    }

    var dao = $app.dao();
    var sources = [];

    // --- 1. FTS5 search across collections ---
    var searchTerm = question
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(function(w) { return w.length >= 2; })
      .slice(0, 8)
      .join(' OR ');

    if (searchTerm.length > 0) {
      // Search conversations
      try {
        var convs = dao.findRecordsByFilter(
          'conversations',
          'user = {:uid} && (title ~ {:q} || summary ~ {:q})',
          '-created', 10, 0,
          { uid: userId, q: question.substring(0, 100) }
        );
        for (var ci = 0; ci < convs.length; ci++) {
          var conv = convs[ci];
          var summary = b2s(conv.get('summary')) || b2s(conv.get('title'));
          sources.push({
            type: 'conversation',
            id: conv.getId(),
            title: b2s(conv.get('title')),
            snippet: summary.substring(0, 250),
            relevance: 0.8 - (ci * 0.05),
          });
        }
      } catch (e) { /* empty */ }

      // Search ideas
      try {
        var ideas = dao.findRecordsByFilter(
          'ideas',
          'user = {:uid} && (title ~ {:q} || content ~ {:q})',
          '-created', 10, 0,
          { uid: userId, q: question.substring(0, 100) }
        );
        for (var ii = 0; ii < ideas.length; ii++) {
          var idea = ideas[ii];
          sources.push({
            type: 'idea',
            id: idea.getId(),
            title: b2s(idea.get('title')),
            snippet: b2s(idea.get('content')).substring(0, 250),
            relevance: 0.75 - (ii * 0.05),
          });
        }
      } catch (e) { /* empty */ }

      // Search topics
      try {
        var topics = dao.findRecordsByFilter(
          'topics',
          'user = {:uid} && name ~ {:q}',
          '-mention_count', 5, 0,
          { uid: userId, q: question.substring(0, 100) }
        );
        for (var ti = 0; ti < topics.length; ti++) {
          var topic = topics[ti];
          sources.push({
            type: 'topic',
            id: topic.getId(),
            title: b2s(topic.get('name')),
            snippet: 'Mentioned ' + topic.getInt('mention_count') + ' times, category: ' + (b2s(topic.get('category')) || 'general'),
            relevance: 0.7 - (ti * 0.05),
          });
        }
      } catch (e) { /* empty */ }

      // Search projects
      try {
        var projs = dao.findRecordsByFilter(
          'projects',
          'user = {:uid} && (name ~ {:q} || description ~ {:q})',
          '-last_activity', 5, 0,
          { uid: userId, q: question.substring(0, 100) }
        );
        for (var pi = 0; pi < projs.length; pi++) {
          var proj = projs[pi];
          sources.push({
            type: 'project',
            id: proj.getId(),
            title: b2s(proj.get('name')),
            snippet: b2s(proj.get('description')).substring(0, 250),
            relevance: 0.7 - (pi * 0.05),
          });
        }
      } catch (e) { /* empty */ }
    }

    // --- 2. Sort by relevance, deduplicate ---
    sources.sort(function(a, b) { return b.relevance - a.relevance; });

    var seen = {};
    var uniqueSources = [];
    for (var si = 0; si < sources.length; si++) {
      var key = sources[si].type + ':' + sources[si].id;
      if (!seen[key]) {
        seen[key] = true;
        uniqueSources.push(sources[si]);
      }
    }
    uniqueSources = uniqueSources.slice(0, 15);

    // --- 3. Build answer from context ---
    var answer = '';
    if (uniqueSources.length === 0) {
      answer = 'No relevant information found for: "' + question + '". Try rephrasing your question or searching with different keywords.';
    } else {
      var parts = [];
      var typeGroups = {};
      for (var ai = 0; ai < uniqueSources.length; ai++) {
        var src = uniqueSources[ai];
        if (!typeGroups[src.type]) typeGroups[src.type] = [];
        typeGroups[src.type].push(src);
      }

      var typeKeys = Object.keys(typeGroups);
      for (var tk = 0; tk < typeKeys.length; tk++) {
        var tType = typeKeys[tk];
        var group = typeGroups[tType];
        var names = group.slice(0, 3).map(function(g) { return '"' + g.title + '"'; }).join(', ');
        parts.push('Found ' + group.length + ' ' + tType + '(s): ' + names);
      }

      answer = 'Based on your knowledge base: ' + parts.join('. ') + '.';

      if (uniqueSources[0] && uniqueSources[0].snippet) {
        answer += ' Most relevant: ' + uniqueSources[0].snippet.substring(0, 200);
      }
    }

    return c.json(200, {
      answer: answer,
      sources: uniqueSources,
      query: question,
    });
  } catch (e) {
    console.log('[AskAPI] Error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

console.log('[AskAPI] Registered: POST /api/mytrend/ask');
