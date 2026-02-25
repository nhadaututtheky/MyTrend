/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Add milestones JSON field to plans collection

migrate(
  (db) => {
    // Add column to SQLite
    db.newQuery("ALTER TABLE plans ADD COLUMN milestones JSON DEFAULT '[]'").execute();

    // Update PocketBase schema metadata so the field is visible via API
    var rows = db.newQuery("SELECT schema FROM _collections WHERE name='plans'").all();
    if (rows && rows.length > 0) {
      var existing = rows[0];
      var schema = JSON.parse(existing.schema || '[]');
      // Only add if not already present
      var alreadyHas = false;
      for (var i = 0; i < schema.length; i++) {
        if (schema[i].name === 'milestones') { alreadyHas = true; break; }
      }
      if (!alreadyHas) {
        schema.push({
          id: 'milestones_json_field',
          name: 'milestones',
          type: 'json',
          required: false,
          presentable: false,
          options: {},
        });
        db.newQuery(
          "UPDATE _collections SET schema='" + JSON.stringify(schema).replace(/'/g, "''") + "' WHERE name='plans'"
        ).execute();
      }
    }
  },
  (db) => {
    // Remove from schema metadata (SQLite can't easily drop columns)
    var rows = db.newQuery("SELECT schema FROM _collections WHERE name='plans'").all();
    if (rows && rows.length > 0) {
      var schema = JSON.parse(rows[0].schema || '[]');
      schema = schema.filter(function (f) { return f.name !== 'milestones'; });
      db.newQuery(
        "UPDATE _collections SET schema='" + JSON.stringify(schema).replace(/'/g, "''") + "' WHERE name='plans'"
      ).execute();
    }
  },
);
