import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readAgentRuntimeConfiguration } from '#src/config.js';
import { createAgentRuntimeHttpPorts } from '#src/httpPorts.js';
import { AgentRuntimeConsumer } from '#src/consumer.js';
import { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { runAgentRuntimeDaemon } from '#src/daemon.js';

// Bundled workspace dependencies include CommonJS libraries with native imports.
globalThis.require = createRequire(import.meta.url);

if (process.argv.includes('--help')) {
  process.stdout.write(
    'Prodivix ordinary Agent Task worker\nUsage: agent-runtime <configuration.json> [--once]\nSecret values are resolved only from server environment names in the configuration.\n'
  );
} else {
  const path = process.argv[2];
  if (!path || path.startsWith('--'))
    throw new Error('Agent runtime configuration path is required.');
  const config = await readAgentRuntimeConfiguration(path);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const consumer = new AgentRuntimeConsumer(
    config,
    createAgentRuntimeHttpPorts(config),
    {
      journal: new AgentRuntimeFileJournal(
        config.stateDirectory ??
          resolve(
            dirname(path),
            '.agent-runtime',
            digestAgentCanonicalValue(config.workerId).slice(7)
          )
      ),
    }
  );
  await runAgentRuntimeDaemon({
    consumer,
    signal: controller.signal,
    intervalMs: config.pollIntervalMs,
    once: process.argv.includes('--once'),
    onResults(results) {
      for (const result of results)
        process.stdout.write(JSON.stringify(result) + '\n');
    },
    onPollingFailure() {
      process.stderr.write(
        'Agent runtime polling failed; durable tasks will be retried.\n'
      );
    },
  });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
