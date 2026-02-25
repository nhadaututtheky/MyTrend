/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Hub Cron Job History Collection
// Stores execution history for hub_cron_jobs (last 20 runs per job).

migrate(
  (db) => {
    var col = new Collection({
      name: 'hub_cron_history',
      type: 'base',
      schema: [
        {
          name: 'cron_job',
          type: 'relation',
          required: true,
          options: { collectionId: 'hub_cron_jobs', cascadeDelete: true, maxSelect: 1 },
        },
        { name: 'ran_at', type: 'date', required: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          options: { values: ['success', 'error'], maxSelect: 1 },
        },
        { name: 'duration_ms', type: 'number', options: { min: 0 } },
        { name: 'output', type: 'text', options: { max: 5000 } },
      ],
      indexes: ['CREATE INDEX idx_hub_cron_history_job ON hub_cron_history (cron_job)'],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });
    Dao(db).saveCollection(col);
  },
  (db) => {
    try {
      var col = Dao(db).findCollectionByNameOrId('hub_cron_history');
      Dao(db).deleteCollection(col);
    } catch (_) {}
  },
);
