/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("m5rfuyfsmnrlekw")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_projects_slug` ON `projects` (`slug`)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "3s4nsvsx",
    "name": "dna",
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
    "id": "bonhhoxl",
    "name": "tech_stack",
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
  const collection = dao.findCollectionByNameOrId("m5rfuyfsmnrlekw")

  collection.indexes = [
    "CREATE UNIQUE INDEX idx_projects_slug ON projects (slug)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "3s4nsvsx",
    "name": "dna",
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
    "id": "bonhhoxl",
    "name": "tech_stack",
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
