import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (args, environment = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(pnpm, args, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...environment },
    });
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`pnpm ${args.join(' ')} exited with ${code}.`));
    });
  });

const temporaryRoot = await mkdtemp(join(tmpdir(), 'prodivix-g2-rootless-'));
const snapshotPath = join(temporaryRoot, 'golden-snapshot.json');
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
    [
      '--filter',
      '@prodivix/golden-conformance',
      'emit:g2-execution-snapshot',
    ],
    { PRODIVIX_GOLDEN_SNAPSHOT_PATH: snapshotPath }
  );
  await run(
    ['--filter', '@prodivix/remote-runner-worker', 'test:rootless-gate'],
    { PRODIVIX_GOLDEN_SNAPSHOT_PATH: snapshotPath }
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
