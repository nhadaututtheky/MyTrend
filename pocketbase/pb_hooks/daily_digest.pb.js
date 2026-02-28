/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Daily/Weekly Digest via Telegram
// Cron: runs at minute 0 every hour, sends daily digest at user's configured time.
// Weekly digest: every Monday at the same time.

// ---------------------------------------------------------------------------
// Cron: Check and send digests hourly
// ---------------------------------------------------------------------------
cronAdd('daily_digest', '0 * * * *', function () {
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
  function toDateStr(d) {
    return d.getFullYear() + '-' + padTwo(d.getMonth() + 1) + '-' + padTwo(d.getDate());
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
  function fmtMins(mins) {
    if (mins < 60) return Math.round(mins) + 'min';
    var h = Math.floor(mins / 60);
    var m = Math.round(mins % 60);
    return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
  }
  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // --- End helpers ---

  var dao = $app.dao();
  var now = new Date();
  var currentHour = now.getHours();

  // Resolve bot token (env → DB fallback)
  var botToken = $os.getenv('TELEGRAM_BOT_TOKEN') || '';
  var digestChatId = $os.getenv('TELEGRAM_DIGEST_CHAT_ID') || $os.getenv('TELEGRAM_STORAGE_CHANNEL_ID') || '';

  // Get user ID
  var userId = $os.getenv('MYTREND_SYNC_USER_ID') || '';
  if (!userId) {
    try {
      var users = dao.findRecordsByFilter('users', '1=1', '', 1, 0);
      if (users && users.length > 0) userId = users[0].getId();
    } catch (e) {}
  }
  if (!userId) return;

  // Resolve settings for bot token and chat ID
  if (!botToken || !digestChatId) {
    try {
      var settings = dao.findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: userId });
      if (!botToken) botToken = settings.getString('telegram_bot_token') || '';
      if (!digestChatId) digestChatId = settings.getString('telegram_chat_id') || settings.getString('telegram_channel_id') || '';
    } catch (e) {}
  }
  if (!botToken || !digestChatId) {
    console.log('[DailyDigest] No bot token or chat ID, skipping');
    return;
  }

  // Digest hour config (default 9 AM)
  var digestHour = 9;
  try {
    var digestHourEnv = $os.getenv('DIGEST_HOUR');
    if (digestHourEnv) digestHour = parseInt(digestHourEnv, 10);
  } catch (e) {}

  // Only send at the configured hour
  if (currentHour !== digestHour) return;

  console.log('[DailyDigest] Running digest at hour ' + currentHour);

  var isMonday = now.getDay() === 1;
  var yesterday = daysAgo(1);
  var yesterdayStr = toPBDateTime(yesterday);
  var nowStr = toPBDateTime(now);

  // --- Gather daily data ---

  // Activities last 24h
  var activities = [];
  try {
    activities = dao.findRecordsByFilter(
      'activities',
      'user = {:uid} && created >= {:start}',
      '-created', 0, 0,
      { uid: userId, start: yesterdayStr }
    );
  } catch (e) {}

  var totalMinutes = 0;
  var typeCounts = {};
  var projectMinutes = {};
  var topicsMap = {};

  for (var i = 0; i < activities.length; i++) {
    var act = activities[i];
    var durSec = act.getFloat('duration_sec') || 0;
    var mins = durSec / 60;
    totalMinutes += mins;

    var actType = act.getString('type') || 'unknown';
    typeCounts[actType] = (typeCounts[actType] || 0) + 1;

    var projId = act.getString('project');
    if (projId) {
      if (!projectMinutes[projId]) projectMinutes[projId] = { minutes: 0, count: 0, name: projId };
      projectMinutes[projId].minutes += mins;
      projectMinutes[projId].count += 1;
    }

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

  // Resolve project names
  var projIds = Object.keys(projectMinutes);
  for (var pi = 0; pi < projIds.length; pi++) {
    try {
      var proj = dao.findRecordById('projects', projIds[pi]);
      projectMinutes[projIds[pi]].name = proj.getString('name');
    } catch (e) {}
  }

  // Ideas: unreviewed (inbox) count + new today
  var inboxCount = 0;
  var newIdeasToday = 0;
  try {
    var inbox = dao.findRecordsByFilter('ideas', 'user = {:uid} && status = "inbox"', '', 0, 0, { uid: userId });
    inboxCount = inbox.length;
  } catch (e) {}
  try {
    var todayIdeas = dao.findRecordsByFilter('ideas', 'user = {:uid} && created >= {:start}', '', 0, 0, { uid: userId, start: yesterdayStr });
    newIdeasToday = todayIdeas.length;
  } catch (e) {}

  // Stuck plans (in_progress > 3 days)
  var stuckPlans = [];
  var threeDaysAgo = toPBDateTime(daysAgo(3));
  try {
    var stuck = dao.findRecordsByFilter(
      'ideas',
      'user = {:uid} && status = "in_progress" && updated < {:cutoff}',
      '-updated', 5, 0,
      { uid: userId, cutoff: threeDaysAgo }
    );
    for (var sp = 0; sp < stuck.length; sp++) {
      stuckPlans.push(stuck[sp].getString('title'));
    }
  } catch (e) {}

  // Conversations last 24h
  var convCount = 0;
  var convTokens = 0;
  try {
    var convs = dao.findRecordsByFilter('conversations', 'user = {:uid} && created >= {:start}', '', 0, 0, { uid: userId, start: yesterdayStr });
    convCount = convs.length;
    for (var ci = 0; ci < convs.length; ci++) {
      convTokens += convs[ci].getInt('total_tokens') || 0;
    }
  } catch (e) {}

  // Streak
  var streakCurrent = 0;
  try {
    var dayAggs = dao.findRecordsByFilter(
      'activity_aggregates',
      'user = {:uid} && period = "day"',
      '-period_start', 30, 0,
      { uid: userId }
    );
    for (var si = 0; si < dayAggs.length; si++) {
      if (dayAggs[si].getInt('total_count') > 0) {
        streakCurrent++;
      } else {
        break;
      }
    }
  } catch (e) {}

  // Top topics (top 3)
  var topTopics = [];
  var topicKeys = Object.keys(topicsMap);
  topicKeys.sort(function (a, b) { return topicsMap[b] - topicsMap[a]; });
  for (var tk = 0; tk < Math.min(3, topicKeys.length); tk++) {
    topTopics.push(topicKeys[tk]);
  }

  // --- Build daily digest message ---
  var lines = [];
  lines.push('<b>📊 Daily Digest — ' + toDateStr(now) + '</b>');
  lines.push('');

  // Stats
  lines.push('<b>🔥 Yesterday\'s Stats</b>');
  lines.push('  • ' + activities.length + ' activities, ' + fmtMins(totalMinutes) + ' productive');
  lines.push('  • ' + convCount + ' conversations' + (convTokens > 0 ? ' (' + Math.round(convTokens / 1000) + 'K tokens)' : ''));
  if (newIdeasToday > 0) lines.push('  • ' + newIdeasToday + ' new ideas');
  if (streakCurrent > 0) lines.push('  • 🔥 ' + streakCurrent + '-day streak!');
  lines.push('');

  // Focus breakdown
  if (projIds.length > 0) {
    lines.push('<b>🗂️ Focus</b>');
    // Sort by minutes desc
    var sortedProjs = projIds.slice().sort(function (a, b) { return projectMinutes[b].minutes - projectMinutes[a].minutes; });
    for (var fp = 0; fp < Math.min(4, sortedProjs.length); fp++) {
      var pm = projectMinutes[sortedProjs[fp]];
      var pct = totalMinutes > 0 ? Math.round((pm.minutes / totalMinutes) * 100) : 0;
      lines.push('  • ' + escHtml(pm.name) + ': ' + fmtMins(pm.minutes) + ' (' + pct + '%)');
    }
    lines.push('');
  }

  // Inbox / stuck
  if (inboxCount > 0 || stuckPlans.length > 0) {
    lines.push('<b>⚠️ Needs Attention</b>');
    if (inboxCount > 0) lines.push('  • 📥 ' + inboxCount + ' unreviewed ideas in inbox');
    for (var sk = 0; sk < stuckPlans.length; sk++) {
      lines.push('  • 🚧 Stuck: <i>' + escHtml(stuckPlans[sk].substring(0, 50)) + '</i>');
    }
    lines.push('');
  }

  // Trending topics
  if (topTopics.length > 0) {
    lines.push('<b>✨ Trending</b>');
    lines.push('  ' + topTopics.map(function (t) { return '#' + escHtml(t); }).join('  '));
    lines.push('');
  }

  var dailyText = lines.join('\n');

  // --- Weekly digest (Monday only) ---
  var weeklyText = '';
  if (isMonday) {
    var weekStart = daysAgo(7);
    var weekStartStr = toPBDateTime(weekStart);

    var weekActivities = [];
    try {
      weekActivities = dao.findRecordsByFilter('activities', 'user = {:uid} && created >= {:start}', '', 0, 0, { uid: userId, start: weekStartStr });
    } catch (e) {}

    var weekMinutes = 0;
    for (var wa = 0; wa < weekActivities.length; wa++) {
      weekMinutes += (weekActivities[wa].getFloat('duration_sec') || 0) / 60;
    }

    var weekIdeas = 0;
    try {
      var wIdeas = dao.findRecordsByFilter('ideas', 'user = {:uid} && created >= {:start}', '', 0, 0, { uid: userId, start: weekStartStr });
      weekIdeas = wIdeas.length;
    } catch (e) {}

    var weekConvs = 0;
    var weekTokens = 0;
    try {
      var wConvs = dao.findRecordsByFilter('conversations', 'user = {:uid} && created >= {:start}', '', 0, 0, { uid: userId, start: weekStartStr });
      weekConvs = wConvs.length;
      for (var wc = 0; wc < wConvs.length; wc++) {
        weekTokens += wConvs[wc].getInt('total_tokens') || 0;
      }
    } catch (e) {}

    // Ideas funnel
    var ideasDone = 0;
    var ideasPlanned = 0;
    try {
      var done = dao.findRecordsByFilter('ideas', 'user = {:uid} && status = "done" && updated >= {:start}', '', 0, 0, { uid: userId, start: weekStartStr });
      ideasDone = done.length;
    } catch (e) {}
    try {
      var planned = dao.findRecordsByFilter('ideas', 'user = {:uid} && status = "planned" && updated >= {:start}', '', 0, 0, { uid: userId, start: weekStartStr });
      ideasPlanned = planned.length;
    } catch (e) {}

    var wLines = [];
    wLines.push('');
    wLines.push('━━━━━━━━━━━━━━━━━━━━');
    wLines.push('<b>📈 Weekly Summary (' + toDateStr(weekStart) + ' → ' + toDateStr(now) + ')</b>');
    wLines.push('');
    wLines.push('  • ' + weekActivities.length + ' activities, ' + fmtMins(weekMinutes));
    wLines.push('  • ' + weekConvs + ' conversations (' + Math.round(weekTokens / 1000) + 'K tokens)');
    wLines.push('  • ' + weekIdeas + ' new ideas');
    if (ideasPlanned > 0 || ideasDone > 0) {
      wLines.push('  • Funnel: ' + weekIdeas + ' → ' + ideasPlanned + ' planned → ' + ideasDone + ' done');
    }

    // Research highlights (fit/partial added this week)
    var weekResearch = [];
    try {
      weekResearch = dao.findRecordsByFilter(
        'research',
        'created >= {:start} && (verdict = "fit" || verdict = "partial")',
        '-created',
        5,
        0,
        { start: weekStartStr }
      );
    } catch (e) {}
    if (weekResearch.length > 0) {
      var sourceIcons = { github: '🐙', npm: '📦', blog: '📝', docs: '📝', other: '🔗' };
      wLines.push('');
      wLines.push('<b>🔬 Research Added</b>');
      for (var ri = 0; ri < weekResearch.length; ri++) {
        var rr = weekResearch[ri];
        var rSource = rr.getString('source');
        var rIcon = sourceIcons[rSource] || '🔗';
        var rVerdict = rr.getString('verdict');
        var vBadge = rVerdict === 'fit' ? '✅' : '🟡';
        var rTitle = escHtml(rr.getString('title')).substring(0, 50);
        var rawUrl = rr.getString('url');
        var rUrl = (rawUrl.indexOf('https://') === 0 || rawUrl.indexOf('http://') === 0)
          ? escHtml(rawUrl)
          : '#';
        wLines.push('  ' + rIcon + ' ' + vBadge + ' <a href="' + rUrl + '">' + rTitle + '</a>');
      }
    }

    weeklyText = wLines.join('\n');
  }

  var fullMessage = dailyText + weeklyText;

  // --- Send to Telegram ---
  try {
    $http.send({
      url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: digestChatId,
        text: fullMessage,
        parse_mode: 'HTML',
        disable_notification: false,
      }),
      timeout: 15,
    });
    console.log('[DailyDigest] Sent daily digest to ' + digestChatId);
  } catch (e) {
    console.log('[DailyDigest] Send failed: ' + e);
  }
});

console.log('[DailyDigest] Cron registered: daily_digest (hourly check)');

// NM Doc Training — triggers companion to encode project docs into Neural Memory
// Runs at :30 every hour, only executes at DIGEST_HOUR
cronAdd('nm_doc_training', '30 * * * *', function () {
  var now = new Date();
  var digestHour = 9;
  try {
    var dh = $os.getenv('DIGEST_HOUR');
    if (dh) digestHour = parseInt(dh, 10);
  } catch (e) {}
  if (now.getHours() !== digestHour) return;

  console.log('[NMDocTraining] Triggering companion doc training');

  try {
    var res = $http.send({
      url: 'http://host.docker.internal:3457/api/nm/train-docs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      timeout: 30,
    });
    console.log('[NMDocTraining] Companion responded: ' + res.statusCode);
  } catch (e) {
    console.log('[NMDocTraining] Companion unreachable: ' + e);
  }
});

console.log('[NMDocTraining] Cron registered: nm_doc_training');
