/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Plan API Endpoints
// Custom endpoints for plan lifecycle management: transition, timeline, stats, backfill.

// ---------------------------------------------------------------------------
// POST /api/mytrend/plans/:id/transition
// Transition a plan to a new status with validation and history tracking.
// Body: { to: string, note: string }
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/plans/:id/transition', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var planId = c.pathParam('id');

  var body = $apis.requestInfo(c).data;
  var toStatus = (body.to || '').trim();
  var note = (body.note || '').trim();

  if (!toStatus) return c.json(400, { error: 'Missing "to" status' });
  if (!note) return c.json(400, { error: 'Missing "note" for transition' });

  // Allowed transitions
  var TRANSITIONS = {
    draft: ['approved', 'abandoned'],
    approved: ['in_progress', 'abandoned'],
    in_progress: ['review', 'abandoned'],
    review: ['completed', 'in_progress', 'abandoned'],
    abandoned: ['draft'],
    completed: [],
    superseded: [],
  };

  var dao = $app.dao();

  try {
    var plan = dao.findRecordById('plans', planId);
    if (plan.getString('user') !== userId) {
      return c.json(403, { error: 'Forbidden' });
    }

    var currentStatus = plan.getString('status');
    var allowed = TRANSITIONS[currentStatus] || [];
    var valid = false;
    for (var i = 0; i < allowed.length; i++) {
      if (allowed[i] === toStatus) { valid = true; break; }
    }
    if (!valid) {
      return c.json(400, {
        error: 'Invalid transition from "' + currentStatus + '" to "' + toStatus + '"',
        allowed: allowed,
      });
    }

    // Decode existing stage_history
    var rawHistory = plan.get('stage_history');
    var history = [];
    if (Array.isArray(rawHistory) && rawHistory.length > 0 && typeof rawHistory[0] === 'object') {
      history = rawHistory;
    } else if (Array.isArray(rawHistory) && rawHistory.length > 0 && typeof rawHistory[0] === 'number') {
      try {
        var s = '';
        for (var b = 0; b < rawHistory.length; b++) s += String.fromCharCode(rawHistory[b]);
        var p = JSON.parse(s);
        if (Array.isArray(p)) history = p;
      } catch (e) { history = []; }
    } else if (typeof rawHistory === 'string') {
      try { var p2 = JSON.parse(rawHistory); if (Array.isArray(p2)) history = p2; } catch (e) {}
    }

    var now = new Date().toISOString();
    history.push({
      from: currentStatus,
      to: toStatus,
      timestamp: now,
      note: note,
    });

    plan.set('status', toStatus);
    plan.set('stage_history', JSON.stringify(history));

    // Track lifecycle timestamps
    if (toStatus === 'in_progress' && !plan.getString('started_at')) {
      plan.set('started_at', now);
    }
    if (toStatus === 'completed' || toStatus === 'abandoned') {
      plan.set('completed_at', now);
    }

    dao.saveRecord(plan);
    return c.json(200, { success: true, status: toStatus, history: history });
  } catch (err) {
    return c.json(404, { error: 'Plan not found: ' + err });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/plans/:id/timeline
// Returns the full lifecycle timeline for a plan with linked entities.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/plans/:id/timeline', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var planId = c.pathParam('id');
  var dao = $app.dao();

  try {
    var plan = dao.findRecordById('plans', planId);
    if (plan.getString('user') !== userId) {
      return c.json(403, { error: 'Forbidden' });
    }

    // Decode arrays
    function _decodeArr(raw) {
      if (!raw) return [];
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw;
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
        try {
          var s = '';
          for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]);
          var p = JSON.parse(s);
          if (Array.isArray(p)) return p;
        } catch (e) {}
      }
      if (typeof raw === 'string') {
        try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) return p2; } catch (e) {}
      }
      return [];
    }

    var convIds = _decodeArr(plan.get('source_conversations'));
    var ideaIds = _decodeArr(plan.get('source_ideas'));
    var stageHistory = _decodeArr(plan.get('stage_history'));

    // Fetch linked conversations
    var conversations = [];
    for (var ci = 0; ci < convIds.length && ci < 10; ci++) {
      try {
        var conv = dao.findRecordById('conversations', convIds[ci]);
        conversations.push({
          id: conv.getId(),
          title: conv.getString('title'),
          started_at: conv.getString('started_at'),
          snippet: (conv.getString('summary') || '').substring(0, 200),
        });
      } catch (e) {}
    }

    // Fetch linked ideas
    var ideas = [];
    for (var ii = 0; ii < ideaIds.length && ii < 10; ii++) {
      try {
        var idea = dao.findRecordById('ideas', ideaIds[ii]);
        ideas.push({
          id: idea.getId(),
          title: idea.getString('title'),
          type: idea.getString('type'),
          status: idea.getString('status'),
        });
      } catch (e) {}
    }

    // Fetch related plans (parent, superseded_by)
    var relatedPlans = [];
    var parentId = plan.getString('parent_plan');
    if (parentId) {
      try {
        var parent = dao.findRecordById('plans', parentId);
        relatedPlans.push({
          id: parent.getId(),
          title: parent.getString('title'),
          status: parent.getString('status'),
          relation: 'parent',
        });
      } catch (e) {}
    }
    var supersededId = plan.getString('superseded_by');
    if (supersededId) {
      try {
        var sup = dao.findRecordById('plans', supersededId);
        relatedPlans.push({
          id: sup.getId(),
          title: sup.getString('title'),
          status: sup.getString('status'),
          relation: 'superseded_by',
        });
      } catch (e) {}
    }

    // Check for child plans
    try {
      var children = dao.findRecordsByFilter(
        'plans',
        'user = {:uid} && parent_plan = {:pid}',
        '-created', 5, 0,
        { uid: userId, pid: planId }
      );
      for (var ch = 0; ch < children.length; ch++) {
        relatedPlans.push({
          id: children[ch].getId(),
          title: children[ch].getString('title'),
          status: children[ch].getString('status'),
          relation: 'child',
        });
      }
    } catch (e) {}

    return c.json(200, {
      plan: {
        id: plan.getId(),
        title: plan.getString('title'),
        slug: plan.getString('slug'),
        plan_type: plan.getString('plan_type'),
        status: plan.getString('status'),
        content: plan.getString('content'),
        trigger: plan.getString('trigger'),
        reasoning: plan.getString('reasoning'),
        alternatives: plan.getString('alternatives'),
        outcome: plan.getString('outcome'),
        priority: plan.getString('priority'),
        complexity: plan.getString('complexity'),
        estimated_effort: plan.getString('estimated_effort'),
        extraction_source: plan.getString('extraction_source'),
        extraction_confidence: plan.getFloat('extraction_confidence'),
        signal_phrase: plan.getString('signal_phrase'),
        tags: _decodeArr(plan.get('tags')),
        started_at: plan.getString('started_at'),
        completed_at: plan.getString('completed_at'),
        created: plan.getString('created'),
        updated: plan.getString('updated'),
      },
      stage_history: stageHistory,
      conversations: conversations,
      ideas: ideas,
      related_plans: relatedPlans,
    });
  } catch (err) {
    return c.json(404, { error: 'Plan not found: ' + err });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/plans/stats
// Returns plan statistics for dashboard.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/plans/stats', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var dao = $app.dao();

  var statuses = ['draft', 'approved', 'in_progress', 'review', 'completed', 'abandoned', 'superseded'];
  var byStatus = {};
  var total = 0;

  for (var si = 0; si < statuses.length; si++) {
    try {
      var records = dao.findRecordsByFilter(
        'plans', 'user = {:uid} && status = {:status}', '', 0, 0,
        { uid: userId, status: statuses[si] }
      );
      byStatus[statuses[si]] = records.length;
      total += records.length;
    } catch (e) {
      byStatus[statuses[si]] = 0;
    }
  }

  var types = ['implementation', 'architecture', 'design', 'refactor', 'bugfix', 'investigation', 'migration'];
  var byType = {};
  for (var ti = 0; ti < types.length; ti++) {
    try {
      var tRecords = dao.findRecordsByFilter(
        'plans', 'user = {:uid} && plan_type = {:type}', '', 0, 0,
        { uid: userId, type: types[ti] }
      );
      byType[types[ti]] = tRecords.length;
    } catch (e) {
      byType[types[ti]] = 0;
    }
  }

  // Recent completed plans
  var recentCompleted = [];
  try {
    var completed = dao.findRecordsByFilter(
      'plans', 'user = {:uid} && status = "completed"', '-completed_at', 5, 0,
      { uid: userId }
    );
    for (var rc = 0; rc < completed.length; rc++) {
      recentCompleted.push({
        id: completed[rc].getId(),
        title: completed[rc].getString('title'),
        plan_type: completed[rc].getString('plan_type'),
        completed_at: completed[rc].getString('completed_at'),
      });
    }
  } catch (e) {}

  return c.json(200, {
    total: total,
    by_status: byStatus,
    by_type: byType,
    recent_completed: recentCompleted,
  });
});

// ---------------------------------------------------------------------------
// POST /api/mytrend/backfill-plans
// Re-scan all existing conversations for plan extraction.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/backfill-plans', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var dao = $app.dao();

  // Inline plan detection (isolated scope)
  var _SIGNALS = {
    implementation: [
      "here's the plan", "here is the plan", "implementation plan",
      "here's my approach", "here is my approach", "step-by-step",
      "implementation approach", "i'll implement", "let me implement",
    ],
    architecture: [
      "architecture decision", "system design", "data model",
      "schema design", "collection schema", "database design",
      "component architecture", "technical design",
    ],
    refactor: ["refactoring plan", "refactor approach", "migration plan", "restructure"],
    design: ["ui design", "design system", "layout design", "design approach"],
    investigation: ["root cause", "investigation", "debugging approach"],
    bugfix: ["the fix is", "here's the fix", "bug fix approach", "the solution is"],
  };

  function _detect(text) {
    var lower = text.toLowerCase();
    var types = Object.keys(_SIGNALS);
    for (var t = 0; t < types.length; t++) {
      var phrases = _SIGNALS[types[t]];
      for (var p = 0; p < phrases.length; p++) {
        var idx = lower.indexOf(phrases[p]);
        if (idx >= 0) return { type: types[t], phrase: phrases[p], position: idx };
      }
    }
    return null;
  }

  function _extractContent(text, pos) {
    var start = pos;
    while (start > 0 && !(text[start-1] === '\n' && start >= 2 && text[start-2] === '\n')) start--;
    var end = pos + 100;
    while (end < text.length && end - pos < 5000) end++;
    var c = text.substring(start, Math.min(end, text.length)).trim();
    if (c.length > 5000) c = c.substring(0, 4997) + '...';
    return c.length >= 50 ? c : null;
  }

  function _extractTitle(content) {
    var lines = content.split('\n');
    for (var i = 0; i < lines.length && i < 5; i++) {
      var line = lines[i].replace(/^[#\-*>\s]+/, '').trim();
      if (line.length >= 10 && line.length <= 200) return line;
    }
    return content.substring(0, 100);
  }

  function _decodeArr(raw) {
    if (!raw) return [];
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') return raw;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
      try {
        var s = '';
        for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]);
        var p = JSON.parse(s);
        if (Array.isArray(p)) return p;
      } catch (e) {}
    }
    if (typeof raw === 'string') {
      try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) return p2; } catch (e) {}
    }
    return [];
  }

  var stats = { conversations_scanned: 0, plans_created: 0, plans_skipped: 0, errors: [] };

  try {
    var conversations = dao.findRecordsByFilter(
      'conversations', 'user = {:uid}', '-started_at', 0, 0,
      { uid: userId }
    );

    for (var ci = 0; ci < conversations.length; ci++) {
      stats.conversations_scanned++;
      var conv = conversations[ci];
      var messages = _decodeArr(conv.get('messages'));
      var convId = conv.getId();
      var projectId = conv.getString('project') || '';
      var extracted = 0;

      for (var mi = 0; mi < messages.length; mi++) {
        var msg = messages[mi];
        if (!msg || msg.role !== 'assistant' || !msg.content) continue;
        var content = typeof msg.content === 'string' ? msg.content : '';
        if (content.length < 100) continue;

        var det = _detect(content);
        if (!det) continue;

        var planContent = _extractContent(content, det.position);
        if (!planContent) continue;

        var title = _extractTitle(planContent);

        // Dedup check
        try {
          dao.findFirstRecordByFilter(
            'plans', 'user = {:uid} && title ~ {:title}',
            { uid: userId, title: title.substring(0, 50) }
          );
          stats.plans_skipped++;
          continue;
        } catch (e) { /* not found, create */ }

        // Get trigger
        var trigger = '';
        for (var j = mi - 1; j >= 0; j--) {
          if (messages[j] && messages[j].role === 'user' && messages[j].content) {
            trigger = (typeof messages[j].content === 'string' ? messages[j].content : '').substring(0, 2000);
            break;
          }
        }

        var now = new Date().toISOString();
        var slug = title.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').substring(0, 200);

        try {
          var planCol = dao.findCollectionByNameOrId('plans');
          var plan = new Record(planCol);
          plan.set('user', userId);
          plan.set('title', title.substring(0, 500));
          plan.set('slug', slug);
          plan.set('plan_type', det.type);
          plan.set('status', 'draft');
          plan.set('content', planContent);
          plan.set('trigger', trigger);
          plan.set('reasoning', '');
          plan.set('alternatives', '');
          plan.set('outcome', '');
          plan.set('source_conversations', JSON.stringify([convId]));
          plan.set('source_ideas', JSON.stringify([]));
          plan.set('parent_plan', '');
          plan.set('superseded_by', '');
          plan.set('stage_history', JSON.stringify([
            { from: 'none', to: 'draft', timestamp: now, note: 'Backfill: auto-extracted from conversation', conversation_id: convId }
          ]));
          plan.set('tags', JSON.stringify([det.type, 'auto-extracted', 'backfill']));
          plan.set('priority', 'medium');
          plan.set('complexity', 'moderate');
          plan.set('estimated_effort', '');
          plan.set('extraction_source', 'auto');
          plan.set('extraction_confidence', 0.6);
          plan.set('signal_phrase', det.phrase);
          if (projectId) plan.set('project', projectId);
          dao.saveRecord(plan);
          stats.plans_created++;
          extracted++;
        } catch (err) {
          stats.errors.push('Conv ' + convId + ': ' + err);
        }

        if (extracted >= 2) break;
      }
    }
  } catch (err) {
    stats.errors.push('Scan error: ' + err);
  }

  console.log('[PlanBackfill] Scanned ' + stats.conversations_scanned + ', created ' + stats.plans_created + ' plans');
  return c.json(200, stats);
});
