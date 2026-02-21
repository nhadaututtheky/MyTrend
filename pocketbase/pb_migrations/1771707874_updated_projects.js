/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("m5rfuyfsmnrlekw")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "4nuxi3oo",
    "name": "github_repo",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": 500,
      "pattern": ""
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "cqhf3uqo",
    "name": "github_last_synced",
    "type": "date",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": "",
      "max": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("m5rfuyfsmnrlekw")

  // remove
  collection.schema.removeField("4nuxi3oo")

  // remove
  collection.schema.removeField("cqhf3uqo")

  return dao.saveCollection(collection)
})
