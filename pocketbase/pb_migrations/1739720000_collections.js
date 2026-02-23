/// <reference path="../pb_data/types.d.ts" />

// MyTrend Collections Migration
// Creates all PocketBase collections for the platform

migrate(
  (db) => {
    // 1. Projects
    const projects = new Collection({
      name: 'projects',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'name', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'slug', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'description', type: 'text', options: { max: 5000 } },
        { name: 'color', type: 'text', options: { max: 10 } },
        { name: 'icon', type: 'text', options: { max: 10 } },
        { name: 'dna', type: 'json' },
        { name: 'tech_stack', type: 'json' },
        { name: 'status', type: 'select', options: { values: ['active', 'paused', 'archived', 'completed'], maxSelect: 1 } },
        { name: 'total_conversations', type: 'number', options: { min: 0 } },
        { name: 'total_ideas', type: 'number', options: { min: 0 } },
        { name: 'total_minutes', type: 'number', options: { min: 0 } },
        { name: 'last_activity', type: 'date' },
        { name: 'github_repo', type: 'text', options: { max: 500 } },
        { name: 'github_last_synced', type: 'date' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_projects_slug ON projects (slug)'],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(projects);

    // 2. Conversations
    const conversations = new Collection({
      name: 'conversations',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 500 } },
        { name: 'summary', type: 'text', options: { max: 5000 } },
        { name: 'source', type: 'select', options: { values: ['cli', 'desktop', 'web', 'imported', 'hub'], maxSelect: 1 } },
        { name: 'device_name', type: 'text', options: { max: 100 } },
        { name: 'session_id', type: 'text', options: { max: 200 } },
        { name: 'messages', type: 'json' },
        { name: 'message_count', type: 'number', options: { min: 0 } },
        { name: 'total_tokens', type: 'number', options: { min: 0 } },
        { name: 'topics', type: 'json' },
        { name: 'tags', type: 'json' },
        { name: 'started_at', type: 'date', required: true },
        { name: 'ended_at', type: 'date' },
        { name: 'duration_min', type: 'number', options: { min: 0 } },
      ],
      indexes: [
        'CREATE INDEX idx_conversations_session ON conversations (session_id)',
        'CREATE INDEX idx_conversations_started ON conversations (started_at)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(conversations);

    // 3. Ideas
    const ideas = new Collection({
      name: 'ideas',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'conversation', type: 'relation', options: { collectionId: conversations.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 500 } },
        { name: 'content', type: 'editor' },
        { name: 'type', type: 'select', options: { values: ['feature', 'bug', 'design', 'architecture', 'optimization', 'question'], maxSelect: 1 } },
        { name: 'status', type: 'select', options: { values: ['inbox', 'considering', 'planned', 'in_progress', 'done', 'rejected'], maxSelect: 1 } },
        { name: 'priority', type: 'select', options: { values: ['low', 'medium', 'high', 'critical'], maxSelect: 1 } },
        { name: 'tags', type: 'json' },
        { name: 'related_ideas', type: 'json' },
        { name: 'attachments', type: 'file', options: { maxSelect: 10, maxSize: 10485760 } },
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(ideas);

    // 4. Activities
    const activities = new Collection({
      name: 'activities',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'conversation', type: 'relation', options: { collectionId: conversations.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'type', type: 'select', options: { values: ['conversation', 'coding', 'idea', 'search', 'review', 'plan', 'commit', 'pr', 'issue'], maxSelect: 1 } },
        { name: 'action', type: 'text', options: { max: 500 } },
        { name: 'device_name', type: 'text', options: { max: 100 } },
        { name: 'metadata', type: 'json' },
        { name: 'timestamp', type: 'date', required: true },
        { name: 'duration_sec', type: 'number', options: { min: 0 } },
      ],
      indexes: [
        'CREATE INDEX idx_activities_timestamp ON activities (timestamp)',
        'CREATE INDEX idx_activities_device ON activities (device_name)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(activities);

    // 5. Activity Aggregates
    const activityAggregates = new Collection({
      name: 'activity_aggregates',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'period', type: 'select', required: true, options: { values: ['hour', 'day', 'week', 'month'], maxSelect: 1 } },
        { name: 'period_start', type: 'date', required: true },
        { name: 'total_count', type: 'number', options: { min: 0 } },
        { name: 'total_minutes', type: 'number', options: { min: 0 } },
        { name: 'breakdown', type: 'json' },
        { name: 'top_topics', type: 'json' },
        { name: 'devices', type: 'json' },
      ],
      indexes: [
        'CREATE INDEX idx_agg_period ON activity_aggregates (period_start)',
        'CREATE UNIQUE INDEX idx_agg_unique ON activity_aggregates (user, project, period, period_start)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    });
    Dao(db).saveCollection(activityAggregates);

    // 6. Topics
    const topics = new Collection({
      name: 'topics',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'name', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'slug', type: 'text', options: { max: 200 } },
        { name: 'category', type: 'text', options: { max: 100 } },
        { name: 'mention_count', type: 'number', options: { min: 0 } },
        { name: 'first_seen', type: 'date' },
        { name: 'last_seen', type: 'date' },
        { name: 'trend_data', type: 'json' },
        { name: 'related', type: 'json' },
      ],
      indexes: [
        'CREATE INDEX idx_topics_slug ON topics (slug)',
        'CREATE INDEX idx_topics_last_seen ON topics (last_seen)',
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(topics);

    // 7. Hub Sessions
    const hubSessions = new Collection({
      name: 'hub_sessions',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'name', type: 'text', options: { max: 200 } },
        { name: 'status', type: 'select', options: { values: ['active', 'paused', 'archived'], maxSelect: 1 } },
        { name: 'model', type: 'text', options: { max: 100 } },
        { name: 'system_prompt', type: 'text', options: { max: 10000 } },
        { name: 'messages', type: 'json' },
        { name: 'message_count', type: 'number', options: { min: 0 } },
        { name: 'total_input_tokens', type: 'number', options: { min: 0 } },
        { name: 'total_output_tokens', type: 'number', options: { min: 0 } },
        { name: 'estimated_cost', type: 'number' },
        { name: 'environment', type: 'text', options: { max: 100 } },
        { name: 'devices', type: 'json' },
        { name: 'last_message_at', type: 'date' },
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(hubSessions);

    // 8. Hub Environments
    const hubEnvironments = new Collection({
      name: 'hub_environments',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'name', type: 'text', required: true, options: { min: 1, max: 100 } },
        { name: 'slug', type: 'text', options: { max: 100 } },
        { name: 'model', type: 'text', options: { max: 100 } },
        { name: 'system_prompt', type: 'text', options: { max: 10000 } },
        { name: 'max_tokens', type: 'number', options: { min: 1, max: 200000 } },
        { name: 'temperature', type: 'number' },
        { name: 'tools_enabled', type: 'json' },
        { name: 'api_key_encrypted', type: 'text', options: { max: 500 } },
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(hubEnvironments);

    // 9. Hub Cron Jobs
    const hubCronJobs = new Collection({
      name: 'hub_cron_jobs',
      type: 'base',
      schema: [
        { name: 'user', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', cascadeDelete: true, maxSelect: 1 } },
        { name: 'project', type: 'relation', options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 } },
        { name: 'name', type: 'text', options: { max: 200 } },
        { name: 'schedule', type: 'text', options: { max: 100 } },
        { name: 'prompt', type: 'text', options: { max: 10000 } },
        { name: 'environment', type: 'text', options: { max: 100 } },
        { name: 'enabled', type: 'bool' },
        { name: 'last_run', type: 'date' },
        { name: 'next_run', type: 'date' },
        { name: 'run_count', type: 'number', options: { min: 0 } },
        { name: 'last_result', type: 'text', options: { max: 10000 } },
      ],
      listRule: '@request.auth.id = user',
      viewRule: '@request.auth.id = user',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user',
    });
    Dao(db).saveCollection(hubCronJobs);

    // Extend users collection with custom fields
    const users = Dao(db).findCollectionByNameOrId('users');
    users.schema.addField(new SchemaField({ name: 'display_name', type: 'text', options: { max: 100 } }));
    users.schema.addField(new SchemaField({ name: 'timezone', type: 'text', options: { max: 50 } }));
    users.schema.addField(new SchemaField({ name: 'preferences', type: 'json' }));
    Dao(db).saveCollection(users);
  },
  (db) => {
    // Down migration
    const collectionNames = [
      'hub_cron_jobs',
      'hub_environments',
      'hub_sessions',
      'topics',
      'activity_aggregates',
      'activities',
      'ideas',
      'conversations',
      'projects',
    ];
    for (const name of collectionNames) {
      try {
        const collection = Dao(db).findCollectionByNameOrId(name);
        Dao(db).deleteCollection(collection);
      } catch (e) {
        // Collection may not exist
      }
    }
  },
);
