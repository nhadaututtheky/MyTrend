/// <reference path="../pb_data/types.d.ts" />

// MyTrend - FTS5 Search Indexing Hook
// Creates and maintains FTS5 virtual tables for full-text search.

// ---------------------------------------------------------------------------
// Bootstrap: Create FTS5 virtual tables
// ---------------------------------------------------------------------------
onAfterBootstrap((e) => {
  console.log('[SearchIndex] Initializing FTS5 search tables...');

  var tables = [
    { name: 'conversations_fts', sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(record_id UNINDEXED, title, content, summary, tokenize="porter unicode61")' },
    { name: 'ideas_fts', sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(record_id UNINDEXED, title, content, category, tokenize="porter unicode61")' },
    { name: 'projects_fts', sql: 'CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(record_id UNINDEXED, name, description, goals, tokenize="porter unicode61")' }
  ];

  var dao = $app.dao();

  try {
    for (var i = 0; i < tables.length; i++) {
      try {
        dao.db().newQuery(tables[i].sql).execute();
        console.log('[SearchIndex] FTS5 table ready: ' + tables[i].name);
      } catch (err) {
        console.log('[SearchIndex] Failed to create FTS5 table ' + tables[i].name + ':', err);
      }
    }
    console.log('[SearchIndex] FTS5 tables initialized successfully.');
  } catch (err) {
    console.log('[SearchIndex] FTS5 initialization error:', err);
  }
});

// ---------------------------------------------------------------------------
// Hooks: Indexing logic
// ---------------------------------------------------------------------------

function upsert(dao, collection, record) {
  try {
    var table = collection + '_fts';
    var cols = [];
    if (collection === 'conversations') cols = ['title', 'content', 'summary'];
    if (collection === 'ideas') cols = ['title', 'content', 'category'];
    if (collection === 'projects') cols = ['name', 'description', 'goals'];

    if (cols.length === 0) return;

    var recordId = record.getId();

    // Delete existing
    try {
      dao.db().newQuery('DELETE FROM ' + table + ' WHERE record_id = {:id}').bind({ id: recordId }).execute();
    } catch (e) { }

    // Insert
    var vals = { record_id: recordId };
    var placeholders = ['{:record_id}'];
    var colNames = ['record_id'];

    for (var i = 0; i < cols.length; i++) {
      var val = record.get(cols[i]);
      var key = 'col_' + i;
      vals[key] = val ? String(val) : '';
      placeholders.push('{:' + key + '}');
      colNames.push(cols[i]);
    }

    var sql = 'INSERT INTO ' + table + ' (' + colNames.join(', ') + ') VALUES (' + placeholders.join(', ') + ')';
    dao.db().newQuery(sql).bind(vals).execute();

    console.log('[SearchIndex] Indexed ' + collection + ': ' + recordId);
  } catch (err) {
    console.log('[SearchIndex] Index error:', err);
  }
}

function del(dao, collection, record) {
  try {
    var table = collection + '_fts';
    dao.db().newQuery('DELETE FROM ' + table + ' WHERE record_id = {:id}').bind({ id: record.getId() }).execute();
    console.log('[SearchIndex] Deleted from index ' + collection + ': ' + record.getId());
  } catch (e) {
    console.log('[SearchIndex] Delete error:', e);
  }
}

// Register hooks
onRecordAfterCreateRequest((e) => upsert($app.dao(), e.collection.name, e.record), 'conversations', 'ideas', 'projects');
onRecordAfterUpdateRequest((e) => upsert($app.dao(), e.collection.name, e.record), 'conversations', 'ideas', 'projects');
onRecordAfterDeleteRequest((e) => del($app.dao(), e.collection.name, e.record), 'conversations', 'ideas', 'projects');
