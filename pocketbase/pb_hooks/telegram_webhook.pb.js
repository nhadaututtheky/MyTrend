/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Telegram Knowledge Inbox
// Receives forwarded messages/files from Telegram bot, auto-creates ideas.
// PocketBase Goja JSVM: each routerAdd has isolated scope.

// ---------------------------------------------------------------------------
// POST /api/telegram/webhook - Receive Telegram updates (no auth, secret header)
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/telegram/webhook', (c) => {
  // Verify webhook secret (Telegram sends X-Telegram-Bot-Api-Secret-Token header)
  var webhookSecret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || '';
  if (webhookSecret) {
    var headerSecret = '';
    try { headerSecret = c.request().header.get('X-Telegram-Bot-Api-Secret-Token') || ''; } catch (e) {}
    if (headerSecret !== webhookSecret) {
      return c.json(403, { error: 'Invalid secret' });
    }
  }

  var body = $apis.requestInfo(c).data;
  if (!body || !body.message) {
    return c.json(200, { ok: true });
  }

  var msg = body.message;
  var chatId = msg.chat ? String(msg.chat.id) : '';
  var text = msg.text || msg.caption || '';
  var fromUser = msg.from ? (msg.from.username || msg.from.first_name || 'unknown') : 'unknown';

  var dao = $app.dao();
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN');
  var channelId = $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID');

  // Resolve MyTrend user
  var userId = $os.getenv('MYTREND_SYNC_USER_ID') || '';
  if (!userId) {
    try {
      var users = dao.findRecordsByFilter('users', '1=1', '', 1, 0);
      if (users && users.length > 0) userId = users[0].getId();
    } catch (e) {}
  }
  if (!userId) {
    console.log('[TelegramWebhook] No user configured, skipping');
    return c.json(200, { ok: true });
  }

  // --- Handle file attachments ---
  var hasFile = !!(msg.document || (msg.photo && msg.photo.length > 0) || msg.audio || msg.video || msg.voice);
  var fileRecord = null;

  if (hasFile && botToken && channelId) {
    var fileId = '';
    var fileUniqueId = '';
    var filename = 'telegram_file';
    var mimeType = 'application/octet-stream';
    var fileSize = 0;

    if (msg.document) {
      fileId = msg.document.file_id;
      fileUniqueId = msg.document.file_unique_id;
      filename = msg.document.file_name || 'document';
      mimeType = msg.document.mime_type || 'application/octet-stream';
      fileSize = msg.document.file_size || 0;
    } else if (msg.photo && msg.photo.length > 0) {
      var largest = msg.photo[msg.photo.length - 1];
      fileId = largest.file_id;
      fileUniqueId = largest.file_unique_id;
      filename = 'photo_' + msg.message_id + '.jpg';
      mimeType = 'image/jpeg';
      fileSize = largest.file_size || 0;
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      fileUniqueId = msg.audio.file_unique_id;
      filename = msg.audio.file_name || 'audio.mp3';
      mimeType = msg.audio.mime_type || 'audio/mpeg';
      fileSize = msg.audio.file_size || 0;
    } else if (msg.video) {
      fileId = msg.video.file_id;
      fileUniqueId = msg.video.file_unique_id;
      filename = msg.video.file_name || 'video.mp4';
      mimeType = msg.video.mime_type || 'video/mp4';
      fileSize = msg.video.file_size || 0;
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      fileUniqueId = msg.voice.file_unique_id;
      filename = 'voice_' + msg.message_id + '.ogg';
      mimeType = msg.voice.mime_type || 'audio/ogg';
      fileSize = msg.voice.file_size || 0;
    }

    if (fileId) {
      // Dedup check
      var exists = false;
      try {
        dao.findFirstRecordByFilter('telegram_files', 'file_unique_id = {:fuid}', { fuid: fileUniqueId });
        exists = true;
      } catch (e) {}

      if (!exists) {
        // If received in private chat (not the storage channel), forward to channel
        var storedMsgId = msg.message_id;
        if (chatId !== channelId) {
          try {
            var fwdRes = $http.send({
              url: 'https://api.telegram.org/bot' + botToken + '/forwardMessage',
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                chat_id: channelId,
                from_chat_id: chatId,
                message_id: msg.message_id,
              }),
              timeout: 30,
            });
            if (fwdRes.json && fwdRes.json.ok) {
              var fwdMsg = fwdRes.json.result;
              storedMsgId = fwdMsg.message_id;
              // Update file_id from forwarded copy
              if (fwdMsg.document) {
                fileId = fwdMsg.document.file_id;
                fileUniqueId = fwdMsg.document.file_unique_id;
              } else if (fwdMsg.photo && fwdMsg.photo.length > 0) {
                var fLargest = fwdMsg.photo[fwdMsg.photo.length - 1];
                fileId = fLargest.file_id;
                fileUniqueId = fLargest.file_unique_id;
              }
            }
          } catch (e) {
            console.log('[TelegramWebhook] Forward failed: ' + e);
          }
        }

        // Save file metadata
        try {
          var tgCol = dao.findCollectionByNameOrId('telegram_files');
          var fr = new Record(tgCol);
          fr.set('user', userId);
          fr.set('file_id', fileId);
          fr.set('file_unique_id', fileUniqueId);
          fr.set('telegram_msg_id', storedMsgId);
          fr.set('channel_id', channelId);
          fr.set('filename', filename);
          fr.set('mime_type', mimeType);
          fr.set('file_size', fileSize);
          fr.set('source', 'webhook');
          fr.set('caption', text.substring(0, 1000));
          dao.saveRecord(fr);
          fileRecord = fr;
          console.log('[TelegramWebhook] Saved file: ' + filename);
        } catch (e) {
          console.log('[TelegramWebhook] File save error: ' + e);
        }
      }
    }
  }

  // --- Auto-create idea from text (if meaningful text) ---
  if (text && text.length >= 5) {
    try {
      var ideaCol = dao.findCollectionByNameOrId('ideas');
      var idea = new Record(ideaCol);

      // Extract title from first line
      var lines = text.split('\n');
      var title = lines[0].replace(/^[#*\->\s]+/, '').trim();
      if (title.length > 200) title = title.substring(0, 197) + '...';
      if (title.length < 3) title = 'Telegram: ' + text.substring(0, 100);

      var content = text;
      if (fileRecord) {
        content += '\n\n📎 Attached: ' + fileRecord.getString('filename');
      }
      content += '\n\n---\n_From Telegram @' + fromUser + ' at ' + new Date().toISOString() + '_';

      idea.set('user', userId);
      idea.set('title', title);
      idea.set('content', content);
      idea.set('type', 'feature');
      idea.set('status', 'inbox');
      idea.set('priority', 'medium');
      idea.set('tags', JSON.stringify(['telegram', 'inbox']));
      idea.set('related_ideas', JSON.stringify([]));
      dao.saveRecord(idea);

      // Link file to idea
      if (fileRecord) {
        fileRecord.set('linked_collection', 'ideas');
        fileRecord.set('linked_record_id', idea.getId());
        dao.saveRecord(fileRecord);
      }

      console.log('[TelegramWebhook] Created idea: ' + title);

      // Send confirmation reply (best-effort)
      if (botToken && chatId) {
        try {
          $http.send({
            url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '📝 Saved to MyTrend inbox: "' + title.substring(0, 50) + '"',
              reply_to_message_id: msg.message_id,
            }),
            timeout: 10,
          });
        } catch (e) { /* non-fatal */ }
      }
    } catch (e) {
      console.log('[TelegramWebhook] Idea create error: ' + e);
    }
  }

  return c.json(200, { ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/telegram/webhook/setup - Register webhook URL with Telegram
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/telegram/webhook/setup', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var body = $apis.requestInfo(c).data;
  var webhookUrl = (body.url || '').trim();
  if (!webhookUrl) return c.json(400, { error: 'Missing webhook URL' });

  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN');
  if (!botToken) return c.json(500, { error: 'Bot token not configured' });

  var secret = $os.getenv('TELEGRAM_WEBHOOK_SECRET') || '';

  var payload = {
    url: webhookUrl + '/api/telegram/webhook',
    allowed_updates: ['message'],
    drop_pending_updates: true,
  };
  if (secret) payload.secret_token = secret;

  try {
    var res = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/setWebhook',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 15,
    });

    if (res.statusCode === 200 && res.json && res.json.ok) {
      return c.json(200, { success: true, message: 'Webhook registered' });
    }

    var errMsg = (res.json && res.json.description) ? res.json.description : ('HTTP ' + res.statusCode);
    return c.json(502, { success: false, error: errMsg });
  } catch (e) {
    return c.json(502, { success: false, error: 'Failed: ' + e });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/telegram/webhook/setup - Remove webhook
// ---------------------------------------------------------------------------
routerAdd('DELETE', '/api/telegram/webhook/setup', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN');
  if (!botToken) return c.json(500, { error: 'Bot token not configured' });

  try {
    var res = $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/deleteWebhook',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: true }),
      timeout: 15,
    });

    return c.json(200, { success: true, message: 'Webhook removed' });
  } catch (e) {
    return c.json(502, { success: false, error: 'Failed: ' + e });
  }
});

console.log('[TelegramWebhook] Hooks registered: webhook, setup, remove');
