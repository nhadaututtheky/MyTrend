/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Auth Tokens Collection + telegram_user_id on users
// Magic link login: Telegram bot generates token → user clicks → auto-login

migrate(
  (db) => {
    // 1. Create auth_tokens collection
    var col = new Collection({
      name: 'auth_tokens',
      type: 'base',
      schema: [
        { name: 'token', type: 'text', required: true, options: { min: 32, max: 128 } },
        { name: 'telegram_user_id', type: 'number', required: true },
        { name: 'telegram_username', type: 'text', options: { max: 100 } },
        { name: 'telegram_display_name', type: 'text', options: { max: 200 } },
        { name: 'expires_at', type: 'date', required: true },
        { name: 'used', type: 'bool' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_auth_tokens_token ON auth_tokens (token)',
        'CREATE INDEX idx_auth_tokens_expires ON auth_tokens (expires_at)',
      ],
      // No client-side access — only PB hooks can read/write
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    Dao(db).saveCollection(col);

    // 2. Add telegram_user_id to users collection
    var usersCol = Dao(db).findCollectionByNameOrId('_pb_users_auth_');
    usersCol.schema.addField(
      new SchemaField({
        name: 'telegram_user_id',
        type: 'number',
      }),
    );
    Dao(db).saveCollection(usersCol);
  },
  (db) => {
    // Rollback: remove auth_tokens + telegram_user_id from users
    try {
      var col = Dao(db).findCollectionByNameOrId('auth_tokens');
      Dao(db).deleteCollection(col);
    } catch (_) {}

    try {
      var usersCol = Dao(db).findCollectionByNameOrId('_pb_users_auth_');
      var field = usersCol.schema.getFieldByName('telegram_user_id');
      if (field) {
        usersCol.schema.removeField(field.id);
        Dao(db).saveCollection(usersCol);
      }
    } catch (_) {}
  },
);
