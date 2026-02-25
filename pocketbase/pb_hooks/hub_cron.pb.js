/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Hub Cron Job Executor
// POST /api/mytrend/cron/{id}/run — manually trigger a cron job
// Calls Anthropic Claude API with the job's prompt, saves result to history.

routerAdd('POST', '/api/mytrend/cron/{id}/run', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var jobId = c.pathParam('id');
  var dao = $app.dao();

  // Load cron job
  var job;
  try {
    job = dao.findRecordById('hub_cron_jobs', jobId);
  } catch (e) {
    return c.json(404, { error: 'Cron job not found' });
  }

  // Ownership check
  if (job.getString('user') !== authRecord.getId()) {
    return c.json(403, { error: 'Forbidden' });
  }

  var prompt = job.getString('prompt');
  if (!prompt || prompt.trim().length === 0) {
    return c.json(400, { error: 'Cron job has no prompt configured' });
  }

  // Resolve API key: env first, then user_settings
  var apiKey = $os.getenv('ANTHROPIC_API_KEY') || '';
  if (!apiKey) {
    try {
      var settings = dao.findFirstRecordByFilter('user_settings', 'user = {:uid}', { uid: authRecord.getId() });
      apiKey = settings.getString('anthropic_api_key') || '';
    } catch (e) {}
  }
  if (!apiKey) {
    return c.json(400, { error: 'Anthropic API key not configured. Set it in Hub Settings.' });
  }

  // Resolve model from environment if set
  var model = 'claude-haiku-4-5-20251001';
  var envId = job.getString('environment');
  if (envId) {
    try {
      var env = dao.findRecordById('hub_environments', envId);
      var envModel = env.getString('model');
      if (envModel) model = envModel;
    } catch (e) {}
  }

  // Call Anthropic API
  var startTime = new Date().getTime();
  var output = '';
  var success = false;

  try {
    var res = $http.send({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.statusCode === 200) {
      var body = JSON.parse(res.raw);
      var content = body.content;
      if (content && content.length > 0) {
        output = content[0].text || '';
      }
      success = true;
    } else {
      output = 'API error ' + res.statusCode + ': ' + res.raw.substring(0, 300);
    }
  } catch (e) {
    output = 'Request failed: ' + String(e).substring(0, 300);
  }

  var durationMs = new Date().getTime() - startTime;
  var now = new Date().toISOString();
  var outputTrimmed = output.substring(0, 2000);

  // Update the cron job record
  job.set('last_run', now);
  job.set('last_result', outputTrimmed);
  job.set('run_count', job.getInt('run_count') + 1);
  try {
    dao.saveRecord(job);
  } catch (e) {
    console.log('[HubCron] Failed to update job record: ' + e);
  }

  // Save to hub_cron_history if collection exists
  try {
    var histCol = dao.findCollectionByNameOrId('hub_cron_history');
    var hist = new Record(histCol);
    hist.set('cron_job', jobId);
    hist.set('ran_at', now);
    hist.set('status', success ? 'success' : 'error');
    hist.set('duration_ms', durationMs);
    hist.set('output', output.substring(0, 5000));
    dao.saveRecord(hist);
  } catch (e) {
    // Collection may not exist yet — non-critical
  }

  console.log('[HubCron] Job "' + job.getString('name') + '" ran in ' + durationMs + 'ms. Success=' + success);
  return c.json(200, { success: success, output: outputTrimmed, duration_ms: durationMs });
});
