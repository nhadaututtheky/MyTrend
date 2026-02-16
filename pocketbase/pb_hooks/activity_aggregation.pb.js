/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Activity Aggregation Hook
// Aggregates activity records into activity_aggregates on cron schedule (hourly)
// and updates real-time counts on each new activity creation.

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
 * Aggregate activities for a given period type ('hour' or 'day') and time window.
 *
 * Groups by user, calculates total_count, total_minutes, breakdown by type,
 * top_topics, and devices used.
 */
function aggregateActivities(dao, periodType, periodStart, periodEnd) {
  var records = [];
  try {
    records = dao.findRecordsByFilter(
      'activities',
      'created >= {:start} && created < {:end}',
      '-created',
      0, // no limit
      0, // no offset
      { start: periodStart, end: periodEnd }
    );
  } catch (err) {
    console.log('[Aggregation] No activity records for period:', periodType, periodStart);
    return;
  }

  if (!records || records.length === 0) {
    return;
  }

  // Group activities by user
  var userGroups = {};
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var userId = rec.getString('user');
    if (!userId) continue;

    if (!userGroups[userId]) {
      userGroups[userId] = [];
    }
    userGroups[userId].push(rec);
  }

  // Process each user group
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

      // Sum duration_sec (convert to minutes)
      var durationSec = act.getFloat('duration_sec');
      var mins = durationSec ? durationSec / 60 : 0;
      if (mins && mins > 0) {
        totalMinutes += mins;
      }

      // Breakdown by type
      var actType = act.getString('type') || 'unknown';
      if (!breakdown[actType]) {
        breakdown[actType] = { count: 0, minutes: 0 };
      }
      breakdown[actType].count += 1;
      breakdown[actType].minutes += (mins || 0);

      // Collect topics from metadata JSON
      var metadata = act.get('metadata');
      if (metadata && metadata.topic) {
        var topic = metadata.topic;
        topicsMap[topic] = (topicsMap[topic] || 0) + 1;
      }

      // Collect devices
      var device = act.getString('device_name');
      if (device) {
        devicesMap[device] = (devicesMap[device] || 0) + 1;
      }
    }

    // Sort topics by frequency, take top 10
    var topicEntries = Object.keys(topicsMap).map(function(k) {
      return { name: k, count: topicsMap[k] };
    });
    topicEntries.sort(function(a, b) { return b.count - a.count; });
    var topTopics = topicEntries.slice(0, 10).map(function(t) { return t.name; });

    // Collect unique devices
    var devices = Object.keys(devicesMap);

    // Upsert into activity_aggregates
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
 * Upsert an aggregate record: update existing or create new.
 */
function upsertAggregate(dao, userId, periodType, periodStart, data) {
  var collection;
  try {
    collection = dao.findCollectionByNameOrId('activity_aggregates');
  } catch (err) {
    console.log('[Aggregation] activity_aggregates collection not found, skipping.');
    return;
  }

  // Try to find existing aggregate for this user + period
  var existing = null;
  try {
    existing = dao.findFirstRecordByFilter(
      'activity_aggregates',
      'user = {:user} && period = {:periodType} && period_start = {:periodStart}',
      { user: userId, periodType: periodType, periodStart: periodStart }
    );
  } catch (err) {
    // Not found -- will create below
  }

  if (existing) {
    existing.set('total_count', data.total_count);
    existing.set('total_minutes', data.total_minutes);
    existing.set('breakdown', data.breakdown);
    existing.set('top_topics', data.top_topics);
    existing.set('devices', data.devices);
    existing.set('updated', new Date().toISOString());
    try {
      dao.saveRecord(existing);
      console.log('[Aggregation] Updated aggregate:', periodType, periodStart, 'user:', userId);
    } catch (err) {
      console.log('[Aggregation] Failed to update aggregate:', err);
    }
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
    try {
      dao.saveRecord(record);
      console.log('[Aggregation] Created aggregate:', periodType, periodStart, 'user:', userId);
    } catch (err) {
      console.log('[Aggregation] Failed to create aggregate:', err);
    }
  }
}

/**
 * Run the full aggregation cycle for the previous hour and current day.
 */
function runAggregationCycle() {
  console.log('[Aggregation] Starting hourly aggregation cycle...');

  var now = new Date();
  var dao = $app.dao();

  // Aggregate for the previous hour
  var prevHourEnd = new Date(now);
  prevHourEnd.setMinutes(0, 0, 0);
  var prevHourStart = new Date(prevHourEnd.getTime() - 3600000);

  aggregateActivities(dao, 'hour', hourStart(prevHourStart), hourStart(prevHourEnd));

  // Aggregate for the current day (recalculate full day so far)
  var todayStartStr = dayStart(now);
  var tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  var tomorrowStartStr = dayStart(tomorrow);

  aggregateActivities(dao, 'day', todayStartStr, tomorrowStartStr);

  console.log('[Aggregation] Aggregation cycle complete.');
}

// ---------------------------------------------------------------------------
// Register cron job on bootstrap
// ---------------------------------------------------------------------------
onAfterBootstrap((e) => {
  console.log('[Aggregation] Registering hourly aggregation cron...');

  // Run aggregation every hour at minute 5 (e.g. 01:05, 02:05, ...)
  cronAdd('activity_aggregation', '5 * * * *', () => {
    try {
      runAggregationCycle();
    } catch (err) {
      console.log('[Aggregation] Cron error:', err);
    }
  });

  console.log('[Aggregation] Hourly cron registered: activity_aggregation');
});

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
    // Update hourly aggregate for the current hour
    var currentHourStart = hourStart(now);
    var nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0, 0, 0);
    var currentHourEnd = hourStart(nextHour);

    aggregateActivities(dao, 'hour', currentHourStart, currentHourEnd);

    // Update daily aggregate for today
    var todayStartStr = dayStart(now);
    var tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    var tomorrowStartStr = dayStart(tomorrow);

    aggregateActivities(dao, 'day', todayStartStr, tomorrowStartStr);
  } catch (err) {
    console.log('[Aggregation] Real-time update error:', err);
  }
}, 'activities');
