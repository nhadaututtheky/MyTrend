/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Research Knowledge Graph Collection
// Stores auto-captured URLs from Telegram with AI analysis.
// Data source: companion telegram-research module

migrate(
  (db) => {
    var col = new Collection({
      name: 'research',
      type: 'base',
      schema: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 },
        },
        { name: 'url', type: 'url', required: true, options: { exceptDomains: [], onlyDomains: [] } },
        {
          name: 'source',
          type: 'select',
          required: true,
          options: { values: ['github', 'npm', 'blog', 'docs', 'other'], maxSelect: 1 },
        },
        { name: 'title', type: 'text', required: true, options: { max: 500 } },
        { name: 'description', type: 'text', options: { max: 5000 } },
        { name: 'stars', type: 'number', options: { min: 0 } },
        { name: 'npm_downloads', type: 'number', options: { min: 0 } },
        { name: 'tech_tags', type: 'json' },
        { name: 'patterns_extracted', type: 'json' },
        { name: 'applicable_projects', type: 'json' },
        {
          name: 'verdict',
          type: 'select',
          options: { values: ['fit', 'partial', 'concept-only', 'irrelevant'], maxSelect: 1 },
        },
        { name: 'ai_summary', type: 'text', options: { max: 10000 } },
        { name: 'user_comment', type: 'text', options: { max: 2000 } },
        { name: 'raw_metadata', type: 'json' },
        { name: 'processed_at', type: 'date' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_research_url ON research (url)',
        'CREATE INDEX idx_research_source ON research (source)',
        'CREATE INDEX idx_research_verdict ON research (verdict)',
        'CREATE INDEX idx_research_created ON research (created)',
        'CREATE INDEX idx_research_user ON research (user)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(col);
  },
  (db) => {
    try {
      var col = Dao(db).findCollectionByNameOrId('research');
      Dao(db).deleteCollection(col);
    } catch (e) {}
  },
);
