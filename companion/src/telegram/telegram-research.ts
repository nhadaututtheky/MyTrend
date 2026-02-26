// Research Knowledge Graph — URL Auto-Capture Module
// Detects URLs in Telegram messages, fetches metadata, AI analysis, saves to PB + NM.
// AI analysis uses Claude Code CLI (--print one-shot mode) — same subscription as Vibe Terminal.

// ─── Types ──────────────────────────────────────────────────────────────────

export type DetectedSource = "github" | "npm" | "blog" | "docs" | "other";

export interface DetectedUrl {
  url: string;
  source: DetectedSource;
  githubOwner?: string;
  githubRepo?: string;
  npmPackage?: string;
}

export interface RawMetadata {
  title: string;
  description: string;
  stars: number;
  npmDownloads: number;
  topics: string[];
  language: string;
  raw: Record<string, unknown>;
}

export interface AIAnalysis {
  summary: string;
  techTags: string[];
  patternsExtracted: string[];
  applicableProjects: string[];
  verdict: "fit" | "partial" | "concept-only" | "irrelevant";
}

export interface ResearchRecord {
  url: string;
  source: DetectedSource;
  title: string;
  description: string;
  stars: number;
  npm_downloads: number;
  tech_tags: string[];
  patterns_extracted: string[];
  applicable_projects: string[];
  verdict: string;
  ai_summary: string;
  user_comment: string;
  raw_metadata: Record<string, unknown>;
  processed_at: string;
}

export interface KnownProject {
  slug: string;
  name: string;
  dir: string;
}

// ─── URL Detection ──────────────────────────────────────────────────────────

const GITHUB_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/gi;
const NPM_RE = /https?:\/\/(?:www\.)?npmjs\.com\/package\/((?:@[\w.-]+\/)?[\w.-]+)/gi;
const DOCS_RE = /https?:\/\/(?:docs\.|documentation\.)\S+/gi;
const GENERIC_URL_RE = /https?:\/\/[^\s<>"']+/gi;

// Skip these domains — not useful for research indexing
const SKIP_DOMAINS = ["t.me", "telegram.org", "youtu.be", "youtube.com", "twitter.com", "x.com"];

export function detectUrls(text: string): DetectedUrl[] {
  const results: DetectedUrl[] = [];
  const seen = new Set<string>();

  // GitHub repos
  for (const match of text.matchAll(GITHUB_RE)) {
    const url = match[0].replace(/[.)]+$/, ""); // trim trailing punctuation
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      source: "github",
      githubOwner: match[1],
      githubRepo: match[2],
    });
  }

  // npm packages
  for (const match of text.matchAll(NPM_RE)) {
    const url = match[0].replace(/[.)]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      source: "npm",
      npmPackage: match[1],
    });
  }

  // Docs sites
  for (const match of text.matchAll(DOCS_RE)) {
    const url = match[0].replace(/[.)]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ url, source: "docs" });
  }

  // Generic URLs (blogs, articles) — only if not already captured
  for (const match of text.matchAll(GENERIC_URL_RE)) {
    const url = match[0].replace(/[.)]+$/, "");
    if (seen.has(url)) continue;

    // Skip known non-research domains
    try {
      const hostname = new URL(url).hostname;
      if (SKIP_DOMAINS.some((d) => hostname.includes(d))) continue;
      // Skip if already captured as github/npm
      if (hostname.includes("github.com") || hostname.includes("npmjs.com")) continue;
    } catch {
      continue; // invalid URL
    }

    seen.add(url);
    results.push({ url, source: "blog" });
  }

  return results;
}

// ─── Metadata Fetching ──────────────────────────────────────────────────────

const FETCH_TIMEOUT = 8_000;

async function fetchGithubMetadata(owner: string, repo: string): Promise<RawMetadata> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "MyTrend-Research/1.0",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;

  return {
    title: (data.full_name as string) || `${owner}/${repo}`,
    description: (data.description as string) || "",
    stars: (data.stargazers_count as number) || 0,
    npmDownloads: 0,
    topics: (data.topics as string[]) || [],
    language: (data.language as string) || "",
    raw: data,
  };
}

async function fetchNpmMetadata(pkg: string): Promise<RawMetadata> {
  const [pkgRes, dlRes] = await Promise.allSettled([
    fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }),
    fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }),
  ]);

  let title = pkg;
  let description = "";
  let keywords: string[] = [];
  let raw: Record<string, unknown> = {};

  if (pkgRes.status === "fulfilled" && pkgRes.value.ok) {
    const data = (await pkgRes.value.json()) as Record<string, unknown>;
    title = (data.name as string) || pkg;
    description = (data.description as string) || "";
    keywords = (data.keywords as string[]) || [];
    raw = data;
  }

  let downloads = 0;
  if (dlRes.status === "fulfilled" && dlRes.value.ok) {
    const dlData = (await dlRes.value.json()) as Record<string, unknown>;
    downloads = (dlData.downloads as number) || 0;
  }

  return {
    title,
    description,
    stars: 0,
    npmDownloads: downloads,
    topics: keywords,
    language: "",
    raw,
  };
}

async function fetchGenericMetadata(url: string): Promise<RawMetadata> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MyTrend-Research/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Only parse HTML responses (first 16KB)
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return {
      title: new URL(url).hostname,
      description: "",
      stars: 0,
      npmDownloads: 0,
      topics: [],
      language: "",
      raw: { url, contentType },
    };
  }

  const text = await res.text();
  const head = text.slice(0, 16_000);

  // Parse <title>
  const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
    : new URL(url).hostname;

  // Parse <meta name="description">
  const descMatch = head.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const description = descMatch ? descMatch[1].replace(/&amp;/g, "&").trim() : "";

  return {
    title,
    description,
    stars: 0,
    npmDownloads: 0,
    topics: [],
    language: "",
    raw: { url },
  };
}

export async function fetchMetadata(detected: DetectedUrl): Promise<RawMetadata> {
  try {
    if (detected.source === "github" && detected.githubOwner && detected.githubRepo) {
      return await fetchGithubMetadata(detected.githubOwner, detected.githubRepo);
    }
    if (detected.source === "npm" && detected.npmPackage) {
      return await fetchNpmMetadata(detected.npmPackage);
    }
    return await fetchGenericMetadata(detected.url);
  } catch (err) {
    console.error(`[research] Metadata fetch failed for ${detected.url}:`, err);
    // Fallback: return minimal metadata
    return {
      title: detected.url,
      description: "",
      stars: 0,
      npmDownloads: 0,
      topics: [],
      language: "",
      raw: { error: String(err) },
    };
  }
}

// ─── AI Analysis (via Claude Code CLI — subscription, no API key) ───────────

/** Resolve the Claude CLI executable path (same logic as cli-launcher.ts). */
async function getClaudeCommand(): Promise<string[]> {
  if (process.platform === "win32") {
    const npmPrefix = process.env.APPDATA ? `${process.env.APPDATA}\\npm` : "";
    const cliScript = `${npmPrefix}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`;
    const { existsSync } = await import("node:fs");
    if (existsSync(cliScript)) return ["node", cliScript];
    return ["claude.cmd"];
  }
  return ["claude"];
}

/** Build clean env without nested Claude Code vars (same as cli-launcher). */
function buildCleanEnv(): Record<string, string> {
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    if (v !== undefined) cleanEnv[k] = v;
  }
  cleanEnv.HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return cleanEnv;
}

export async function analyzeWithClaude(
  detected: DetectedUrl,
  metadata: RawMetadata,
  userComment: string,
  knownProjects: KnownProject[],
): Promise<AIAnalysis> {
  const projectList = knownProjects
    .map((p) => `- ${p.name} (${p.slug}): ${p.dir}`)
    .join("\n");

  const prompt = `Analyze this ${detected.source} resource for a developer's personal knowledge base.

URL: ${detected.url}
Title: ${metadata.title}
Description: ${metadata.description}
${metadata.stars > 0 ? `Stars: ${metadata.stars}` : ""}
${metadata.npmDownloads > 0 ? `Weekly downloads: ${metadata.npmDownloads}` : ""}
${metadata.topics.length > 0 ? `Topics: ${metadata.topics.join(", ")}` : ""}
${metadata.language ? `Language: ${metadata.language}` : ""}
${userComment ? `User comment: ${userComment}` : ""}

Known projects:
${projectList}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence summary of what this is and why it's useful",
  "tech_tags": ["max 5 technology/framework tags"],
  "patterns_extracted": ["max 3 design patterns or techniques this demonstrates"],
  "applicable_projects": ["project slugs from the list above that could benefit"],
  "verdict": "fit|partial|concept-only|irrelevant"
}

Verdict guide:
- fit: directly usable in one or more projects
- partial: some parts applicable, needs adaptation
- concept-only: interesting concept but not directly usable
- irrelevant: not relevant to any known project`;

  try {
    const cmd = await getClaudeCommand();
    const args = [
      ...cmd,
      "--print",
      "--model", "haiku",
      "--permission-mode", "bypassPermissions",
      "-p", prompt,
    ];

    console.log(`[research] Spawning Claude CLI for analysis: ${cmd[0]}...`);

    const proc = Bun.spawn(args, {
      cwd: process.env.PROJECT_DIR || "D:\\Project\\MyTrend",
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: buildCleanEnv(),
    });

    // Consume stdout/stderr concurrently with process execution to avoid pipe drain race
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();

    // Wait for completion with 90s timeout (CLI cold start on Windows is slow)
    const timeoutId = setTimeout(() => proc.kill(), 90_000);
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    const [text, stderrText] = await Promise.all([stdoutPromise, stderrPromise]);

    if (exitCode !== 0) {
      console.error(`[research] CLI exited ${exitCode}: ${stderrText.slice(0, 200)}`);
      return fallbackAnalysis(detected, metadata);
    }

    // Extract JSON object — Claude may wrap in markdown fences or add preamble
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[research] No JSON found in CLI output: ${text.slice(0, 200)}`);
      return fallbackAnalysis(detected, metadata);
    }
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const validVerdicts = ["fit", "partial", "concept-only", "irrelevant"];
    const verdict = validVerdicts.includes(parsed.verdict as string)
      ? (parsed.verdict as AIAnalysis["verdict"])
      : "partial";

    return {
      summary: String(parsed.summary || "").slice(0, 500),
      techTags: (Array.isArray(parsed.tech_tags) ? parsed.tech_tags : [])
        .map(String)
        .slice(0, 5),
      patternsExtracted: (
        Array.isArray(parsed.patterns_extracted) ? parsed.patterns_extracted : []
      )
        .map(String)
        .slice(0, 3),
      applicableProjects: (
        Array.isArray(parsed.applicable_projects) ? parsed.applicable_projects : []
      )
        .map(String)
        .slice(0, 5),
      verdict,
    };
  } catch (err) {
    console.error("[research] Claude CLI analysis failed:", err);
    return fallbackAnalysis(detected, metadata);
  }
}

function fallbackAnalysis(detected: DetectedUrl, metadata: RawMetadata): AIAnalysis {
  return {
    summary: metadata.description || `${detected.source} resource: ${metadata.title}`,
    techTags: metadata.topics.slice(0, 5),
    patternsExtracted: [],
    applicableProjects: [],
    verdict: "partial",
  };
}

// ─── PocketBase Save ────────────────────────────────────────────────────────

const PB_URL = process.env.PB_URL || process.env.POCKETBASE_URL || "http://localhost:8090";
const INTERNAL_SECRET = process.env.COMPANION_INTERNAL_SECRET || "";

export async function checkExistingResearch(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${PB_URL}/api/mytrend/research/internal/check?url=${encodeURIComponent(url)}`,
      {
        headers: { "X-Internal-Secret": INTERNAL_SECRET },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string | null };
    return data.id;
  } catch {
    return null;
  }
}

export async function saveResearchToPB(
  userId: string,
  record: ResearchRecord,
): Promise<string | null> {
  try {
    const res = await fetch(`${PB_URL}/api/mytrend/research/internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ userId, ...record }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[research] PB save failed: ${res.status} — ${errBody.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as { id: string; action: string };
    if (data.action === "exists") {
      console.log(`[research] URL already indexed: ${record.url}`);
    }
    return data.id;
  } catch (err) {
    console.error("[research] PB save error:", err);
    return null;
  }
}

// ─── Neural Memory Save ─────────────────────────────────────────────────────

const NM_URL = process.env.NM_URL || "http://localhost:8001";

export async function saveToNeuralMemory(
  record: ResearchRecord,
  analysis: AIAnalysis,
): Promise<void> {
  const priorityMap: Record<string, number> = {
    fit: 8,
    partial: 5,
    "concept-only": 3,
    irrelevant: 2,
  };

  try {
    await fetch(`${NM_URL}/memory/encode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Brain-ID": "laptop-brain",
      },
      body: JSON.stringify({
        content: `[RESEARCH] ${record.title}\n\nURL: ${record.url}\nSource: ${record.source}\nVerdict: ${record.verdict}\n\n${analysis.summary}`,
        tags: [
          "research",
          `source:${record.source}`,
          `verdict:${record.verdict}`,
          ...record.tech_tags.map((t) => `tech:${t}`),
        ],
        metadata: {
          type: "reference",
          priority: priorityMap[record.verdict] ?? 5,
          url: record.url,
          source: record.source,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Fire-and-forget — don't propagate NM errors
  }
}
