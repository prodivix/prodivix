import { Command } from 'commander';
import { pathToFileURL } from 'node:url';
import { createBuildCommand } from './commands/build.js';
import { createExportCommand } from './commands/export.js';
import { createVerificationCommand } from './commands/verification.js';
import { createAgentCommand } from './commands/agent.js';

export async function cli(argv: string[]): Promise<void> {
  await new Command()
    .name('prodivix')
    .description('Prodivix CLI')
    .version('0.0.1')
    .addCommand(createBuildCommand())
    .addCommand(createExportCommand())
    .addCommand(createAgentCommand())
    .addCommand(createVerificationCommand())
    .parseAsync(argv);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void cli(process.argv);
}
