/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Git Activity Receiver
// POST /api/mytrend/activity/git
// Receives git commit data and creates activity records.
// Future-ready for git hooks integration.

routerAdd('POST', '/api/mytrend/activity/git', (c) => {
  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var body = $apis.requestInfo(c).data;

    if (!body || !body.commit_hash) {
      return c.json(400, { error: 'Missing commit_hash' });
    }

    var dao = $app.dao();
    var now = new Date();

    // Resolve project from name if provided
    var projectId = body.project_id || '';
    if (!projectId && body.project_name) {
      try {
        var proj = dao.findFirstRecordByFilter(
          'projects',
          'user = {:uid} && name = {:name}',
          { uid: userId, name: body.project_name }
        );
        projectId = proj.getId();
      } catch (e) {
        // Try slug match
        try {
          var slug = body.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          var projSlug = dao.findFirstRecordByFilter(
            'projects',
            'user = {:uid} && slug = {:slug}',
            { uid: userId, slug: slug }
          );
          projectId = projSlug.getId();
        } catch (e2) { /* no match */ }
      }
    }

    // Create activity record
    var col = dao.findCollectionByNameOrId('activities');
    var activity = new Record(col);
    activity.set('user', userId);
    if (projectId) activity.set('project', projectId);
    activity.set('type', 'coding');

    var message = (body.message || 'Git commit').substring(0, 300);
    activity.set('action', 'Git commit: ' + message);
    activity.set('device_name', body.device_name || body.hostname || '');
    activity.set('metadata', JSON.stringify({
      source: 'git',
      commit_hash: body.commit_hash,
      branch: body.branch || '',
      files_changed: body.files_changed || 0,
      insertions: body.insertions || 0,
      deletions: body.deletions || 0,
      author: body.author || '',
      repo: body.repo || '',
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
    }));
    activity.set('timestamp', body.timestamp || now.toISOString());
    activity.set('duration_sec', 0);

    dao.saveRecord(activity);

    return c.json(200, {
      ok: true,
      activity_id: activity.getId(),
      project_id: projectId || null,
    });
  } catch (e) {
    console.log('[GitActivity] Error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

console.log('[GitActivity] Registered: POST /api/mytrend/activity/git');
