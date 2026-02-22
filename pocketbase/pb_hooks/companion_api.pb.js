/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Companion Internal API
// Endpoints for companion service (no auth required, internal network only).

// GET /api/mytrend/companion/projects
// Returns active project slugs + names for Telegram bot project selection.
routerAdd('GET', '/api/mytrend/companion/projects', (c) => {
  try {
    var dao = $app.dao();
    var records = dao.findRecordsByFilter('projects', "status = 'active'", '-last_activity', 50, 0);

    var projects = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      projects.push({
        slug: rec.getString('slug'),
        name: rec.getString('name'),
      });
    }

    return c.json(200, { projects: projects });
  } catch (e) {
    console.log('[CompanionAPI] projects error: ' + e);
    return c.json(200, { projects: [] });
  }
});

console.log('[CompanionAPI] Registered: GET /api/mytrend/companion/projects');
