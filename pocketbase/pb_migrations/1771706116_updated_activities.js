/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("sdvi0ednglf49o3")

  collection.indexes = [
    "CREATE INDEX `idx_activities_timestamp` ON `activities` (`timestamp`)",
    "CREATE INDEX `idx_activities_device` ON `activities` (`device_name`)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "64bpgxhv",
    "name": "metadata",
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
  const collection = dao.findCollectionByNameOrId("sdvi0ednglf49o3")

  collection.indexes = [
    "CREATE INDEX idx_activities_timestamp ON activities (timestamp)",
    "CREATE INDEX idx_activities_device ON activities (device_name)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "64bpgxhv",
    "name": "metadata",
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
