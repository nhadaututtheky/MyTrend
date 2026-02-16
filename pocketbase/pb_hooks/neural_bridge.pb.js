/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Neural Bridge Hook
// Bridges to Neural Memory (optional sidecar) for semantic encoding.
// Sends conversation and idea records to Neural Memory /memory/encode endpoint.
// Silently fails if Neural Memory is unreachable (it is optional).

/**
 * Get the Neural Memory URL from environment or use default.
 */
function getNeuralMemoryUrl() {
  var envUrl = $os.getenv('NM_URL');
  return envUrl || 'http://neural-memory:8000';
}

/**
 * Encode a record into Neural Memory via POST /memory/encode.
 * Wraps in try/catch so failures are silent (Neural Memory is optional).
 *
 * @param {string} collection - The collection name (e.g. 'conversations', 'ideas')
 * @param {Record} record - The PocketBase record to encode
 */
function encodeToNeuralMemory(collection, record) {
  try {
    var nmUrl = getNeuralMemoryUrl();
    var endpoint = nmUrl + '/memory/encode';

    // Build the payload based on collection type
    var payload = {
      id: record.getId(),
      collection: collection,
      user: record.getString('user'),
      created: record.getString('created'),
    };

    if (collection === 'conversations') {
      payload.content = record.getString('content') || '';
      payload.summary = record.getString('summary') || '';
      payload.title = record.getString('title') || '';
      payload.tags = record.get('tags') || [];
      payload.project = record.getString('project') || '';
    } else if (collection === 'ideas') {
      payload.content = record.getString('content') || '';
      payload.title = record.getString('title') || '';
      payload.category = record.getString('category') || '';
      payload.tags = record.get('tags') || [];
      payload.priority = record.getInt('priority') || 0;
      payload.project = record.getString('project') || '';
    }

    // Send to Neural Memory using PocketBase built-in $http.send()
    var res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: 5, // 5 second timeout
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('[NeuralBridge] Encoded ' + collection + ' record: ' + record.getId());
    } else {
      console.log('[NeuralBridge] Encode returned status ' + res.statusCode + ' for ' + collection + ': ' + record.getId());
    }
  } catch (err) {
    // Silently fail -- Neural Memory is an optional sidecar
    console.log('[NeuralBridge] Neural Memory unreachable or error (this is OK if NM is not deployed):', err);
  }
}

// ---------------------------------------------------------------------------
// Hook: Encode conversations into Neural Memory after creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('conversations', e.record);
}, 'conversations');

// ---------------------------------------------------------------------------
// Hook: Encode ideas into Neural Memory after creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('ideas', e.record);
}, 'ideas');
