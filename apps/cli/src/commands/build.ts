import { Command } from 'commander';
import {
  buildExportedWorkspace,
  exportWorkspace,
  type WorkspaceExportOptions,
} from '../workspaceProduct.js';

export const createBuildCommand = (): Command =>
  new Command('build')
    .description(
      'compile a canonical Workspace and build its standalone production project'
    )
    .requiredOption('--input <path>', 'strict Workspace snapshot JSON')
    .requiredOption(
      '--output <directory>',
      'new or empty generated project directory'
    )
    .option('--target <target>', 'react-vite or vue-vite', 'react-vite')
    .action(async (options: WorkspaceExportOptions) => {
      const receipt = exportWorkspace(options);
      await buildExportedWorkspace(options.output);
      process.stdout.write(
        `Built ${receipt.target} Workspace ${receipt.workspaceId} in ${options.output}/dist\n`
      );
    });
