import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(repoDir, 'apps/backend');
const isWindows = process.platform === 'win32';

function findCommand(command) {
  const lookup = isWindows ? 'where.exe' : 'command';
  const args = isWindows ? [command] : ['-v', command];
  const result = spawnSync(lookup, args, {
    cwd: backendDir,
    shell: !isWindows,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.split(/\r?\n/).find(Boolean) ?? null;
}

const airCommand = findCommand('air');
const goCommand = findCommand('go');
const command = airCommand ?? goCommand;
const useHotReload = Boolean(airCommand);
const args = useHotReload ? ['-c', '.air.toml'] : ['run', './cmd/server'];

if (!command) {
  console.error('[backend] Go is required to start the backend dev server.');
  process.exit(1);
}

if (!useHotReload) {
  console.warn('[backend] air not found; falling back to go run ./cmd/server.');
}

const child = spawn(command, args, {
  cwd: backendDir,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
