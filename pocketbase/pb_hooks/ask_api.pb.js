/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Ask API
// POST /api/mytrend/ask
// Semantic "Ask" endpoint: combines FTS5 search with Neural Memory query
// to answer natural language questions about your knowledge base.
// Searches: conversations, ideas, topics, projects, plans, activities, claude_tasks

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
    var shortQ = question.substring(0, 100);

    // --- 1. FTS5 search across ALL collections ---

    // Search conversations
    try {
      var convs = dao.findRecordsByFilter(
        'conversations',
        'user = {:uid} && (title ~ {:q} || summary ~ {:q})',
        '-created', 10, 0,
        { uid: userId, q: shortQ }
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
        { uid: userId, q: shortQ }
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
        { uid: userId, q: shortQ }
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
        { uid: userId, q: shortQ }
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

    // Search plans
    try {
      var plans = dao.findRecordsByFilter(
        'plans',
        'user = {:uid} && (title ~ {:q} || content ~ {:q} || reasoning ~ {:q})',
        '-created', 5, 0,
        { uid: userId, q: shortQ }
      );
      for (var pli = 0; pli < plans.length; pli++) {
        var plan = plans[pli];
        sources.push({
          type: 'plan',
          id: plan.getId(),
          title: b2s(plan.get('title')),
          snippet: b2s(plan.get('content')).substring(0, 250),
          relevance: 0.72 - (pli * 0.05),
        });
      }
    } catch (e) { /* empty */ }

    // Search activities
    try {
      var acts = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && action ~ {:q}',
        '-timestamp', 10, 0,
        { uid: userId, q: shortQ }
      );
      for (var ai = 0; ai < acts.length; ai++) {
        var act = acts[ai];
        var actSnippet = b2s(act.get('type')) + ': ' + b2s(act.get('action')).substring(0, 200);
        sources.push({
          type: 'activity',
          id: act.getId(),
          title: b2s(act.get('action')),
          snippet: actSnippet,
          relevance: 0.65 - (ai * 0.03),
        });
      }
    } catch (e) { /* empty */ }

    // Search claude_tasks
    try {
      var tasks = dao.findRecordsByFilter(
        'claude_tasks',
        'user = {:uid} && (content ~ {:q} || session_title ~ {:q})',
        '-created', 10, 0,
        { uid: userId, q: shortQ }
      );
      for (var cti = 0; cti < tasks.length; cti++) {
        var task = tasks[cti];
        sources.push({
          type: 'claude_task',
          id: task.getId(),
          title: b2s(task.get('content')),
          snippet: 'Session: ' + (b2s(task.get('session_title')) || 'Unknown') + ' | Status: ' + b2s(task.get('status')),
          relevance: 0.6 - (cti * 0.03),
        });
      }
    } catch (e) { /* empty */ }

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

    // --- 3. Build structured answer from context ---
    var answer = '';
    if (uniqueSources.length === 0) {
      answer = 'No relevant information found for: "' + question + '". Try rephrasing your question or searching with different keywords.';
    } else {
      // Lead with most relevant result
      var top = uniqueSources[0];
      var lead = top.title || top.snippet;
      answer = 'Most relevant ' + top.type + ': "' + lead + '"';
      if (top.snippet && top.snippet !== lead) {
        answer += ' - ' + top.snippet.substring(0, 150);
      }

      // Group remaining by type
      var typeGroups = {};
      for (var gi = 1; gi < uniqueSources.length; gi++) {
        var src = uniqueSources[gi];
        if (!typeGroups[src.type]) typeGroups[src.type] = [];
        typeGroups[src.type].push(src);
      }

      var typeParts = [];
      var typeKeys = Object.keys(typeGroups);
      for (var tk = 0; tk < typeKeys.length; tk++) {
        var tType = typeKeys[tk];
        var group = typeGroups[tType];
        var names = group.slice(0, 3).map(function(g) { return '"' + g.title + '"'; }).join(', ');
        typeParts.push(group.length + ' related ' + tType + '(s): ' + names);
      }

      if (typeParts.length > 0) {
        answer += '. Also found: ' + typeParts.join('; ') + '.';
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

console.log('[AskAPI] Registered: POST /api/mytrend/ask (7 collections)');
