/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Tasks Collection Migration
// Stores TodoWrite tasks from Claude Code sessions.
// Data source: ~/.claude/todos/{sessionId}-agent-{agentId}.json

migrate(
  (db) => {
    var col = new Collection({
      name: 'claude_tasks',
      type: 'base',
      schema: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 },
        },
        { name: 'session_id', type: 'text', options: { max: 200 } },
        { name: 'agent_id', type: 'text', options: { max: 200 } },
        { name: 'content', type: 'text', options: { max: 2000 } },
        { name: 'active_form', type: 'text', options: { max: 2000 } },
        {
          name: 'status',
          type: 'select',
          required: true,
          options: { values: ['pending', 'in_progress', 'completed'], maxSelect: 1 },
        },
        { name: 'task_index', type: 'number', options: { min: 0 } },
        { name: 'model', type: 'text', options: { max: 200 } },
        { name: 'project_dir', type: 'text', options: { max: 500 } },
        { name: 'session_title', type: 'text', options: { max: 500 } },
        { name: 'input_tokens', type: 'number', options: { min: 0 } },
        { name: 'output_tokens', type: 'number', options: { min: 0 } },
        { name: 'cache_read_tokens', type: 'number', options: { min: 0 } },
        { name: 'cache_create_tokens', type: 'number', options: { min: 0 } },
        { name: 'started_at', type: 'text', options: { max: 50 } },
        { name: 'ended_at', type: 'text', options: { max: 50 } },
        { name: 'file_hash', type: 'text', options: { max: 100 } },
        { name: 'source_file', type: 'text', options: { max: 300 } },
      ],
      indexes: [
        'CREATE INDEX idx_claude_tasks_session ON claude_tasks (session_id)',
        'CREATE INDEX idx_claude_tasks_status ON claude_tasks (status)',
        'CREATE INDEX idx_claude_tasks_user ON claude_tasks (user)',
        'CREATE UNIQUE INDEX idx_claude_tasks_dedup ON claude_tasks (session_id, agent_id, task_index)',
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
      var col = Dao(db).findCollectionByNameOrId('claude_tasks');
      Dao(db).deleteCollection(col);
    } catch (e) {}
  },
);
