import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pnpm = 'pnpm';
const contractOnly = process.argv.includes('--contract-only');
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--contract-only');
if (unknownArguments.length > 0)
  throw new TypeError(
    `Unsupported rootless Gate arguments: ${unknownArguments.join(', ')}.`
  );
const windowsShellToken = /^[A-Za-z0-9@._:/=+*-]+$/u;
const run = (args, environment = {}) =>
  new Promise((resolveRun, rejectRun) => {
    if (
      process.platform === 'win32' &&
      [pnpm, ...args].some((argument) => !windowsShellToken.test(argument))
    )
      throw new TypeError('Unsafe Windows rootless Gate command token.');
    const child = spawn(
      process.platform === 'win32' ? [pnpm, ...args].join(' ') : pnpm,
      process.platform === 'win32' ? [] : args,
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, ...environment },
      }
    );
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`pnpm ${args.join(' ')} exited with ${code}.`));
    });
  });

const temporaryRoot = await mkdtemp(join(tmpdir(), 'prodivix-g2-rootless-'));
const snapshotPath = join(temporaryRoot, 'golden-snapshot.json');
const catalogSnapshotPath = join(
  temporaryRoot,
  'golden-vue-catalog-snapshot.json'
);
try {
  await run([
    'turbo',
    'run',
    'build',
    '--filter=@prodivix/remote-runner-worker',
    '--filter=@prodivix/prodivix-compiler',
    '--filter=@prodivix/plugin-antd',
  ]);
  await run(
    ['--filter', '@prodivix/golden-conformance', 'emit:g2-execution-snapshot'],
    { PRODIVIX_GOLDEN_SNAPSHOT_PATH: snapshotPath }
  );
  await run(
    [
      '--filter',
      '@prodivix/golden-conformance',
      'emit:g2-vue-catalog-snapshot',
    ],
    { PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH: catalogSnapshotPath }
  );
  await run(
    [
      '--filter',
      '@prodivix/remote-runner-worker',
      contractOnly ? 'test:rootless-snapshot-contract' : 'test:rootless-gate',
    ],
    {
      PRODIVIX_GOLDEN_SNAPSHOT_PATH: snapshotPath,
      PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH: catalogSnapshotPath,
    }
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
