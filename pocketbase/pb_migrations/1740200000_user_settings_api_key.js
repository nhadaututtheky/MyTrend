/// <reference path="../pb_data/types.d.ts" />

// Add anthropic_api_key field to user_settings collection
// Allows users to configure their Claude API key via the web UI

migrate(
  (db) => {
    const dao = new Dao(db);
    const col = dao.findCollectionByNameOrId('user_settings');

    col.schema.addField(
      new SchemaField({
        name: 'anthropic_api_key',
        type: 'text',
        options: { max: 500 },
      }),
    );

    dao.saveCollection(col);
  },
  (db) => {
    const dao = new Dao(db);
    const col = dao.findCollectionByNameOrId('user_settings');

    const field = col.schema.getFieldByName('anthropic_api_key');
    if (field) {
      col.schema.removeField(field.id);
      dao.saveCollection(col);
    }
  },
);
