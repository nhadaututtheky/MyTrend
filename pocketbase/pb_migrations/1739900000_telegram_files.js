/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Telegram Files Collection Migration
// Stores metadata for files uploaded to Telegram storage channel.

migrate(
  (db) => {
    const telegramFiles = new Collection({
      name: 'telegram_files',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'file_id', type: 'text', required: true, options: { max: 500 } },
        { name: 'file_unique_id', type: 'text', required: true, options: { max: 200 } },
        { name: 'telegram_msg_id', type: 'number', required: true },
        { name: 'channel_id', type: 'text', required: true, options: { max: 50 } },
        { name: 'filename', type: 'text', required: true, options: { max: 500 } },
        { name: 'mime_type', type: 'text', options: { max: 200 } },
        { name: 'file_size', type: 'number', options: { min: 0 } },
        { name: 'linked_collection', type: 'text', options: { max: 100 } },
        { name: 'linked_record_id', type: 'text', options: { max: 50 } },
        { name: 'source', type: 'select', options: { values: ['upload', 'webhook', 'import'], maxSelect: 1 } },
        { name: 'caption', type: 'text', options: { max: 1000 } },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_tgfiles_unique_id ON telegram_files (file_unique_id)',
        'CREATE INDEX idx_tgfiles_linked ON telegram_files (linked_collection, linked_record_id)',
        'CREATE INDEX idx_tgfiles_user ON telegram_files (user)',
        'CREATE INDEX idx_tgfiles_msg_id ON telegram_files (telegram_msg_id)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(telegramFiles);
  },
  (db) => {
    try {
      const col = Dao(db).findCollectionByNameOrId('telegram_files');
      Dao(db).deleteCollection(col);
    } catch (e) {}
  },
);
