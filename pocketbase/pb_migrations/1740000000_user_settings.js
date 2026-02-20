/// <reference path="../pb_data/types.d.ts" />

// MyTrend - User Settings Collection Migration
// Stores per-user configuration: Telegram bot token, channel ID, etc.
// Tokens stored in plain text (self-hosted, single-user context).

migrate(
  (db) => {
    const userSettings = new Collection({
      name: 'user_settings',
      type: 'base',
      schema: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 },
        },
        { name: 'telegram_bot_token', type: 'text', options: { max: 500 } },
        { name: 'telegram_channel_id', type: 'text', options: { max: 100 } },
        { name: 'telegram_webhook_secret', type: 'text', options: { max: 200 } },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_user_settings_user ON user_settings (user)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(userSettings);
  },
  (db) => {
    try {
      const col = Dao(db).findCollectionByNameOrId('user_settings');
      Dao(db).deleteCollection(col);
    } catch (e) {}
  },
);
