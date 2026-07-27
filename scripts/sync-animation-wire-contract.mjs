import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { animationCurrentWireSchema } from '../packages/animation/src/wire.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDirectory = path.join(root, 'specs/animation');
const manifestPath = path.join(
  snapshotDirectory,
  'Animation-current.version.json'
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Number.isSafeInteger(manifest.version) || manifest.version < 1) {
  throw new Error('Animation activation manifest must contain a positive version.');
}
const snapshotPath = path.join(
  snapshotDirectory,
  `Animation-v${manifest.version}.json`
);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!isDeepStrictEqual(snapshot, animationCurrentWireSchema)) {
  throw new Error(
    'Animation TypeScript wire mirror differs from the activated immutable snapshot.'
  );
}
const targets = [
  path.join(snapshotDirectory, 'Animation-current.json'),
  path.join(
    root,
    'apps/backend/internal/platform/animationcontract/current_schema.generated.json'
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
        `Animation wire mirror ${path.relative(root, target)} is stale. Run pnpm animation:sync-wire.\n`
      );
      process.exitCode = 1;
    }
    continue;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

if (mode === 'sync') {
  process.stdout.write(
    `Synchronized Animation v${manifest.version} current wire mirrors.\n`
  );
}
