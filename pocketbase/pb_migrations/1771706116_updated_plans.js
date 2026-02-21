/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("tm2c4sw6908ylxe")

  collection.indexes = [
    "CREATE INDEX `idx_plans_status` ON `plans` (`status`)",
    "CREATE INDEX `idx_plans_project` ON `plans` (`project`)",
    "CREATE INDEX `idx_plans_slug` ON `plans` (`slug`)",
    "CREATE INDEX `idx_plans_type` ON `plans` (`plan_type`)",
    "CREATE INDEX `idx_plans_started` ON `plans` (`started_at`)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "q0dzbiml",
    "name": "source_conversations",
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
    "id": "ocjxqdoi",
    "name": "source_ideas",
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
    "id": "i6wsmmka",
    "name": "stage_history",
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
    "id": "ti0vfxh9",
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
  const collection = dao.findCollectionByNameOrId("tm2c4sw6908ylxe")

  collection.indexes = [
    "CREATE INDEX idx_plans_status ON plans (status)",
    "CREATE INDEX idx_plans_project ON plans (project)",
    "CREATE INDEX idx_plans_slug ON plans (slug)",
    "CREATE INDEX idx_plans_type ON plans (plan_type)",
    "CREATE INDEX idx_plans_started ON plans (started_at)"
  ]

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "q0dzbiml",
    "name": "source_conversations",
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
    "id": "ocjxqdoi",
    "name": "source_ideas",
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
    "id": "i6wsmmka",
    "name": "stage_history",
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
    "id": "ti0vfxh9",
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
