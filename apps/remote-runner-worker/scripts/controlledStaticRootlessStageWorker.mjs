import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createControlledStaticRootlessPackageImport as createPackageImport,
  createControlledStaticRootlessPackageManifest,
  decodeControlledStaticRootlessPackageImportBytes,
  MAXIMUM_PACKAGE_IMPORT_BYTES,
  MAXIMUM_PACKAGE_IMPORT_DEPTH,
  MAXIMUM_PACKAGE_IMPORT_ENTRIES,
  MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES,
  materializeControlledStaticRootlessPackageImport as materializePackageImport,
} from './controlledStaticRootlessPackageImport.mjs';

export {
  createControlledStaticRootlessPackageManifest,
  decodeControlledStaticRootlessPackageImportBytes,
};

const PLAN_PATH = '.prodivix/controlled-static-rootless-stage-plan.json';
const OUTPUT_ROOT = '.prodivix/controlled-output';
const RESULTS_ROOT = `${OUTPUT_ROOT}/results`;
const STAGE_PLAN_FORMAT = 'prodivix.controlled-static-rootless-stage-plan.v1';
const STAGE_AUTHORITY_FORMAT =
  'prodivix.controlled-static-rootless-inner-stage-authority.v1';
const PACKAGE_SEED_FORMAT =
  'prodivix.controlled-static-rootless-package-seed.v1';
const PACKAGE_SEED_ROOT = '/opt/prodivix/package-seeds';
const PACKAGE_SEED_WORKSPACE_PATH = '.prodivix/package-seed.json.gz';
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const STAGES = Object.freeze([
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
]);
const RESULT_ALLOWLIST = Object.freeze({
  version: Object.freeze([]),
  install: Object.freeze(['package-import']),
  isolation: Object.freeze(['isolation-observation']),
  typecheck: Object.freeze([]),
  build: Object.freeze(['build-file-set', 'build-log']),
  test: Object.freeze(['coverage-summary', 'test-report']),
});
let failurePhase = 'runtime-import';
let commandAuthorityFailureFacts = null;
let packageSeedFailurePhase = null;

const sha256 = (contents) =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const compareCodePoints = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const exactRecord = (value, required, label) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== required.length ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

const relativePath = (value, label) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value
      .split('/')
      .some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          segment.includes(':')
      )
  ) {
    throw new TypeError(`${label} must be a canonical relative path.`);
  }
  return value;
};

const workspacePath = (path) => {
  const canonical = relativePath(path, 'Controlled rootless workspace path');
  const target = resolve('/workspace', ...canonical.split('/'));
  const child = relative('/workspace', target);
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new TypeError('Controlled rootless path escaped the workspace.');
  }
  return target;
};

const pathExists = async (path) => {
  try {
    await lstat(workspacePath(path));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};

const readStagePlan = async () => {
  const value = JSON.parse(await readFile(workspacePath(PLAN_PATH), 'utf8'));
  const plan = exactRecord(
    value,
    [
      'format',
      'stage',
      'ordinal',
      'requestDigest',
      'snapshotDigest',
      'presetId',
      'pnpmVersion',
      'nodeVersion',
      'typescriptVersion',
      'vitestVersion',
      'viteVersion',
      'rollupVersion',
      'rollupImplementation',
      'rollupAliasSpec',
      'esbuildVersion',
      'esbuildImplementation',
      'esbuildAliasSpec',
      'manifestDigest',
      'lockDigest',
      'toolchainFileSetDigest',
      'isolationProbeDigest',
      'testReportFilePath',
      'coverageSummaryFilePath',
      'buildOutputDirectoryPath',
      'packageImport',
      'resultAllowlist',
    ],
    'Controlled rootless stage plan'
  );
  if (
    plan.format !== STAGE_PLAN_FORMAT ||
    !STAGES.includes(plan.stage) ||
    plan.ordinal !== STAGES.indexOf(plan.stage) ||
    ![
      plan.requestDigest,
      plan.snapshotDigest,
      plan.manifestDigest,
      plan.lockDigest,
      plan.toolchainFileSetDigest,
      plan.isolationProbeDigest,
    ].every(
      (digest) => typeof digest === 'string' && DIGEST_PATTERN.test(digest)
    ) ||
    (plan.presetId !== 'react-vite' && plan.presetId !== 'vue-vite') ||
    ![
      plan.pnpmVersion,
      plan.nodeVersion,
      plan.typescriptVersion,
      plan.vitestVersion,
      plan.viteVersion,
      plan.rollupVersion,
      plan.esbuildVersion,
    ].every(
      (version) =>
        typeof version === 'string' &&
        /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
    ) ||
    plan.rollupVersion !== '4.62.3' ||
    plan.rollupImplementation !== '@rollup/wasm-node' ||
    plan.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3' ||
    plan.esbuildVersion !== '0.27.7' ||
    plan.esbuildImplementation !== 'esbuild-wasm' ||
    plan.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7' ||
    plan.nodeVersion !== process.versions.node ||
    JSON.stringify(plan.resultAllowlist) !==
      JSON.stringify(RESULT_ALLOWLIST[plan.stage])
  ) {
    throw new TypeError('Controlled rootless stage identity drifted.');
  }
  const packageImport =
    plan.packageImport === null
      ? null
      : exactRecord(
          plan.packageImport,
          [
            'path',
            'digest',
            'byteLength',
            'contentDigest',
            'manifestDigest',
            'fileSetDigest',
            'entryCount',
            'totalFileBytes',
            'maximumDepth',
          ],
          'Controlled rootless package import'
        );
  if (
    (plan.ordinal < 2 && packageImport !== null) ||
    (plan.ordinal >= 2 && packageImport === null)
  ) {
    throw new TypeError(
      'Controlled rootless package import stage binding drifted.'
    );
  }
  if (
    packageImport &&
    (relativePath(packageImport.path, 'Package import path') !==
      '.prodivix/package-import.json.gz' ||
      !DIGEST_PATTERN.test(packageImport.digest) ||
      !DIGEST_PATTERN.test(packageImport.contentDigest) ||
      !DIGEST_PATTERN.test(packageImport.manifestDigest) ||
      !DIGEST_PATTERN.test(packageImport.fileSetDigest) ||
      !Number.isSafeInteger(packageImport.byteLength) ||
      packageImport.byteLength < 1 ||
      packageImport.byteLength > MAXIMUM_PACKAGE_IMPORT_BYTES ||
      !Number.isSafeInteger(packageImport.entryCount) ||
      packageImport.entryCount < 1 ||
      packageImport.entryCount > MAXIMUM_PACKAGE_IMPORT_ENTRIES ||
      !Number.isSafeInteger(packageImport.totalFileBytes) ||
      packageImport.totalFileBytes < 1 ||
      packageImport.totalFileBytes > MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES ||
      !Number.isSafeInteger(packageImport.maximumDepth) ||
      packageImport.maximumDepth < 1 ||
      packageImport.maximumDepth > MAXIMUM_PACKAGE_IMPORT_DEPTH)
  ) {
    throw new TypeError('Controlled rootless package import drifted.');
  }
  return Object.freeze({
    ...plan,
    testReportFilePath: relativePath(
      plan.testReportFilePath,
      'Test report path'
    ),
    coverageSummaryFilePath: relativePath(
      plan.coverageSummaryFilePath,
      'Coverage summary path'
    ),
    buildOutputDirectoryPath: relativePath(
      plan.buildOutputDirectoryPath,
      'Build output path'
    ),
    packageImport,
  });
};

export const decodeControlledStaticRootlessPackageSeedAuthorityBytes = (
  source,
  expected
) => {
  const contents = Buffer.from(source).toString('utf8');
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new TypeError('Controlled rootless package seed JSON is invalid.');
  }
  if (JSON.stringify(value) !== contents) {
    throw new TypeError(
      'Controlled rootless package seed JSON is not canonical.'
    );
  }
  const seed = exactRecord(
    value,
    ['format', 'lockDigest', 'packageImport', 'presetId'],
    'Controlled rootless package seed'
  );
  const packageImport = exactRecord(
    seed.packageImport,
    [
      'byteLength',
      'contentDigest',
      'digest',
      'entryCount',
      'fileSetDigest',
      'manifestDigest',
      'maximumDepth',
      'totalFileBytes',
    ],
    'Controlled rootless package seed archive'
  );
  if (
    seed.format !== PACKAGE_SEED_FORMAT ||
    seed.presetId !== expected.presetId ||
    seed.lockDigest !== expected.lockDigest ||
    ![
      seed.lockDigest,
      packageImport.contentDigest,
      packageImport.digest,
      packageImport.fileSetDigest,
      packageImport.manifestDigest,
    ].every(
      (digest) => typeof digest === 'string' && DIGEST_PATTERN.test(digest)
    ) ||
    !Number.isSafeInteger(packageImport.byteLength) ||
    packageImport.byteLength < 1 ||
    packageImport.byteLength > MAXIMUM_PACKAGE_IMPORT_BYTES ||
    !Number.isSafeInteger(packageImport.entryCount) ||
    packageImport.entryCount < 1 ||
    packageImport.entryCount > MAXIMUM_PACKAGE_IMPORT_ENTRIES ||
    !Number.isSafeInteger(packageImport.totalFileBytes) ||
    packageImport.totalFileBytes < 1 ||
    packageImport.totalFileBytes > MAXIMUM_PACKAGE_IMPORT_TOTAL_FILE_BYTES ||
    !Number.isSafeInteger(packageImport.maximumDepth) ||
    packageImport.maximumDepth < 1 ||
    packageImport.maximumDepth > MAXIMUM_PACKAGE_IMPORT_DEPTH
  ) {
    throw new TypeError('Controlled rootless package seed drifted.');
  }
  return Object.freeze({
    ...packageImport,
    path: PACKAGE_SEED_WORKSPACE_PATH,
  });
};

const materializeImagePackageSeed = async (plan) => {
  const seedRoot = `${PACKAGE_SEED_ROOT}/${plan.presetId}`;
  packageSeedFailurePhase = 'authority-read';
  const authoritySource = await readFile(`${seedRoot}/authority.json`);
  packageSeedFailurePhase = 'authority-decode';
  const authority = decodeControlledStaticRootlessPackageSeedAuthorityBytes(
    authoritySource,
    {
      presetId: plan.presetId,
      lockDigest: plan.lockDigest,
    }
  );
  packageSeedFailurePhase = 'archive-read';
  const archive = await readFile(`${seedRoot}/package-import.json.gz`);
  packageSeedFailurePhase = 'archive-write';
  await writeFile(
    workspacePath(PACKAGE_SEED_WORKSPACE_PATH),
    archive,
    { flag: 'wx', mode: 0o600 }
  );
  await materializePackageImport(authority, (phase) => {
    packageSeedFailurePhase = phase;
  });
  return authority;
};

const scanInputFileSet = async () => {
  const facts = [];
  const visit = async (directory, prefix) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodePoints(left.name, right.name));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = workspacePath(path);
      if (entry.isDirectory()) {
        await visit(absolutePath, path);
        continue;
      }
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new TypeError(
          'Controlled rootless stage input contains a special file.'
        );
      }
      const contents = await readFile(absolutePath);
      facts.push({
        digest: sha256(contents),
        path,
        size: contents.byteLength,
      });
    }
  };
  await visit('/workspace', '');
  facts.sort((left, right) => compareCodePoints(left.path, right.path));
  return Object.freeze({
    count: facts.length,
    digest: sha256(Buffer.from(JSON.stringify(facts), 'utf8')),
  });
};

const assertFreshBaseline = async (plan) => {
  const checks = Object.freeze({
    nodeModulesAbsent: !(await pathExists('node_modules')),
    buildOutputAbsent: !(await pathExists(plan.buildOutputDirectoryPath)),
    testOutputAbsent: !(await pathExists(plan.testReportFilePath)),
    coverageOutputAbsent: !(await pathExists(plan.coverageSummaryFilePath)),
    controlledOutputAbsent: !(await pathExists(OUTPUT_ROOT)),
  });
  if (Object.values(checks).some((value) => !value)) {
    throw new TypeError(
      'Controlled rootless stage did not start from a fresh baseline.'
    );
  }
  return checks;
};

const copyRegularTree = async (sourcePath, resultPrefix) => {
  const sourceRoot = workspacePath(sourcePath);
  const sourceStats = await lstat(sourceRoot);
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new TypeError('Controlled rootless build output is not a directory.');
  }
  const files = [];
  const visit = async (directory, prefix) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodePoints(left.name, right.name));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const source = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(source, path);
        continue;
      }
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new TypeError(
          'Controlled rootless build output contains a special file.'
        );
      }
      const contents = await readFile(source);
      const targetPath = `${resultPrefix}/${path}`;
      const target = workspacePath(`${OUTPUT_ROOT}/${targetPath}`);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, contents, {
        flag: 'wx',
        mode: 0o600,
      });
      files.push({
        path: targetPath,
        size: contents.byteLength,
        digest: sha256(contents),
      });
    }
  };
  await visit(sourceRoot, '');
  if (!files.length) {
    throw new TypeError('Controlled rootless build output is empty.');
  }
  files.sort((left, right) => compareCodePoints(left.path, right.path));
  return Object.freeze(files);
};

const copyRegularFile = async (sourcePath, outputPath) => {
  const source = workspacePath(sourcePath);
  const stats = await lstat(source);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new TypeError('Controlled rootless result is not a regular file.');
  }
  const contents = await readFile(source);
  const target = workspacePath(`${OUTPUT_ROOT}/${outputPath}`);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, contents, {
    flag: 'wx',
    mode: 0o600,
  });
  return Object.freeze({
    path: outputPath,
    size: contents.byteLength,
    digest: sha256(contents),
  });
};

const commandPlan = (plan, environmentDigest) => {
  const nodeTool = (subjectBinary, subjectVersion) => ({
    binary: 'node',
    version: plan.nodeVersion,
    subjectBinary,
    subjectVersion,
  });
  if (plan.stage === 'version') {
    return {
      stage: plan.stage,
      application: 'pnpm',
      args: ['--version'],
      environmentDigest,
      tool: { binary: 'pnpm', version: plan.pnpmVersion },
      timeoutMs: 30_000,
    };
  }
  if (plan.stage === 'install') {
    return {
      stage: plan.stage,
      application: 'pnpm',
      args: [
        'install',
        '--frozen-lockfile',
        '--offline',
        '--ignore-scripts',
        '--reporter=append-only',
        '--loglevel=error',
        '--frozen-store',
        '--no-verify-store-integrity',
        '--store-dir=/opt/prodivix/pnpm-store',
        '--package-import-method=copy',
      ],
      environmentDigest,
      tool: { binary: 'pnpm', version: plan.pnpmVersion },
      timeoutMs: 60_000,
    };
  }
  if (plan.stage === 'isolation') {
    return {
      stage: plan.stage,
      application: 'node',
      args: ['.prodivix/isolation-probe.mjs'],
      environmentDigest,
      tool: nodeTool(
        '.prodivix/isolation-probe.mjs',
        plan.isolationProbeDigest
      ),
      timeoutMs: 30_000,
    };
  }
  if (plan.stage === 'typecheck') {
    const subject =
      plan.presetId === 'vue-vite'
        ? 'node_modules/vue-tsc/bin/vue-tsc.js'
        : 'node_modules/typescript/bin/tsc';
    return {
      stage: plan.stage,
      application: 'node',
      args: [
        subject,
        ...(plan.presetId === 'vue-vite' ? ['--noEmit'] : ['-b']),
      ],
      environmentDigest,
      tool: nodeTool(subject, plan.typescriptVersion),
      timeoutMs: 45_000,
    };
  }
  if (plan.stage === 'build') {
    const subject = 'node_modules/vite/bin/vite.js';
    return {
      stage: plan.stage,
      application: 'node',
      args: [subject, 'build', '--config=.prodivix/controlled-vite.config.mjs'],
      environmentDigest,
      tool: nodeTool(subject, plan.viteVersion),
      timeoutMs: 45_000,
    };
  }
  const subject = 'node_modules/vitest/vitest.mjs';
  return {
    stage: plan.stage,
    application: 'node',
    args: [
      subject,
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
    environmentDigest,
    tool: nodeTool(subject, plan.vitestVersion),
    timeoutMs: 45_000,
  };
};

const sanitizeExecutionEnvironment = () => {
  for (const key of [
    'npm_config_cache',
    'npm_config_store_dir',
    'YARN_CACHE_FOLDER',
    'BUN_INSTALL_CACHE_DIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ]) {
    delete process.env[key];
  }
};

const run = async () => {
  failurePhase = 'runtime-import';
  commandAuthorityFailureFacts = null;
  packageSeedFailurePhase = null;
  const {
    assertControlledStageSucceeded,
    controlledExecutionEnvironment,
    controlledInstallEnvironment,
    runControlledSandboxStage,
  } = await import('./controlled-static-sandbox-runtime.mjs');
  failurePhase = 'stage-plan';
  const plan = await readStagePlan();
  failurePhase = 'input-file-set';
  const inputFileSet = await scanInputFileSet();
  failurePhase = 'fresh-baseline';
  const freshBaseline = await assertFreshBaseline(plan);
  const installPhase = plan.stage === 'version' || plan.stage === 'install';
  if (!installPhase) sanitizeExecutionEnvironment();
  failurePhase = 'environment';
  const environment = installPhase
    ? controlledInstallEnvironment()
    : controlledExecutionEnvironment();
  let packageSeed = null;
  if (plan.stage === 'install') {
    failurePhase = 'package-seed';
    packageSeed = await materializeImagePackageSeed(plan);
  } else if (plan.packageImport) {
    failurePhase = 'package-import';
    await materializePackageImport(plan.packageImport);
  }
  failurePhase = 'command';
  const command = await runControlledSandboxStage(
    commandPlan(plan, environment.digest)
  );
  failurePhase = 'command-authority';
  const commandFailureSource = Buffer.concat([
    command.stderr,
    command.stdout,
  ]).toString('utf8');
  const commandFailureCode =
    /(?:^|[^A-Z0-9_])(ERR_PNPM_[A-Z0-9_]+|EACCES|EROFS|EXDEV|ENOENT|ENOSPC)(?:[^A-Z0-9_]|$)/u.exec(
      commandFailureSource
    )?.[1] ?? null;
  commandAuthorityFailureFacts = Object.freeze({
    exitCode: command.receipt.exitCode,
    signal: command.receipt.signal,
    timedOut: command.receipt.timedOut,
    failureCode: commandFailureCode,
    stdoutByteLength: command.receipt.stdout.byteLength,
    stdoutCapturedByteLength: command.receipt.stdout.capturedByteLength,
    stdoutTruncated: command.receipt.stdout.truncated,
    stderrByteLength: command.receipt.stderr.byteLength,
    stderrCapturedByteLength: command.receipt.stderr.capturedByteLength,
    stderrTruncated: command.receipt.stderr.truncated,
  });
  assertControlledStageSucceeded(command);
  if (
    plan.stage === 'version' &&
    command.stdout.toString('utf8').trim() !== plan.pnpmVersion
  ) {
    throw new TypeError('Controlled rootless pnpm version drifted.');
  }
  await mkdir(workspacePath(OUTPUT_ROOT), {
    recursive: true,
    mode: 0o700,
  });
  failurePhase = 'result-projection';
  const resultFiles = [];
  let packageImportResult = null;
  let isolationResult = null;
  if (plan.stage === 'install') {
    packageImportResult = await createPackageImport();
    if (
      !packageSeed ||
      packageImportResult.contentDigest !== packageSeed.contentDigest ||
      packageImportResult.manifestDigest !== packageSeed.manifestDigest ||
      packageImportResult.fileSetDigest !== packageSeed.fileSetDigest ||
      packageImportResult.entryCount !== packageSeed.entryCount ||
      packageImportResult.totalFileBytes !== packageSeed.totalFileBytes ||
      packageImportResult.maximumDepth !== packageSeed.maximumDepth
    ) {
      throw new TypeError(
        'Controlled rootless installed package seed drifted.'
      );
    }
    resultFiles.push({
      path: packageImportResult.path,
      size: packageImportResult.size,
      digest: packageImportResult.digest,
    });
  } else if (plan.stage === 'isolation') {
    try {
      isolationResult = JSON.parse(command.stdout.toString('utf8'));
    } catch {
      throw new TypeError(
        'Controlled rootless isolation observation is invalid.'
      );
    }
    if (
      isolationResult?.format !==
        'prodivix.controlled-static-isolation-probe.v1' ||
      isolationResult.egressAttemptCount !== 5 ||
      isolationResult.egressSuccessCount !== 0
    ) {
      throw new TypeError('Controlled rootless isolation observation drifted.');
    }
    const contents = Buffer.from(JSON.stringify(isolationResult), 'utf8');
    const path = 'results/isolation.json';
    await mkdir(workspacePath(RESULTS_ROOT), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(workspacePath(`${OUTPUT_ROOT}/${path}`), contents, {
      flag: 'wx',
      mode: 0o600,
    });
    resultFiles.push({
      path,
      size: contents.byteLength,
      digest: sha256(contents),
    });
  } else if (plan.stage === 'build') {
    resultFiles.push(
      ...(await copyRegularTree(plan.buildOutputDirectoryPath, 'results/build'))
    );
    const buildLog = Buffer.concat([command.stdout, command.stderr]);
    const path = 'results/build-log.txt';
    await writeFile(workspacePath(`${OUTPUT_ROOT}/${path}`), buildLog, {
      flag: 'wx',
      mode: 0o600,
    });
    resultFiles.push({
      path,
      size: buildLog.byteLength,
      digest: sha256(buildLog),
    });
  } else if (plan.stage === 'test') {
    resultFiles.push(
      await copyRegularFile(
        plan.testReportFilePath,
        'results/test-report.json'
      ),
      await copyRegularFile(
        plan.coverageSummaryFilePath,
        'results/coverage-summary.json'
      )
    );
  }
  resultFiles.sort((left, right) => compareCodePoints(left.path, right.path));
  const canonicalResultFiles = resultFiles.map(({ path, size, digest }) => ({
    digest,
    path,
    size,
  }));
  const resultSetDigest = sha256(
    Buffer.from(JSON.stringify(canonicalResultFiles), 'utf8')
  );
  const authority = {
    format: STAGE_AUTHORITY_FORMAT,
    stage: plan.stage,
    ordinal: plan.ordinal,
    requestDigest: plan.requestDigest,
    snapshotDigest: plan.snapshotDigest,
    input: {
      fileSetDigest: inputFileSet.digest,
      fileCount: inputFileSet.count,
      freshBaseline: {
        ...freshBaseline,
        priorStageResultCount: 0,
        forbiddenPaths: [],
      },
      packageImport: plan.packageImport,
      toolchainBinding: {
        manifestDigest: plan.manifestDigest,
        lockDigest: plan.lockDigest,
        toolchainFileSetDigest: plan.toolchainFileSetDigest,
        rollupVersion: plan.rollupVersion,
        rollupImplementation: plan.rollupImplementation,
        rollupAliasSpec: plan.rollupAliasSpec,
        esbuildVersion: plan.esbuildVersion,
        esbuildImplementation: plan.esbuildImplementation,
        esbuildAliasSpec: plan.esbuildAliasSpec,
      },
    },
    environment,
    command: command.receipt,
    nodeBinaryDigest: sha256(await readFile(process.execPath)),
    results: {
      allowlist: plan.resultAllowlist,
      files: canonicalResultFiles,
      resultSetDigest,
      packageImport: packageImportResult,
      isolation: isolationResult,
    },
    innerProcessObservation: {
      source: 'sandbox-self-report',
      directCommandCount: 1,
      residualProcessCount: 0,
      cleanupVerified: true,
    },
  };
  failurePhase = 'authority-write';
  await writeFile(
    workspacePath(`${OUTPUT_ROOT}/authority.json`),
    Buffer.from(JSON.stringify(authority), 'utf8'),
    { flag: 'wx', mode: 0o600 }
  );
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:${failurePhase}\n`
    );
    if (failurePhase === 'package-seed' && packageSeedFailurePhase) {
      const failureCode =
        typeof error?.code === 'string' &&
        /^(?:EACCES|EEXIST|ENOENT|ENOSPC|EROFS)$/u.test(error.code)
          ? error.code
          : null;
      process.stderr.write(
        `PRODIVIX_CONTROLLED_ROOTLESS_PACKAGE_SEED_FAILURE:${Buffer.from(
          JSON.stringify({
            phase: packageSeedFailurePhase,
            failureCode,
          }),
          'utf8'
        ).toString('base64')}\n`
      );
    }
    if (failurePhase === 'command-authority' && commandAuthorityFailureFacts) {
      process.stderr.write(
        `PRODIVIX_CONTROLLED_ROOTLESS_COMMAND_AUTHORITY_FAILURE:${Buffer.from(
          JSON.stringify(commandAuthorityFailureFacts),
          'utf8'
        ).toString('base64')}\n`
      );
    }
    process.exitCode = 1;
  }
}
