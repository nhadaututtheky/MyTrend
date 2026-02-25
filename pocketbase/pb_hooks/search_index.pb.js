/// <reference path="../pb_data/types.d.ts" />

// MyTrend - FTS5 Search Indexing Hook
// Creates FTS5 virtual tables + search endpoint.
// Collections indexed: conversations, ideas, projects, plans, activities, claude_tasks

// ---------------------------------------------------------------------------
// Shared upsert/delete helpers (accessible from onRecord* hooks)
// ---------------------------------------------------------------------------
function upsertIndex(dao, collection, record) {
  try {
    var table = collection + '_fts';
    var recordId = record.getId();

    // Delete existing entry
    try {
      dao.db().newQuery('DELETE FROM ' + table + ' WHERE record_id = {:id}').bind({ id: recordId }).execute();
    } catch (e) { /* not found */ }

    // Build column values based on collection
    if (collection === 'conversations') {
      var title = record.getString('title') || '';
      var summary = record.getString('summary') || '';
      dao.db().newQuery(
        'INSERT INTO conversations_fts (record_id, title, summary) VALUES ({:rid}, {:title}, {:summary})'
      ).bind({ rid: recordId, title: title, summary: summary }).execute();
    } else if (collection === 'ideas') {
      var iTitle = record.getString('title') || '';
      var content = record.getString('content') || '';
      dao.db().newQuery(
        'INSERT INTO ideas_fts (record_id, title, content) VALUES ({:rid}, {:title}, {:content})'
      ).bind({ rid: recordId, title: iTitle, content: content }).execute();
    } else if (collection === 'projects') {
      var pName = record.getString('name') || '';
      var desc = record.getString('description') || '';
      dao.db().newQuery(
        'INSERT INTO projects_fts (record_id, name, description) VALUES ({:rid}, {:name}, {:desc})'
      ).bind({ rid: recordId, name: pName, desc: desc }).execute();
    } else if (collection === 'plans') {
      var plTitle = record.getString('title') || '';
      var plContent = record.getString('content') || '';
      var plReasoning = record.getString('reasoning') || '';
      dao.db().newQuery(
        'INSERT INTO plans_fts (record_id, title, content, reasoning) VALUES ({:rid}, {:title}, {:content}, {:reasoning})'
      ).bind({ rid: recordId, title: plTitle, content: plContent, reasoning: plReasoning }).execute();
    } else if (collection === 'activities') {
      var actAction = record.getString('action') || '';
      var actType = record.getString('type') || '';
      dao.db().newQuery(
        'INSERT INTO activities_fts (record_id, action, type) VALUES ({:rid}, {:action}, {:type})'
      ).bind({ rid: recordId, action: actAction, type: actType }).execute();
    } else if (collection === 'claude_tasks') {
      var ctContent = record.getString('content') || '';
      var ctSession = record.getString('session_title') || '';
      dao.db().newQuery(
        'INSERT INTO claude_tasks_fts (record_id, content, session_title) VALUES ({:rid}, {:content}, {:session})'
      ).bind({ rid: recordId, content: ctContent, session: ctSession }).execute();
    }
  } catch (err) {
    console.log('[SearchIndex] Index error for ' + collection + ':' + record.getId() + ': ' + err);
  }
}

function deleteIndex(dao, collection, record) {
  try {
    dao.db().newQuery('DELETE FROM ' + collection + '_fts WHERE record_id = {:id}').bind({ id: record.getId() }).execute();
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Bootstrap: Create FTS5 virtual tables + rebuild index
// NOTE: onAfterBootstrap has ISOLATED scope - must inline all logic.
// ---------------------------------------------------------------------------
onAfterBootstrap((e) => {
  console.log('[SearchIndex] Initializing FTS5 search tables...');

  var tables = [
    {
      name: 'conversations_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(record_id UNINDEXED, title, summary, tokenize="porter unicode61")'
    },
    {
      name: 'ideas_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(record_id UNINDEXED, title, content, tokenize="porter unicode61")'
    },
    {
      name: 'projects_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(record_id UNINDEXED, name, description, tokenize="porter unicode61")'
    },
    {
      name: 'plans_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(record_id UNINDEXED, title, content, reasoning, tokenize="porter unicode61")'
    },
    {
      name: 'activities_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS activities_fts USING fts5(record_id UNINDEXED, action, type, tokenize="porter unicode61")'
    },
    {
      name: 'claude_tasks_fts',
      sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS claude_tasks_fts USING fts5(record_id UNINDEXED, content, session_title, tokenize="porter unicode61")'
    }
  ];

  var dao = $app.dao();

  for (var i = 0; i < tables.length; i++) {
    try {
      dao.db().newQuery('DROP TABLE IF EXISTS ' + tables[i].name).execute();
      dao.db().newQuery(tables[i].sql).execute();
      console.log('[SearchIndex] FTS5 table ready: ' + tables[i].name);
    } catch (err) {
      console.log('[SearchIndex] FTS5 table ' + tables[i].name + ' error: ' + err);
    }
  }

  // Inline rebuild function (isolated scope - can't reference file-level functions)
  function _upsert(d, coll, rec) {
    try {
      var tbl = coll + '_fts';
      var rid = rec.getId();
      try { d.db().newQuery('DELETE FROM ' + tbl + ' WHERE record_id = {:id}').bind({ id: rid }).execute(); } catch (x) {}
      if (coll === 'conversations') {
        d.db().newQuery('INSERT INTO conversations_fts (record_id, title, summary) VALUES ({:rid}, {:t}, {:s})')
          .bind({ rid: rid, t: rec.getString('title') || '', s: rec.getString('summary') || '' }).execute();
      } else if (coll === 'ideas') {
        d.db().newQuery('INSERT INTO ideas_fts (record_id, title, content) VALUES ({:rid}, {:t}, {:c})')
          .bind({ rid: rid, t: rec.getString('title') || '', c: rec.getString('content') || '' }).execute();
      } else if (coll === 'projects') {
        d.db().newQuery('INSERT INTO projects_fts (record_id, name, description) VALUES ({:rid}, {:n}, {:d})')
          .bind({ rid: rid, n: rec.getString('name') || '', d: rec.getString('description') || '' }).execute();
      } else if (coll === 'plans') {
        d.db().newQuery('INSERT INTO plans_fts (record_id, title, content, reasoning) VALUES ({:rid}, {:t}, {:c}, {:r})')
          .bind({ rid: rid, t: rec.getString('title') || '', c: rec.getString('content') || '', r: rec.getString('reasoning') || '' }).execute();
      } else if (coll === 'activities') {
        d.db().newQuery('INSERT INTO activities_fts (record_id, action, type) VALUES ({:rid}, {:a}, {:tp})')
          .bind({ rid: rid, a: rec.getString('action') || '', tp: rec.getString('type') || '' }).execute();
      } else if (coll === 'claude_tasks') {
        d.db().newQuery('INSERT INTO claude_tasks_fts (record_id, content, session_title) VALUES ({:rid}, {:c}, {:s})')
          .bind({ rid: rid, c: rec.getString('content') || '', s: rec.getString('session_title') || '' }).execute();
      }
    } catch (e) {}
  }

  var collections = ['conversations', 'ideas', 'projects', 'plans', 'activities', 'claude_tasks'];
  for (var c = 0; c < collections.length; c++) {
    try {
      var records = dao.findRecordsByFilter(collections[c], '1=1', '', 0, 0);
      var count = 0;
      for (var r = 0; r < records.length; r++) {
        _upsert(dao, collections[c], records[r]);
        count++;
      }
      console.log('[SearchIndex] Rebuilt ' + count + ' records for ' + collections[c]);
    } catch (e) {
      console.log('[SearchIndex] Rebuild ' + collections[c] + ' error: ' + e);
    }
  }

  console.log('[SearchIndex] FTS5 initialization complete.');
});

// ---------------------------------------------------------------------------
// Hooks: Index on create/update/delete (onRecord* CAN access file-level vars)
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => { upsertIndex($app.dao(), e.collection.name, e.record); }, 'conversations', 'ideas', 'projects', 'plans', 'activities', 'claude_tasks');
onRecordAfterUpdateRequest((e) => { upsertIndex($app.dao(), e.collection.name, e.record); }, 'conversations', 'ideas', 'projects', 'plans', 'activities', 'claude_tasks');
onRecordAfterDeleteRequest((e) => { deleteIndex($app.dao(), e.collection.name, e.record); }, 'conversations', 'ideas', 'projects', 'plans', 'activities', 'claude_tasks');

// ---------------------------------------------------------------------------
// GET /api/mytrend/search?q=...
// Backend search endpoint - safe from SQL injection.
// NOTE: routerAdd has ISOLATED scope - must inline all logic.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/search', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var q = (c.queryParam('q') || '').trim();
  if (q.length < 2) return c.json(200, []);

  var dao = $app.dao();
  var results = [];

  // Search conversations (safe parameter binding)
  try {
    var convs = dao.findRecordsByFilter(
      'conversations',
      'user = {:uid} && (title ~ {:q} || summary ~ {:q})',
      '-created', 10, 0,
      { uid: userId, q: q }
    );
    for (var i = 0; i < convs.length; i++) {
      results.push({
        type: 'conversation',
        id: convs[i].getId(),
        title: convs[i].getString('title'),
        snippet: (convs[i].getString('summary') || '').substring(0, 200),
        score: 0.8,
      });
    }
  } catch (e) { /* skip */ }

  // Search ideas
  try {
    var ideas = dao.findRecordsByFilter(
      'ideas',
      'user = {:uid} && (title ~ {:q} || content ~ {:q})',
      '-created', 10, 0,
      { uid: userId, q: q }
    );
    for (var j = 0; j < ideas.length; j++) {
      results.push({
        type: 'idea',
        id: ideas[j].getId(),
        title: ideas[j].getString('title'),
        snippet: (ideas[j].getString('content') || '').substring(0, 200),
        score: 0.7,
      });
    }
  } catch (e) { /* skip */ }

  // Search projects (return slug for correct linking)
  try {
    var projects = dao.findRecordsByFilter(
      'projects',
      'user = {:uid} && (name ~ {:q} || description ~ {:q})',
      '-created', 10, 0,
      { uid: userId, q: q }
    );
    for (var k = 0; k < projects.length; k++) {
      results.push({
        type: 'project',
        id: projects[k].getString('slug'),
        title: projects[k].getString('name'),
        snippet: (projects[k].getString('description') || '').substring(0, 200),
        score: 0.9,
      });
    }
  } catch (e) { /* skip */ }

  // Search plans
  try {
    var plans = dao.findRecordsByFilter(
      'plans',
      'user = {:uid} && (title ~ {:q} || content ~ {:q} || reasoning ~ {:q})',
      '-created', 10, 0,
      { uid: userId, q: q }
    );
    for (var pl = 0; pl < plans.length; pl++) {
      results.push({
        type: 'plan',
        id: plans[pl].getId(),
        title: plans[pl].getString('title'),
        snippet: (plans[pl].getString('content') || '').substring(0, 200),
        score: 0.85,
      });
    }
  } catch (e) { /* skip */ }

  // Search topics
  try {
    var topics = dao.findRecordsByFilter(
      'topics',
      'user = {:uid} && name ~ {:q}',
      '-mention_count', 10, 0,
      { uid: userId, q: q }
    );
    for (var t = 0; t < topics.length; t++) {
      results.push({
        type: 'topic',
        id: topics[t].getId(),
        title: topics[t].getString('name'),
        snippet: 'Mentioned ' + topics[t].getInt('mention_count') + ' times',
        score: 0.6,
      });
    }
  } catch (e) { /* skip */ }

  // Search activities
  try {
    var acts = dao.findRecordsByFilter(
      'activities',
      'user = {:uid} && action ~ {:q}',
      '-timestamp', 10, 0,
      { uid: userId, q: q }
    );
    for (var ai = 0; ai < acts.length; ai++) {
      results.push({
        type: 'activity',
        id: acts[ai].getId(),
        title: acts[ai].getString('action'),
        snippet: acts[ai].getString('type') + ' activity',
        score: 0.65,
      });
    }
  } catch (e) { /* skip */ }

  // Search claude_tasks
  try {
    var tasks = dao.findRecordsByFilter(
      'claude_tasks',
      'user = {:uid} && (content ~ {:q} || session_title ~ {:q})',
      '-created', 10, 0,
      { uid: userId, q: q }
    );
    for (var ct = 0; ct < tasks.length; ct++) {
      results.push({
        type: 'claude_task',
        id: tasks[ct].getId(),
        title: tasks[ct].getString('content'),
        snippet: 'Session: ' + (tasks[ct].getString('session_title') || 'Unknown') + ' | ' + tasks[ct].getString('status'),
        score: 0.6,
      });
    }
  } catch (e) { /* skip */ }

  // Sort by score descending
  results.sort(function(a, b) { return b.score - a.score; });

  return c.json(200, results.slice(0, 20));
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/related?collection=ideas&id=<recordId>&q=<text>&limit=5
// Cross-collection FTS5 "related content" lookup. Auth required.
// NOTE: routerAdd has ISOLATED scope - must inline all logic.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/related', function(c) {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var sourceCollection = (c.queryParam('collection') || '').trim();
  var sourceId = (c.queryParam('id') || '').trim();
  var q = (c.queryParam('q') || '').trim();
  var limit = parseInt(c.queryParam('limit') || '5', 10);
  if (isNaN(limit) || limit < 1 || limit > 10) limit = 5;

  if (!q || q.length < 2) return c.json(200, []);

  var dao = $app.dao();
  var results = [];

  // Search conversations (exclude source if same collection)
  try {
    var filter = sourceCollection === 'conversations' && sourceId
      ? 'user = {:uid} && id != {:excl} && (title ~ {:q} || summary ~ {:q})'
      : 'user = {:uid} && (title ~ {:q} || summary ~ {:q})';
    var convs = dao.findRecordsByFilter(
      'conversations', filter, '-created', limit, 0,
      { uid: userId, q: q, excl: sourceId }
    );
    for (var i = 0; i < convs.length; i++) {
      results.push({
        type: 'conversation',
        id: convs[i].getId(),
        title: convs[i].getString('title'),
        snippet: (convs[i].getString('summary') || '').substring(0, 150),
      });
    }
  } catch (e) { /* skip */ }

  // Search ideas (exclude source if same collection)
  try {
    var ideaFilter = sourceCollection === 'ideas' && sourceId
      ? 'user = {:uid} && id != {:excl} && (title ~ {:q} || content ~ {:q})'
      : 'user = {:uid} && (title ~ {:q} || content ~ {:q})';
    var ideas = dao.findRecordsByFilter(
      'ideas', ideaFilter, '-created', limit, 0,
      { uid: userId, q: q, excl: sourceId }
    );
    for (var j = 0; j < ideas.length; j++) {
      results.push({
        type: 'idea',
        id: ideas[j].getId(),
        title: ideas[j].getString('title'),
        snippet: (ideas[j].getString('content') || '').substring(0, 150),
      });
    }
  } catch (e) { /* skip */ }

  // Search projects (exclude source if same collection)
  try {
    var projFilter = sourceCollection === 'projects' && sourceId
      ? 'user = {:uid} && id != {:excl} && (name ~ {:q} || description ~ {:q})'
      : 'user = {:uid} && (name ~ {:q} || description ~ {:q})';
    var projects = dao.findRecordsByFilter(
      'projects', projFilter, '-created', limit, 0,
      { uid: userId, q: q, excl: sourceId }
    );
    for (var k = 0; k < projects.length; k++) {
      results.push({
        type: 'project',
        id: projects[k].getString('slug'),
        title: projects[k].getString('name'),
        snippet: (projects[k].getString('description') || '').substring(0, 150),
      });
    }
  } catch (e) { /* skip */ }

  // Search plans (exclude source if same collection)
  try {
    var planFilter = sourceCollection === 'plans' && sourceId
      ? 'user = {:uid} && id != {:excl} && (title ~ {:q} || content ~ {:q})'
      : 'user = {:uid} && (title ~ {:q} || content ~ {:q})';
    var plans = dao.findRecordsByFilter(
      'plans', planFilter, '-created', limit, 0,
      { uid: userId, q: q, excl: sourceId }
    );
    for (var pl = 0; pl < plans.length; pl++) {
      results.push({
        type: 'plan',
        id: plans[pl].getId(),
        title: plans[pl].getString('title'),
        snippet: (plans[pl].getString('content') || '').substring(0, 150),
      });
    }
  } catch (e) { /* skip */ }

  // Shuffle slightly (each collection already sorted by -created) then cap
  return c.json(200, results.slice(0, limit));
});
