/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("sdvi0ednglf49o3")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "atnqjhzu",
    "name": "type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "conversation",
        "coding",
        "idea",
        "search",
        "review",
        "plan",
        "commit",
        "pr",
        "issue"
      ]
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("sdvi0ednglf49o3")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "atnqjhzu",
    "name": "type",
    "type": "select",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": [
        "conversation",
        "coding",
        "idea",
        "search",
        "review",
        "plan"
      ]
    }
  }))

  return dao.saveCollection(collection)
})
