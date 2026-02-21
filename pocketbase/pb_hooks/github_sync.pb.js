/// <reference path="../pb_data/types.d.ts" />

// MyTrend - GitHub Activity Sync
// POST /api/mytrend/github-sync   - Manual trigger
// Cron: every 30 minutes
//
// Fetches commits, PRs, issues from GitHub API for projects with github_repo set.
// Stores them as activity records (type: commit, pr, issue).
// Requires GITHUB_PAT environment variable.
//
// Each routerAdd/cronAdd callback has isolated scope - inline all helpers.

// ---------------------------------------------------------------------------
// POST /api/mytrend/github-sync
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/mytrend/github-sync', function(c) {
  var authRecord = c.get('authRecord');
  var admin = c.get('admin');
  if (!authRecord && !admin) return c.json(401, { error: 'Authentication required' });

  var userId = '';
  if (authRecord) {
    userId = authRecord.getId();
  } else {
    var qUserId = c.queryParam('userId');
    if (qUserId) {
      userId = qUserId;
    } else {
      try {
        var users = $app.dao().findRecordsByFilter('users', '', '-created', 1, 0);
        if (users.length > 0) userId = users[0].getId();
      } catch(e) { /* no users */ }
    }
  }

  if (!userId) return c.json(400, { error: 'No user found' });

  // Read GitHub PAT from environment
  var githubPat = $os.getenv('GITHUB_PAT');
  if (!githubPat) {
    return c.json(400, { error: 'GITHUB_PAT environment variable not set' });
  }

  var dao = $app.dao();
  var results = { synced: [], errors: [], skipped: [] };

  // Find all projects with github_repo set
  var projects = [];
  try {
    projects = dao.findRecordsByFilter(
      'projects',
      'user = {:uid} && github_repo != ""',
      '-updated',
      50,
      0,
      { uid: userId }
    );
  } catch(e) {
    return c.json(200, { message: 'No projects with github_repo configured', results: results });
  }

  for (var i = 0; i < projects.length; i++) {
    var proj = projects[i];
    var repo = proj.getString('github_repo'); // format: owner/repo
    var projectId = proj.getId();
    var projectName = proj.getString('name');

    if (!repo || repo.indexOf('/') < 0) {
      results.skipped.push({ project: projectName, reason: 'invalid github_repo format' });
      continue;
    }

    try {
      // Determine since date (last synced or 7 days ago)
      var lastSynced = proj.getString('github_last_synced');
      var sinceDate = '';
      if (lastSynced) {
        sinceDate = lastSynced;
      } else {
        var d = new Date();
        d.setDate(d.getDate() - 7);
        sinceDate = d.toISOString();
      }

      var headers = {
        'Authorization': 'Bearer ' + githubPat,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'MyTrend-GitHub-Sync',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      var created = 0;
      var skippedDupes = 0;

      // --- Fetch Commits ---
      try {
        var commitsUrl = 'https://api.github.com/repos/' + repo + '/commits?since=' + sinceDate + '&per_page=30';
        var commitsRes = $http.send({ method: 'GET', url: commitsUrl, headers: headers, timeout: 15000 });
        if (commitsRes.statusCode === 200 && commitsRes.json) {
          var commits = commitsRes.json;
          for (var ci = 0; ci < commits.length; ci++) {
            var commit = commits[ci];
            var sha = commit.sha || '';
            var msg = (commit.commit && commit.commit.message) ? commit.commit.message.split('\n')[0] : '';
            var authorName = (commit.commit && commit.commit.author) ? commit.commit.author.name : '';
            var commitDate = (commit.commit && commit.commit.author) ? commit.commit.author.date : new Date().toISOString();

            // Dedup by metadata.commit_hash
            try {
              dao.findFirstRecordByFilter('activities', 'user = {:uid} && type = "commit" && metadata ~ {:sha}', { uid: userId, sha: sha.substring(0, 12) });
              skippedDupes++;
              continue;
            } catch(e) { /* not found, create */ }

            var col = dao.findCollectionByNameOrId('activities');
            var rec = new Record(col);
            rec.set('user', userId);
            rec.set('project', projectId);
            rec.set('type', 'commit');
            rec.set('action', msg.substring(0, 300) || 'Git commit');
            rec.set('device_name', 'github');
            rec.set('metadata', JSON.stringify({
              source: 'github',
              commit_hash: sha,
              author: authorName,
              repo: repo,
              url: commit.html_url || '',
            }));
            rec.set('timestamp', commitDate);
            rec.set('duration_sec', 0);
            dao.saveRecord(rec);
            created++;
          }
        }
      } catch(ce) {
        results.errors.push({ project: projectName, type: 'commits', error: String(ce) });
      }

      // --- Fetch Recent PRs ---
      try {
        var prsUrl = 'https://api.github.com/repos/' + repo + '/pulls?state=all&sort=updated&direction=desc&per_page=10';
        var prsRes = $http.send({ method: 'GET', url: prsUrl, headers: headers, timeout: 15000 });
        if (prsRes.statusCode === 200 && prsRes.json) {
          var prs = prsRes.json;
          for (var pi = 0; pi < prs.length; pi++) {
            var pr = prs[pi];
            var prNum = pr.number || 0;
            var prTitle = pr.title || '';
            var prState = pr.state || 'open';
            var prDate = pr.updated_at || pr.created_at || new Date().toISOString();
            var prKey = 'pr-' + prNum;

            // Dedup
            try {
              dao.findFirstRecordByFilter('activities', 'user = {:uid} && type = "pr" && metadata ~ {:key}', { uid: userId, key: prKey });
              skippedDupes++;
              continue;
            } catch(e) { /* create */ }

            var prCol = dao.findCollectionByNameOrId('activities');
            var prRec = new Record(prCol);
            prRec.set('user', userId);
            prRec.set('project', projectId);
            prRec.set('type', 'pr');
            prRec.set('action', 'PR #' + prNum + ': ' + prTitle.substring(0, 250));
            prRec.set('device_name', 'github');
            prRec.set('metadata', JSON.stringify({
              source: 'github',
              pr_number: prNum,
              pr_key: prKey,
              state: prState,
              repo: repo,
              url: pr.html_url || '',
              merged: pr.merged_at ? true : false,
            }));
            prRec.set('timestamp', prDate);
            prRec.set('duration_sec', 0);
            dao.saveRecord(prRec);
            created++;
          }
        }
      } catch(pe) {
        results.errors.push({ project: projectName, type: 'prs', error: String(pe) });
      }

      // --- Fetch Recent Issues ---
      try {
        var issuesUrl = 'https://api.github.com/repos/' + repo + '/issues?state=all&sort=updated&direction=desc&per_page=10&since=' + sinceDate;
        var issuesRes = $http.send({ method: 'GET', url: issuesUrl, headers: headers, timeout: 15000 });
        if (issuesRes.statusCode === 200 && issuesRes.json) {
          var issues = issuesRes.json;
          for (var ii = 0; ii < issues.length; ii++) {
            var issue = issues[ii];
            // Skip PRs (GitHub API returns PRs in issues endpoint)
            if (issue.pull_request) continue;

            var issNum = issue.number || 0;
            var issTitle = issue.title || '';
            var issState = issue.state || 'open';
            var issDate = issue.updated_at || issue.created_at || new Date().toISOString();
            var issKey = 'issue-' + issNum;

            // Dedup
            try {
              dao.findFirstRecordByFilter('activities', 'user = {:uid} && type = "issue" && metadata ~ {:key}', { uid: userId, key: issKey });
              skippedDupes++;
              continue;
            } catch(e) { /* create */ }

            var issCol = dao.findCollectionByNameOrId('activities');
            var issRec = new Record(issCol);
            issRec.set('user', userId);
            issRec.set('project', projectId);
            issRec.set('type', 'issue');
            issRec.set('action', 'Issue #' + issNum + ': ' + issTitle.substring(0, 250));
            issRec.set('device_name', 'github');
            issRec.set('metadata', JSON.stringify({
              source: 'github',
              issue_number: issNum,
              issue_key: issKey,
              state: issState,
              repo: repo,
              url: issue.html_url || '',
              labels: (issue.labels || []).map(function(l) { return l.name; }),
            }));
            issRec.set('timestamp', issDate);
            issRec.set('duration_sec', 0);
            dao.saveRecord(issRec);
            created++;
          }
        }
      } catch(ie) {
        results.errors.push({ project: projectName, type: 'issues', error: String(ie) });
      }

      // Update github_last_synced
      proj.set('github_last_synced', new Date().toISOString());
      dao.saveRecord(proj);

      results.synced.push({
        project: projectName,
        repo: repo,
        created: created,
        skipped_dupes: skippedDupes,
      });

    } catch(projErr) {
      results.errors.push({ project: projectName, error: String(projErr) });
    }
  }

  return c.json(200, results);
});

// ---------------------------------------------------------------------------
// Cron: GitHub sync every 30 minutes
// ---------------------------------------------------------------------------
try {
  cronAdd('github_sync', '*/30 * * * *', function() {
    console.log('[GitHubSync] Cron triggered');

    var githubPat = $os.getenv('GITHUB_PAT');
    if (!githubPat) {
      console.log('[GitHubSync] GITHUB_PAT not set, skipping');
      return;
    }

    var dao = $app.dao();

    // Find first user
    var userId = '';
    try {
      var users = dao.findRecordsByFilter('users', '', '-created', 1, 0);
      if (users.length > 0) userId = users[0].getId();
    } catch(e) { return; }
    if (!userId) return;

    // Find projects with github_repo
    var projects = [];
    try {
      projects = dao.findRecordsByFilter(
        'projects',
        'user = {:uid} && github_repo != ""',
        '-updated', 50, 0,
        { uid: userId }
      );
    } catch(e) { return; }

    if (projects.length === 0) {
      console.log('[GitHubSync] No projects with github_repo');
      return;
    }

    var headers = {
      'Authorization': 'Bearer ' + githubPat,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'MyTrend-GitHub-Sync',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    var totalCreated = 0;

    for (var i = 0; i < projects.length; i++) {
      var proj = projects[i];
      var repo = proj.getString('github_repo');
      var projectId = proj.getId();
      if (!repo || repo.indexOf('/') < 0) continue;

      var lastSynced = proj.getString('github_last_synced');
      var sinceDate = '';
      if (lastSynced) {
        sinceDate = lastSynced;
      } else {
        var d = new Date();
        d.setDate(d.getDate() - 7);
        sinceDate = d.toISOString();
      }

      // Fetch commits only in cron (lighter)
      try {
        var url = 'https://api.github.com/repos/' + repo + '/commits?since=' + sinceDate + '&per_page=15';
        var res = $http.send({ method: 'GET', url: url, headers: headers, timeout: 15000 });
        if (res.statusCode === 200 && res.json) {
          for (var ci = 0; ci < res.json.length; ci++) {
            var commit = res.json[ci];
            var sha = commit.sha || '';
            try {
              dao.findFirstRecordByFilter('activities', 'user = {:uid} && type = "commit" && metadata ~ {:sha}', { uid: userId, sha: sha.substring(0, 12) });
              continue; // already exists
            } catch(e) { /* create */ }

            var msg = (commit.commit && commit.commit.message) ? commit.commit.message.split('\n')[0] : '';
            var authorName = (commit.commit && commit.commit.author) ? commit.commit.author.name : '';
            var commitDate = (commit.commit && commit.commit.author) ? commit.commit.author.date : new Date().toISOString();

            var col = dao.findCollectionByNameOrId('activities');
            var rec = new Record(col);
            rec.set('user', userId);
            rec.set('project', projectId);
            rec.set('type', 'commit');
            rec.set('action', msg.substring(0, 300) || 'Git commit');
            rec.set('device_name', 'github');
            rec.set('metadata', JSON.stringify({
              source: 'github',
              commit_hash: sha,
              author: authorName,
              repo: repo,
              url: commit.html_url || '',
            }));
            rec.set('timestamp', commitDate);
            rec.set('duration_sec', 0);
            dao.saveRecord(rec);
            totalCreated++;
          }
        }
      } catch(e) {
        console.log('[GitHubSync] Error fetching commits for ' + repo + ': ' + e);
      }

      // Update last synced
      try {
        proj.set('github_last_synced', new Date().toISOString());
        dao.saveRecord(proj);
      } catch(e) { /* ignore */ }
    }

    console.log('[GitHubSync] Cron done: ' + totalCreated + ' new activities from ' + projects.length + ' projects');
  });
} catch(e) {
  console.log('[GitHubSync] cronAdd not available: ' + e);
}

console.log('[GitHubSync] Registered: POST /api/mytrend/github-sync, cron');
