/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Activity Auto-Tracking
// Creates activity records when conversations, ideas, projects are created.
// These activity records feed into activity_aggregation for trends/heatmap.
// Enriched metadata: hour_of_day, day_of_week, source, duration_sec for insights.

// ---------------------------------------------------------------------------
// Track conversation creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var now = new Date();
  var dao = $app.dao();
  try {
    var col = dao.findCollectionByNameOrId('activities');
    var activity = new Record(col);
    activity.set('user', userId);
    var proj = record.getString('project');
    if (proj) activity.set('project', proj);
    activity.set('type', 'conversation');
    var title = record.getString('title') || '';
    activity.set('action', 'Created conversation: ' + title.substring(0, 200));
    activity.set('device_name', record.getString('device_name') || '');
    activity.set('metadata', JSON.stringify({
      source: record.getString('source') || '',
      message_count: record.getInt('message_count') || 0,
      tokens: record.getInt('total_tokens') || 0,
      session_id: record.getString('session_id') || '',
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      conversation_id: record.getId(),
    }));
    activity.set('timestamp', record.getString('started_at') || now.toISOString());
    activity.set('duration_sec', (record.getInt('duration_min') || 0) * 60);
    dao.saveRecord(activity);
    console.log('[ActivityTracking] Tracked conversation: ' + record.getId());
  } catch (err) {
    console.log('[ActivityTracking] Error tracking conversation: ' + err);
  }
}, 'conversations');

// ---------------------------------------------------------------------------
// Track idea creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var now = new Date();
  var dao = $app.dao();
  try {
    var col = dao.findCollectionByNameOrId('activities');
    var activity = new Record(col);
    activity.set('user', userId);
    var proj = record.getString('project');
    if (proj) activity.set('project', proj);
    activity.set('type', 'idea');
    var title = record.getString('title') || '';
    activity.set('action', 'Created idea: ' + title.substring(0, 200));
    activity.set('device_name', '');
    activity.set('metadata', JSON.stringify({
      idea_type: record.getString('type') || '',
      priority: record.getString('priority') || '',
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      idea_id: record.getId(),
    }));
    activity.set('timestamp', now.toISOString());
    activity.set('duration_sec', 0);
    dao.saveRecord(activity);
    console.log('[ActivityTracking] Tracked idea: ' + record.getId());
  } catch (err) {
    console.log('[ActivityTracking] Error tracking idea: ' + err);
  }
}, 'ideas');

// ---------------------------------------------------------------------------
// Track project creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var now = new Date();
  var dao = $app.dao();
  try {
    var col = dao.findCollectionByNameOrId('activities');
    var activity = new Record(col);
    activity.set('user', userId);
    activity.set('project', record.getId());
    activity.set('type', 'coding');
    var name = record.getString('name') || '';
    activity.set('action', 'Created project: ' + name.substring(0, 200));
    activity.set('device_name', '');
    activity.set('metadata', JSON.stringify({
      status: record.getString('status') || 'active',
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
    }));
    activity.set('timestamp', now.toISOString());
    activity.set('duration_sec', 0);
    dao.saveRecord(activity);
    console.log('[ActivityTracking] Tracked project: ' + record.getId());
  } catch (err) {
    console.log('[ActivityTracking] Error tracking project: ' + err);
  }
}, 'projects');

// ---------------------------------------------------------------------------
// Track plan creation
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  try {
    var col = dao.findCollectionByNameOrId('activities');
    var activity = new Record(col);
    activity.set('user', userId);
    var proj = record.getString('project');
    if (proj) activity.set('project', proj);
    activity.set('type', 'plan');
    var title = record.getString('title') || '';
    activity.set('action', 'Created plan: ' + title.substring(0, 200));
    activity.set('device_name', '');
    activity.set('metadata', JSON.stringify({
      plan_type: record.getString('plan_type') || '',
      status: record.getString('status') || '',
      extraction_source: record.getString('extraction_source') || '',
    }));
    activity.set('timestamp', new Date().toISOString());
    activity.set('duration_sec', 0);
    dao.saveRecord(activity);
    console.log('[ActivityTracking] Tracked plan: ' + record.getId());
  } catch (err) {
    console.log('[ActivityTracking] Error tracking plan: ' + err);
  }
}, 'plans');
