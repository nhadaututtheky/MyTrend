/// <reference path="../pb_data/types.d.ts" />

// MyTrend - Claude Plan File Auto-Sync
// Scans ~/.claude/plans/ directory for .md and .yaml plan files
// Auto-imports them as plan records with project matching and type detection.
// Each routerAdd/cronAdd callback has isolated scope - inline all helpers.

// ---------------------------------------------------------------------------
// POST /api/mytrend/sync-plans
// Manual trigger to scan and import Claude plan files
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/sync-plans', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var userId = authRecord.getId();
  var forceReimport = c.queryParam('force') === 'true';
  console.log('[PlanSync] Manual sync triggered by: ' + userId + (forceReimport ? ' (FORCE)' : ''));

  // UTF-8 byte-array to string decoder (inline - isolated scope)
  function b2s(raw) {
    var s = '';
    var buf = [];
    var i = 0;
    var len = raw.length;
    while (i < len) {
      var b = raw[i];
      var cp;
      if (b < 0x80) {
        cp = b; i++;
      } else if ((b & 0xE0) === 0xC0) {
        if (i + 1 >= len) break;
        cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2;
      } else if ((b & 0xF0) === 0xE0) {
        if (i + 2 >= len) break;
        cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3;
      } else if ((b & 0xF8) === 0xF0) {
        if (i + 3 >= len) break;
        cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4;
      } else { i++; continue; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
    return s;
  }

  // Detect plan_type from content
  function detectPlanType(title, content) {
    var text = (title + ' ' + content).toLowerCase();
    if (text.indexOf('bug') >= 0 || text.indexOf('fix') >= 0 || text.indexOf('error') >= 0) return 'bugfix';
    if (text.indexOf('refactor') >= 0 || text.indexOf('cleanup') >= 0 || text.indexOf('consolidat') >= 0) return 'refactor';
    if (text.indexOf('design') >= 0 || text.indexOf('ui') >= 0 || text.indexOf('ux') >= 0 || text.indexOf('layout') >= 0) return 'design';
    if (text.indexOf('architect') >= 0 || text.indexOf('system design') >= 0 || text.indexOf('data model') >= 0 || text.indexOf('schema') >= 0) return 'architecture';
    if (text.indexOf('migrat') >= 0 || text.indexOf('upgrade') >= 0) return 'migration';
    if (text.indexOf('investigat') >= 0 || text.indexOf('research') >= 0 || text.indexOf('audit') >= 0 || text.indexOf('review') >= 0) return 'investigation';
    return 'implementation';
  }

  // Detect priority from content
  function detectPriority(content) {
    var text = content.toLowerCase();
    if (text.indexOf('critical') >= 0 || text.indexOf('urgent') >= 0 || text.indexOf('blocker') >= 0) return 'critical';
    if (text.indexOf('[high]') >= 0 || text.indexOf('high priority') >= 0 || text.indexOf('severity: high') >= 0) return 'high';
    if (text.indexOf('[low]') >= 0 || text.indexOf('low priority') >= 0) return 'low';
    return 'medium';
  }

  // Detect complexity from content
  function detectComplexity(content) {
    var text = content.toLowerCase();
    var phaseCount = 0;
    var idx = 0;
    while (true) {
      idx = text.indexOf('phase', idx);
      if (idx === -1) break;
      phaseCount++; idx++;
    }
    if (phaseCount >= 4) return 'epic';
    if (phaseCount >= 2) return 'complex';
    var lineCount = content.split('\n').length;
    if (lineCount > 100) return 'complex';
    if (lineCount > 40) return 'moderate';
    if (lineCount > 15) return 'simple';
    return 'trivial';
  }

  // Extract section from markdown
  function extractSection(content, headings) {
    for (var h = 0; h < headings.length; h++) {
      var pattern = headings[h].toLowerCase();
      var lines = content.split('\n');
      var collecting = false;
      var result = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim().toLowerCase();
        if (trimmed.indexOf('## ') === 0 || trimmed.indexOf('# ') === 0) {
          if (collecting) break;
          if (trimmed.indexOf(pattern) >= 0) { collecting = true; continue; }
        }
        if (collecting) result.push(line);
      }
      if (result.length > 0) return result.join('\n').trim();
    }
    return '';
  }

  // Extract tags from content (project names, tech keywords)
  function extractTags(title, content) {
    var tags = ['claude-plan-file'];
    var text = (title + ' ' + content).toLowerCase();
    var keywords = ['mytrend', 'future', 'pocketbase', 'svelte', 'sveltekit', 'react', 'typescript',
      'python', 'docker', 'api', 'database', 'frontend', 'backend', 'trading', 'telegram'];
    for (var k = 0; k < keywords.length; k++) {
      if (text.indexOf(keywords[k]) >= 0) tags.push(keywords[k]);
    }
    return tags;
  }

  // Parse markdown plan file
  function parseMdPlan(filename, content) {
    var lines = content.split('\n');
    var title = filename.replace('.md', '').replace(/-/g, ' ');

    // Extract title from first # heading
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('# ') === 0 && line.indexOf('## ') !== 0) {
        title = line.substring(2).trim();
        // Clean "Plan: " prefix
        if (title.indexOf('Plan: ') === 0) title = title.substring(6);
        if (title.indexOf('Plan - ') === 0) title = title.substring(7);
        break;
      }
    }

    var context = extractSection(content, ['context', 'background', 'overview', 'problem']);
    var reasoning = extractSection(content, ['reasoning', 'why', 'rationale', 'motivation']);
    var alternatives = extractSection(content, ['alternatives', 'rejected', 'other approach', 'considered']);
    var verification = extractSection(content, ['verification', 'verify', 'testing', 'validation']);

    // Content = everything except title line, trimmed
    var contentLines = [];
    var pastTitle = false;
    for (var j = 0; j < lines.length; j++) {
      if (!pastTitle && lines[j].trim().indexOf('# ') === 0 && lines[j].trim().indexOf('## ') !== 0) {
        pastTitle = true; continue;
      }
      if (pastTitle) contentLines.push(lines[j]);
    }
    var planContent = contentLines.join('\n').trim();

    return {
      title: title,
      trigger: context,
      content: planContent,
      reasoning: reasoning,
      alternatives: alternatives,
      plan_type: detectPlanType(title, content),
      priority: detectPriority(content),
      complexity: detectComplexity(content),
      tags: extractTags(title, content),
      verification: verification,
    };
  }

  // Parse YAML plan file (simple line parser, no real YAML engine)
  function parseYamlPlan(filename, content) {
    var lines = content.split('\n');
    var title = filename.replace('.yaml', '').replace(/-/g, ' ');

    // Extract title from first "# Plan:" or "# " comment
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('# Plan:') === 0) {
        title = line.substring(7).trim();
        break;
      }
      if (line.indexOf('# ') === 0 && line.indexOf('##') !== 0) {
        var t = line.substring(2).trim();
        if (t.length > 5 && t.length < 200) {
          title = t;
          if (title.indexOf('Plan: ') === 0) title = title.substring(6);
          if (title.indexOf('Plan - ') === 0) title = title.substring(7);
          break;
        }
      }
    }

    // Extract context from "# Context:" comment
    var context = '';
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].trim().indexOf('# Context:') === 0) {
        context = lines[j].trim().substring(10).trim();
        break;
      }
    }

    return {
      title: title,
      trigger: context,
      content: content,
      reasoning: '',
      alternatives: '',
      plan_type: detectPlanType(title, content),
      priority: detectPriority(content),
      complexity: detectComplexity(content),
      tags: extractTags(title, content),
      verification: '',
    };
  }

  // Match project by content keywords
  function matchProject(dao, userId, title, content) {
    var text = (title + ' ' + content).toLowerCase();
    try {
      var projects = dao.findRecordsByFilter('projects', 'user = {:uid}', '', 0, 0, { uid: userId });
      for (var p = 0; p < projects.length; p++) {
        var pName = projects[p].getString('name').toLowerCase();
        var pSlug = projects[p].getString('slug').toLowerCase();
        if (pName && text.indexOf(pName) >= 0) return projects[p].getId();
        if (pSlug && text.indexOf(pSlug) >= 0) return projects[p].getId();
      }
    } catch (e) {}
    return null;
  }

  var dao = $app.dao();
  var result = { files_found: 0, imported: 0, updated: 0, skipped: 0, errors: [] };
  var plansDir = '/pb/import/claude/plans';

  try {
    var files = $os.readDir(plansDir);

    for (var fi = 0; fi < files.length; fi++) {
      if (files[fi].isDir()) continue;
      var fname = files[fi].name();
      if (fname.indexOf('.md') < 0 && fname.indexOf('.yaml') < 0 && fname.indexOf('.yml') < 0) continue;
      result.files_found++;

      // Slug = filename without extension (unique identifier)
      var slug = fname.replace('.yaml', '').replace('.yml', '').replace('.md', '');

      // Dedup check by slug
      var existing = null;
      try { existing = dao.findFirstRecordByFilter('plans', 'slug = {:slug}', { slug: slug }); } catch (e) {}

      if (existing && !forceReimport) {
        result.skipped++;
        continue;
      }

      // Read file
      var fileContent;
      try {
        fileContent = b2s($os.readFile(plansDir + '/' + fname));
      } catch (e) {
        result.errors.push(fname + ': read error - ' + e);
        continue;
      }

      if (!fileContent || fileContent.trim().length < 10) {
        result.skipped++;
        continue;
      }

      // Parse based on extension
      var parsed;
      if (fname.indexOf('.yaml') >= 0 || fname.indexOf('.yml') >= 0) {
        parsed = parseYamlPlan(fname, fileContent);
      } else {
        parsed = parseMdPlan(fname, fileContent);
      }

      if (!parsed.title || parsed.title.length < 3) {
        parsed.title = slug.replace(/-/g, ' ');
      }
      if (parsed.title.length > 200) parsed.title = parsed.title.substring(0, 197) + '...';

      // Match project
      var projectId = matchProject(dao, userId, parsed.title, parsed.content);

      try {
        var record;
        if (existing && forceReimport) {
          record = existing;
          result.updated++;
        } else {
          var col = dao.findCollectionByNameOrId('plans');
          record = new Record(col);
          result.imported++;
        }

        record.set('user', userId);
        record.set('title', parsed.title);
        record.set('slug', slug);
        record.set('plan_type', parsed.plan_type);
        record.set('status', 'draft');
        record.set('priority', parsed.priority);
        record.set('complexity', parsed.complexity);
        record.set('trigger', parsed.trigger);
        record.set('content', parsed.content);
        record.set('reasoning', parsed.reasoning);
        record.set('alternatives', parsed.alternatives);
        record.set('tags', JSON.stringify(parsed.tags));
        record.set('extraction_source', 'claude_plan_file');
        record.set('extraction_confidence', 0.95);
        record.set('signal_phrase', 'file:' + fname);
        record.set('source_conversations', JSON.stringify([]));
        record.set('source_ideas', JSON.stringify([]));
        record.set('stage_history', JSON.stringify([
          { from: 'none', to: 'draft', timestamp: new Date().toISOString(), note: 'Imported from Claude plan file: ' + fname }
        ]));
        if (projectId) record.set('project', projectId);

        dao.saveRecord(record);
        console.log('[PlanSync] ' + (existing ? 'Updated' : 'Imported') + ': ' + fname + ' -> "' + parsed.title + '" (' + parsed.plan_type + ')');
      } catch (err) {
        var es = String(err);
        if (es.indexOf('UNIQUE') >= 0 || es.indexOf('duplicate') >= 0) { result.skipped++; }
        else { result.errors.push(fname + ': ' + es.substring(0, 150)); }
      }
    }
  } catch (e) {
    console.log('[PlanSync] Cannot read plans dir: ' + e);
    result.errors.push('Cannot read ' + plansDir + ': ' + e);
  }

  console.log('[PlanSync] Done. Imported: ' + result.imported + ', Updated: ' + result.updated + ', Skipped: ' + result.skipped);
  return c.json(200, result);
});

// ---------------------------------------------------------------------------
// GET /api/mytrend/sync-plans/status
// Show what plan files exist and their import status
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/mytrend/sync-plans/status', (c) => {
  var authRecord = c.get('authRecord');
  if (!authRecord) return c.json(401, { error: 'Authentication required' });

  var dao = $app.dao();
  var plansDir = '/pb/import/claude/plans';
  var files = [];

  try {
    var dirFiles = $os.readDir(plansDir);
    for (var i = 0; i < dirFiles.length; i++) {
      if (dirFiles[i].isDir()) continue;
      var fname = dirFiles[i].name();
      if (fname.indexOf('.md') < 0 && fname.indexOf('.yaml') < 0 && fname.indexOf('.yml') < 0) continue;

      var slug = fname.replace('.yaml', '').replace('.yml', '').replace('.md', '');
      var imported = false;
      var planId = '';
      try {
        var rec = dao.findFirstRecordByFilter('plans', 'slug = {:slug}', { slug: slug });
        imported = true;
        planId = rec.getId();
      } catch (e) {}

      files.push({ filename: fname, slug: slug, imported: imported, plan_id: planId });
    }
  } catch (e) {
    return c.json(500, { error: 'Cannot read plans directory: ' + e });
  }

  var importedCount = 0;
  for (var j = 0; j < files.length; j++) { if (files[j].imported) importedCount++; }

  return c.json(200, {
    total_files: files.length,
    imported: importedCount,
    pending: files.length - importedCount,
    files: files,
  });
});

// ---------------------------------------------------------------------------
// Cron: Auto-sync plan files every 30 minutes
// ---------------------------------------------------------------------------
try {
  cronAdd('plan_file_sync', '*/30 * * * *', function() {
    console.log('[PlanSync] Cron triggered');

    // UTF-8 byte-array to string decoder (inline - isolated scope)
    function b2s(raw) {
      var s = '';
      var buf = [];
      var i = 0;
      var len = raw.length;
      while (i < len) {
        var b = raw[i];
        var cp;
        if (b < 0x80) {
          cp = b; i++;
        } else if ((b & 0xE0) === 0xC0) {
          if (i + 1 >= len) break;
          cp = ((b & 0x1F) << 6) | (raw[i + 1] & 0x3F); i += 2;
        } else if ((b & 0xF0) === 0xE0) {
          if (i + 2 >= len) break;
          cp = ((b & 0x0F) << 12) | ((raw[i + 1] & 0x3F) << 6) | (raw[i + 2] & 0x3F); i += 3;
        } else if ((b & 0xF8) === 0xF0) {
          if (i + 3 >= len) break;
          cp = ((b & 0x07) << 18) | ((raw[i + 1] & 0x3F) << 12) | ((raw[i + 2] & 0x3F) << 6) | (raw[i + 3] & 0x3F); i += 4;
        } else { i++; continue; }
        if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 + (cp >> 10)); buf.push(0xDC00 + (cp & 0x3FF)); } else { buf.push(cp); }
        if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
      }
      if (buf.length > 0) s += String.fromCharCode.apply(null, buf);
      return s;
    }

    function detectPlanType(title, content) {
      var text = (title + ' ' + content).toLowerCase();
      if (text.indexOf('bug') >= 0 || text.indexOf('fix') >= 0 || text.indexOf('error') >= 0) return 'bugfix';
      if (text.indexOf('refactor') >= 0 || text.indexOf('cleanup') >= 0) return 'refactor';
      if (text.indexOf('design') >= 0 || text.indexOf('ui') >= 0 || text.indexOf('ux') >= 0) return 'design';
      if (text.indexOf('architect') >= 0 || text.indexOf('system design') >= 0) return 'architecture';
      if (text.indexOf('migrat') >= 0 || text.indexOf('upgrade') >= 0) return 'migration';
      if (text.indexOf('investigat') >= 0 || text.indexOf('research') >= 0 || text.indexOf('audit') >= 0) return 'investigation';
      return 'implementation';
    }

    function detectPriority(content) {
      var text = content.toLowerCase();
      if (text.indexOf('critical') >= 0 || text.indexOf('urgent') >= 0) return 'critical';
      if (text.indexOf('[high]') >= 0 || text.indexOf('high priority') >= 0) return 'high';
      if (text.indexOf('[low]') >= 0) return 'low';
      return 'medium';
    }

    function detectComplexity(content) {
      var text = content.toLowerCase();
      var pc = 0; var idx = 0;
      while (true) { idx = text.indexOf('phase', idx); if (idx === -1) break; pc++; idx++; }
      if (pc >= 4) return 'epic';
      if (pc >= 2) return 'complex';
      var lc = content.split('\n').length;
      if (lc > 100) return 'complex';
      if (lc > 40) return 'moderate';
      if (lc > 15) return 'simple';
      return 'trivial';
    }

    function extractSection(content, headings) {
      for (var h = 0; h < headings.length; h++) {
        var pattern = headings[h].toLowerCase();
        var lines = content.split('\n');
        var collecting = false;
        var result = [];
        for (var i = 0; i < lines.length; i++) {
          var trimmed = lines[i].trim().toLowerCase();
          if (trimmed.indexOf('## ') === 0 || trimmed.indexOf('# ') === 0) {
            if (collecting) break;
            if (trimmed.indexOf(pattern) >= 0) { collecting = true; continue; }
          }
          if (collecting) result.push(lines[i]);
        }
        if (result.length > 0) return result.join('\n').trim();
      }
      return '';
    }

    function extractTags(title, content) {
      var tags = ['claude-plan-file'];
      var text = (title + ' ' + content).toLowerCase();
      var kw = ['mytrend', 'future', 'pocketbase', 'svelte', 'react', 'typescript', 'python', 'docker', 'trading', 'telegram'];
      for (var k = 0; k < kw.length; k++) { if (text.indexOf(kw[k]) >= 0) tags.push(kw[k]); }
      return tags;
    }

    var dao = $app.dao();
    var uid = $os.getenv('MYTREND_SYNC_USER_ID') || null;
    if (!uid) { try { var u = dao.findRecordsByFilter('users', '1=1', '', 1, 0); if (u && u.length > 0) uid = u[0].getId(); } catch(e){} }
    if (!uid) { console.log('[PlanSync] Cron: no user'); return; }

    var plansDir = '/pb/import/claude/plans';
    var imp = 0;

    try {
      var files = $os.readDir(plansDir);
      for (var fi = 0; fi < files.length; fi++) {
        if (files[fi].isDir()) continue;
        var fname = files[fi].name();
        if (fname.indexOf('.md') < 0 && fname.indexOf('.yaml') < 0 && fname.indexOf('.yml') < 0) continue;

        var slug = fname.replace('.yaml', '').replace('.yml', '').replace('.md', '');

        // Dedup - skip if already imported
        try { dao.findFirstRecordByFilter('plans', 'slug = {:slug}', { slug: slug }); continue; } catch(e) {}

        var fileContent;
        try { fileContent = b2s($os.readFile(plansDir + '/' + fname)); } catch(e) { continue; }
        if (!fileContent || fileContent.trim().length < 10) continue;

        // Parse title
        var title = slug.replace(/-/g, ' ');
        var lines = fileContent.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('# ') === 0 && line.indexOf('## ') !== 0) {
            title = line.substring(2).trim();
            if (title.indexOf('Plan: ') === 0) title = title.substring(6);
            if (title.indexOf('Plan - ') === 0) title = title.substring(7);
            break;
          }
        }
        if (title.length > 200) title = title.substring(0, 197) + '...';

        var context = extractSection(fileContent, ['context', 'background', 'overview']);
        var reasoning = extractSection(fileContent, ['reasoning', 'why', 'rationale']);
        var alternatives = extractSection(fileContent, ['alternatives', 'rejected']);
        var tags = extractTags(title, fileContent);

        // Content = everything after title
        var contentLines = [];
        var pastTitle = false;
        for (var j = 0; j < lines.length; j++) {
          if (!pastTitle && lines[j].trim().indexOf('# ') === 0 && lines[j].trim().indexOf('## ') !== 0) { pastTitle = true; continue; }
          if (pastTitle) contentLines.push(lines[j]);
        }
        var planContent = contentLines.join('\n').trim();
        if (!planContent) planContent = fileContent;

        // Match project
        var projectId = null;
        try {
          var projects = dao.findRecordsByFilter('projects', 'user = {:uid}', '', 0, 0, { uid: uid });
          var text = (title + ' ' + fileContent).toLowerCase();
          for (var p = 0; p < projects.length; p++) {
            var pn = projects[p].getString('name').toLowerCase();
            if (pn && text.indexOf(pn) >= 0) { projectId = projects[p].getId(); break; }
          }
        } catch(e) {}

        try {
          var col = dao.findCollectionByNameOrId('plans');
          var r = new Record(col);
          r.set('user', uid);
          r.set('title', title);
          r.set('slug', slug);
          r.set('plan_type', detectPlanType(title, fileContent));
          r.set('status', 'draft');
          r.set('priority', detectPriority(fileContent));
          r.set('complexity', detectComplexity(fileContent));
          r.set('trigger', context);
          r.set('content', planContent);
          r.set('reasoning', reasoning);
          r.set('alternatives', alternatives);
          r.set('tags', JSON.stringify(tags));
          r.set('extraction_source', 'claude_plan_file');
          r.set('extraction_confidence', 0.95);
          r.set('signal_phrase', 'file:' + fname);
          r.set('source_conversations', JSON.stringify([]));
          r.set('source_ideas', JSON.stringify([]));
          r.set('stage_history', JSON.stringify([
            { from: 'none', to: 'draft', timestamp: new Date().toISOString(), note: 'Auto-imported from Claude plan file: ' + fname }
          ]));
          if (projectId) r.set('project', projectId);
          dao.saveRecord(r);
          imp++;
          console.log('[PlanSync] Cron imported: ' + fname + ' -> "' + title + '"');
        } catch(err) {}
      }
    } catch(e) {
      console.log('[PlanSync] Cron error: ' + e);
    }
    console.log('[PlanSync] Cron done. Imported: ' + imp);
  });
  console.log('[PlanSync] Cron registered: */30 * * * *');
} catch (e) {
  console.log('[PlanSync] cronAdd not available: ' + e);
}
