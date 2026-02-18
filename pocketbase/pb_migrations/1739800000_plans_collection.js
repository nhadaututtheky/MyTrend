/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Plans Collection Migration
// Adds the plans collection for tracking Claude's plans, decisions, and their lifecycle.

migrate(
  (db) => {
    // Lookup existing collections for relations
    const projects = Dao(db).findCollectionByNameOrId('projects');
    const conversations = Dao(db).findCollectionByNameOrId('conversations');
    const ideas = Dao(db).findCollectionByNameOrId('ideas');

    // Create plans collection
    const plans = new Collection({
      name: 'plans',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 500 } },
        { name: 'slug', type: 'text', options: { max: 200 } },
        { name: 'plan_type', type: 'select', options: { values: ['implementation', 'architecture', 'design', 'refactor', 'bugfix', 'investigation', 'migration'], maxSelect: 1 } },
        { name: 'status', type: 'select', required: true, options: { values: ['draft', 'approved', 'in_progress', 'review', 'completed', 'abandoned', 'superseded'], maxSelect: 1 } },
        { name: 'content', type: 'editor' },
        { name: 'trigger', type: 'editor' },
        { name: 'reasoning', type: 'editor' },
        { name: 'alternatives', type: 'editor' },
        { name: 'outcome', type: 'editor' },
        { name: 'source_conversations', type: 'json' },
        { name: 'source_ideas', type: 'json' },
        { name: 'parent_plan', type: 'text', options: { max: 50 } },
        { name: 'superseded_by', type: 'text', options: { max: 50 } },
        { name: 'stage_history', type: 'json' },
        { name: 'tags', type: 'json' },
        { name: 'priority', type: 'select', options: { values: ['low', 'medium', 'high', 'critical'], maxSelect: 1 } },
        { name: 'complexity', type: 'select', options: { values: ['trivial', 'simple', 'moderate', 'complex', 'epic'], maxSelect: 1 } },
        { name: 'estimated_effort', type: 'text', options: { max: 100 } },
        { name: 'extraction_source', type: 'select', options: { values: ['auto', 'manual', 'idea_promotion'], maxSelect: 1 } },
        { name: 'extraction_confidence', type: 'number' },
        { name: 'signal_phrase', type: 'text', options: { max: 200 } },
        { name: 'started_at', type: 'date' },
        { name: 'completed_at', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_plans_status ON plans (status)',
        'CREATE INDEX idx_plans_project ON plans (project)',
        'CREATE INDEX idx_plans_slug ON plans (slug)',
        'CREATE INDEX idx_plans_type ON plans (plan_type)',
        'CREATE INDEX idx_plans_started ON plans (started_at)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(plans);

    // Add 'plan' to activities.type select values
    const activities = Dao(db).findCollectionByNameOrId('activities');
    const typeField = activities.schema.getFieldByName('type');
    typeField.options.values = ['conversation', 'coding', 'idea', 'search', 'review', 'plan'];
    Dao(db).saveCollection(activities);
  },
  (db) => {
    // Down: remove plans collection, revert activity type
    try {
      const plans = Dao(db).findCollectionByNameOrId('plans');
      Dao(db).deleteCollection(plans);
    } catch (e) {}

    try {
      const activities = Dao(db).findCollectionByNameOrId('activities');
      const typeField = activities.schema.getFieldByName('type');
      typeField.options.values = ['conversation', 'coding', 'idea', 'search', 'review'];
      Dao(db).saveCollection(activities);
    } catch (e) {}
  },
);
