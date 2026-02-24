/// <reference path="../pb_data/types.d.ts" />

// Add linked_plan field to ideas collection
// Stores the plan ID when an idea is promoted to a plan

migrate(
  (db) => {
    const dao = new Dao(db);
    const col = dao.findCollectionByNameOrId('ideas');

    col.schema.addField(
      new SchemaField({
        name: 'linked_plan',
        type: 'text',
        options: { max: 50 },
      }),
    );

    dao.saveCollection(col);
  },
  (db) => {
    const dao = new Dao(db);
    const col = dao.findCollectionByNameOrId('ideas');

    const field = col.schema.getFieldByName('linked_plan');
    if (field) {
      col.schema.removeField(field.id);
      dao.saveCollection(col);
    }
  },
);
