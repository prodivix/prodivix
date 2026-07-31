import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  agentWorkspaceDocumentMigrationWireSchemas,
  agentWorkspaceDocumentWireSchemas,
} from '../packages/ai/src/wire/agentPolicyWire.ts';
import { createG4AgentPolicyCanonicalVector } from './g4-agent-policy-canonical-vector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  {
    label: 'Agent',
    target: path.join(
      root,
      'apps/backend/internal/platform/agentcontract/schemas.generated.json'
    ),
    value: {
      ...agentWorkspaceDocumentWireSchemas,
      ...agentWorkspaceDocumentMigrationWireSchemas,
    },
  },
  {
    label: 'AgentPolicy canonical vector',
    target: path.join(
      root,
      'apps/backend/internal/platform/agentcontract/testdata/agent-policy-vector.json'
    ),
    value: createG4AgentPolicyCanonicalVector(),
  },
];
const mode = process.argv[2] ?? 'check';

for (const { label, target, value } of targets) {
  const prettierConfig = (await resolveConfig(target)) ?? {};
  const expected = await format(JSON.stringify(value), {
    ...prettierConfig,
    filepath: target,
  });
  if (mode === 'sync') {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, expected, 'utf8');
    process.stdout.write(`Synchronized the ${label} wire contracts.\n`);
    continue;
  }
  if (mode === 'check') {
    const actual = await readFile(target, 'utf8').catch(() => '');
    if (actual !== expected) {
      process.stderr.write(
        `${label} backend contract is stale. Run pnpm g4:sync-wire.\n`
      );
      process.exitCode = 1;
    }
    continue;
  }
  throw new Error(`Unknown mode: ${mode}`);
}
