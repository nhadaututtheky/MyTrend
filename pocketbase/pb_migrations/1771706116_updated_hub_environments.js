/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("d3l71g5tzffueg7")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "erkyda6l",
    "name": "tools_enabled",
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
  const collection = dao.findCollectionByNameOrId("d3l71g5tzffueg7")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "erkyda6l",
    "name": "tools_enabled",
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
