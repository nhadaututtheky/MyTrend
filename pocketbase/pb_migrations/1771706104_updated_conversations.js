/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("qqgc71k9ym6m107")

  collection.indexes = [
    "CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`)",
    "CREATE INDEX `idx_conversations_started` ON `conversations` (`started_at`)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "nfehfjsb",
    "name": "messages",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dg8pei0i",
    "name": "topics",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wwfb9das",
    "name": "tags",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("qqgc71k9ym6m107")

  collection.indexes = [
    "CREATE INDEX idx_conversations_session ON conversations (session_id)",
    "CREATE INDEX idx_conversations_started ON conversations (started_at)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "nfehfjsb",
    "name": "messages",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 0
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dg8pei0i",
    "name": "topics",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 0
    }
  }))

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "wwfb9das",
    "name": "tags",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 0
    }
  }))

  return dao.saveCollection(collection)
})
