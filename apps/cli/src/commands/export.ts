import { Command } from 'commander';
import {
  exportWorkspace,
  type WorkspaceExportOptions,
} from '../workspaceProduct.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';

export const createExportCommand = (): Command =>
  new Command('export')
    .description(
      'export the complete canonical Workspace through the production planner'
    )
    .requiredOption('--input <path>', 'strict Workspace snapshot JSON')
    .requiredOption(
      '--output <directory>',
      'new or empty generated project directory'
    )
    .option('--target <target>', 'react-vite or vue-vite', 'react-vite')
    .action((options: WorkspaceExportOptions) => {
      process.stdout.write(`${canonicalJsonText(exportWorkspace(options))}\n`);
    });
