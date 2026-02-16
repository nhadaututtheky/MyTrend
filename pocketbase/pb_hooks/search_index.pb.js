/// <reference path="../pb_data/types.d.ts" />

// MyTrend - FTS5 Search Indexing Hook
// Creates and maintains FTS5 virtual tables for full-text search
// across conversations, ideas, and projects.

// ---------------------------------------------------------------------------
// FTS5 Table Definitions
// ---------------------------------------------------------------------------
var FTS_TABLES = [
  {
    name: 'conversations_fts',
    source: 'conversations',
    columns: ['title', 'content', 'summary'],
    createSql: 'CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(record_id UNINDEXED, title, content, summary, tokenize="porter unicode61")',
  },
  {
    name: 'ideas_fts',
    source: 'ideas',
    columns: ['title', 'content', 'category'],
    createSql: 'CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(record_id UNINDEXED, title, content, category, tokenize="porter unicode61")',
  },
  {
    name: 'projects_fts',
    source: 'projects',
    columns: ['name', 'description', 'goals'],
    createSql: 'CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(record_id UNINDEXED, name, description, goals, tokenize="porter unicode61")',
  },
];

/**
 * Create FTS5 virtual tables if they do not already exist.
 */
function createFtsTables(dao) {
  for (var i = 0; i < FTS_TABLES.length; i++) {
    var table = FTS_TABLES[i];
    try {
      dao.db()
        .newQuery(table.createSql)
        .execute();
      console.log('[SearchIndex] FTS5 table ready: ' + table.name);
    } catch (err) {
      console.log('[SearchIndex] Failed to create FTS5 table ' + table.name + ':', err);
    }
  }
}

/**
 * Find the FTS table config for a given source collection.
 */
function findFtsConfig(collectionName) {
  for (var i = 0; i < FTS_TABLES.length; i++) {
    if (FTS_TABLES[i].source === collectionName) {
      return FTS_TABLES[i];
    }
  }
  return null;
}

/**
 * Upsert a record into the FTS5 index.
 * Deletes any existing entry, then inserts the current data.
 *
 * @param {Dao} dao
 * @param {string} collectionName
 * @param {Record} record
 */
function upsertFtsEntry(dao, collectionName, record) {
  var config = findFtsConfig(collectionName);
  if (!config) return;

  var recordId = record.getId();

  try {
    // Delete existing entry for this record
    dao.db()
      .newQuery('DELETE FROM ' + config.name + ' WHERE record_id = {:recordId}')
      .bind({ recordId: recordId })
      .execute();
  } catch (err) {
    // Table may not exist yet or record not found -- continue to insert
  }

  try {
    // Build column values from the record
    var colNames = ['record_id'];
    var placeholders = ['{:record_id}'];
    var bindings = { record_id: recordId };

    for (var c = 0; c < config.columns.length; c++) {
      var colName = config.columns[c];
      colNames.push(colName);
      placeholders.push('{:col_' + c + '}');

      // Get value as string; handle arrays by joining
      var val = record.get(colName);
      if (Array.isArray(val)) {
        val = val.join(' ');
      } else if (val === null || val === undefined) {
        val = '';
      } else {
        val = String(val);
      }
      bindings['col_' + c] = val;
    }

    var insertSql = 'INSERT INTO ' + config.name +
      ' (' + colNames.join(', ') + ') VALUES (' + placeholders.join(', ') + ')';

    dao.db()
      .newQuery(insertSql)
      .bind(bindings)
      .execute();

    console.log('[SearchIndex] Indexed ' + collectionName + ' record: ' + recordId);
  } catch (err) {
    console.log('[SearchIndex] Failed to index ' + collectionName + ' record ' + recordId + ':', err);
  }
}

/**
 * Delete a record from the FTS5 index.
 *
 * @param {Dao} dao
 * @param {string} collectionName
 * @param {Record} record
 */
function deleteFtsEntry(dao, collectionName, record) {
  var config = findFtsConfig(collectionName);
  if (!config) return;

  try {
    dao.db()
      .newQuery('DELETE FROM ' + config.name + ' WHERE record_id = {:recordId}')
      .bind({ recordId: record.getId() })
      .execute();
    console.log('[SearchIndex] Removed ' + collectionName + ' record from index: ' + record.getId());
  } catch (err) {
    console.log('[SearchIndex] Failed to remove from index:', err);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap: Create FTS5 virtual tables
// ---------------------------------------------------------------------------
onAfterBootstrap((e) => {
  console.log('[SearchIndex] Initializing FTS5 search tables...');
  try {
    createFtsTables($app.dao());
    console.log('[SearchIndex] FTS5 tables initialized successfully.');
  } catch (err) {
    console.log('[SearchIndex] FTS5 initialization error:', err);
  }
});

// ---------------------------------------------------------------------------
// Hooks: Index on create for conversations, ideas, projects
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  upsertFtsEntry($app.dao(), 'conversations', e.record);
}, 'conversations');

onRecordAfterCreateRequest((e) => {
  upsertFtsEntry($app.dao(), 'ideas', e.record);
}, 'ideas');

onRecordAfterCreateRequest((e) => {
  upsertFtsEntry($app.dao(), 'projects', e.record);
}, 'projects');

// ---------------------------------------------------------------------------
// Hooks: Update index on update for conversations, ideas, projects
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest((e) => {
  upsertFtsEntry($app.dao(), 'conversations', e.record);
}, 'conversations');

onRecordAfterUpdateRequest((e) => {
  upsertFtsEntry($app.dao(), 'ideas', e.record);
}, 'ideas');

onRecordAfterUpdateRequest((e) => {
  upsertFtsEntry($app.dao(), 'projects', e.record);
}, 'projects');

// ---------------------------------------------------------------------------
// Hooks: Remove from index on delete for conversations, ideas, projects
// ---------------------------------------------------------------------------
onRecordAfterDeleteRequest((e) => {
  deleteFtsEntry($app.dao(), 'conversations', e.record);
}, 'conversations');

onRecordAfterDeleteRequest((e) => {
  deleteFtsEntry($app.dao(), 'ideas', e.record);
}, 'ideas');

onRecordAfterDeleteRequest((e) => {
  deleteFtsEntry($app.dao(), 'projects', e.record);
}, 'projects');
