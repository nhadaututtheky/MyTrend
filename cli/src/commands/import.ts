import { Command } from 'commander';
import PocketBase from 'pocketbase';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';

interface ClaudeMessage {
  role: string;
  content: string;
  timestamp?: string;
  tokens?: number;
}

interface ClaudeSession {
  id?: string;
  title?: string;
  messages?: ClaudeMessage[];
  model?: string;
  created_at?: string;
  updated_at?: string;
}

interface JsonlEntry {
  type?: string;
  role?: string;
  content?: string;
  timestamp?: string;
  message?: ClaudeMessage;
  session_id?: string;
}

function parseJsonlFile(filePath: string): ClaudeSession {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  const messages: ClaudeMessage[] = [];
  let title = '';
  let sessionId = '';

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as JsonlEntry;

      if (entry.type === 'session' || entry.session_id) {
        sessionId = entry.session_id ?? '';
      }

      if (entry.role && entry.content) {
        messages.push({
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
        });
      } else if (entry.message) {
        messages.push(entry.message);
      }

      if (!title && entry.role === 'user' && entry.content) {
        title = entry.content.slice(0, 100);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return {
    id: sessionId,
    title: title || 'Imported Conversation',
    messages,
  };
}

function parseJsonFile(filePath: string): ClaudeSession[] {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as ClaudeSession | ClaudeSession[];

  if (Array.isArray(data)) {
    return data;
  }

  return [data];
}

async function importConversation(
  pb: PocketBase,
  session: ClaudeSession,
  source: string,
  projectId: string | undefined,
  deviceName: string,
): Promise<void> {
  const now = new Date().toISOString();
  const startedAt = session.created_at ?? session.messages?.[0]?.timestamp ?? now;

  await pb.collection('conversations').create({
    user: pb.authStore.record?.id,
    project: projectId ?? null,
    title: session.title ?? 'Imported Conversation',
    summary: '',
    source,
    device_name: deviceName,
    session_id: session.id ?? '',
    messages: session.messages ?? [],
    message_count: session.messages?.length ?? 0,
    total_tokens: 0,
    topics: [],
    tags: [],
    started_at: startedAt,
    ended_at: session.updated_at ?? now,
    duration_min: 0,
  });
}

export const importCommand = new Command('import')
  .description('Import Claude conversation logs into MyTrend')
  .argument('<path>', 'Path to JSONL/JSON file or directory')
  .option('-u, --url <url>', 'PocketBase URL', 'http://localhost:8090')
  .option('-e, --email <email>', 'Admin email')
  .option('-p, --password <password>', 'Admin password')
  .option('-s, --source <source>', 'Source label (cli, desktop, imported)', 'imported')
  .option('--project <id>', 'Link to project ID')
  .option('--device <name>', 'Device name', 'cli-import')
  .action(async (inputPath: string, options: {
    url: string;
    email?: string;
    password?: string;
    source: string;
    project?: string;
    device: string;
  }) => {
    const spinner = ora('Connecting to PocketBase...').start();

    try {
      const pb = new PocketBase(options.url);

      if (options.email && options.password) {
        await pb.collection('users').authWithPassword(options.email, options.password);
        spinner.succeed('Authenticated');
      } else {
        spinner.fail('Email and password required. Use --email and --password flags.');
        process.exit(1);
      }

      const resolvedPath = resolve(inputPath);

      if (!existsSync(resolvedPath)) {
        spinner.fail(`Path not found: ${resolvedPath}`);
        process.exit(1);
      }

      let files: string[] = [];
      const stat = await import('node:fs').then((fs) => fs.statSync(resolvedPath));

      if (stat.isDirectory()) {
        files = await glob('**/*.{jsonl,json}', { cwd: resolvedPath, absolute: true });
      } else {
        files = [resolvedPath];
      }

      if (files.length === 0) {
        spinner.fail('No .jsonl or .json files found');
        process.exit(1);
      }

      spinner.start(`Importing ${files.length} file(s)...`);
      let imported = 0;
      let failed = 0;

      for (const file of files) {
        try {
          const ext = extname(file).toLowerCase();
          let sessions: ClaudeSession[] = [];

          if (ext === '.jsonl') {
            sessions = [parseJsonlFile(file)];
          } else if (ext === '.json') {
            sessions = parseJsonFile(file);
          }

          for (const session of sessions) {
            if (!session.messages || session.messages.length === 0) {
              continue;
            }

            await importConversation(pb, session, options.source, options.project, options.device);
            imported++;
          }
        } catch (err: unknown) {
          failed++;
          console.error(chalk.red(`  Failed: ${file} - ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
      }

      spinner.succeed(
        `Import complete: ${chalk.green(`${imported} imported`)}, ${chalk.red(`${failed} failed`)}`,
      );
    } catch (err: unknown) {
      spinner.fail(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
