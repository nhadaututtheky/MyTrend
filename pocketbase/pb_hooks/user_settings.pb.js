/// <reference path="../pb_data/types.d.ts" />

// MyTrend - User Settings API
// GET  /api/mytrend/settings/telegram  → load telegram config for current user
// PUT  /api/mytrend/settings/telegram  → save telegram config for current user

// ---------------------------------------------------------------------------
// GET /api/mytrend/settings/telegram
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/settings/telegram', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var dao = $app.dao();
  var userId = authRecord.getId();

  var result = {
    telegram_bot_token: '',
    telegram_channel_id: '',
    telegram_webhook_secret: '',
    // Also surface env-var status so frontend knows if overridden
    env_bot_token_set: !!$os.getenv('TELEGRAM_BOT_TOKEN'),
    env_channel_id_set: !!$os.getenv('TELEGRAM_STORAGE_CHANNEL_ID'),
  };

  try {
    var rec = dao.findFirstRecordByFilter(
      'user_settings',
      'user = {:uid}',
      { uid: userId }
    );
    result.telegram_bot_token = rec.getString('telegram_bot_token') || '';
    result.telegram_channel_id = rec.getString('telegram_channel_id') || '';
    result.telegram_webhook_secret = rec.getString('telegram_webhook_secret') || '';
  } catch (e) {
    // No settings record yet — return empty strings
  }

  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// PUT /api/mytrend/settings/telegram
// Body: { telegram_bot_token, telegram_channel_id, telegram_webhook_secret }
// ---------------------------------------------------------------------------
routerAdd('PUT', '/api/mytrend/settings/telegram', (c) => {
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

  var botToken = (body.telegram_bot_token || '').toString().trim();
  var channelId = (body.telegram_channel_id || '').toString().trim();
  var webhookSecret = (body.telegram_webhook_secret || '').toString().trim();

  try {
    // Upsert: try find existing record
    var rec;
    try {
      rec = dao.findFirstRecordByFilter(
        'user_settings',
        'user = {:uid}',
        { uid: userId }
      );
    } catch (e) {
      // Create new
      var col = dao.findCollectionByNameOrId('user_settings');
      rec = new Record(col);
      rec.set('user', userId);
    }

    rec.set('telegram_bot_token', botToken);
    rec.set('telegram_channel_id', channelId);
    rec.set('telegram_webhook_secret', webhookSecret);
    dao.saveRecord(rec);

    return c.json(200, { success: true });
  } catch (err) {
    console.log('[UserSettings] Save error: ' + err);
    return c.json(500, { error: 'Failed to save settings: ' + err });
  }
});

console.log('[UserSettings] Registered: GET/PUT /api/mytrend/settings/telegram');
