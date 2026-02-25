/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Daily Context Snapshot API
// GET /api/mytrend/context/snapshot — builds a compact agent context snapshot
// Returns: { text, generated_at, project_count, idea_count }

routerAdd('GET', '/api/mytrend/context/snapshot', function (c) {
  var dao = $app.dao();
  var userId = $os.getenv('MYTREND_SYNC_USER_ID') || '';

  function safeStr(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      var s = '';
      for (var i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
      return s;
    }
    return String(raw);
  }

  function safeJSON(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return JSON.parse(safeStr(raw)); } catch (e) { return null; }
  }

  // Validate internal caller via shared secret
  var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
  var authHeader = c.request().header.get('X-Internal-Token');
  if (secret && authHeader !== secret) {
    return c.json(401, { error: 'Unauthorized' });
  }

  var lines = [];
  var now = new Date().toISOString();
  lines.push('=== MyTrend Context Snapshot (' + now.slice(0, 10) + ') ===\n');

  var projectCount = 0;
  var ideaCount = 0;

  // ── Active Projects (max 6) ───────────────────────────────────────────────
  try {
    var projects = dao.findRecordsByFilter(
      'projects',
      userId ? 'user="' + userId + '" && status="active"' : 'status="active"',
      '-last_activity',
      6,
      0
    );
    projectCount = projects.length;

    if (projects.length > 0) {
      lines.push('ACTIVE PROJECTS (' + projects.length + '):');
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i];
        var name = safeStr(p.get('name'));
        var desc = safeStr(p.get('description')).slice(0, 60);
        var convCount = p.get('total_conversations') || 0;
        var ideaC = p.get('total_ideas') || 0;
        var lastAct = safeStr(p.get('last_activity'));
        var daysOld = lastAct
          ? Math.floor((Date.now() - new Date(lastAct).getTime()) / 86400000)
          : 999;
        var health = daysOld < 3 ? 'active' : daysOld < 14 ? 'stalling' : 'dormant';
        lines.push('  • ' + name + ' [' + health + '] — ' + desc +
          ' (' + convCount + ' convs, ' + ideaC + ' ideas)');
      }
      lines.push('');
    }
  } catch (e) {
    // Non-critical
  }

  // ── Pending Ideas (max 5, high+critical priority first) ──────────────────
  try {
    var ideas = dao.findRecordsByFilter(
      'ideas',
      userId
        ? 'user="' + userId + '" && (status="inbox" || status="considering") && (priority="high" || priority="critical")'
        : '(status="inbox" || status="considering") && (priority="high" || priority="critical")',
      '-created',
      5,
      0
    );
    ideaCount = ideas.length;

    if (ideas.length > 0) {
      lines.push('PENDING IDEAS (high/critical, max 5):');
      for (var j = 0; j < ideas.length; j++) {
        var idea = ideas[j];
        var title = safeStr(idea.get('title'));
        var priority = safeStr(idea.get('priority'));
        var itype = safeStr(idea.get('type'));
        lines.push('  • [' + priority + '/' + itype + '] ' + title);
      }
      lines.push('');
    }
  } catch (e) {
    // Non-critical
  }

  // ── Active Plans ──────────────────────────────────────────────────────────
  try {
    var plans = dao.findRecordsByFilter(
      'plans',
      userId
        ? 'user="' + userId + '" && (status="in_progress" || status="approved")'
        : '(status="in_progress" || status="approved")',
      '-updated',
      4,
      0
    );

    if (plans.length > 0) {
      lines.push('ACTIVE PLANS (' + plans.length + '):');
      for (var k = 0; k < plans.length; k++) {
        var plan = plans[k];
        var pTitle = safeStr(plan.get('title'));
        var pStatus = safeStr(plan.get('status'));
        var pType = safeStr(plan.get('plan_type'));
        lines.push('  • [' + pStatus + '/' + pType + '] ' + pTitle);
      }
      lines.push('');
    }
  } catch (e) {
    // Non-critical
  }

  // ── Recent Conversations (last 3, titles only) ────────────────────────────
  try {
    var convs = dao.findRecordsByFilter(
      'conversations',
      userId ? 'user="' + userId + '"' : '',
      '-started_at',
      3,
      0
    );

    if (convs.length > 0) {
      lines.push('RECENT CONVERSATIONS:');
      for (var m = 0; m < convs.length; m++) {
        var conv = convs[m];
        var cTitle = safeStr(conv.get('title')).slice(0, 70);
        var cDate = safeStr(conv.get('started_at')).slice(0, 10);
        lines.push('  • ' + cDate + ' — ' + cTitle);
      }
      lines.push('');
    }
  } catch (e) {
    // Non-critical
  }

  // ── Trending Topics (top 5 by mention_count) ──────────────────────────────
  try {
    var topics = dao.findRecordsByFilter(
      'topics',
      userId ? 'user="' + userId + '"' : '',
      '-mention_count',
      5,
      0
    );

    if (topics.length > 0) {
      var topicNames = [];
      for (var n = 0; n < topics.length; n++) {
        topicNames.push(safeStr(topics[n].get('name')));
      }
      lines.push('KEY TOPICS: ' + topicNames.join(', '));
      lines.push('');
    }
  } catch (e) {
    // Non-critical
  }

  // ── Research Graph: top 5 'fit' entries ─────────────────────────────────
  // Sprint 2B: surface relevant research captured from Telegram/URLs
  try {
    var research = dao.findRecordsByFilter(
      'research',
      userId
        ? 'user="' + userId + '" && (verdict="fit" || verdict="partial")'
        : '(verdict="fit" || verdict="partial")',
      '-created',
      5,
      0
    );

    if (research.length > 0) {
      lines.push('RESEARCH KNOWLEDGE GRAPH (recent fit/partial, max 5):');
      for (var r = 0; r < research.length; r++) {
        var entry = research[r];
        var rTitle = safeStr(entry.get('title')).slice(0, 60);
        var rVerdict = safeStr(entry.get('verdict'));
        var rSummary = safeStr(entry.get('ai_summary')).slice(0, 80);
        var rUrl = safeStr(entry.get('url'));
        // Show domain only to save tokens
        var domain = '';
        try { domain = new URL(rUrl).hostname; } catch (e) { domain = rUrl.slice(0, 30); }
        lines.push('  • [' + rVerdict + '] ' + rTitle + ' (' + domain + ')');
        if (rSummary) lines.push('    → ' + rSummary);
      }
      lines.push('');
    }
  } catch (e) {
    // Non-critical — research collection may not exist
  }

  lines.push('=== End of Context ===');

  var text = lines.join('\n');

  // Cap at ~2400 chars to stay within token budget (~600 tokens)
  if (text.length > 2400) {
    text = text.slice(0, 2400) + '\n[... truncated for token budget ...]';
  }

  return c.json(200, {
    text: text,
    generated_at: now,
    project_count: projectCount,
    idea_count: ideaCount,
    char_count: text.length,
  });
});
