import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDirectory = resolve(repositoryDirectory, 'apps/backend');
const pnpmCli = process.env.npm_execpath;

const pnpm = pnpmCli
  ? {
      command: process.execPath,
      prefixArguments: [pnpmCli],
      shell: false,
    }
  : {
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      prefixArguments: [],
      shell: process.platform === 'win32',
    };

const packageTests = [
  '@prodivix/animation',
  '@prodivix/authoring',
  '@prodivix/diagnostics',
  '@prodivix/golden-conformance',
  '@prodivix/nodegraph',
  '@prodivix/pir',
  '@prodivix/pir-react-renderer',
  '@prodivix/prodivix-compiler',
  '@prodivix/router',
  '@prodivix/runtime-browser',
  '@prodivix/runtime-core',
  '@prodivix/workspace',
  '@prodivix/workspace-sync',
];

const pnpmCheck = (label, arguments_) => ({
  label,
  command: pnpm.command,
  arguments: [...pnpm.prefixArguments, ...arguments_],
  cwd: repositoryDirectory,
  shell: pnpm.shell,
});

const checks = [
  pnpmCheck('Core package boundaries', ['run', 'check:core-boundaries']),
  pnpmCheck('Authoring write-path hard cuts', ['run', 'check:editor-hard-cut']),
  pnpmCheck('Property-test naming contract', ['run', 'check:property-test-names']),
  pnpmCheck('Diagnostic catalog conformance', [
    'run',
    'docs:diagnostics:check',
  ]),
  pnpmCheck('G0 domain and Golden conformance tests', [
    'exec',
    'turbo',
    'run',
    'test',
    ...packageTests.map((packageName) => `--filter=${packageName}`),
  ]),
  pnpmCheck('Web composition typecheck', [
    '--filter',
    '@prodivix/web',
    'run',
    'typecheck',
  ]),
  pnpmCheck('Web Issues and recovery adapter tests', [
    '--filter',
    '@prodivix/web',
    'exec',
    'vitest',
    '--config',
    'vitest.config.ts',
    '--run',
    'src/editor/features/issues',
    'src/editor/workspaceSync',
  ]),
  {
    label: 'Backend Workspace commit and schema conformance tests',
    command: 'go',
    arguments: ['test', './...'],
    cwd: backendDirectory,
    shell: false,
  },
];

for (const [index, check] of checks.entries()) {
  console.log(`\n[G0 ${index + 1}/${checks.length}] ${check.label}`);

  const result = spawnSync(check.command, check.arguments, {
    cwd: check.cwd,
    env: process.env,
    stdio: 'inherit',
    shell: check.shell,
  });

  if (result.error) {
    console.error(`[G0] Unable to run ${check.label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    const detail = result.signal
      ? `terminated by ${result.signal}`
      : `exited with code ${result.status ?? 'unknown'}`;
    console.error(`[G0] ${check.label} ${detail}.`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[G0] All non-browser Truth & Change Kernel gates passed.');
