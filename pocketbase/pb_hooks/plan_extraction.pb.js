/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Plan Extraction
// Auto-extracts plans/decisions from Claude's assistant messages in conversations.
// Detects implementation plans, architecture decisions, design approaches, etc.
// Creates plan records with status "draft" for user review.

// Signal phrases that indicate a plan/decision (grouped by plan_type)
var PLAN_SIGNALS = {
  implementation: [
    "here's the plan", "here is the plan", "implementation plan",
    "here's my approach", "here is my approach", "step-by-step",
    "implementation approach", "implementation strategy",
    "here's how i'll", "here is how i'll", "i'll implement",
    "the implementation will", "i propose the following",
    "let me implement", "here's what i'll do", "here is what i'll do",
    "ke hoach thuc hien", "day la plan", "cach lam nhu sau",
  ],
  architecture: [
    "architecture decision", "architectural approach", "system design",
    "data model", "schema design", "collection schema", "database design",
    "component architecture", "technical design", "design decision",
    "the architecture", "data flow", "kien truc", "thiet ke he thong",
  ],
  refactor: [
    "refactoring plan", "refactor approach", "restructure",
    "migration plan", "migration strategy", "let me refactor",
    "code reorganization", "refactoring strategy",
  ],
  design: [
    "ui design", "design system", "layout design", "ux approach",
    "visual design", "component design", "design approach",
    "page layout", "thiet ke giao dien",
  ],
  investigation: [
    "root cause", "investigation", "debugging approach",
    "let me analyze", "analysis:", "diagnostic", "the issue is",
    "after investigating", "nguyen nhan",
  ],
  bugfix: [
    "the fix is", "here's the fix", "here is the fix",
    "to fix this", "bug fix approach", "the solution is",
    "fix approach", "cach fix",
  ],
};

/**
 * Check if text contains any plan signal phrase and return the type + matched phrase + position.
 */
function detectPlan(text) {
  var lower = text.toLowerCase();
  var types = Object.keys(PLAN_SIGNALS);
  for (var t = 0; t < types.length; t++) {
    var phrases = PLAN_SIGNALS[types[t]];
    for (var p = 0; p < phrases.length; p++) {
      var idx = lower.indexOf(phrases[p]);
      if (idx >= 0) {
        return { type: types[t], phrase: phrases[p], position: idx };
      }
    }
  }
  return null;
}

/**
 * Extract plan content: multi-paragraph block from signal phrase to next major section break.
 * Returns up to 5000 chars of structured content.
 */
function extractPlanContent(text, position) {
  // Find the start of the section containing the signal
  var start = position;
  // Go back to find section start (heading, double newline, or beginning)
  while (start > 0) {
    if (text[start - 1] === '\n' && start >= 2 && text[start - 2] === '\n') {
      break; // Double newline = paragraph break
    }
    if (text[start - 1] === '\n' && start < text.length && (text[start] === '#' || text[start] === '-' || text[start] === '*')) {
      break; // Heading or list start
    }
    start--;
  }

  // Find the end: next major heading or end of message
  var end = position + 100; // Skip past the signal phrase
  var headingCount = 0;
  while (end < text.length) {
    if (text[end] === '\n' && end + 1 < text.length && text[end + 1] === '#') {
      headingCount++;
      if (headingCount >= 2) break; // Stop at 2nd heading after signal
    }
    if (text[end] === '\n' && end + 1 < text.length && text[end + 1] === '\n' && end + 2 < text.length && text[end + 2] === '\n') {
      break; // Triple newline = major section break
    }
    end++;
  }

  var content = text.substring(start, Math.min(end, text.length)).trim();
  if (content.length > 5000) content = content.substring(0, 4997) + '...';
  if (content.length < 50) return null; // Too short to be a real plan
  return content;
}

/**
 * Extract the title from plan content (first meaningful line).
 */
function extractTitle(content, signalPhrase) {
  var lines = content.split('\n');
  for (var i = 0; i < lines.length && i < 5; i++) {
    var line = lines[i].replace(/^[#\-*>\s]+/, '').trim();
    if (line.length >= 10 && line.length <= 200) {
      return line;
    }
  }
  // Fallback: use signal phrase context
  return signalPhrase.substring(0, 1).toUpperCase() + signalPhrase.substring(1);
}

/**
 * Look for alternatives/trade-offs discussion near the plan.
 */
function extractAlternatives(text, planPosition) {
  var lower = text.toLowerCase();
  var altSignals = ['alternatively', 'alternative', 'trade-off', 'tradeoff',
    'instead of', 'we could also', 'another approach', 'other option',
    'considered', 'rejected because', 'why not'];

  for (var i = 0; i < altSignals.length; i++) {
    var idx = lower.indexOf(altSignals[i], Math.max(0, planPosition - 500));
    if (idx >= 0 && idx < planPosition + 3000) {
      // Extract paragraph containing the alternative discussion
      var start = idx;
      while (start > 0 && text[start - 1] !== '\n') start--;
      var end = idx + 100;
      while (end < text.length && !(text[end] === '\n' && text[end + 1] === '\n')) end++;
      var alt = text.substring(start, Math.min(end, text.length)).trim();
      if (alt.length >= 20 && alt.length <= 2000) return alt;
    }
  }
  return '';
}

/**
 * Calculate confidence based on content quality indicators.
 */
function calculateConfidence(content, signalPhrase) {
  var score = 0.5; // Base for any signal match

  // Bonus for structured content
  if (content.match(/\d+[\.\)]/)) score += 0.15; // Numbered list
  if (content.match(/^[-*]\s/m)) score += 0.1;   // Bulleted list
  if (content.indexOf('```') >= 0) score += 0.1;  // Code blocks
  if (content.split('\n').length >= 5) score += 0.1; // Multi-line
  if (content.length >= 500) score += 0.05;         // Substantial length

  return Math.min(score, 1.0);
}

/**
 * Generate slug from title.
 */
function planSlugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

/**
 * Decode JSON array field (Goja byte-array safe).
 */
function decodeMessagesForPlans(raw) {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') return raw;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
    try {
      var s = '';
      for (var b = 0; b < raw.length; b++) s += String.fromCharCode(raw[b]);
      var p = JSON.parse(s);
      if (Array.isArray(p)) return p;
    } catch (e) { /* fall through */ }
  }
  if (typeof raw === 'string') {
    try { var p2 = JSON.parse(raw); if (Array.isArray(p2)) return p2; } catch (e) { /* */ }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Extract plans from new conversations
// ---------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  var record = e.record;
  var userId = record.getString('user');
  if (!userId) return;

  var dao = $app.dao();
  var messages = decodeMessagesForPlans(record.get('messages'));
  var convId = record.getId();
  var projectId = record.getString('project') || '';

  var extractedCount = 0;
  var seenTitles = {};

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (!msg || msg.role !== 'assistant' || !msg.content) continue;
    var content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length < 100) continue; // Plans need substance

    var detection = detectPlan(content);
    if (!detection) continue;

    var planContent = extractPlanContent(content, detection.position);
    if (!planContent) continue;

    var title = extractTitle(planContent, detection.phrase);
    var titleKey = title.substring(0, 50).toLowerCase();
    if (seenTitles[titleKey]) continue;
    seenTitles[titleKey] = true;

    // Check for duplicate plans
    try {
      dao.findFirstRecordByFilter(
        'plans',
        'user = {:uid} && title ~ {:title}',
        { uid: userId, title: title.substring(0, 50) }
      );
      continue; // Already exists
    } catch (e) { /* not found, create */ }

    // Find the trigger: preceding user message
    var trigger = '';
    for (var j = i - 1; j >= 0; j--) {
      if (messages[j] && messages[j].role === 'user' && messages[j].content) {
        var triggerContent = typeof messages[j].content === 'string' ? messages[j].content : '';
        trigger = triggerContent.substring(0, 2000);
        break;
      }
    }

    // Extract alternatives discussion
    var alternatives = extractAlternatives(content, detection.position);
    var confidence = calculateConfidence(planContent, detection.phrase);
    var slug = planSlugify(title);
    var now = new Date().toISOString();

    try {
      var planCol = dao.findCollectionByNameOrId('plans');
      var plan = new Record(planCol);
      plan.set('user', userId);
      plan.set('title', title.substring(0, 500));
      plan.set('slug', slug);
      plan.set('plan_type', detection.type);
      plan.set('status', 'draft');
      plan.set('content', planContent);
      plan.set('trigger', trigger);
      plan.set('reasoning', '');
      plan.set('alternatives', alternatives);
      plan.set('outcome', '');
      plan.set('source_conversations', JSON.stringify([convId]));
      plan.set('source_ideas', JSON.stringify([]));
      plan.set('parent_plan', '');
      plan.set('superseded_by', '');
      plan.set('stage_history', JSON.stringify([
        { from: 'none', to: 'draft', timestamp: now, note: 'Auto-extracted from conversation', conversation_id: convId }
      ]));
      plan.set('tags', JSON.stringify([detection.type, 'auto-extracted']));
      plan.set('priority', 'medium');
      plan.set('complexity', 'moderate');
      plan.set('estimated_effort', '');
      plan.set('extraction_source', 'auto');
      plan.set('extraction_confidence', confidence);
      plan.set('signal_phrase', detection.phrase);
      plan.set('started_at', '');
      plan.set('completed_at', '');
      if (projectId) plan.set('project', projectId);
      dao.saveRecord(plan);
      extractedCount++;
    } catch (err) {
      console.log('[PlanExtraction] Create error: ' + err);
    }

    // Max 2 plans per conversation
    if (extractedCount >= 2) break;
  }

  if (extractedCount > 0) {
    console.log('[PlanExtraction] Extracted ' + extractedCount + ' plans from conversation: ' + convId);
  }
}, 'conversations');

console.log('[PlanExtraction] Registered: auto-extract plans from conversations');
