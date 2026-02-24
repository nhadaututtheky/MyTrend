/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Idea ↔ Plan Auto-Linking
// Hook A: Idea → "planned" auto-creates draft plan
// Hook B: Plan → "completed"/"abandoned" cascades to linked ideas
// Endpoint: GET /api/mytrend/funnel returns conversion analytics

// ---------------------------------------------------------------------------
// Idea type → Plan type mapping
// ---------------------------------------------------------------------------
var IDEA_TO_PLAN_TYPE = {
  feature: 'implementation',
  bug: 'bugfix',
  design: 'design',
  architecture: 'architecture',
  optimization: 'refactor',
  question: 'investigation',
};

// ---------------------------------------------------------------------------
// Hook A: Idea status → "planned" → Auto-create draft plan
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest(
  (e) => {
    var record = e.record;
    var oldRecord = record.originalCopy();

    var oldStatus = oldRecord.getString('status');
    var newStatus = record.getString('status');

    // Only trigger on transition TO "planned"
    if (oldStatus === 'planned' || newStatus !== 'planned') return;

    // Skip if already has a linked plan
    var existingPlan = record.getString('linked_plan');
    if (existingPlan) {
      console.log('[IdeaPlanLink] Idea ' + record.getId() + ' already linked to plan ' + existingPlan);
      return;
    }

    try {
      var dao = $app.dao();
      var planCol = dao.findCollectionByNameOrId('plans');
      var plan = new Record(planCol);

      var ideaType = record.getString('type') || 'feature';
      var planType = IDEA_TO_PLAN_TYPE[ideaType] || 'implementation';

      plan.set('user', record.getString('user'));
      plan.set('title', record.getString('title'));
      plan.set('plan_type', planType);
      plan.set('status', 'draft');
      plan.set('extraction_source', 'idea_promotion');
      plan.set('trigger', 'Promoted from idea: ' + record.getString('title'));
      plan.set('source_ideas', JSON.stringify([record.getId()]));

      var project = record.getString('project');
      if (project) plan.set('project', project);

      var tags = record.getString('tags');
      if (tags) plan.set('tags', tags);

      var priority = record.getString('priority');
      if (priority) plan.set('priority', priority);

      // Generate slug from title
      var slug = record
        .getString('title')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 200);
      plan.set('slug', slug);

      dao.saveRecord(plan);
      console.log('[IdeaPlanLink] Created plan ' + plan.getId() + ' from idea ' + record.getId());

      // Update idea with linked_plan
      record.set('linked_plan', plan.getId());
      dao.saveRecord(record);
      console.log('[IdeaPlanLink] Linked idea ' + record.getId() + ' → plan ' + plan.getId());

      // Log activity
      try {
        var actCol = dao.findCollectionByNameOrId('activities');
        var activity = new Record(actCol);
        activity.set('user', record.getString('user'));
        activity.set('type', 'idea');
        activity.set('action', 'Promoted idea to plan: ' + record.getString('title').substring(0, 200));
        activity.set('timestamp', new Date().toISOString());
        activity.set('metadata', JSON.stringify({
          idea_id: record.getId(),
          plan_id: plan.getId(),
          idea_type: ideaType,
          plan_type: planType,
        }));
        var proj = record.getString('project');
        if (proj) activity.set('project', proj);
        dao.saveRecord(activity);
      } catch (actErr) {
        console.log('[IdeaPlanLink] Activity log error: ' + actErr);
      }
    } catch (err) {
      console.log('[IdeaPlanLink] Error creating plan from idea: ' + err);
    }
  },
  'ideas',
);

// ---------------------------------------------------------------------------
// Hook B: Plan status → "completed"/"abandoned" → Update linked ideas
// ---------------------------------------------------------------------------
onRecordAfterUpdateRequest(
  (e) => {
    var record = e.record;
    var oldRecord = record.originalCopy();

    var oldStatus = oldRecord.getString('status');
    var newStatus = record.getString('status');

    // Only trigger on transitions to completed or abandoned
    if (oldStatus === newStatus) return;
    if (newStatus !== 'completed' && newStatus !== 'abandoned') return;

    var planId = record.getId();
    var dao = $app.dao();

    try {
      // Find ideas linked to this plan
      var ideas = dao.findRecordsByFilter(
        'ideas',
        'linked_plan = {:planId}',
        '-created',
        0,
        0,
        { planId: planId },
      );

      if (!ideas || ideas.length === 0) {
        console.log('[IdeaPlanLink] No linked ideas for plan ' + planId);
        return;
      }

      var targetStatus = newStatus === 'completed' ? 'done' : 'considering';

      for (var i = 0; i < ideas.length; i++) {
        var idea = ideas[i];
        var currentStatus = idea.getString('status');

        // Don't update if already in target status
        if (currentStatus === targetStatus) continue;

        idea.set('status', targetStatus);
        dao.saveRecord(idea);
        console.log(
          '[IdeaPlanLink] Plan ' + planId + ' ' + newStatus +
          ' → idea ' + idea.getId() + ' set to ' + targetStatus,
        );
      }
    } catch (err) {
      console.log('[IdeaPlanLink] Error cascading plan status: ' + err);
    }
  },
  'plans',
);

// ---------------------------------------------------------------------------
// GET /api/mytrend/funnel — Idea → Plan conversion funnel analytics
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/funnel', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Auth required' });

  var userId = authRecord.getId();
  var dao = $app.dao();

  try {
    // Count ideas by status
    var ideaStatuses = ['inbox', 'considering', 'planned', 'in_progress', 'done', 'rejected'];
    var ideaByStatus = {};
    var ideaTotal = 0;

    for (var i = 0; i < ideaStatuses.length; i++) {
      var status = ideaStatuses[i];
      var ideas = dao.findRecordsByFilter(
        'ideas',
        'user = {:userId} && status = {:status}',
        '',
        0,
        0,
        { userId: userId, status: status },
      );
      var count = ideas ? ideas.length : 0;
      ideaByStatus[status] = count;
      ideaTotal += count;
    }

    // Count plans by status
    var planStatuses = ['draft', 'approved', 'in_progress', 'review', 'completed', 'abandoned', 'superseded'];
    var planByStatus = {};
    var planTotal = 0;

    for (var j = 0; j < planStatuses.length; j++) {
      var pStatus = planStatuses[j];
      var plans = dao.findRecordsByFilter(
        'plans',
        'user = {:userId} && status = {:status}',
        '',
        0,
        0,
        { userId: userId, status: pStatus },
      );
      var pCount = plans ? plans.length : 0;
      planByStatus[pStatus] = pCount;
      planTotal += pCount;
    }

    // Count ideas with linked_plan
    var linkedIdeas = dao.findRecordsByFilter(
      'ideas',
      'user = {:userId} && linked_plan != ""',
      '',
      0,
      0,
      { userId: userId },
    );
    var linkedCount = linkedIdeas ? linkedIdeas.length : 0;

    // Count promoted plans
    var promotedPlans = dao.findRecordsByFilter(
      'plans',
      'user = {:userId} && extraction_source = "idea_promotion"',
      '',
      0,
      0,
      { userId: userId },
    );
    var promotedCount = promotedPlans ? promotedPlans.length : 0;

    // Conversion rates
    var ideaToPlan = ideaTotal > 0 ? Math.round((linkedCount / ideaTotal) * 100) / 100 : 0;
    var planCompletion = planTotal > 0 ? Math.round(((planByStatus['completed'] || 0) / planTotal) * 100) / 100 : 0;
    var ideaToDone = ideaTotal > 0 ? Math.round(((ideaByStatus['done'] || 0) / ideaTotal) * 100) / 100 : 0;

    return c.json(200, {
      ideas: {
        total: ideaTotal,
        by_status: ideaByStatus,
      },
      plans: {
        total: planTotal,
        by_status: planByStatus,
      },
      conversion: {
        idea_to_plan: ideaToPlan,
        plan_completion: planCompletion,
        idea_to_done: ideaToDone,
        promoted_plans: promotedCount,
      },
    });
  } catch (err) {
    console.log('[IdeaPlanLink] Funnel error: ' + err);
    return c.json(500, { error: 'Failed to compute funnel stats' });
  }
});
