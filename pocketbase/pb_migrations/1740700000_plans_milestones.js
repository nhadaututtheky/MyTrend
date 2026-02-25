/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Add milestones JSON field to plans collection

migrate(
  (db) => {
    // Step 1: Add column to SQLite (idempotent — ignore if already exists)
    try {
      db.newQuery("ALTER TABLE plans ADD COLUMN milestones JSON DEFAULT '[]'").execute();
    } catch (_) {}

    // Step 2: Update PocketBase _collections schema using SQLite JSON functions
    // (avoids .all() which requires Go pointer types in Goja)
    db.newQuery(
      "UPDATE _collections " +
      "SET schema = json_insert(schema, '$[#]', json('{\"id\":\"milestones_json_field\",\"name\":\"milestones\",\"type\":\"json\",\"required\":false,\"presentable\":false,\"options\":{}}')) " +
      "WHERE name = 'plans' " +
      "AND NOT EXISTS (" +
      "  SELECT 1 FROM json_each(schema) WHERE json_extract(value, '$.name') = 'milestones'" +
      ")"
    ).execute();
  },
  (db) => {
    // Remove milestones from _collections schema
    db.newQuery(
      "UPDATE _collections " +
      "SET schema = (" +
      "  SELECT json_group_array(value) FROM json_each(schema) " +
      "  WHERE json_extract(value, '$.name') != 'milestones'" +
      ") " +
      "WHERE name = 'plans'"
    ).execute();
  },
);
