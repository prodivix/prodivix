import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  assertGoldenAuthorityDigest,
  goldenAuthorityCanonicalDigest,
  goldenAuthorityExactDigest,
  goldenAuthorityExactInteger,
  goldenAuthorityExactRecord,
} from './generatedProjectToolchainAuthorityDecoding';

export const ROOTLESS_STAGE_ORDER = Object.freeze([
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
] as const);
export type RootlessStage = (typeof ROOTLESS_STAGE_ORDER)[number];

export const ROOTLESS_RESULT_ALLOWLIST: Readonly<
  Record<RootlessStage, readonly string[]>
> = Object.freeze({
  version: Object.freeze([]),
  install: Object.freeze(['package-import']),
  isolation: Object.freeze(['isolation-observation']),
  typecheck: Object.freeze([]),
  build: Object.freeze(['build-file-set', 'build-log']),
  test: Object.freeze(['coverage-summary', 'test-report']),
});

export const OCI_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
export const SEMVER_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u;
const EMPTY_DIGEST =
  'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export type RootlessRecord = Readonly<Record<string, unknown>>;

const decodeRootlessOutput = (
  value: unknown,
  label: string
): RootlessRecord => {
  const record = goldenAuthorityExactRecord(
    value,
    ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
    label
  );
  const byteLength = goldenAuthorityExactInteger(
    record.byteLength,
    `${label} byteLength`
  );
  if (
    goldenAuthorityExactInteger(
      record.capturedByteLength,
      `${label} capturedByteLength`
    ) !== byteLength ||
    record.truncated !== false
  ) {
    throw new Error(`${label} was not captured exactly.`);
  }
  return Object.freeze({
    digest: goldenAuthorityExactDigest(record.digest, `${label} digest`),
    byteLength,
    capturedByteLength: byteLength,
    truncated: false,
  });
};

export const decodeRootlessControllerProcess = (
  value: unknown,
  label: string
): RootlessRecord => {
  const record = goldenAuthorityExactRecord(
    value,
    [
      'application',
      'args',
      'cwd',
      'environmentDigest',
      'startedAtEpochMs',
      'completedAtEpochMs',
      'exitCode',
      'signal',
      'timedOut',
      'stdout',
      'stderr',
    ],
    label
  );
  const startedAtEpochMs = goldenAuthorityExactInteger(
    record.startedAtEpochMs,
    `${label} start`
  );
  const completedAtEpochMs = goldenAuthorityExactInteger(
    record.completedAtEpochMs,
    `${label} completion`
  );
  if (
    record.application !== 'podman' ||
    !Array.isArray(record.args) ||
    record.args.some((argument) => typeof argument !== 'string') ||
    record.cwd !== 'repository:/' ||
    !Number.isSafeInteger(record.exitCode) ||
    record.signal !== null ||
    record.timedOut !== false ||
    completedAtEpochMs < startedAtEpochMs
  ) {
    throw new Error(`${label} identity drifted.`);
  }
  return Object.freeze({
    application: 'podman',
    args: Object.freeze([...(record.args as string[])]),
    cwd: 'repository:/',
    environmentDigest: goldenAuthorityExactDigest(
      record.environmentDigest,
      `${label} environment`
    ),
    startedAtEpochMs,
    completedAtEpochMs,
    exitCode: record.exitCode as number,
    signal: null,
    timedOut: false,
    stdout: decodeRootlessOutput(record.stdout, `${label} stdout`),
    stderr: decodeRootlessOutput(record.stderr, `${label} stderr`),
  });
};

export const processArgs = (receipt: RootlessRecord): readonly string[] =>
  receipt.args as readonly string[];
export const processExitCode = (receipt: RootlessRecord): number =>
  receipt.exitCode as number;
export const processStartedAt = (receipt: RootlessRecord): number =>
  receipt.startedAtEpochMs as number;
export const processCompletedAt = (receipt: RootlessRecord): number =>
  receipt.completedAtEpochMs as number;

export type RootlessIdentity = Readonly<{
  requestDigest: string;
  snapshotDigest: string;
  manifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  rollupVersion: '4.62.3';
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: '0.27.7';
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
}>;

export const decodeRootlessPackageImport = (
  value: unknown,
  identity: RootlessIdentity
): RootlessRecord => {
  const record = goldenAuthorityExactRecord(
    value,
    [
      'format',
      'producerStage',
      'requestDigest',
      'snapshotDigest',
      'projectManifestDigest',
      'lockDigest',
      'toolchainFileSetDigest',
      'rollupVersion',
      'rollupImplementation',
      'rollupAliasSpec',
      'esbuildVersion',
      'esbuildImplementation',
      'esbuildAliasSpec',
      'archivePath',
      'archiveDigest',
      'archiveByteLength',
      'contentDigest',
      'manifestDigest',
      'fileSetDigest',
      'entryCount',
      'totalFileBytes',
      'maximumDepth',
      'installStageAuthorityDigest',
      'authorityDigest',
    ],
    'Golden rootless package import authority'
  );
  const archiveByteLength = goldenAuthorityExactInteger(
    record.archiveByteLength,
    'Golden rootless package archive bytes'
  );
  const entryCount = goldenAuthorityExactInteger(
    record.entryCount,
    'Golden rootless package entry count'
  );
  const totalFileBytes = goldenAuthorityExactInteger(
    record.totalFileBytes,
    'Golden rootless package file bytes'
  );
  const maximumDepth = goldenAuthorityExactInteger(
    record.maximumDepth,
    'Golden rootless package maximum depth'
  );
  if (
    record.format !==
      'prodivix.controlled-static-rootless-package-import-authority.v1' ||
    record.producerStage !== 'install' ||
    record.requestDigest !== identity.requestDigest ||
    record.snapshotDigest !== identity.snapshotDigest ||
    record.projectManifestDigest !== identity.manifestDigest ||
    record.lockDigest !== identity.lockDigest ||
    record.toolchainFileSetDigest !== identity.toolchainFileSetDigest ||
    record.rollupVersion !== identity.rollupVersion ||
    record.rollupImplementation !== identity.rollupImplementation ||
    record.rollupAliasSpec !== identity.rollupAliasSpec ||
    record.esbuildVersion !== identity.esbuildVersion ||
    record.esbuildImplementation !== identity.esbuildImplementation ||
    record.esbuildAliasSpec !== identity.esbuildAliasSpec ||
    record.archivePath !== '.prodivix/package-import.json.gz' ||
    archiveByteLength < 1 ||
    entryCount < 1 ||
    totalFileBytes < 1 ||
    maximumDepth < 1
  ) {
    throw new Error('Golden rootless package import identity drifted.');
  }
  const authority = Object.freeze({
    format: record.format,
    producerStage: 'install',
    requestDigest: identity.requestDigest,
    snapshotDigest: identity.snapshotDigest,
    projectManifestDigest: identity.manifestDigest,
    lockDigest: identity.lockDigest,
    toolchainFileSetDigest: identity.toolchainFileSetDigest,
    rollupVersion: identity.rollupVersion,
    rollupImplementation: identity.rollupImplementation,
    rollupAliasSpec: identity.rollupAliasSpec,
    esbuildVersion: identity.esbuildVersion,
    esbuildImplementation: identity.esbuildImplementation,
    esbuildAliasSpec: identity.esbuildAliasSpec,
    archivePath: '.prodivix/package-import.json.gz',
    archiveDigest: goldenAuthorityExactDigest(
      record.archiveDigest,
      'Golden rootless package archive digest'
    ),
    archiveByteLength,
    contentDigest: goldenAuthorityExactDigest(
      record.contentDigest,
      'Golden rootless package content digest'
    ),
    manifestDigest: goldenAuthorityExactDigest(
      record.manifestDigest,
      'Golden rootless package manifest digest'
    ),
    fileSetDigest: goldenAuthorityExactDigest(
      record.fileSetDigest,
      'Golden rootless package file-set digest'
    ),
    entryCount,
    totalFileBytes,
    maximumDepth,
    installStageAuthorityDigest: goldenAuthorityExactDigest(
      record.installStageAuthorityDigest,
      'Golden rootless install-stage digest'
    ),
    authorityDigest: goldenAuthorityExactDigest(
      record.authorityDigest,
      'Golden rootless package authority digest'
    ),
  });
  assertGoldenAuthorityDigest(authority, 'Golden rootless package authority');
  if (!sameCanonicalJson(authority, record)) {
    throw new Error('Golden rootless package authority fields drifted.');
  }
  return authority;
};

export const decodeRootlessCleanup = (
  value: unknown,
  input: Readonly<{
    stage: RootlessStage;
    ordinal: number;
    snapshotDigest: string;
    imageDigest: string;
    providerEnvironmentDigest: string;
    providerCompletedAtEpochMs: number;
  }>
): RootlessRecord => {
  const label = `Golden rootless ${input.stage} cleanup`;
  const record = goldenAuthorityExactRecord(
    value,
    [
      'format',
      'stage',
      'ordinal',
      'container',
      'action',
      'remove',
      'absence',
      'residualQuery',
      'processProof',
      'workspaceProof',
      'containerRemoved',
      'residualContainerCount',
      'residualProcessCount',
      'residualWorkspaceCount',
      'killOnContainerExit',
      'cleanupVerified',
      'authorityDigest',
    ],
    label
  );
  const container = goldenAuthorityExactRecord(
    record.container,
    ['name', 'executionId', 'imageDigest'],
    `${label} container`
  );
  const expectedExecutionId = `g3-v6-${input.snapshotDigest.slice(
    7,
    23
  )}-${input.stage}-${input.ordinal}`;
  if (
    record.format !==
      'prodivix.controlled-static-rootless-stage-cleanup-authority.v1' ||
    record.stage !== input.stage ||
    record.ordinal !== input.ordinal ||
    typeof container.name !== 'string' ||
    !new RegExp(`^prodivix-g3-v6-static-${input.stage}-[a-f0-9]{8}$`, 'u').test(
      container.name
    ) ||
    container.executionId !== expectedExecutionId ||
    container.imageDigest !== input.imageDigest ||
    record.action !== 'podman-rm-force-then-absence-and-label-query' ||
    record.processProof !== 'removed-container-with-private-pid-namespace' ||
    record.workspaceProof !== 'removed-container-tmpfs' ||
    record.containerRemoved !== true ||
    record.residualContainerCount !== 0 ||
    record.residualProcessCount !== 0 ||
    record.residualWorkspaceCount !== 0 ||
    record.killOnContainerExit !== true ||
    record.cleanupVerified !== true
  ) {
    throw new Error(`${label} identity drifted.`);
  }
  const remove = decodeRootlessControllerProcess(
    record.remove,
    `${label} remove`
  );
  const absence = decodeRootlessControllerProcess(
    record.absence,
    `${label} absence`
  );
  const residualQuery = decodeRootlessControllerProcess(
    record.residualQuery,
    `${label} residual query`
  );
  const residualStdout = residualQuery.stdout as RootlessRecord;
  if (
    !sameCanonicalJson(processArgs(remove), [
      'rm',
      '--force',
      '--ignore',
      container.name,
    ]) ||
    processExitCode(remove) !== 0 ||
    !sameCanonicalJson(processArgs(absence), [
      'container',
      'exists',
      container.name,
    ]) ||
    processExitCode(absence) !== 1 ||
    !sameCanonicalJson(processArgs(residualQuery), [
      'ps',
      '--all',
      '--filter',
      `label=prodivix.remote-execution=${expectedExecutionId}`,
      '--format',
      '{{.ID}}',
    ]) ||
    processExitCode(residualQuery) !== 0 ||
    [remove, absence, residualQuery].some(
      (process) => process.environmentDigest !== input.providerEnvironmentDigest
    ) ||
    processStartedAt(remove) < input.providerCompletedAtEpochMs ||
    processStartedAt(absence) < processCompletedAt(remove) ||
    processStartedAt(residualQuery) < processCompletedAt(absence) ||
    residualStdout.digest !== EMPTY_DIGEST ||
    residualStdout.byteLength !== 0
  ) {
    throw new Error(`${label} outer proof drifted.`);
  }
  const base = Object.freeze({
    format: record.format,
    stage: input.stage,
    ordinal: input.ordinal,
    container: Object.freeze({
      name: container.name,
      executionId: expectedExecutionId,
      imageDigest: input.imageDigest,
    }),
    action: record.action,
    remove,
    absence,
    residualQuery,
    processProof: record.processProof,
    workspaceProof: record.workspaceProof,
    containerRemoved: true,
    residualContainerCount: 0,
    residualProcessCount: 0,
    residualWorkspaceCount: 0,
    killOnContainerExit: true,
    cleanupVerified: true,
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: goldenAuthorityCanonicalDigest(base),
  });
  if (!sameCanonicalJson(authority, record)) {
    throw new Error(`${label} digest drifted.`);
  }
  return authority;
};

export const expectedRootlessProviderArgs = (
  actual: readonly string[],
  input: Readonly<{
    stage: RootlessStage;
    ordinal: number;
    snapshotDigest: string;
    imageDigest: string;
    containerName: string;
  }>
): readonly string[] => {
  const user = actual[11];
  if (typeof user !== 'string' || !/^--user=[1-9][0-9]*:[0-9]+$/u.test(user)) {
    throw new Error(`Golden rootless ${input.stage} user identity drifted.`);
  }
  const executionId = `g3-v6-${input.snapshotDigest.slice(
    7,
    23
  )}-${input.stage}-${input.ordinal}`;
  return Object.freeze([
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    `--name=${input.containerName}`,
    `--label=prodivix.remote-execution=${executionId}`,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--userns=keep-id',
    user,
    '--pid=private',
    '--ipc=private',
    '--uts=private',
    '--cgroupns=private',
    '--log-driver=none',
    '--cpus=2',
    '--memory=2048m',
    '--memory-swap=2048m',
    '--pids-limit=256',
    '--ulimit=nofile=4096:4096',
    '--ulimit=core=0:0',
    '--tmpfs=/workspace:rw,nosuid,nodev,size=1024m,mode=0777',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=1024m,mode=1777',
    '--workdir=/workspace',
    input.imageDigest,
  ]);
};
