/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Activity Aggregation Hook
// Aggregates activity records into activity_aggregates.
// Cron: hourly aggregation. Real-time: on each new activity.

/**
 * Pad a number to two digits.
 */
function padTwo(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * Get the start of the current hour as a PocketBase-compatible datetime string.
 */
function hourStart(date) {
  var d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.getFullYear() + '-' +
    padTwo(d.getMonth() + 1) + '-' +
    padTwo(d.getDate()) + ' ' +
    padTwo(d.getHours()) + ':00:00';
}

/**
 * Get the start of the current day as a PocketBase-compatible datetime string.
 */
function dayStart(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getFullYear() + '-' +
    padTwo(d.getMonth() + 1) + '-' +
    padTwo(d.getDate()) + ' 00:00:00';
}

/**
 * Aggregate activities for a given period type and time window.
 */
function aggregateActivities(dao, periodType, periodStart, periodEnd) {
  var records = [];
  try {
    records = dao.findRecordsByFilter(
      'activities',
      'created >= {:start} && created < {:end}',
      '-created',
      0,
      0,
      { start: periodStart, end: periodEnd }
    );
  } catch (err) {
    return;
  }

  if (!records || records.length === 0) return;

  // Group activities by user
  var userGroups = {};
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var userId = rec.getString('user');
    if (!userId) continue;
    if (!userGroups[userId]) userGroups[userId] = [];
    userGroups[userId].push(rec);
  }

  var userIds = Object.keys(userGroups);
  for (var u = 0; u < userIds.length; u++) {
    var uid = userIds[u];
    var activities = userGroups[uid];

    var totalCount = activities.length;
    var totalMinutes = 0;
    var breakdown = {};
    var topicsMap = {};
    var devicesMap = {};

    for (var a = 0; a < activities.length; a++) {
      var act = activities[a];
      var durationSec = act.getFloat('duration_sec');
      var mins = durationSec ? durationSec / 60 : 0;
      if (mins > 0) totalMinutes += mins;

      var actType = act.getString('type') || 'unknown';
      breakdown[actType] = (breakdown[actType] || 0) + 1;

      var metadata = act.get('metadata');
      if (metadata && metadata.topic) {
        var topic = metadata.topic;
        topicsMap[topic] = (topicsMap[topic] || 0) + 1;
      }

      var device = act.getString('device_name');
      if (device) devicesMap[device] = (devicesMap[device] || 0) + 1;
    }

    var topicEntries = Object.keys(topicsMap).map(function (k) {
      return { name: k, count: topicsMap[k] };
    });
    topicEntries.sort(function (a, b) { return b.count - a.count; });
    var topTopics = topicEntries.slice(0, 10).map(function (t) { return t.name; });
    var devices = Object.keys(devicesMap);

    upsertAggregate(dao, uid, periodType, periodStart, {
      total_count: totalCount,
      total_minutes: Math.round(totalMinutes * 100) / 100,
      breakdown: breakdown,
      top_topics: topTopics,
      devices: devices,
    });
  }
}

/**
 * Upsert an aggregate record.
 */
function upsertAggregate(dao, userId, periodType, periodStart, data) {
  var collection;
  try {
    collection = dao.findCollectionByNameOrId('activity_aggregates');
  } catch (err) {
    return;
  }

  var existing = null;
  try {
    existing = dao.findFirstRecordByFilter(
      'activity_aggregates',
      'user = {:user} && period = {:periodType} && period_start = {:periodStart}',
      { user: userId, periodType: periodType, periodStart: periodStart }
    );
  } catch (err) { /* not found */ }

  if (existing) {
    existing.set('total_count', data.total_count);
    existing.set('total_minutes', data.total_minutes);
    existing.set('breakdown', data.breakdown);
    existing.set('top_topics', data.top_topics);
    existing.set('devices', data.devices);
    try { dao.saveRecord(existing); } catch (err) { console.log('[Aggregation] Update error: ' + err); }
  } else {
    var record = new Record(collection);
    record.set('user', userId);
    record.set('period', periodType);
    record.set('period_start', periodStart);
    record.set('total_count', data.total_count);
    record.set('total_minutes', data.total_minutes);
    record.set('breakdown', data.breakdown);
    record.set('top_topics', data.top_topics);
    record.set('devices', data.devices);
    try { dao.saveRecord(record); } catch (err) { console.log('[Aggregation] Create error: ' + err); }
  }
}

// ---------------------------------------------------------------------------
// Cron: Hourly aggregation (enabled - PB 0.22 supports cronAdd)
// ---------------------------------------------------------------------------
try {
  cronAdd('activity_aggregation', '5 * * * *', function() {
    console.log('[Aggregation] Cron triggered');
    var now = new Date();
    var dao = $app.dao();

    // Aggregate for the previous hour
    var prevHourEnd = new Date(now);
    prevHourEnd.setMinutes(0, 0, 0);
    var prevHourStart = new Date(prevHourEnd.getTime() - 3600000);
    aggregateActivities(dao, 'hour', hourStart(prevHourStart), hourStart(prevHourEnd));

    // Aggregate for the current day
    var todayStartStr = dayStart(now);
    var tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    aggregateActivities(dao, 'day', todayStartStr, dayStart(tomorrow));

    console.log('[Aggregation] Cron complete');
  });
  console.log('[Aggregation] Cron registered: 5 * * * *');
} catch (e) {
  console.log('[Aggregation] cronAdd not available: ' + e);
}

// ---------------------------------------------------------------------------
// Real-time update on each new activity record
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var now = new Date();
  var dao = $app.dao();

  try {
    var currentHourStart = hourStart(now);
    var nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0, 0, 0);
    aggregateActivities(dao, 'hour', currentHourStart, hourStart(nextHour));

    var todayStartStr = dayStart(now);
    var tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    aggregateActivities(dao, 'day', todayStartStr, dayStart(tomorrow));
  } catch (err) {
    console.log('[Aggregation] Real-time update error: ' + err);
  }
}, 'activities');

// ---------------------------------------------------------------------------
// GET /api/mytrend/heatmap?days=365
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/heatmap', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var days = parseInt(c.queryParam('days') || '365', 10);
  if (isNaN(days) || days < 1) days = 365;
  if (days > 730) days = 730;

  var dao = $app.dao();
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  var results = [];
  try {
    results = dao.findRecordsByFilter(
      'activity_aggregates',
      'user = {:uid} && period = "day" && period_start >= {:start}',
      'period_start',
      0, 0,
      { uid: userId, start: startDate.toISOString() }
    );
  } catch (e) { /* empty */ }

  var data = [];
  for (var i = 0; i < results.length; i++) {
    data.push({
      date: results[i].getString('period_start'),
      count: results[i].getInt('total_count'),
    });
  }

  return c.json(200, data);
});
