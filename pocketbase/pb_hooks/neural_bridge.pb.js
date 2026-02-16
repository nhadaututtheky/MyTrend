/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Neural Bridge Hook
// Encodes conversations and ideas into Neural Memory for semantic search.
// NM EncodeRequest: { content: string, timestamp?: string, metadata?: object, tags?: string[] }
// Silently fails if NM is unreachable (optional sidecar).

/**
 * Encode a record into Neural Memory.
 */
function encodeToNeuralMemory(collection, record) {
  try {
    var nmUrl = $os.getenv('NM_URL') || 'http://neural-memory:8000';
    var endpoint = nmUrl + '/memory/encode';

    var content = '';
    var tags = [];
    var metadata = {
      collection: collection,
      record_id: record.getId(),
      user: record.getString('user'),
      type: 'fact',
    };

    if (collection === 'conversations') {
      var title = record.getString('title') || '';
      var summary = record.getString('summary') || '';

      // Build content from title + summary + first few messages
      var parts = [];
      if (title) parts.push('Title: ' + title);
      if (summary) parts.push('Summary: ' + summary);

      var messages = record.get('messages') || [];
      var msgCount = 0;
      for (var i = 0; i < messages.length && msgCount < 10; i++) {
        var msg = messages[i];
        if (msg && msg.role && msg.content) {
          var msgText = msg.content;
          if (msgText.length > 500) msgText = msgText.substring(0, 497) + '...';
          parts.push(msg.role + ': ' + msgText);
          msgCount++;
        }
      }
      content = parts.join('\n');

      // Tags from record
      var recordTags = record.get('tags') || [];
      for (var t = 0; t < recordTags.length; t++) {
        tags.push(String(recordTags[t]));
      }
      tags.push('conversation');

      metadata.title = title;
      metadata.source = record.getString('source') || '';
      metadata.session_id = record.getString('session_id') || '';
      metadata.message_count = record.getInt('message_count') || 0;

    } else if (collection === 'ideas') {
      var ideaTitle = record.getString('title') || '';
      var ideaContent = record.getString('content') || '';

      content = 'Idea: ' + ideaTitle;
      if (ideaContent) content += '\n' + ideaContent;

      var ideaTags = record.get('tags') || [];
      for (var it = 0; it < ideaTags.length; it++) {
        tags.push(String(ideaTags[it]));
      }
      tags.push('idea');

      var ideaType = record.getString('type');
      if (ideaType) tags.push(ideaType);

      metadata.title = ideaTitle;
      metadata.idea_type = ideaType || '';
      metadata.priority = record.getString('priority') || '';
    }

    if (!content || content.length < 10) return;

    // Truncate content to NM max (100k chars)
    if (content.length > 50000) content = content.substring(0, 50000);

    var payload = {
      content: content,
      metadata: metadata,
      tags: tags,
    };

    var startedAt = record.getString('started_at') || record.getString('created');
    if (startedAt) {
      payload.timestamp = startedAt;
    }

    var res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-ID': 'mytrend' },
      body: JSON.stringify(payload),
      timeout: 5,
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('[NeuralBridge] Encoded ' + collection + ': ' + record.getId());
    } else {
      console.log('[NeuralBridge] Status ' + res.statusCode + ' for ' + collection + ': ' + record.getId());
    }
  } catch (err) {
    // Silent fail - NM is optional
    console.log('[NeuralBridge] NM unreachable (OK if not deployed): ' + err);
  }
}

// ---------------------------------------------------------------------------
// Hooks: Encode on create
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('conversations', e.record);
}, 'conversations');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('ideas', e.record);
}, 'ideas');

// ---------------------------------------------------------------------------
// Hooks: Re-encode on update (for title/summary changes)
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('conversations', e.record);
}, 'conversations');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('ideas', e.record);
}, 'ideas');
