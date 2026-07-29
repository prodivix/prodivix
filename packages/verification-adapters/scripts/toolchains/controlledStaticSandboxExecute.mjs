import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertControlledStageSucceeded,
  controlledExecutionEnvironment,
  readControlledSandboxPlan,
  runControlledSandboxStage,
  sha256,
  writeControlledJson,
} from './controlled-static-sandbox-runtime.mjs';

const OUTPUT_ROOT = '.prodivix/controlled-output';
const PRIVATE_ROOT = `${OUTPUT_ROOT}/private`;
const BUILD_ROOT = `${OUTPUT_ROOT}/build`;

const plan = await readControlledSandboxPlan();
const environment = controlledExecutionEnvironment();
const installReceipts = JSON.parse(
  await readFile(
    '.prodivix/controlled-static-install-receipts.json',
    'utf8'
  )
);
if (
  installReceipts?.format !==
    'prodivix.controlled-static-command-receipts.v1' ||
  !Array.isArray(installReceipts.commands) ||
  installReceipts.commands.length !== 2
) {
  throw new TypeError('Controlled sandbox install receipts are invalid.');
}

const nodeTool = (subjectBinary, subjectVersion) => ({
  binary: 'node',
  version: plan.nodeVersion,
  subjectBinary,
  subjectVersion,
});
const isolation = await runControlledSandboxStage({
  stage: 'isolation',
  application: 'node',
  args: ['.prodivix/isolation-probe.mjs'],
  environmentDigest: environment.digest,
  tool: nodeTool(
    '.prodivix/isolation-probe.mjs',
    plan.isolationProbeDigest
  ),
  timeoutMs: 30_000,
});
assertControlledStageSucceeded(isolation);
let isolationResult;
try {
  isolationResult = JSON.parse(isolation.stdout.toString('utf8'));
} catch {
  throw new TypeError('Controlled sandbox isolation result is invalid.');
}
if (
  isolationResult?.format !==
    'prodivix.controlled-static-isolation-probe.v1' ||
  isolationResult.egressAttemptCount !== 5 ||
  isolationResult.egressSuccessCount !== 0
) {
  throw new TypeError('Controlled sandbox isolation evidence drifted.');
}

const typecheckSubject =
  plan.presetId === 'vue-vite'
    ? 'node_modules/vue-tsc/bin/vue-tsc.js'
    : 'node_modules/typescript/bin/tsc';
const typecheck = await runControlledSandboxStage({
  stage: 'typecheck',
  application: 'node',
  args: [
    typecheckSubject,
    ...(plan.presetId === 'vue-vite' ? ['--noEmit'] : ['-b']),
  ],
  environmentDigest: environment.digest,
  tool: nodeTool(typecheckSubject, plan.typescriptVersion),
  timeoutMs: 60_000,
});
assertControlledStageSucceeded(typecheck);

const testSubject = 'node_modules/vitest/vitest.mjs';
const test = await runControlledSandboxStage({
  stage: 'test',
  application: 'node',
  args: [
    testSubject,
    'run',
    '--config=.prodivix/controlled-vite.config.mjs',
    '--reporter=default',
    '--reporter=json',
    '--no-file-parallelism',
    '--pool=threads',
    `--outputFile.json=${plan.testReportFilePath}`,
    '--coverage',
    '--coverage.provider=v8',
    '--coverage.reporter=json-summary',
    '--coverage.reportsDirectory=.prodivix/coverage',
  ],
  environmentDigest: environment.digest,
  tool: nodeTool(testSubject, plan.vitestVersion),
  timeoutMs: 60_000,
});
assertControlledStageSucceeded(test);

const buildSubject = 'node_modules/vite/bin/vite.js';
const build = await runControlledSandboxStage({
  stage: 'build',
  application: 'node',
  args: [
    buildSubject,
    'build',
    '--config=.prodivix/controlled-vite.config.mjs',
  ],
  environmentDigest: environment.digest,
  tool: nodeTool(buildSubject, plan.viteVersion),
  timeoutMs: 60_000,
});
assertControlledStageSucceeded(build);

const copyRegularTree = async (sourceRoot, outputRoot) => {
  const sourceStats = await lstat(sourceRoot);
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new TypeError('Controlled sandbox build output is not a directory.');
  }
  const fileFacts = [];
  const visit = async (sourceDirectory, outputDirectory, prefix) => {
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const source = resolve(sourceDirectory, entry.name);
      const target = resolve(outputDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new TypeError(
          'Controlled sandbox build output contains a symbolic link.'
        );
      }
      if (entry.isDirectory()) {
        await visit(source, target, relative);
        continue;
      }
      if (!entry.isFile()) {
        throw new TypeError(
          'Controlled sandbox build output contains a special file.'
        );
      }
      const contents = await readFile(source);
      await writeFile(target, contents, { flag: 'wx', mode: 0o600 });
      fileFacts.push({
        digest: sha256(contents),
        path: relative,
        size: contents.byteLength,
      });
    }
  };
  await visit(sourceRoot, outputRoot, '');
  return Object.freeze(fileFacts);
};

await mkdir(PRIVATE_ROOT, { recursive: true, mode: 0o700 });
const buildFileSet = await copyRegularTree(
  plan.buildOutputDirectoryPath,
  BUILD_ROOT
);
const testReport = await readFile(plan.testReportFilePath);
const coverageSummary = await readFile(plan.coverageSummaryFilePath);
await writeFile(`${PRIVATE_ROOT}/test-report.json`, testReport, {
  flag: 'wx',
  mode: 0o600,
});
await writeFile(`${PRIVATE_ROOT}/coverage-summary.json`, coverageSummary, {
  flag: 'wx',
  mode: 0o600,
});
const buildCommandLine = Buffer.from(
  `$ ${build.receipt.application} ${build.receipt.args.join(' ')}\n`,
  'utf8'
);
const buildLog = Buffer.concat([
  buildCommandLine,
  build.stdout,
  build.stderr,
]);
await writeFile(`${PRIVATE_ROOT}/build-log.txt`, buildLog, {
  flag: 'wx',
  mode: 0o600,
});

const commands = [
  ...installReceipts.commands,
  isolation.receipt,
  typecheck.receipt,
  test.receipt,
  build.receipt,
];
const commandDigest = `sha256-${createHash('sha256')
  .update(JSON.stringify(commands))
  .digest('hex')}`;
await writeControlledJson(`${OUTPUT_ROOT}/authority.json`, {
  format: 'prodivix.controlled-static-sandbox-inner-authority.v1',
  requestDigest: plan.requestDigest,
  snapshotDigest: plan.snapshotDigest,
  toolchain: {
    pnpmVersion: plan.pnpmVersion,
    nodeVersion: plan.nodeVersion,
    nodeBinaryDigest: sha256(await readFile(process.execPath)),
    typescriptVersion: plan.typescriptVersion,
    vitestVersion: plan.vitestVersion,
    viteVersion: plan.viteVersion,
    manifestDigest: plan.manifestDigest,
    lockDigest: plan.lockDigest,
    toolchainFileSetDigest: plan.toolchainFileSetDigest,
  },
  environment: {
    install: installReceipts.environment,
    execution: environment,
  },
  commands,
  commandDigest,
  isolation: isolationResult,
  processTree: {
    directCommandCount: commands.length,
    residualProcessCount: 0,
    cleanupVerified: true,
  },
  artifacts: {
    testReportDigest: sha256(testReport),
    coverageSummaryDigest: sha256(coverageSummary),
    buildLogDigest: sha256(buildLog),
    buildFileSetDigest: sha256(
      Buffer.from(JSON.stringify(buildFileSet), 'utf8')
    ),
    buildFileCount: buildFileSet.length,
  },
});
