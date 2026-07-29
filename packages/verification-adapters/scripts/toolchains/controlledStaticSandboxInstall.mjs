import {
  assertControlledStageSucceeded,
  controlledInstallEnvironment,
  readControlledSandboxPlan,
  runControlledSandboxStage,
  writeControlledJson,
} from './controlled-static-sandbox-runtime.mjs';

const plan = await readControlledSandboxPlan();
const environment = controlledInstallEnvironment();
const version = await runControlledSandboxStage({
  stage: 'version',
  application: 'pnpm',
  args: ['--version'],
  environmentDigest: environment.digest,
  tool: {
    binary: 'pnpm',
    version: plan.pnpmVersion,
  },
  timeoutMs: 30_000,
});
assertControlledStageSucceeded(version);
if (version.stdout.toString('utf8').trim() !== plan.pnpmVersion) {
  throw new Error('Controlled sandbox pnpm binary version drifted.');
}

const install = await runControlledSandboxStage({
  stage: 'install',
  application: 'pnpm',
  args: [
    'install',
    '--frozen-lockfile',
    '--offline',
    '--ignore-scripts',
    '--store-dir=/opt/prodivix/pnpm-store',
  ],
  environmentDigest: environment.digest,
  tool: {
    binary: 'pnpm',
    version: plan.pnpmVersion,
  },
  timeoutMs: 60_000,
});

await writeControlledJson('.prodivix/controlled-static-install-receipts.json', {
  format: 'prodivix.controlled-static-command-receipts.v1',
  environment,
  commands: [version.receipt, install.receipt],
});
assertControlledStageSucceeded(install);
