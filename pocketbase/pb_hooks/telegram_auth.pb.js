/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Telegram Magic Link Authentication
// Two endpoints:
// 1. POST /api/auth/telegram/request - Internal: bot creates magic token
// 2. POST /api/auth/telegram/verify  - Public: browser verifies token → gets credentials

// ---------------------------------------------------------------------------
// POST /api/auth/telegram/request — Create magic token (internal only)
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/auth/telegram/request', function (c) {
  // Auth: internal secret only
  var secret = $os.getenv('COMPANION_INTERNAL_SECRET') || '';
  if (!secret) return c.json(503, { error: 'Secret not configured' });

  var headerSecret = '';
  try {
    headerSecret = c.request().header.get('X-Internal-Secret') || '';
  } catch (e) {}
  if (headerSecret !== secret) return c.json(401, { error: 'Unauthorized' });

  var body = $apis.requestInfo(c).data;
  var tgUserId = parseInt(body.telegram_user_id) || 0;
  if (!tgUserId) return c.json(400, { error: 'telegram_user_id required' });

  var dao = $app.dao();
  var token = $security.randomString(64);
  var expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  var collection = dao.findCollectionByNameOrId('auth_tokens');
  var record = new Record(collection);
  record.set('token', token);
  record.set('telegram_user_id', tgUserId);
  record.set('telegram_username', body.telegram_username || '');
  record.set('telegram_display_name', body.telegram_display_name || '');
  record.set('expires_at', expiresAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''));
  record.set('used', false);
  dao.saveRecord(record);

  return c.json(200, { token: token });
});

// ---------------------------------------------------------------------------
// POST /api/auth/telegram/verify — Verify magic token, return auth credentials
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/auth/telegram/verify', function (c) {
  var body = $apis.requestInfo(c).data;
  var token = (body.token || '').trim();
  if (!token || token.length < 32) return c.json(400, { error: 'Invalid token' });

  var dao = $app.dao();

  // 1. Find token record (not used)
  var tokenRec;
  try {
    tokenRec = dao.findFirstRecordByFilter(
      'auth_tokens',
      'token = {:token} && used = false',
      { token: token },
    );
  } catch (e) {
    return c.json(401, { error: 'Token not found or already used' });
  }

  // 2. Check expiry
  var expiresAt = new Date(tokenRec.getString('expires_at'));
  if (new Date() > expiresAt) {
    // Mark expired token as used to prevent replay
    tokenRec.set('used', true);
    dao.saveRecord(tokenRec);
    return c.json(401, { error: 'Token expired' });
  }

  // 3. Mark as used immediately (single-use)
  tokenRec.set('used', true);
  dao.saveRecord(tokenRec);

  // 4. Find or create user by telegram_user_id
  var tgUserId = tokenRec.getInt('telegram_user_id');
  var tgUsername = tokenRec.getString('telegram_username');
  var tgDisplayName = tokenRec.getString('telegram_display_name');

  var user;
  try {
    user = dao.findFirstRecordByFilter('users', 'telegram_user_id = {:tgId}', { tgId: tgUserId });
  } catch (e) {
    // New user — create account
    var collection = dao.findCollectionByNameOrId('users');
    user = new Record(collection);
    user.set('telegram_user_id', tgUserId);
    user.set('email', 'tg_' + tgUserId + '@telegram.local');
    user.set('display_name', tgDisplayName || tgUsername || 'Telegram User');
    user.set('verified', true);
    user.set('timezone', 'UTC');
    user.set('preferences', { theme: 'comic', defaultProject: null, sidebarCollapsed: false });
  }

  // 5. Set one-time password (changes every login)
  var otp = $security.randomString(32);
  user.setPassword(otp);
  dao.saveRecord(user);

  // 6. Return credentials for client-side authWithPassword
  return c.json(200, {
    email: user.getString('email'),
    password: otp,
  });
});

// ---------------------------------------------------------------------------
// Cron: Clean up expired/used tokens (daily at 3am)
// ---------------------------------------------------------------------------
cronAdd('auth_tokens_cleanup', '0 3 * * *', function () {
  var dao = $app.dao();
  var cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // older than 24h
  var cutoffStr = cutoff.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

  try {
    var records = dao.findRecordsByFilter(
      'auth_tokens',
      'used = true || expires_at < {:cutoff}',
      '',
      500,
      0,
      { cutoff: cutoffStr },
    );
    for (var i = 0; i < records.length; i++) {
      dao.deleteRecord(records[i]);
    }
    if (records.length > 0) {
      console.log('[TelegramAuth] Cleaned up ' + records.length + ' expired/used tokens');
    }
  } catch (e) {
    // No tokens to clean or collection not ready
  }
});

console.log('[TelegramAuth] Hooks registered: request, verify, cleanup cron');
