/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Auto Backup SQLite

// ---------------------------------------------------------------------------
// POST /api/mytrend/backup - Manual trigger
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/backup', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Auth required' });

  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }

  var bkDir = $app.dataDir() + '/backups';
  try { $os.mkdirAll(bkDir, 493); } catch (e) { /* exists */ }

  var now = new Date();
  var name = 'manual_' + now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate())
    + '_' + padTwo(now.getHours()) + padTwo(now.getMinutes()) + padTwo(now.getSeconds()) + '.db';

  try {
    var dbPath = $app.dataDir() + '/data.db';
    var cmd = $os.cmd('cp', dbPath, bkDir + '/' + name);
    cmd.run();
  } catch (e) {
    return c.json(500, { error: 'Backup failed: ' + e });
  }

  // Rotate: keep last 7 manual backups
  try {
    var entries = $os.readDir(bkDir);
    var manuals = [];
    for (var i = 0; i < entries.length; i++) {
      var fn = entries[i].name();
      if (fn.indexOf('manual_') === 0) manuals.push(fn);
    }
    manuals.sort();
    while (manuals.length > 7) {
      var old = manuals.shift();
      try { $os.remove(bkDir + '/' + old); } catch (re) { /* ignore */ }
    }
  } catch (e) { /* ignore rotation errors */ }

  return c.json(200, { name: name, message: 'Backup created' });
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/backups - List all backups
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/backups', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Auth required' });

  var bkDir = $app.dataDir() + '/backups';
  try { $os.mkdirAll(bkDir, 493); } catch (e) { /* exists */ }

  var files = [];
  try {
    var entries = $os.readDir(bkDir);
    for (var i = 0; i < entries.length; i++) {
      var fn = entries[i].name();
      if (fn.indexOf('.db') !== -1) files.push(fn);
    }
  } catch (e) {
    return c.json(500, { error: 'Read failed: ' + e });
  }

  files.sort();
  files.reverse();

  return c.json(200, { backups: files, total: files.length });
});

// ---------------------------------------------------------------------------
// Cron: Daily auto backup at 3 AM
// ---------------------------------------------------------------------------
cronAdd('auto_backup', '0 3 * * *', function() {
  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }

  var bkDir = $app.dataDir() + '/backups';
  try { $os.mkdirAll(bkDir, 493); } catch (e) { /* exists */ }

  var now = new Date();
  var name = 'auto_' + now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate()) + '.db';

  try {
    var cmd = $os.cmd('cp', $app.dataDir() + '/data.db', bkDir + '/' + name);
    cmd.run();
  } catch (e) {
    console.log('[AutoBackup] Create failed: ' + e);
    return;
  }
  console.log('[AutoBackup] Created: ' + name);

  // Rotate auto backups (keep 7)
  try {
    var entries = $os.readDir(bkDir);
    var autos = [];
    for (var i = 0; i < entries.length; i++) {
      var fn = entries[i].name();
      if (fn.indexOf('auto_') === 0) autos.push(fn);
    }
    autos.sort();
    while (autos.length > 7) {
      var old = autos.shift();
      try { $os.remove(bkDir + '/' + old); console.log('[AutoBackup] Deleted: ' + old); }
      catch (re) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // Telegram notification
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID') || '';
  var digestChatId = $os.getenv('TELEGRAM_DIGEST_CHAT_ID') || '';

  if (!botToken || !channelId || !digestChatId) {
    try {
      var dao = $app.dao();
      var users = dao.findRecordsByFilter('users', '1=1', '', 1, 0);
      if (users.length > 0) {
        var s = dao.findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: users[0].getId() });
        if (!botToken) botToken = s.getString('telegram_bot_token') || '';
        if (!channelId) channelId = s.getString('telegram_storage_channel_id') || '';
        if (!digestChatId) digestChatId = s.getString('telegram_chat_id') || '';
      }
    } catch (e) { /* no settings */ }
  }

  if (!botToken) {
    console.log('[AutoBackup] No Telegram config, local only');
    return;
  }

  // Upload to storage channel
  var uploaded = false;
  if (channelId) {
    try {
      var fileBytes = $os.readFile(bkDir + '/' + name);
      var formData = new FormData();
      formData.append('chat_id', channelId);
      formData.append('caption', 'MyTrend Auto Backup\n' + name);
      formData.append('document', new Blob([fileBytes]), name);
      var res = $http.send({
        url: 'https://api.telegram.org/bot' + botToken + '/sendDocument',
        method: 'POST',
        body: formData,
        timeout: 120,
      });
      uploaded = (res.statusCode === 200 && res.json && res.json.ok);
    } catch (e) {
      console.log('[AutoBackup] Upload error: ' + e);
    }
  }

  // Send text notification
  if (digestChatId) {
    var msg = '<b>Auto Backup Complete</b>\n\n<code>' + name + '</code>\n';
    msg += uploaded ? 'Uploaded to Telegram' : 'Local only';
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: digestChatId, text: msg, parse_mode: 'HTML' }),
        timeout: 15,
      });
    } catch (e) {
      console.log('[AutoBackup] Notification failed: ' + e);
    }
  }

  console.log('[AutoBackup] Done. Uploaded: ' + uploaded);
});

console.log('[AutoBackup] Registered: cron (daily 3 AM), POST /api/mytrend/backup, GET /api/mytrend/backups');
