import { Command } from 'commander';
import PocketBase from 'pocketbase';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

type ExportFormat = 'json' | 'md';
type ExportCollection = 'conversations' | 'ideas' | 'projects' | 'all';

interface ExportRecord {
  id: string;
  title?: string;
  name?: string;
  content?: string;
  messages?: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

function toMarkdown(record: ExportRecord, collection: string): string {
  const lines: string[] = [];
  const title = record.title ?? record.name ?? record.id;

  lines.push(`# ${title}`);
  lines.push('');

  if (collection === 'conversations' && Array.isArray(record.messages)) {
    for (const msg of record.messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      lines.push(`## ${role}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }
  } else if (collection === 'ideas') {
    if (record.content) {
      lines.push(String(record.content));
      lines.push('');
    }
  } else if (collection === 'projects') {
    const { id, name, ...rest } = record;
    lines.push('```json');
    lines.push(JSON.stringify(rest, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}

async function exportCollection(
  pb: PocketBase,
  collection: string,
  outputDir: string,
  format: ExportFormat,
): Promise<number> {
  const ITEMS_PER_PAGE = 50;
  let page = 1;
  let totalExported = 0;
  let hasMore = true;

  const collectionDir = join(outputDir, collection);
  mkdirSync(collectionDir, { recursive: true });

  while (hasMore) {
    const result = await pb.collection(collection).getList<ExportRecord>(page, ITEMS_PER_PAGE, {
      sort: '-created',
    });

    for (const record of result.items) {
      const filename = `${record.id}.${format}`;
      const filePath = join(collectionDir, filename);

      if (format === 'json') {
        writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
      } else {
        writeFileSync(filePath, toMarkdown(record, collection), 'utf-8');
      }

      totalExported++;
    }

    hasMore = page * ITEMS_PER_PAGE < result.totalItems;
    page++;
  }

  return totalExported;
}

export const exportCommand = new Command('export')
  .description('Export MyTrend data to JSON or Markdown files')
  .option('-u, --url <url>', 'PocketBase URL', 'http://localhost:8090')
  .option('-e, --email <email>', 'User email')
  .option('-p, --password <password>', 'User password')
  .option('-o, --output <dir>', 'Output directory', './mytrend-export')
  .option('-f, --format <format>', 'Export format (json, md)', 'json')
  .option('-c, --collection <name>', 'Collection to export (conversations, ideas, projects, all)', 'all')
  .action(async (options: {
    url: string;
    email?: string;
    password?: string;
    output: string;
    format: string;
    collection: string;
  }) => {
    const spinner = ora('Connecting to PocketBase...').start();

    try {
      const pb = new PocketBase(options.url);

      if (options.email && options.password) {
        await pb.collection('users').authWithPassword(options.email, options.password);
        spinner.succeed('Authenticated');
      } else {
        spinner.fail('Email and password required.');
        process.exit(1);
      }

      const outputDir = resolve(options.output);
      mkdirSync(outputDir, { recursive: true });

      const format = options.format as ExportFormat;
      const collections: string[] =
        options.collection === 'all'
          ? ['conversations', 'ideas', 'projects']
          : [options.collection];

      let totalExported = 0;

      for (const collection of collections) {
        spinner.start(`Exporting ${collection}...`);
        const count = await exportCollection(pb, collection, outputDir, format);
        totalExported += count;
        spinner.succeed(`${collection}: ${chalk.green(`${count} records`)}`);
      }

      console.log('');
      console.log(chalk.bold(`Total exported: ${totalExported} records to ${outputDir}`));
    } catch (err: unknown) {
      spinner.fail(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
