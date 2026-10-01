import { Command } from 'commander';
import { requestBackend, validateBackendUrl } from '../backendTransport.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';

export const createDeployCommand = (): Command =>
  new Command('deploy')
    .description(
      'publish the current confirmed project projection to the Prodivix community'
    )
    .requiredOption('--base-url <url>', 'authenticated Backend origin')
    .requiredOption('--project <id>', 'exact project to publish')
    .action(async (options: { baseUrl: string; project: string }) => {
      const url = validateBackendUrl(options.baseUrl);
      const prefix = url.pathname.replace(/\/+$/u, '');
      url.pathname = `${prefix.endsWith('/api') ? prefix : `${prefix}/api`}/projects/${encodeURIComponent(options.project)}/publish`;
      const response = await requestBackend(
        url,
        { method: 'POST' },
        'PRODIVIX_ACCESS_TOKEN'
      );
      if (!response.ok)
        throw new Error(`Project publication rejected (${response.status}).`);
      process.stdout.write(`${canonicalJsonText(await response.json())}\n`);
    });
