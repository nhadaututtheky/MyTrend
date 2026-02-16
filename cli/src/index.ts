#!/usr/bin/env node

import { Command } from 'commander';
import { importCommand } from './commands/import.js';
import { exportCommand } from './commands/export.js';
import { syncCommand } from './commands/sync.js';

const program = new Command();

program
  .name('mytrend')
  .description('MyTrend CLI - Import, export, and sync your personal knowledge data')
  .version('0.1.0');

program.addCommand(importCommand);
program.addCommand(exportCommand);
program.addCommand(syncCommand);

program.parse();
