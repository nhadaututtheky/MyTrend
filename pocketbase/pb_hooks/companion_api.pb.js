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

// POST /api/mytrend/companion/sync-project
// Creates a project record in PB when added from Settings UI.
routerAdd('POST', '/api/mytrend/companion/sync-project', (c) => {
  try {
    var body = $apis.requestInfo(c).data;
    var slug = body.slug || '';
    var name = body.name || '';
    if (!slug) return c.json(400, { error: 'slug required' });

    var dao = $app.dao();
    var collection = dao.findCollectionByNameOrId('projects');

    // Check if already exists
    try {
      var existing = dao.findRecordsByFilter('projects', "slug = '" + slug + "'", '', 1, 0);
      if (existing.length > 0) {
        return c.json(200, { ok: true, action: 'exists' });
      }
    } catch (e) {
      // no records found, proceed to create
    }

    // Get first user as owner (single-user platform)
    var users = dao.findRecordsByFilter('users', "id != ''", '', 1, 0);
    if (!users || users.length === 0) {
      return c.json(400, { ok: false, error: 'No users found — register first' });
    }

    var record = new Record(collection);
    record.set('user', users[0].getId());
    record.set('slug', slug);
    record.set('name', name || slug);
    record.set('status', 'active');
    dao.saveRecord(record);

    return c.json(200, { ok: true, action: 'created' });
  } catch (e) {
    console.log('[CompanionAPI] sync-project POST error: ' + e);
    return c.json(500, { ok: false, error: '' + e });
  }
});

// DELETE /api/mytrend/companion/sync-project?slug=xxx
// Removes a project record from PB when deleted from Settings UI.
routerAdd('DELETE', '/api/mytrend/companion/sync-project', (c) => {
  try {
    var slug = c.queryParam('slug');
    if (!slug) return c.json(400, { error: 'slug required' });

    var dao = $app.dao();
    try {
      var records = dao.findRecordsByFilter('projects', "slug = '" + slug + "'", '', 10, 0);
      for (var i = 0; i < records.length; i++) {
        dao.deleteRecord(records[i]);
      }
    } catch (e) {
      // not found
    }

    return c.json(200, { ok: true });
  } catch (e) {
    console.log('[CompanionAPI] sync-project DELETE error: ' + e);
    return c.json(500, { ok: false, error: '' + e });
  }
});

console.log('[CompanionAPI] Registered: GET /api/mytrend/companion/projects');
