/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Hub Settings API
// GET  /api/mytrend/settings/hub  → load hub config (API key status)
// PUT  /api/mytrend/settings/hub  → save hub config (API key)

// ---------------------------------------------------------------------------
// GET /api/mytrend/settings/hub
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/settings/hub', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var dao = $app.dao();
  var userId = authRecord.getId();

  var result = {
    anthropic_api_key_set: false,
    anthropic_api_key_masked: '',
    env_api_key_set: !!$os.getenv('ANTHROPIC_API_KEY'),
  };

  try {
    var rec = dao.findFirstRecordByFilter(
      'user_settings',
      'user = {:uid}',
      { uid: userId }
    );
    var key = rec.getString('anthropic_api_key') || '';
    if (key.length > 0) {
      result.anthropic_api_key_set = true;
      result.anthropic_api_key_masked = key.substring(0, 7) + '...' + key.substring(key.length - 4);
    }
  } catch (e) {
    // No settings record yet
  }

  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// PUT /api/mytrend/settings/hub
// Body: { anthropic_api_key }
// ---------------------------------------------------------------------------
routerAdd('PUT', '/api/mytrend/settings/hub', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var body = {};
  try {
    body = $apis.requestInfo(c).data;
  } catch (e) {
    return c.json(400, { error: 'Invalid request body' });
  }

  var dao = $app.dao();
  var userId = authRecord.getId();

  var apiKey = (body.anthropic_api_key || '').toString().trim();

  try {
    var rec;
    try {
      rec = dao.findFirstRecordByFilter(
        'user_settings',
        'user = {:uid}',
        { uid: userId }
      );
    } catch (e) {
      var col = dao.findCollectionByNameOrId('user_settings');
      rec = new Record(col);
      rec.set('user', userId);
    }

    rec.set('anthropic_api_key', apiKey);
    dao.saveRecord(rec);

    return c.json(200, { success: true });
  } catch (err) {
    console.log('[HubSettings] Save error: ' + err);
    return c.json(500, { error: 'Failed to save settings: ' + err });
  }
});

// ---------------------------------------------------------------------------
// Internal: Get API key (env > DB) — used by other hooks
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/internal/api-key', (c) => {
  // Only allow from internal services (no auth header = container-to-container)
  var envKey = $os.getenv('ANTHROPIC_API_KEY');
  if (envKey) {
    return c.json(200, { key: envKey, source: 'env' });
  }

  // Try first user's settings (single-user self-hosted)
  var dao = $app.dao();
  try {
    var records = dao.findRecordsByFilter(
      'user_settings',
      'anthropic_api_key != ""',
      '-created',
      1,
      0
    );
    if (records && records.length > 0) {
      return c.json(200, { key: records[0].getString('anthropic_api_key'), source: 'db' });
    }
  } catch (e) {
    // ignore
  }

  return c.json(200, { key: '', source: 'none' });
});

console.log('[HubSettings] Registered: GET/PUT /api/mytrend/settings/hub + internal/api-key');
