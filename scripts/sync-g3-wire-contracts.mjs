import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { behaviorDocumentWireSchemas } from '../packages/behavior/src/wire.ts';
import { verificationDocumentWireSchemas } from '../packages/verification/src/wire.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  {
    label: 'Behavior',
    target: path.join(
      root,
      'apps/backend/internal/platform/behaviorcontract/schemas.generated.json'
    ),
    schemas: behaviorDocumentWireSchemas,
  },
  {
    label: 'Verification',
    target: path.join(
      root,
      'apps/backend/internal/platform/verificationcontract/schemas.generated.json'
    ),
    schemas: verificationDocumentWireSchemas,
  },
];
const mode = process.argv[2] ?? 'check';

for (const { label, target, schemas } of targets) {
  const prettierConfig = (await resolveConfig(target)) ?? {};
  const expected = await format(JSON.stringify(schemas), {
    ...prettierConfig,
    filepath: target,
  });
  if (mode === 'sync') {
    await writeFile(target, expected, 'utf8');
    process.stdout.write(`Synchronized the ${label} wire contracts.\n`);
    continue;
  }
  if (mode === 'check') {
    const actual = await readFile(target, 'utf8').catch(() => '');
    if (actual !== expected) {
      process.stderr.write(
        `${label} backend wire schemas are stale. Run pnpm g3:sync-wire.\n`
      );
      process.exitCode = 1;
    }
    continue;
  }
  throw new Error(`Unknown mode: ${mode}`);
}
