import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { nodeGraphCurrentWireSchema } from '../packages/nodegraph/src/wire.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDirectory = path.join(root, 'specs/nodegraph');
const manifestPath = path.join(
  snapshotDirectory,
  'NodeGraph-current.version.json'
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Number.isSafeInteger(manifest.version) || manifest.version < 1) {
  throw new Error('NodeGraph activation manifest must contain a positive version.');
}
const snapshotPath = path.join(
  snapshotDirectory,
  `NodeGraph-v${manifest.version}.json`
);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!isDeepStrictEqual(snapshot, nodeGraphCurrentWireSchema)) {
  throw new Error(
    'NodeGraph TypeScript wire mirror differs from the activated immutable snapshot.'
  );
}
const targets = [
  path.join(snapshotDirectory, 'NodeGraph-current.json'),
  path.join(
    root,
    'apps/backend/internal/platform/nodegraphcontract/current_schema.generated.json'
  ),
];
const mode = process.argv[2] ?? 'check';

for (const target of targets) {
  const prettierConfig = (await resolveConfig(target)) ?? {};
  const expected = await format(JSON.stringify(snapshot), {
    ...prettierConfig,
    filepath: target,
  });
  if (mode === 'sync') {
    await writeFile(target, expected, 'utf8');
    continue;
  }
  if (mode === 'check') {
    const actual = await readFile(target, 'utf8').catch(() => '');
    if (actual !== expected) {
      process.stderr.write(
        `NodeGraph wire mirror ${path.relative(root, target)} is stale. Run pnpm nodegraph:sync-wire.\n`
      );
      process.exitCode = 1;
    }
    continue;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

if (mode === 'sync') {
  process.stdout.write(
    `Synchronized NodeGraph v${manifest.version} current wire mirrors.\n`
  );
}
