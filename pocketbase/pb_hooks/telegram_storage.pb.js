/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Telegram Storage Backend
// Uses Telegram Bot API to upload/download files via a private channel.
// PocketBase Goja JSVM: each routerAdd has isolated scope - must inline helpers.

// ---------------------------------------------------------------------------
// GET /api/telegram/status - Bot connection status + file stats
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/telegram/status', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  // Inline: resolve Telegram credentials (env → DB fallback)
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID') || '';
  if ((!botToken || !channelId) && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      if (!botToken) botToken = settingsRec.getString('telegram_bot_token') || '';
      if (!channelId) channelId = settingsRec.getString('telegram_channel_id') || '';
    } catch (e) { /* no settings record */ }
  }

  var status = {
    configured: !!(botToken && channelId),
    bot_token_set: !!botToken,
    channel_id_set: !!channelId,
    channel_id: channelId || null,
    env_token_set: !!$os.getenv('TELEGRAM_BOT_TOKEN'),
    env_channel_set: !!$os.getenv('TELEGRAM_STORAGE_CHANNEL_ID'),
    bot_info: null,
    total_files: 0,
    total_size: 0,
    error: null,
  };

  if (botToken) {
    try {
      var res = $http.send({
        url: 'https://api.telegram.org/bot' + botToken + '/getMe',
        method: 'GET',
        timeout: 10,
      });
      if (res.statusCode === 200 && res.json && res.json.ok) {
        status.bot_info = {
          id: res.json.result.id,
          username: res.json.result.username,
          first_name: res.json.result.first_name,
        };
      } else {
        status.error = 'Invalid bot token';
      }
    } catch (e) {
      status.error = 'Connection failed: ' + e;
    }
  }

  // Count stored files for this user
  var dao = $app.dao();
  try {
    var files = dao.findRecordsByFilter(
      'telegram_files', 'user = {:uid}', '-created', 0, 0,
      { uid: authRecord.getId() }
    );
    status.total_files = files.length;
    var totalSize = 0;
    for (var i = 0; i < files.length; i++) {
      totalSize += (files[i].getInt('file_size') || 0);
    }
    status.total_size = totalSize;
  } catch (e) {
    // Collection may not exist yet
  }

  return c.json(200, status);
});

// ---------------------------------------------------------------------------
// POST /api/telegram/test - Test connection by sending+deleting a message
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/telegram/test', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  // Inline: resolve Telegram credentials
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID') || '';
  if ((!botToken || !channelId) && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      if (!botToken) botToken = settingsRec.getString('telegram_bot_token') || '';
      if (!channelId) channelId = settingsRec.getString('telegram_channel_id') || '';
    } catch (e) { /* no settings record */ }
  }

  if (!botToken || !channelId) {
    return c.json(400, { error: 'Telegram not configured. Add Bot Token and Channel ID in Settings.' });
  }

  try {
    var res = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: '✅ MyTrend connection test - ' + new Date().toISOString(),
      }),
      timeout: 15,
    });

    if (res.statusCode === 200 && res.json && res.json.ok) {
      // Delete test message
      var msgId = res.json.result.message_id;
      try {
        $http.send({
          url: 'https://api.telegram.org/bot' + botToken + '/deleteMessage',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: channelId, message_id: msgId }),
          timeout: 5,
        });
      } catch (e) { /* ok */ }

      return c.json(200, { success: true, message: 'Connection successful' });
    }

    var errMsg = (res.json && res.json.description) ? res.json.description : ('HTTP ' + res.statusCode);
    return c.json(502, { success: false, error: errMsg });
  } catch (e) {
    return c.json(502, { success: false, error: 'Connection failed: ' + e });
  }
});

// ---------------------------------------------------------------------------
// GET /api/telegram/resolve-channel - Auto-detect channel ID from getUpdates
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/telegram/resolve-channel', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  // Inline: resolve bot token
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  if (!botToken && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      botToken = settingsRec.getString('telegram_bot_token') || '';
    } catch (e) { /* no settings record */ }
  }
  if (!botToken) return c.json(400, { error: 'Bot token not configured. Add it in Settings.' });

  try {
    var res = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/getUpdates',
      method: 'GET',
      timeout: 15,
    });

    if (res.statusCode !== 200 || !res.json || !res.json.ok) {
      return c.json(502, { error: 'Failed to get updates' });
    }

    var updates = res.json.result || [];
    var channels = [];
    var seen = {};

    for (var i = 0; i < updates.length; i++) {
      var msg = updates[i].message || updates[i].channel_post || updates[i].my_chat_member;
      if (!msg || !msg.chat) continue;
      var chat = msg.chat;
      var chatId = String(chat.id);
      if (seen[chatId]) continue;
      seen[chatId] = true;
      channels.push({
        id: chatId,
        title: chat.title || chat.first_name || chatId,
        type: chat.type,
      });
    }

    return c.json(200, { channels: channels });
  } catch (e) {
    return c.json(502, { error: 'Failed: ' + e });
  }
});

// ---------------------------------------------------------------------------
// POST /api/telegram/upload - Upload file to Telegram channel
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/telegram/upload', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  // Inline: resolve Telegram credentials
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID') || '';
  if ((!botToken || !channelId) && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      if (!botToken) botToken = settingsRec.getString('telegram_bot_token') || '';
      if (!channelId) channelId = settingsRec.getString('telegram_channel_id') || '';
    } catch (e) { /* no settings record */ }
  }
  if (!botToken || !channelId) {
    return c.json(400, { error: 'Telegram storage not configured. Add Bot Token and Channel ID in Settings.' });
  }

  // Read form fields
  var linkedCollection = '';
  var linkedRecordId = '';
  var caption = '';
  try { linkedCollection = c.request().formValue('linked_collection') || ''; } catch (e) {}
  try { linkedRecordId = c.request().formValue('linked_record_id') || ''; } catch (e) {}
  try { caption = c.request().formValue('caption') || ''; } catch (e) {}

  // Get uploaded file
  var fileHeader;
  try {
    var result = c.request().formFile('file');
    fileHeader = result[1];
  } catch (e) {
    return c.json(400, { error: 'No file provided' });
  }

  var filename = fileHeader.filename || 'unnamed';
  var fileSize = fileHeader.size || 0;

  // Forward to Telegram via sendDocument
  var tgFormData = new FormData();
  tgFormData.append('chat_id', channelId);
  if (caption) tgFormData.append('caption', caption.substring(0, 1024));

  // Use $filesystem.fileFromMultipart to get file bytes, then attach
  var pbFile = $filesystem.fileFromMultipart(fileHeader);
  tgFormData.append('document', pbFile);

  var tgRes;
  try {
    tgRes = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/sendDocument',
      method: 'POST',
      body: tgFormData,
      timeout: 120,
    });
  } catch (e) {
    return c.json(502, { error: 'Telegram upload failed: ' + e });
  }

  if (tgRes.statusCode !== 200 || !tgRes.json || !tgRes.json.ok) {
    var errDesc = (tgRes.json && tgRes.json.description) ? tgRes.json.description : ('HTTP ' + tgRes.statusCode);
    return c.json(502, { error: 'Telegram rejected: ' + errDesc });
  }

  // Extract metadata from Telegram response
  var tgMsg = tgRes.json.result;
  var doc = tgMsg.document || {};
  var fileId = doc.file_id || '';
  var fileUniqueId = doc.file_unique_id || '';
  var telegramMsgId = tgMsg.message_id || 0;
  var mimeType = doc.mime_type || 'application/octet-stream';

  // Handle photo uploads (Telegram may treat images as photos)
  if (!fileId && tgMsg.photo && tgMsg.photo.length > 0) {
    var largest = tgMsg.photo[tgMsg.photo.length - 1];
    fileId = largest.file_id;
    fileUniqueId = largest.file_unique_id;
    mimeType = 'image/jpeg';
  }

  if (!fileId) {
    return c.json(502, { error: 'No file_id in Telegram response' });
  }

  // Save metadata to PocketBase
  var dao = $app.dao();
  var tgCol = dao.findCollectionByNameOrId('telegram_files');
  var record = new Record(tgCol);
  record.set('user', authRecord.getId());
  record.set('file_id', fileId);
  record.set('file_unique_id', fileUniqueId);
  record.set('telegram_msg_id', telegramMsgId);
  record.set('channel_id', channelId);
  record.set('filename', filename);
  record.set('mime_type', mimeType);
  record.set('file_size', fileSize);
  record.set('linked_collection', linkedCollection);
  record.set('linked_record_id', linkedRecordId);
  record.set('source', 'upload');
  record.set('caption', caption.substring(0, 1000));
  dao.saveRecord(record);

  return c.json(200, {
    id: record.getId(),
    file_id: fileId,
    filename: filename,
    mime_type: mimeType,
    file_size: fileSize,
    telegram_msg_id: telegramMsgId,
    created: record.getString('created'),
  });
});

// ---------------------------------------------------------------------------
// GET /api/telegram/files/:id - Proxy download from Telegram
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/telegram/files/:id', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var fileRecordId = c.pathParam('id');

  // Inline: resolve bot token
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  if (!botToken && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      botToken = settingsRec.getString('telegram_bot_token') || '';
    } catch (e) { /* no settings record */ }
  }
  if (!botToken) return c.json(400, { error: 'Telegram not configured. Add Bot Token in Settings.' });

  var dao = $app.dao();
  var record;
  try {
    record = dao.findRecordById('telegram_files', fileRecordId);
  } catch (e) {
    return c.json(404, { error: 'File not found' });
  }

  // Verify ownership
  if (record.getString('user') !== authRecord.getId()) {
    return c.json(403, { error: 'Forbidden' });
  }

  var fileId = record.getString('file_id');
  var fileSizeBytes = record.getInt('file_size') || 0;

  // Telegram getFile only works for files up to 20MB
  if (fileSizeBytes > 20 * 1024 * 1024) {
    return c.json(413, {
      error: 'File too large for proxy download (>20MB). Telegram Bot API getFile limit.',
      filename: record.getString('filename'),
      file_size: fileSizeBytes,
    });
  }

  // Step 1: Get file_path from Telegram
  var getFileRes;
  try {
    getFileRes = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/getFile',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
      timeout: 30,
    });
  } catch (e) {
    return c.json(502, { error: 'Telegram getFile failed: ' + e });
  }

  if (getFileRes.statusCode !== 200 || !getFileRes.json || !getFileRes.json.ok) {
    return c.json(502, { error: 'Cannot resolve Telegram file path' });
  }

  var filePath = getFileRes.json.result.file_path;
  var downloadUrl = 'https://api.telegram.org/file/bot' + botToken + '/' + filePath;

  // Step 2: Download file bytes
  var downloadRes;
  try {
    downloadRes = $http.send({
      url: downloadUrl,
      method: 'GET',
      timeout: 120,
    });
  } catch (e) {
    return c.json(502, { error: 'Download from Telegram failed: ' + e });
  }

  if (downloadRes.statusCode !== 200) {
    return c.json(502, { error: 'Telegram download returned ' + downloadRes.statusCode });
  }

  // Step 3: Return file with correct headers
  var mimeType = record.getString('mime_type') || 'application/octet-stream';
  var filename = record.getString('filename') || 'file';

  c.response().header().set('Content-Type', mimeType);
  c.response().header().set('Content-Disposition', 'inline; filename="' + filename + '"');
  c.response().header().set('Cache-Control', 'private, max-age=3600');

  return c.blob(downloadRes.statusCode, mimeType, downloadRes.raw);
});

// ---------------------------------------------------------------------------
// GET /api/telegram/files/:id/info - File metadata
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/telegram/files/:id/info', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var fileRecordId = c.pathParam('id');
  var dao = $app.dao();
  var record;
  try {
    record = dao.findRecordById('telegram_files', fileRecordId);
  } catch (e) {
    return c.json(404, { error: 'File not found' });
  }

  if (record.getString('user') !== authRecord.getId()) {
    return c.json(403, { error: 'Forbidden' });
  }

  return c.json(200, {
    id: record.getId(),
    filename: record.getString('filename'),
    mime_type: record.getString('mime_type'),
    file_size: record.getInt('file_size'),
    telegram_msg_id: record.getInt('telegram_msg_id'),
    linked_collection: record.getString('linked_collection'),
    linked_record_id: record.getString('linked_record_id'),
    source: record.getString('source'),
    caption: record.getString('caption'),
    created: record.getString('created'),
    updated: record.getString('updated'),
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/telegram/files/:id - Delete from Telegram channel + PB
// ---------------------------------------------------------------------------
routerAdd('DELETE', '/api/telegram/files/:id', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var fileRecordId = c.pathParam('id');

  // Inline: resolve bot token
  var userId = authRecord.getId();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  if (!botToken && userId) {
    try {
      var settingsRec = $app.dao().findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      botToken = settingsRec.getString('telegram_bot_token') || '';
    } catch (e) { /* no settings record */ }
  }

  var dao = $app.dao();

  var record;
  try {
    record = dao.findRecordById('telegram_files', fileRecordId);
  } catch (e) {
    return c.json(404, { error: 'File not found' });
  }

  if (record.getString('user') !== authRecord.getId()) {
    return c.json(403, { error: 'Forbidden' });
  }

  // Delete message from Telegram (best-effort)
  var channelId = record.getString('channel_id');
  var msgId = record.getInt('telegram_msg_id');
  if (botToken && channelId && msgId) {
    try {
      $http.send({
        url: 'https://api.telegram.org/bot' + botToken + '/deleteMessage',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: channelId, message_id: msgId }),
        timeout: 10,
      });
    } catch (e) {
      console.log('[TelegramStorage] Delete message failed (non-fatal): ' + e);
    }
  }

  // Delete PocketBase record
  dao.deleteRecord(record);
  return c.json(200, { success: true });
});

// ---------------------------------------------------------------------------
// GET /api/telegram/files - List user's files (paginated)
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/telegram/files', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var linkedCol = c.queryParam('linked_collection') || '';
  var linkedId = c.queryParam('linked_record_id') || '';
  var page = parseInt(c.queryParam('page') || '1', 10);
  var perPage = parseInt(c.queryParam('per_page') || '50', 10);
  if (perPage > 100) perPage = 100;

  var filter = 'user = {:uid}';
  var params = { uid: authRecord.getId() };

  if (linkedCol) {
    filter += ' && linked_collection = {:lc}';
    params.lc = linkedCol;
  }
  if (linkedId) {
    filter += ' && linked_record_id = {:lid}';
    params.lid = linkedId;
  }

  var dao = $app.dao();
  try {
    var result = dao.findRecordsByFilter(
      'telegram_files', filter, '-created', perPage, (page - 1) * perPage, params
    );

    var items = [];
    for (var i = 0; i < result.length; i++) {
      var r = result[i];
      items.push({
        id: r.getId(),
        filename: r.getString('filename'),
        mime_type: r.getString('mime_type'),
        file_size: r.getInt('file_size'),
        source: r.getString('source'),
        caption: r.getString('caption'),
        linked_collection: r.getString('linked_collection'),
        linked_record_id: r.getString('linked_record_id'),
        created: r.getString('created'),
      });
    }

    return c.json(200, { items: items, page: page, per_page: perPage });
  } catch (e) {
    return c.json(200, { items: [], page: page, per_page: perPage });
  }
});

console.log('[TelegramStorage] Hooks registered: status, test, resolve-channel, upload, download, info, delete, list');
