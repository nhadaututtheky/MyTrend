/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Insights API
// Smart analytics endpoints for personal trend insights.
// NOTE: PocketBase Goja isolates each routerAdd callback scope.
// All helper functions MUST be defined inside each callback.

// ---------------------------------------------------------------------------
// GET /api/mytrend/insights/weekly
// Returns: top topics, activity summary, peak hours, focus breakdown,
//          streak, new ideas count, conversation stats
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/insights/weekly', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function toISODate(d) {
    return d.getFullYear() + '-' + padTwo(d.getMonth() + 1) + '-' + padTwo(d.getDate());
  }
  function toPBDateTime(d) {
    return toISODate(d) + ' 00:00:00';
  }
  function b2s(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw) return '';
    if (Array.isArray(raw)) {
      var s = '';
      for (var i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
      return s;
    }
    return String(raw);
  }
  function safeJSON(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return JSON.parse(b2s(raw)); } catch (e) { return null; }
  }
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var dao = $app.dao();

    var now = new Date();
    var weekStart = daysAgo(7);
    var prevWeekStart = daysAgo(14);
    var weekStartStr = toPBDateTime(weekStart);
    var prevWeekStartStr = toPBDateTime(prevWeekStart);
    var nowStr = toPBDateTime(now);

    // --- This week's activities ---
    var thisWeekActivities = [];
    try {
      thisWeekActivities = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '-created', 0, 0,
        { uid: userId, start: weekStartStr, end: nowStr }
      );
    } catch (e) { /* empty */ }

    // --- Last week's activities ---
    var lastWeekActivities = [];
    try {
      lastWeekActivities = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '-created', 0, 0,
        { uid: userId, start: prevWeekStartStr, end: weekStartStr }
      );
    } catch (e) { /* empty */ }

    // Activity summary
    var totalCount = thisWeekActivities.length;
    var totalMinutes = 0;
    var hourCounts = {};
    var projectMinutes = {};
    var typeCounts = {};
    var topicsMap = {};

    for (var i = 0; i < thisWeekActivities.length; i++) {
      var act = thisWeekActivities[i];
      var durSec = act.getFloat('duration_sec') || 0;
      var mins = durSec / 60;
      totalMinutes += mins;

      // Hour distribution
      var created = new Date(act.getString('created'));
      var hour = created.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;

      // Type breakdown
      var actType = act.getString('type') || 'unknown';
      typeCounts[actType] = (typeCounts[actType] || 0) + 1;

      // Project focus
      var projId = act.getString('project');
      if (projId) {
        if (!projectMinutes[projId]) projectMinutes[projId] = { minutes: 0, count: 0 };
        projectMinutes[projId].minutes += mins;
        projectMinutes[projId].count += 1;
      }

      // Topics
      var metadata = safeJSON(act.get('metadata'));
      if (metadata && metadata.topic) {
        topicsMap[metadata.topic] = (topicsMap[metadata.topic] || 0) + 1;
      }
      if (metadata && metadata.topics && Array.isArray(metadata.topics)) {
        for (var t = 0; t < metadata.topics.length; t++) {
          topicsMap[metadata.topics[t]] = (topicsMap[metadata.topics[t]] || 0) + 1;
        }
      }
    }

    // Last week totals for comparison
    var lastWeekTotal = lastWeekActivities.length;
    var lastWeekMinutes = 0;
    for (var lw = 0; lw < lastWeekActivities.length; lw++) {
      lastWeekMinutes += (lastWeekActivities[lw].getFloat('duration_sec') || 0) / 60;
    }

    var totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    var avgPerDay = Math.round(totalCount / 7 * 10) / 10;
    var vsLastWeekPct = lastWeekTotal > 0
      ? Math.round(((totalCount - lastWeekTotal) / lastWeekTotal) * 100)
      : (totalCount > 0 ? 100 : 0);

    // Peak hours - top 3
    var peakHours = [];
    var hourKeys = Object.keys(hourCounts);
    hourKeys.sort(function(a, b) { return hourCounts[b] - hourCounts[a]; });
    for (var h = 0; h < Math.min(3, hourKeys.length); h++) {
      peakHours.push({ hour: parseInt(hourKeys[h], 10), count: hourCounts[hourKeys[h]] });
    }

    // Focus breakdown - resolve project names
    var focusBreakdown = [];
    var projIds = Object.keys(projectMinutes);
    for (var p = 0; p < projIds.length; p++) {
      var pid = projIds[p];
      var projName = pid;
      try {
        var proj = dao.findRecordById('projects', pid);
        projName = proj.getString('name');
      } catch (e) { /* use id */ }
      focusBreakdown.push({
        project_id: pid,
        project_name: projName,
        minutes: Math.round(projectMinutes[pid].minutes * 10) / 10,
        count: projectMinutes[pid].count,
        pct: totalMinutes > 0 ? Math.round((projectMinutes[pid].minutes / totalMinutes) * 100) : 0,
      });
    }
    focusBreakdown.sort(function(a, b) { return b.minutes - a.minutes; });

    // Top topics (top 5)
    var topicEntries = [];
    var topicKeys = Object.keys(topicsMap);
    for (var tk = 0; tk < topicKeys.length; tk++) {
      topicEntries.push({ name: topicKeys[tk], count: topicsMap[topicKeys[tk]] });
    }
    topicEntries.sort(function(a, b) { return b.count - a.count; });
    var topTopics = topicEntries.slice(0, 5);

    // Streak from day aggregates
    var streakCurrent = 0;
    var streakLongest = 0;
    try {
      var dayAggs = dao.findRecordsByFilter(
        'activity_aggregates',
        'user = {:uid} && period = "day"',
        '-period_start', 90, 0,
        { uid: userId }
      );
      // dayAggs sorted desc by period_start
      var tempStreak = 0;
      for (var si = 0; si < dayAggs.length; si++) {
        if (dayAggs[si].getInt('total_count') > 0) {
          tempStreak++;
        } else {
          if (si === 0) { /* today has 0, streak = 0 */ }
          break;
        }
      }
      streakCurrent = tempStreak;

      // Longest streak
      var runStreak = 0;
      for (var sj = dayAggs.length - 1; sj >= 0; sj--) {
        if (dayAggs[sj].getInt('total_count') > 0) {
          runStreak++;
          if (runStreak > streakLongest) streakLongest = runStreak;
        } else {
          runStreak = 0;
        }
      }
    } catch (e) { /* no aggs */ }

    // New ideas count this week
    var newIdeasCount = 0;
    try {
      var ideas = dao.findRecordsByFilter(
        'ideas',
        'user = {:uid} && created >= {:start}',
        '', 0, 0,
        { uid: userId, start: weekStartStr }
      );
      newIdeasCount = ideas.length;
    } catch (e) { /* empty */ }

    // Conversation stats this week
    var convTotal = 0;
    var convMsgs = 0;
    var convTokens = 0;
    try {
      var convs = dao.findRecordsByFilter(
        'conversations',
        'user = {:uid} && created >= {:start}',
        '', 0, 0,
        { uid: userId, start: weekStartStr }
      );
      convTotal = convs.length;
      for (var ci = 0; ci < convs.length; ci++) {
        convMsgs += convs[ci].getInt('message_count') || 0;
        convTokens += convs[ci].getInt('total_tokens') || 0;
      }
    } catch (e) { /* empty */ }

    return c.json(200, {
      period: { start: toISODate(weekStart), end: toISODate(now) },
      activity_summary: {
        total: totalCount,
        hours: totalHours,
        avg_per_day: avgPerDay,
        vs_last_week_pct: vsLastWeekPct,
        breakdown: typeCounts,
      },
      top_topics: topTopics,
      peak_hours: peakHours,
      focus_breakdown: focusBreakdown.slice(0, 6),
      streak: { current: streakCurrent, longest: streakLongest },
      new_ideas_count: newIdeasCount,
      conversation_stats: {
        total: convTotal,
        avg_messages: convTotal > 0 ? Math.round(convMsgs / convTotal) : 0,
        avg_tokens: convTotal > 0 ? Math.round(convTokens / convTotal) : 0,
      },
    });
  } catch (e) {
    console.log('[InsightsAPI] weekly error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/insights/patterns
// Returns: productive hours, productive days, topic velocity, session patterns
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/insights/patterns', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function toPBDateTime(d) {
    return d.getFullYear() + '-' + padTwo(d.getMonth() + 1) + '-' + padTwo(d.getDate()) + ' 00:00:00';
  }
  function b2s(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw) return '';
    if (Array.isArray(raw)) {
      var s = '';
      for (var i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
      return s;
    }
    return String(raw);
  }
  function safeJSON(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return JSON.parse(b2s(raw)); } catch (e) { return null; }
  }
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var dao = $app.dao();

    var startDate = daysAgo(30);
    var startStr = toPBDateTime(startDate);

    // Get last 30 days of activities
    var activities = [];
    try {
      activities = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start}',
        '-created', 0, 0,
        { uid: userId, start: startStr }
      );
    } catch (e) { /* empty */ }

    // Analyze hour-of-day patterns
    var hourCounts = {};
    var dayOfWeekCounts = {};
    var sessionDurations = [];
    var topicsThisMonth = {};
    var topicsPrevMonth = {};

    for (var i = 0; i < activities.length; i++) {
      var act = activities[i];
      var created = new Date(act.getString('created'));
      var hour = created.getHours();
      var dow = created.getDay();
      var durSec = act.getFloat('duration_sec') || 0;

      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayOfWeekCounts[dow] = (dayOfWeekCounts[dow] || 0) + 1;

      if (durSec > 0) sessionDurations.push(durSec / 60);

      // Topic tracking for velocity
      var metadata = safeJSON(act.get('metadata'));
      if (metadata && metadata.topic) {
        topicsThisMonth[metadata.topic] = (topicsThisMonth[metadata.topic] || 0) + 1;
      }
    }

    // Previous month topics for velocity comparison
    var prevStart = daysAgo(60);
    var prevStartStr = toPBDateTime(prevStart);
    try {
      var prevActivities = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '', 0, 0,
        { uid: userId, start: prevStartStr, end: startStr }
      );
      for (var pi = 0; pi < prevActivities.length; pi++) {
        var pm = safeJSON(prevActivities[pi].get('metadata'));
        if (pm && pm.topic) {
          topicsPrevMonth[pm.topic] = (topicsPrevMonth[pm.topic] || 0) + 1;
        }
      }
    } catch (e) { /* empty */ }

    // Productive hours - top 3
    var productiveHours = [];
    var hKeys = Object.keys(hourCounts);
    hKeys.sort(function(a, b) { return hourCounts[b] - hourCounts[a]; });
    for (var hi = 0; hi < Math.min(3, hKeys.length); hi++) {
      productiveHours.push({ hour: parseInt(hKeys[hi], 10), count: hourCounts[hKeys[hi]] });
    }

    // Productive days - top 3
    var productiveDays = [];
    var dKeys = Object.keys(dayOfWeekCounts);
    dKeys.sort(function(a, b) { return dayOfWeekCounts[b] - dayOfWeekCounts[a]; });
    for (var di = 0; di < Math.min(3, dKeys.length); di++) {
      var dayNum = parseInt(dKeys[di], 10);
      productiveDays.push({
        day: dayNum,
        name: DAY_NAMES[dayNum] || 'Unknown',
        count: dayOfWeekCounts[dKeys[di]],
      });
    }

    // Topic velocity (>50% growth)
    var topicVelocity = [];
    var thisKeys = Object.keys(topicsThisMonth);
    for (var tv = 0; tv < thisKeys.length; tv++) {
      var tName = thisKeys[tv];
      var thisCount = topicsThisMonth[tName];
      var prevCount = topicsPrevMonth[tName] || 0;
      var growth = prevCount > 0
        ? Math.round(((thisCount - prevCount) / prevCount) * 100)
        : (thisCount > 2 ? 100 : 0);

      if (growth >= 50) {
        topicVelocity.push({
          topic: tName,
          this_month: thisCount,
          last_month: prevCount,
          growth_pct: growth,
        });
      }
    }
    topicVelocity.sort(function(a, b) { return b.growth_pct - a.growth_pct; });

    // Session patterns
    var avgSessionLen = 0;
    if (sessionDurations.length > 0) {
      var totalDur = 0;
      for (var sd = 0; sd < sessionDurations.length; sd++) totalDur += sessionDurations[sd];
      avgSessionLen = Math.round(totalDur / sessionDurations.length * 10) / 10;
    }
    var sessionsPerDay = Math.round(activities.length / 30 * 10) / 10;

    return c.json(200, {
      productive_hours: productiveHours,
      productive_days: productiveDays,
      topic_velocity: topicVelocity.slice(0, 10),
      session_patterns: {
        avg_session_minutes: avgSessionLen,
        sessions_per_day: sessionsPerDay,
        total_sessions: activities.length,
      },
    });
  } catch (e) {
    console.log('[InsightsAPI] patterns error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/insights/compare?period=week
// Returns: this vs last period comparison for activities/hours/conversations/ideas
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/insights/compare', (c) => {
  // --- Inline helpers (Goja scope isolation) ---
  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }
  function daysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function toPBDateTime(d) {
    return d.getFullYear() + '-' + padTwo(d.getMonth() + 1) + '-' + padTwo(d.getDate()) + ' 00:00:00';
  }
  // --- End helpers ---

  try {
    var authRecord = c.get('authRecord');
    if (!authRecord) return c.json(401, { error: 'Auth required' });

    var userId = authRecord.getId();
    var dao = $app.dao();

    var period = c.queryParam('period') || 'week';
    var daysInPeriod = 7;
    if (period === 'month') daysInPeriod = 30;
    else if (period === 'quarter') daysInPeriod = 90;

    var now = new Date();
    var thisPeriodStart = daysAgo(daysInPeriod);
    var lastPeriodStart = daysAgo(daysInPeriod * 2);
    var nowStr = toPBDateTime(now);
    var thisStartStr = toPBDateTime(thisPeriodStart);
    var lastStartStr = toPBDateTime(lastPeriodStart);

    // This period counts
    var thisActivities = 0;
    var thisMinutes = 0;
    try {
      var ta = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '', 0, 0,
        { uid: userId, start: thisStartStr, end: nowStr }
      );
      thisActivities = ta.length;
      for (var i = 0; i < ta.length; i++) {
        thisMinutes += (ta[i].getFloat('duration_sec') || 0) / 60;
      }
    } catch (e) { /* empty */ }

    var thisConversations = 0;
    try {
      var tc = dao.findRecordsByFilter(
        'conversations',
        'user = {:uid} && created >= {:start}',
        '', 0, 0,
        { uid: userId, start: thisStartStr }
      );
      thisConversations = tc.length;
    } catch (e) { /* empty */ }

    var thisIdeas = 0;
    try {
      var ti = dao.findRecordsByFilter(
        'ideas',
        'user = {:uid} && created >= {:start}',
        '', 0, 0,
        { uid: userId, start: thisStartStr }
      );
      thisIdeas = ti.length;
    } catch (e) { /* empty */ }

    // Last period counts
    var lastActivities = 0;
    var lastMinutes = 0;
    try {
      var la = dao.findRecordsByFilter(
        'activities',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '', 0, 0,
        { uid: userId, start: lastStartStr, end: thisStartStr }
      );
      lastActivities = la.length;
      for (var li = 0; li < la.length; li++) {
        lastMinutes += (la[li].getFloat('duration_sec') || 0) / 60;
      }
    } catch (e) { /* empty */ }

    var lastConversations = 0;
    try {
      var lc = dao.findRecordsByFilter(
        'conversations',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '', 0, 0,
        { uid: userId, start: lastStartStr, end: thisStartStr }
      );
      lastConversations = lc.length;
    } catch (e) { /* empty */ }

    var lastIdeas = 0;
    try {
      var liRec = dao.findRecordsByFilter(
        'ideas',
        'user = {:uid} && created >= {:start} && created < {:end}',
        '', 0, 0,
        { uid: userId, start: lastStartStr, end: thisStartStr }
      );
      lastIdeas = liRec.length;
    } catch (e) { /* empty */ }

    function changePct(current, previous) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    return c.json(200, {
      period: period,
      days: daysInPeriod,
      activities: {
        this_period: thisActivities,
        last_period: lastActivities,
        change_pct: changePct(thisActivities, lastActivities),
      },
      hours: {
        this_period: Math.round(thisMinutes / 60 * 10) / 10,
        last_period: Math.round(lastMinutes / 60 * 10) / 10,
        change_pct: changePct(Math.round(thisMinutes), Math.round(lastMinutes)),
      },
      conversations: {
        this_period: thisConversations,
        last_period: lastConversations,
        change_pct: changePct(thisConversations, lastConversations),
      },
      ideas: {
        this_period: thisIdeas,
        last_period: lastIdeas,
        change_pct: changePct(thisIdeas, lastIdeas),
      },
    });
  } catch (e) {
    console.log('[InsightsAPI] compare error: ' + e);
    return c.json(500, { error: String(e) });
  }
});

console.log('[InsightsAPI] Registered: /api/mytrend/insights/weekly, /patterns, /compare');
