/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Default Projects Seed
// POST /api/mytrend/seed-projects
// Creates default projects for the authenticated user (skip if slug already exists).

var DEFAULT_PROJECTS = [
  {
    name: 'Neural Memory',
    slug: 'neural-memory',
    description: 'NeuralMemory MCP - knowledge graph, instincts, decisions, and cross-session memory across all projects.',
    color: '#A29BFE',
    icon: '🧠',
    tech_stack: ['NeuralMemory MCP', 'Graph DB', 'Claude Code'],
  },
  {
    name: 'MyTrend',
    slug: 'mytrend',
    description: 'Personal knowledge & activity trend platform. Records history, conversations, ideas, and trends.',
    color: '#00D26A',
    icon: '📊',
    tech_stack: ['SvelteKit 5', 'PocketBase', 'Wired Elements', 'Rough.js'],
  },
  {
    name: 'Future Bot',
    slug: 'future-bot',
    description: 'Automated trading bot and dashboard. Signals, backtesting, PnL analytics, and risk management.',
    color: '#4ECDC4',
    icon: '🤖',
    tech_stack: ['Vite', 'React 19', 'TradingView', 'Python', 'FastAPI'],
  },
  {
    name: 'Companion',
    slug: 'companion',
    description: 'Vibe Terminal bridge + Telegram Claude Bridge. WebSocket relay for browser-based Claude Code control.',
    color: '#FFE66D',
    icon: '🌉',
    tech_stack: ['Bun', 'Hono', 'TypeScript', 'WebSocket'],
  },
  {
    name: 'Feature Factory',
    slug: 'feature-factory',
    description: 'AI-powered feature pipeline. Turns feature requests into production-ready code via Claude agents.',
    color: '#6366F1',
    icon: '🏭',
    tech_stack: ['Next.js 16', 'PostgreSQL', 'TypeScript', 'Claude API'],
  },
];

routerAdd('POST', '/api/mytrend/seed-projects', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var dao = $app.dao();

  var created = [];
  var skipped = [];
  var errors = [];

  for (var i = 0; i < DEFAULT_PROJECTS.length; i++) {
    var p = DEFAULT_PROJECTS[i];

    // Skip if slug already exists for this user
    try {
      dao.findFirstRecordByFilter('projects', 'user = {:uid} && slug = {:slug}', { uid: userId, slug: p.slug });
      skipped.push(p.slug);
      continue;
    } catch (e) { /* not found, create */ }

    try {
      var col = dao.findCollectionByNameOrId('projects');
      var rec = new Record(col);
      rec.set('user', userId);
      rec.set('name', p.name);
      rec.set('slug', p.slug);
      rec.set('description', p.description);
      rec.set('color', p.color);
      rec.set('icon', p.icon);
      rec.set('tech_stack', p.tech_stack);
      rec.set('status', 'active');
      rec.set('total_conversations', 0);
      rec.set('total_ideas', 0);
      rec.set('total_minutes', 0);
      dao.saveRecord(rec);
      created.push(p.slug);
      console.log('[SeedProjects] Created: ' + p.slug);
    } catch (err) {
      errors.push({ slug: p.slug, error: String(err) });
      console.log('[SeedProjects] Error creating ' + p.slug + ': ' + err);
    }
  }

  return c.json(200, {
    created: created,
    skipped: skipped,
    errors: errors,
    message: created.length + ' project(s) created, ' + skipped.length + ' already existed.',
  });
});

console.log('[SeedProjects] Registered: POST /api/mytrend/seed-projects');
