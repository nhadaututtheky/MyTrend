import { Command } from 'commander';
import PocketBase from 'pocketbase';
import { hostname } from 'node:os';
import chalk from 'chalk';
import ora from 'ora';

interface SyncStats {
  conversations: number;
  ideas: number;
  projects: number;
  activities: number;
}

async function getCollectionCount(pb: PocketBase, collection: string): Promise<number> {
  const result = await pb.collection(collection).getList(1, 1);
  return result.totalItems;
}

export const syncCommand = new Command('sync')
  .description('Check sync status and register device with MyTrend')
  .option('-u, --url <url>', 'PocketBase URL', 'http://localhost:8090')
  .option('-e, --email <email>', 'User email')
  .option('-p, --password <password>', 'User password')
  .option('--device <name>', 'Device name', hostname())
  .option('--watch', 'Watch for real-time changes')
  .action(async (options: {
    url: string;
    email?: string;
    password?: string;
    device: string;
    watch?: boolean;
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

      // Register activity for this device
      spinner.start('Registering device activity...');
      await pb.collection('activities').create({
        user: pb.authStore.record?.id,
        type: 'coding',
        action: 'cli_sync',
        device_name: options.device,
        metadata: { hostname: hostname(), platform: process.platform },
        timestamp: new Date().toISOString(),
        duration_sec: 0,
      });
      spinner.succeed(`Device registered: ${chalk.cyan(options.device)}`);

      // Fetch stats
      spinner.start('Fetching sync status...');
      const stats: SyncStats = {
        conversations: await getCollectionCount(pb, 'conversations'),
        ideas: await getCollectionCount(pb, 'ideas'),
        projects: await getCollectionCount(pb, 'projects'),
        activities: await getCollectionCount(pb, 'activities'),
      };
      spinner.succeed('Sync status retrieved');

      console.log('');
      console.log(chalk.bold('MyTrend Sync Status'));
      console.log(chalk.dim('─'.repeat(40)));
      console.log(`  Conversations:  ${chalk.green(stats.conversations)}`);
      console.log(`  Ideas:          ${chalk.yellow(stats.ideas)}`);
      console.log(`  Projects:       ${chalk.blue(stats.projects)}`);
      console.log(`  Activities:     ${chalk.magenta(stats.activities)}`);
      console.log(chalk.dim('─'.repeat(40)));
      console.log(`  Device:         ${chalk.cyan(options.device)}`);
      console.log(`  Server:         ${chalk.dim(options.url)}`);
      console.log('');

      if (options.watch) {
        console.log(chalk.dim('Watching for changes... (Ctrl+C to stop)'));

        await pb.collection('conversations').subscribe('*', (e) => {
          const action = e.action === 'create' ? chalk.green('+') : e.action === 'delete' ? chalk.red('-') : chalk.yellow('~');
          console.log(`${action} conversation: ${(e.record as { title?: string }).title ?? e.record.id}`);
        });

        await pb.collection('ideas').subscribe('*', (e) => {
          const action = e.action === 'create' ? chalk.green('+') : e.action === 'delete' ? chalk.red('-') : chalk.yellow('~');
          console.log(`${action} idea: ${(e.record as { title?: string }).title ?? e.record.id}`);
        });

        await pb.collection('activities').subscribe('*', (e) => {
          const action = e.action === 'create' ? chalk.green('+') : e.action === 'delete' ? chalk.red('-') : chalk.yellow('~');
          console.log(`${action} activity: ${(e.record as { action?: string }).action ?? e.record.id}`);
        });

        // Keep process alive
        await new Promise(() => {});
      }
    } catch (err: unknown) {
      spinner.fail(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
