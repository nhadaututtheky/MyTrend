/// <reference path="../pb_data/types.d.ts" />

// MyTrend - GitHub Webhook Activity Ingest
// POST /api/mytrend/github-ingest
//
// Called by companion after HMAC-SHA256 verification of GitHub webhooks.
// Writes normalized activities and auto-links PR events to matching ideas.
//
// Payload: { repo: string, activities: Array<{ type, action, metadata, timestamp }> }

routerAdd('POST', '/api/mytrend/github-ingest', function(c) {
  // Accept calls from companion (internal) — no auth required since companion owns HMAC check.
  // Reject requests not from localhost to limit exposure.
  var remoteIp = c.realIP();
  if (remoteIp && remoteIp !== '127.0.0.1' && remoteIp !== '::1' && !remoteIp.startsWith('172.') && !remoteIp.startsWith('10.')) {
    return c.json(403, { error: 'Internal endpoint only' });
  }

  var body = $apis.requestInfo(c).data;
  if (!body) return c.json(400, { error: 'Missing body' });

  var repo = body.repo || '';
  var activities = body.activities;

  if (!Array.isArray(activities) || activities.length === 0) {
    return c.json(200, { created: 0, skipped: 0 });
  }

  var dao = $app.dao();
  var created = 0;
  var skipped = 0;

  // Resolve project + user from repo name
  var userId = '';
  var projectId = '';

  if (repo) {
    try {
      var proj = dao.findFirstRecordByFilter('projects', 'github_repo = {:repo}', { repo: repo });
      userId = proj.getString('user');
      projectId = proj.getId();
    } catch(e) { /* no matching project */ }
  }

  // Fallback: first user in the system
  if (!userId) {
    try {
      var users = dao.findRecordsByFilter('users', '', '-created', 1, 0);
      if (users.length > 0) userId = users[0].getId();
    } catch(e) { /* no users */ }
  }

  if (!userId) return c.json(400, { error: 'No user found' });

  var activitiesCol = dao.findCollectionByNameOrId('activities');

  for (var i = 0; i < activities.length; i++) {
    var act = activities[i];
    var type = act.type || 'commit';
    var action = act.action || '';
    var metadata = act.metadata || {};
    var timestamp = act.timestamp || new Date().toISOString();

    // ── Dedup check ───────────────────────────────────────────────────────
    var dedupKey = '';
    if (type === 'commit' && metadata.commit_hash) {
      dedupKey = String(metadata.commit_hash).substring(0, 12);
    } else if (type === 'pr' && metadata.pr_key) {
      dedupKey = String(metadata.pr_key);
    } else if (type === 'issue' && metadata.issue_key) {
      dedupKey = String(metadata.issue_key);
    }

    if (dedupKey) {
      try {
        dao.findFirstRecordByFilter(
          'activities',
          'user = {:uid} && type = {:type} && metadata ~ {:key}',
          { uid: userId, type: type, key: dedupKey }
        );
        skipped++;
        continue; // already ingested
      } catch(e) { /* not found — proceed */ }
    }

    // ── PR → Idea auto-linking (Sprint 3C) ───────────────────────────────
    if (type === 'pr' && metadata.pr_number) {
      var linkedIdeas = [];
      var prTitle = action.replace(/^PR #\d+:\s*/, '');
      var prBody = String(metadata.body || '');
      // Extract significant words from PR title + body for keyword search
      var searchTerms = (prTitle + ' ' + prBody)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(function(w) { return w.length > 4; })
        .slice(0, 6);

      if (searchTerms.length > 0) {
        for (var si = 0; si < searchTerms.length; si++) {
          var term = searchTerms[si];
          try {
            var matchedIdeas = dao.findRecordsByFilter(
              'ideas',
              'user = {:uid} && (title ~ {:q} || content ~ {:q})',
              '-created',
              3,
              0,
              { uid: userId, q: term }
            );
            for (var mi = 0; mi < matchedIdeas.length; mi++) {
              var ideaId = matchedIdeas[mi].getId();
              // Deduplicate linked_ideas array
              var alreadyLinked = false;
              for (var li = 0; li < linkedIdeas.length; li++) {
                if (linkedIdeas[li] === ideaId) { alreadyLinked = true; break; }
              }
              if (!alreadyLinked) linkedIdeas.push(ideaId);
            }
          } catch(e) { /* search error — skip */ }
          if (linkedIdeas.length >= 5) break; // cap at 5 linked ideas
        }
      }

      if (linkedIdeas.length > 0) {
        metadata.linked_ideas = linkedIdeas;
      }
    }

    // ── Create activity record ─────────────────────────────────────────
    var rec = new Record(activitiesCol);
    rec.set('user', userId);
    if (projectId) rec.set('project', projectId);
    rec.set('type', type);
    rec.set('action', action);
    rec.set('device_name', 'github');
    rec.set('duration_sec', 0);
    rec.set('timestamp', timestamp);
    rec.set('metadata', JSON.stringify(metadata));
    dao.saveRecord(rec);
    created++;
  }

  return c.json(200, { created: created, skipped: skipped });
});
