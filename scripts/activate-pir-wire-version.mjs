import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPirSchemaVersion } from '../packages/shared/scripts/pir-schema.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const positionalArgs = args.filter((argument) => !argument.startsWith('--'));
if (
  positionalArgs.length !== 1 ||
  args.some((argument) => argument.startsWith('--') && argument !== '--check')
) {
  console.error(
    'Usage: pnpm run pir:activate-wire -- <numeric-version> [--check]'
  );
  process.exit(1);
}

const version = positionalArgs[0];
if (!/^\d+(?:\.\d+)*$/.test(version)) {
  console.error(`Invalid PIR wire version ${JSON.stringify(version)}.`);
  process.exit(1);
}

const toRepositoryPath = (path) =>
  relative(repoRoot, path).replaceAll('\\', '/');
const snapshotPath = resolve(repoRoot, `specs/pir/PIR-v${version}.json`);
const manifestPath = resolve(repoRoot, 'specs/pir/PIR-current.version.json');
const generatedPaths = [
  resolve(repoRoot, 'specs/pir/PIR-current.json'),
  resolve(repoRoot, 'packages/pir/src/codec/pirWire.generated.ts'),
  resolve(
    repoRoot,
    'apps/backend/internal/platform/pircontract/current_schema.generated.json'
  ),
  resolve(
    repoRoot,
    'apps/backend/internal/platform/pircontract/current_version.generated.go'
  ),
];

if (!existsSync(snapshotPath)) {
  console.error(
    `Missing immutable snapshot ${toRepositoryPath(snapshotPath)}. Add it before activation.`
  );
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
} catch (error) {
  console.error(`Invalid PIR snapshot JSON: ${error.message}`);
  process.exit(1);
}

let snapshotVersion;
try {
  snapshotVersion = getPirSchemaVersion(snapshot);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (snapshotVersion !== version) {
  console.error(
    `${toRepositoryPath(snapshotPath)} declares ${JSON.stringify(snapshotVersion)} instead of ${JSON.stringify(version)}.`
  );
  process.exit(1);
}

const snapshotRepositoryPath = toRepositoryPath(snapshotPath);
const existedAtHead = spawnSync(
  'git',
  ['cat-file', '-e', `HEAD:${snapshotRepositoryPath}`],
  { cwd: repoRoot, stdio: 'ignore' }
);
if (existedAtHead.status === 0) {
  const immutableDiff = spawnSync(
    'git',
    ['diff', '--quiet', 'HEAD', '--', snapshotRepositoryPath],
    { cwd: repoRoot, stdio: 'ignore' }
  );
  if (immutableDiff.status !== 0) {
    console.error(
      `${snapshotRepositoryPath} is already immutable in HEAD. Add a new versioned snapshot instead of modifying it.`
    );
    process.exit(1);
  }
}

if (checkOnly) {
  console.log(`${snapshotRepositoryPath} is ready for activation.`);
  process.exit(0);
}

const previousManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const previousVersion = previousManifest?.version;
const mutablePaths = [manifestPath, ...generatedPaths];
const backups = new Map(
  mutablePaths.map((path) => [
    path,
    existsSync(path)
      ? { existed: true, content: readFileSync(path) }
      : { existed: false, content: null },
  ])
);

const restoreGeneratedState = () => {
  for (const [path, backup] of backups) {
    if (backup.existed) {
      writeFileSync(path, backup.content);
    } else {
      rmSync(path, { force: true });
    }
  }
};

const runNodeScript = (repositoryPath) => {
  const result = spawnSync(process.execPath, [repositoryPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `${repositoryPath} failed with exit code ${result.status}.`
    );
  }
};

const runCommand = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed with exit code ${result.status}.`
    );
  }
};

const runPnpm = (commandArgs) => {
  if (process.platform !== 'win32') {
    runCommand('pnpm', commandArgs);
    return;
  }
  runCommand(process.env.ComSpec || 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    `pnpm ${commandArgs.join(' ')}`,
  ]);
};

try {
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ version }, null, 2)}\n`,
    'utf8'
  );
  runNodeScript('packages/shared/scripts/sync-current-pir-schema.js');
  runNodeScript('packages/shared/scripts/generate-types.js');
  runPnpm(['--filter', '@prodivix/pir', 'test']);
  runNodeScript('scripts/check-pir-current-boundary.mjs');
} catch (error) {
  restoreGeneratedState();
  console.error(`PIR wire activation rolled back: ${error.message}`);
  process.exit(1);
}

console.log(`Activated PIR wire snapshot ${snapshotRepositoryPath}.`);
console.log(
  'This activates repository contracts only; production rollout still requires the canonical persistence migration gate.'
);
if (previousVersion !== version) {
  console.log(
    `Verified the deterministic migration path from ${String(previousVersion)} to ${version}.`
  );
}
