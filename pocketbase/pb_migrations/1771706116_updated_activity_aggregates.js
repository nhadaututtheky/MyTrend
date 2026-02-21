/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("7f662husxng4s6x")

  collection.indexes = [
    "CREATE INDEX `idx_agg_period` ON `activity_aggregates` (`period_start`)",
    "CREATE UNIQUE INDEX `idx_agg_unique` ON `activity_aggregates` (\n  `user`,\n  `project`,\n  `period`,\n  `period_start`\n)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ovrtyl2x",
    "name": "breakdown",
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
    "id": "fqaxdxcz",
    "name": "top_topics",
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
    "id": "6vx4mj3o",
    "name": "devices",
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
  const collection = dao.findCollectionByNameOrId("7f662husxng4s6x")

  collection.indexes = [
    "CREATE INDEX idx_agg_period ON activity_aggregates (period_start)",
    "CREATE UNIQUE INDEX idx_agg_unique ON activity_aggregates (user, project, period, period_start)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ovrtyl2x",
    "name": "breakdown",
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
    "id": "fqaxdxcz",
    "name": "top_topics",
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
    "id": "6vx4mj3o",
    "name": "devices",
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
