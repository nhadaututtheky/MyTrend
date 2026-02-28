/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Neural Bridge Hook
// Encodes conversations, ideas, plans, activities, claude_tasks, projects, topics
// into Neural Memory for semantic search.
// NM EncodeRequest: { content: string, timestamp?: string, metadata?: object, tags?: string[] }
// Silently fails if NM is unreachable (optional sidecar).

/**
 * Classify memory type and priority based on collection and content.
 * Returns { type: string, priority: number }
 */
function classifyMemoryType(content, collection, record) {
  // Collection-specific overrides (check first)
  if (collection === 'plans') {
    return { type: 'decision', priority: 8 };
  }
  if (collection === 'activities') {
    return { type: 'workflow', priority: 6 };
  }
  if (collection === 'projects') {
    return { type: 'fact', priority: 4 };
  }
  if (collection === 'topics') {
    return { type: 'fact', priority: 4 };
  }
  if (collection === 'ideas') {
    var ideaStatus = record.getString('status') || '';
    if (ideaStatus === 'planned' || ideaStatus === 'done') {
      return { type: 'decision', priority: 8 };
    }
    return { type: 'fact', priority: 4 };
  }

  // Pattern matching on content (for conversations, claude_tasks, and fallback)
  var text = content.toLowerCase();

  if (
    text.indexOf('decided to') !== -1 ||
    text.indexOf('chose') !== -1 ||
    text.indexOf('went with') !== -1 ||
    text.indexOf('will use') !== -1 ||
    text.indexOf('switched to') !== -1 ||
    text.indexOf('migrated to') !== -1
  ) {
    return { type: 'decision', priority: 8 };
  }

  if (
    text.indexOf('learned') !== -1 ||
    text.indexOf('lesson') !== -1 ||
    text.indexOf('mistake') !== -1 ||
    text.indexOf('never again') !== -1 ||
    text.indexOf('insight') !== -1 ||
    text.indexOf('realized') !== -1 ||
    text.indexOf('turns out') !== -1
  ) {
    return { type: 'insight', priority: 8 };
  }

  if (
    text.indexOf('error') !== -1 ||
    text.indexOf('failed') !== -1 ||
    text.indexOf('bug') !== -1 ||
    text.indexOf('crashed') !== -1 ||
    text.indexOf('broke') !== -1 ||
    text.indexOf('exception') !== -1 ||
    text.indexOf('stacktrace') !== -1
  ) {
    return { type: 'error', priority: 7 };
  }

  if (
    text.indexOf('workflow') !== -1 ||
    text.indexOf('process') !== -1 ||
    text.indexOf('pattern') !== -1 ||
    text.indexOf('always do') !== -1 ||
    text.indexOf('convention') !== -1 ||
    text.indexOf('standard') !== -1
  ) {
    return { type: 'workflow', priority: 6 };
  }

  if (
    text.indexOf('todo') !== -1 ||
    text.indexOf('need to') !== -1 ||
    text.indexOf('should') !== -1 ||
    text.indexOf('must') !== -1 ||
    text.indexOf('plan to') !== -1 ||
    text.indexOf('next step') !== -1
  ) {
    return { type: 'todo', priority: 5 };
  }

  if (
    text.indexOf('prefer') !== -1 ||
    text.indexOf('like') !== -1 ||
    text.indexOf('dislike') !== -1 ||
    text.indexOf('better') !== -1 ||
    text.indexOf('worse') !== -1 ||
    text.indexOf('favorite') !== -1
  ) {
    return { type: 'preference', priority: 5 };
  }

  return { type: 'fact', priority: 4 };
}

/**
 * Infer domain tags from content.
 * Returns array of strings like ['domain:frontend', 'domain:ai'].
 */
function inferDomainTags(content) {
  var text = content.toLowerCase();
  var domains = [];

  var frontendWords = ['svelte', 'component', 'css', 'layout', 'page', 'route', 'html', 'ui'];
  var backendWords = ['pocketbase', 'hook', 'api', 'endpoint', 'collection', 'migration', 'cron'];
  var infraWords = ['docker', 'nginx', 'deploy', 'compose', 'build', 'ci', 'pipeline'];
  var aiWords = ['neural', 'memory', 'model', 'claude', 'prompt', 'llm', 'embedding'];
  var telegramWords = ['telegram', 'bot', 'webhook', 'chat_id'];

  var foundFrontend = false;
  for (var fi = 0; fi < frontendWords.length; fi++) {
    if (text.indexOf(frontendWords[fi]) !== -1) { foundFrontend = true; break; }
  }
  if (foundFrontend) domains.push('domain:frontend');

  var foundBackend = false;
  for (var bi = 0; bi < backendWords.length; bi++) {
    if (text.indexOf(backendWords[bi]) !== -1) { foundBackend = true; break; }
  }
  if (foundBackend) domains.push('domain:backend');

  var foundInfra = false;
  for (var ii = 0; ii < infraWords.length; ii++) {
    if (text.indexOf(infraWords[ii]) !== -1) { foundInfra = true; break; }
  }
  if (foundInfra) domains.push('domain:infra');

  var foundAi = false;
  for (var ai = 0; ai < aiWords.length; ai++) {
    if (text.indexOf(aiWords[ai]) !== -1) { foundAi = true; break; }
  }
  if (foundAi) domains.push('domain:ai');

  var foundTelegram = false;
  for (var ti = 0; ti < telegramWords.length; ti++) {
    if (text.indexOf(telegramWords[ti]) !== -1) { foundTelegram = true; break; }
  }
  if (foundTelegram) domains.push('domain:telegram');

  return domains;
}

/**
 * Encode a record into Neural Memory.
 */
function encodeToNeuralMemory(collection, record) {
  try {
    var nmUrl = $os.getenv('NM_URL') || 'http://neural-memory:8000';
    var endpoint = nmUrl + '/memory/encode';

    var content = '';
    var tags = [];
    var metadata = {
      collection: collection,
      record_id: record.getId(),
      user: record.getString('user'),
    };

    // Helper: resolve project name from relation ID
    function resolveProjectName(projId) {
      if (!projId) return null;
      try {
        var proj = $app.dao().findRecordById('projects', projId);
        return proj.getString('name') || null;
      } catch (e) { return null; }
    }

    // -----------------------------------------------------------------------
    // conversations
    // -----------------------------------------------------------------------
    if (collection === 'conversations') {
      var title = record.getString('title') || '';
      var summary = record.getString('summary') || '';

      var parts = [];
      if (title) parts.push('Title: ' + title);
      if (summary) parts.push('Summary: ' + summary);

      var messages = record.get('messages') || [];
      var msgCount = 0;
      for (var i = 0; i < messages.length && msgCount < 10; i++) {
        var msg = messages[i];
        if (msg && msg.role && msg.content) {
          var msgText = msg.content;
          if (msgText.length > 500) msgText = msgText.substring(0, 497) + '...';
          parts.push(msg.role + ': ' + msgText);
          msgCount++;
        }
      }
      content = parts.join('\n');

      var recordTags = record.get('tags') || [];
      for (var t = 0; t < recordTags.length; t++) {
        tags.push(String(recordTags[t]));
      }
      tags.push('conversation');

      metadata.title = title;
      metadata.source = record.getString('source') || '';
      metadata.session_id = record.getString('session_id') || '';
      metadata.message_count = record.getInt('message_count') || 0;

      var projId = record.getString('project');
      var projName = resolveProjectName(projId);
      if (projName) {
        tags.push('project:' + projName);
        metadata.project_name = projName;
        content = 'Project: ' + projName + '\n' + content;
      }

      var topicsList = record.get('topics') || [];
      for (var tp = 0; tp < topicsList.length && tp < 10; tp++) {
        var topicName = String(topicsList[tp]);
        if (topicName) tags.push('topic:' + topicName);
      }

      // Extract typed insights from conversation messages
      function extractInsights(msgs, maxInsights) {
        var results = [];
        var extractPatterns = [
          { words: ['decided to', 'chose', 'went with', 'will use', 'switched to'], type: 'decision', priority: 8 },
          { words: ['learned', 'lesson', 'mistake', 'never again', 'realized', 'turns out'], type: 'insight', priority: 8 },
          { words: ['error', 'failed', 'bug', 'crashed', 'broke'], type: 'error', priority: 7 },
          { words: ['workflow', 'process', 'always do', 'convention'], type: 'workflow', priority: 6 },
        ];

        for (var mi = 0; mi < msgs.length && results.length < maxInsights; mi++) {
          var m = msgs[mi];
          if (!m || !m.content || m.role !== 'assistant') continue;
          var txt = m.content.toLowerCase();

          for (var pi = 0; pi < extractPatterns.length; pi++) {
            var matched = false;
            for (var wi = 0; wi < extractPatterns[pi].words.length; wi++) {
              if (txt.indexOf(extractPatterns[pi].words[wi]) !== -1) {
                matched = true;
                break;
              }
            }
            if (matched) {
              var snippet = m.content;
              if (snippet.length > 300) snippet = snippet.substring(0, 297) + '...';
              results.push({
                content: snippet,
                type: extractPatterns[pi].type,
                priority: extractPatterns[pi].priority,
              });
              break; // One type per message
            }
          }
        }
        return results;
      }

      // Encode extracted insights as separate memories
      var extracted = extractInsights(messages, 5);
      for (var ei = 0; ei < extracted.length; ei++) {
        var insightTags = tags.slice(); // copy base tags
        insightTags.push('extracted');
        insightTags.push(extracted[ei].type);
        var insightPayload = {
          content: extracted[ei].content,
          metadata: {
            collection: 'conversations',
            record_id: record.getId(),
            type: extracted[ei].type,
            priority: extracted[ei].priority,
            extracted_from: 'conversation',
            title: title,
          },
          tags: insightTags,
        };
        try {
          $http.send({
            url: endpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Brain-ID': ($os.getenv('NEURALMEMORY_BRAIN') || 'laptop-brain') },
            body: JSON.stringify(insightPayload),
            timeout: 5,
          });
        } catch (e) { /* silent fail */ }
      }

    // -----------------------------------------------------------------------
    // ideas
    // -----------------------------------------------------------------------
    } else if (collection === 'ideas') {
      var ideaTitle = record.getString('title') || '';
      var ideaContent = record.getString('content') || '';

      content = 'Idea: ' + ideaTitle;
      if (ideaContent) content += '\n' + ideaContent;

      var ideaTags = record.get('tags') || [];
      for (var it = 0; it < ideaTags.length; it++) {
        tags.push(String(ideaTags[it]));
      }
      tags.push('idea');

      var ideaType = record.getString('type');
      if (ideaType) tags.push(ideaType);

      metadata.title = ideaTitle;
      metadata.idea_type = ideaType || '';
      metadata.priority = record.getString('priority') || '';

    // -----------------------------------------------------------------------
    // plans
    // -----------------------------------------------------------------------
    } else if (collection === 'plans') {
      var planTitle = record.getString('title') || '';
      var planType = record.getString('plan_type') || '';
      var planStatus = record.getString('status') || '';
      var planContent = record.getString('content') || '';
      var planReasoning = record.getString('reasoning') || '';
      var planAlternatives = record.getString('alternatives') || '';

      var planParts = ['Plan: ' + planTitle];
      if (planType) planParts.push('Type: ' + planType);
      if (planStatus) planParts.push('Status: ' + planStatus);
      if (planContent) planParts.push(planContent);
      if (planReasoning) planParts.push('Reasoning: ' + planReasoning);
      if (planAlternatives) planParts.push('Alternatives: ' + planAlternatives);
      content = planParts.join('\n');

      var planTags = record.get('tags') || [];
      for (var pt = 0; pt < planTags.length; pt++) {
        tags.push(String(planTags[pt]));
      }
      tags.push('plan');
      if (planType) tags.push(planType);

      metadata.title = planTitle;
      metadata.plan_type = planType;
      metadata.status = planStatus;
      metadata.priority = record.getString('priority') || '';
      metadata.complexity = record.getString('complexity') || '';

      var planProjId = record.getString('project');
      var planProjName = resolveProjectName(planProjId);
      if (planProjName) {
        tags.push('project:' + planProjName);
        metadata.project_name = planProjName;
      }

    // -----------------------------------------------------------------------
    // activities (immutable event records)
    // -----------------------------------------------------------------------
    } else if (collection === 'activities') {
      var actType = record.getString('type') || '';
      var actAction = record.getString('action') || '';
      var actMeta = record.get('metadata') || {};

      var actParts = ['Activity [' + actType + ']: ' + actAction];
      if (actMeta.repo) actParts.push('Repo: ' + actMeta.repo);
      if (actMeta.commit_hash) actParts.push('Commit: ' + String(actMeta.commit_hash).substring(0, 12));
      if (actMeta.pr_number) actParts.push('PR #' + actMeta.pr_number);
      if (actMeta.issue_number) actParts.push('Issue #' + actMeta.issue_number);
      if (actMeta.state) actParts.push('State: ' + actMeta.state);
      if (actMeta.labels && actMeta.labels.length) actParts.push('Labels: ' + actMeta.labels.join(', '));
      content = actParts.join('\n');

      tags.push('activity');
      tags.push(actType);
      if (actMeta.source) tags.push('source:' + actMeta.source);

      metadata.activity_type = actType;
      if (actMeta.repo) metadata.repo = actMeta.repo;
      if (actMeta.url) metadata.url = actMeta.url;

      var actProjId = record.getString('project');
      var actProjName = resolveProjectName(actProjId);
      if (actProjName) {
        tags.push('project:' + actProjName);
        metadata.project_name = actProjName;
      }

    // -----------------------------------------------------------------------
    // claude_tasks
    // -----------------------------------------------------------------------
    } else if (collection === 'claude_tasks') {
      var taskContent = record.getString('content') || '';
      var taskStatus = record.getString('status') || '';
      var taskModel = record.getString('model') || '';
      var sessionTitle = record.getString('session_title') || '';
      var projectDir = record.getString('project_dir') || '';

      var taskParts = ['Claude Task: ' + taskContent];
      if (taskStatus) taskParts.push('Status: ' + taskStatus);
      if (taskModel) taskParts.push('Model: ' + taskModel);
      if (sessionTitle) taskParts.push('Session: ' + sessionTitle);
      content = taskParts.join('\n');

      tags.push('claude-task');
      if (taskStatus) tags.push('status:' + taskStatus);
      if (taskModel) tags.push('model:' + taskModel);

      // Extract project name from project_dir (last segment)
      if (projectDir) {
        var dirParts = projectDir.replace(/\\/g, '/').split('/');
        var dirName = dirParts[dirParts.length - 1] || '';
        if (dirName) tags.push('project:' + dirName);
      }

      metadata.title = taskContent;
      metadata.task_status = taskStatus;
      metadata.model = taskModel;
      metadata.session_id = record.getString('session_id') || '';

    // -----------------------------------------------------------------------
    // projects (DNA / context)
    // -----------------------------------------------------------------------
    } else if (collection === 'projects') {
      var projNameVal = record.getString('name') || '';
      var projDesc = record.getString('description') || '';
      var projStatus = record.getString('status') || '';
      var techStack = record.get('tech_stack') || [];
      var dna = record.get('dna') || {};

      var projParts = ['Project: ' + projNameVal];
      if (projDesc) projParts.push(projDesc);
      if (projStatus) projParts.push('Status: ' + projStatus);
      if (techStack.length) projParts.push('Tech stack: ' + techStack.join(', '));
      if (dna.vision) projParts.push('Vision: ' + dna.vision);
      if (dna.phase) projParts.push('Phase: ' + dna.phase);
      if (dna.challenges && dna.challenges.length) projParts.push('Challenges: ' + dna.challenges.join('; '));
      if (dna.decisions && dna.decisions.length) {
        for (var di = 0; di < dna.decisions.length && di < 10; di++) {
          var dec = dna.decisions[di];
          projParts.push('[' + (dec.date || '') + '] ' + (dec.title || '') + ' - ' + (dec.description || ''));
        }
      }
      content = projParts.join('\n');

      tags.push('project');
      tags.push('project:' + projNameVal);
      for (var ts = 0; ts < techStack.length; ts++) {
        tags.push('tech:' + techStack[ts]);
      }
      var ghRepo = record.getString('github_repo');
      if (ghRepo) tags.push('github:' + ghRepo);

      metadata.title = projNameVal;
      metadata.project_name = projNameVal;
      metadata.slug = record.getString('slug') || '';
      metadata.status = projStatus;

    // -----------------------------------------------------------------------
    // topics
    // -----------------------------------------------------------------------
    } else if (collection === 'topics') {
      var topName = record.getString('name') || '';
      var topCategory = record.getString('category') || '';
      var topMentions = record.getInt('mention_count') || 0;
      var topRelated = record.get('related') || [];

      var topParts = ['Topic: ' + topName];
      if (topCategory) topParts.push('Category: ' + topCategory);
      topParts.push('Mentions: ' + topMentions);

      // Resolve related topic names
      if (topRelated.length > 0) {
        var relNames = [];
        for (var ri = 0; ri < topRelated.length && ri < 10; ri++) {
          try {
            var relTopic = $app.dao().findRecordById('topics', topRelated[ri]);
            relNames.push(relTopic.getString('name'));
          } catch (e) { /* skip */ }
        }
        if (relNames.length) topParts.push('Related: ' + relNames.join(', '));
      }
      content = topParts.join('\n');

      tags.push('topic');
      if (topCategory) tags.push('category:' + topCategory);
      tags.push(topName);

      metadata.title = topName;
      metadata.category = topCategory;
      metadata.mention_count = topMentions;
    }

    if (!content || content.length < 10) return;

    // Truncate content to NM max (100k chars)
    if (content.length > 50000) content = content.substring(0, 50000);

    // Classify memory type
    var classified = classifyMemoryType(content, collection, record);
    metadata.type = classified.type;
    metadata.priority = classified.priority;

    // Add domain tags
    var domainTags = inferDomainTags(content);
    for (var dt = 0; dt < domainTags.length; dt++) {
      tags.push(domainTags[dt]);
    }

    // Add session date and collection tags
    function padTwo(n) { return n < 10 ? '0' + n : '' + n; }
    var now = new Date();
    tags.push('session:' + now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate()));
    tags.push('collection:' + collection);

    var payload = {
      content: content,
      metadata: metadata,
      tags: tags,
    };

    var startedAt = record.getString('started_at') || record.getString('timestamp') || record.getString('created');
    if (startedAt) {
      payload.timestamp = startedAt;
    }

    var res = $http.send({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Brain-ID': ($os.getenv('NEURALMEMORY_BRAIN') || 'laptop-brain') },
      body: JSON.stringify(payload),
      timeout: 5,
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('[NeuralBridge] Encoded ' + collection + ': ' + record.getId());
    } else {
      console.log('[NeuralBridge] Status ' + res.statusCode + ' for ' + collection + ': ' + record.getId());
    }
  } catch (err) {
    // Silent fail - NM is optional
    console.log('[NeuralBridge] NM unreachable (OK if not deployed): ' + err);
  }
}

// ---------------------------------------------------------------------------
// Hooks: Encode on create
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('conversations', e.record);
}, 'conversations');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('ideas', e.record);
}, 'ideas');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('plans', e.record);
}, 'plans');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('activities', e.record);
}, 'activities');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('claude_tasks', e.record);
}, 'claude_tasks');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('projects', e.record);
}, 'projects');

onRecordAfterCreateRequest((e) => {
  encodeToNeuralMemory('topics', e.record);
}, 'topics');

// ---------------------------------------------------------------------------
// Hooks: Re-encode on update (for meaningful changes)
// Activities are immutable - no update hook needed
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('conversations', e.record);
}, 'conversations');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('ideas', e.record);
}, 'ideas');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('plans', e.record);
}, 'plans');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('claude_tasks', e.record);
}, 'claude_tasks');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('projects', e.record);
}, 'projects');

onRecordAfterUpdateRequest((e) => {
  encodeToNeuralMemory('topics', e.record);
}, 'topics');

console.log('[NeuralBridge] Registered hooks: conversations, ideas, plans, activities, claude_tasks, projects, topics');
