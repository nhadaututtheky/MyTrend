/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Neural Bridge Hook
// Encodes conversations, ideas, plans, activities, claude_tasks, projects, topics
// into Neural Memory for semantic search.
// NM EncodeRequest: { content: string, timestamp?: string, metadata?: object, tags?: string[] }
// Silently fails if NM is unreachable (optional sidecar).

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
      type: 'fact',
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
      metadata.type = 'context';

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
      headers: { 'Content-Type': 'application/json', 'X-Brain-ID': 'laptop-brain' },
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
