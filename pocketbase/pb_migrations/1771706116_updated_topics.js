/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("bsqs0k86v8tgk05")

  collection.indexes = [
    "CREATE INDEX `idx_topics_slug` ON `topics` (`slug`)",
    "CREATE INDEX `idx_topics_last_seen` ON `topics` (`last_seen`)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "oma65vz2",
    "name": "trend_data",
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
    "id": "gcgeamng",
    "name": "related",
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
  const collection = dao.findCollectionByNameOrId("bsqs0k86v8tgk05")

  collection.indexes = [
    "CREATE INDEX idx_topics_slug ON topics (slug)",
    "CREATE INDEX idx_topics_last_seen ON topics (last_seen)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "oma65vz2",
    "name": "trend_data",
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
    "id": "gcgeamng",
    "name": "related",
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
