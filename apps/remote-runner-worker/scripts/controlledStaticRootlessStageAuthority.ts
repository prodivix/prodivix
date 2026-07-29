import { createHash } from 'node:crypto';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';

export const CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER = Object.freeze([
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
] as const);

export const CONTROLLED_STATIC_ROOTLESS_NODE_VERSION = '22.23.1';

export type ControlledStaticRootlessStage =
  (typeof CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER)[number];

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const OCI_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const EMPTY_DIGEST =
  'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const RESULT_ALLOWLIST: Readonly<
  Record<ControlledStaticRootlessStage, readonly string[]>
> = Object.freeze({
  version: Object.freeze([]),
  install: Object.freeze(['package-import']),
  isolation: Object.freeze(['isolation-observation']),
  typecheck: Object.freeze([]),
  build: Object.freeze(['build-file-set', 'build-log']),
  test: Object.freeze(['coverage-summary', 'test-report']),
});

export type ControlledStaticRootlessProcessOutput = Readonly<{
  digest: string;
  byteLength: number;
  capturedByteLength: number;
  truncated: false;
}>;

export type ControlledStaticRootlessControllerProcessReceipt = Readonly<{
  application: 'podman';
  args: readonly string[];
  cwd: 'repository:/';
  environmentDigest: string;
  startedAtEpochMs: number;
  completedAtEpochMs: number;
  exitCode: number;
  signal: string | null;
  timedOut: false;
  stdout: ControlledStaticRootlessProcessOutput;
  stderr: ControlledStaticRootlessProcessOutput;
}>;

export type ControlledStaticRootlessCommandReceipt = Readonly<{
  stage: ControlledStaticRootlessStage;
  application: string;
  args: readonly string[];
  cwd: 'workspace:/';
  executionBoundary: 'sandbox';
  environmentDigest: string;
  tool: Readonly<{
    binary: string;
    version: string;
    subjectBinary?: string;
    subjectVersion?: string;
  }>;
  startedAtEpochMs: number;
  completedAtEpochMs: number;
  exitCode: 0;
  signal: null;
  timedOut: false;
  stdout: ControlledStaticRootlessProcessOutput;
  stderr: ControlledStaticRootlessProcessOutput;
}>;

export type ControlledStaticRootlessStageCleanupAuthority = Readonly<{
  format: 'prodivix.controlled-static-rootless-stage-cleanup-authority.v1';
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  container: Readonly<{
    name: string;
    executionId: string;
    imageDigest: string;
  }>;
  action: 'podman-rm-force-then-absence-and-label-query';
  remove: ControlledStaticRootlessControllerProcessReceipt;
  absence: ControlledStaticRootlessControllerProcessReceipt;
  residualQuery: ControlledStaticRootlessControllerProcessReceipt;
  processProof: 'removed-container-with-private-pid-namespace';
  workspaceProof: 'removed-container-tmpfs';
  containerRemoved: true;
  residualContainerCount: 0;
  residualProcessCount: 0;
  residualWorkspaceCount: 0;
  killOnContainerExit: true;
  cleanupVerified: true;
  authorityDigest: string;
}>;

export type ControlledStaticRootlessStageAuthority = Readonly<{
  format: 'prodivix.controlled-static-rootless-stage-authority.v1';
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  requestDigest: string;
  snapshotDigest: string;
  projectManifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  rollupVersion: '4.62.3';
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: '0.27.7';
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
  sourceBaselineDigest: string;
  providerFileSetDigest: string;
  observedInputFileSetDigest: string;
  observedInputFileCount: number;
  packageImportDigest: string | null;
  freshBaseline: Readonly<{
    nodeModulesAbsent: true;
    buildOutputAbsent: true;
    testOutputAbsent: true;
    coverageOutputAbsent: true;
    priorStageResultCount: 0;
    forbiddenPaths: readonly never[];
  }>;
  resultAllowlist: readonly string[];
  resultSetDigest: string;
  innerAuthorityDigest: string;
  innerCleanupClaim: Readonly<{
    source: 'sandbox-self-report';
    directCommandCount: 1;
    residualProcessCount: 0;
    cleanupVerified: true;
  }>;
  command: ControlledStaticRootlessCommandReceipt;
  providerProcess: ControlledStaticRootlessControllerProcessReceipt;
  cleanup: ControlledStaticRootlessStageCleanupAuthority;
  authorityDigest: string;
}>;

export type ControlledStaticRootlessAggregateAuthority = Readonly<{
  format: 'prodivix.controlled-static-rootless-aggregate-stage-authority.v1';
  requestDigest: string;
  snapshotDigest: string;
  projectManifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  rollupVersion: '4.62.3';
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: '0.27.7';
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
  sourceBaselineDigest: string;
  packageImportDigest: string;
  stageOrder: typeof CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER;
  stages: readonly Readonly<{
    stage: ControlledStaticRootlessStage;
    ordinal: number;
    stageAuthorityDigest: string;
    cleanupAuthorityDigest: string;
  }>[];
  activeContainerCount: 0;
  activeProcessCount: 0;
  activeWorkspaceCount: 0;
  cleanupVerified: true;
  authorityDigest: string;
}>;

const digestBytes = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
}

function assertNonNegativeInteger(
  value: unknown,
  label: string
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
}

const assertOutput = (
  output: ControlledStaticRootlessProcessOutput,
  label: string
): void => {
  assertDigest(output.digest, `${label} digest`);
  assertNonNegativeInteger(output.byteLength, `${label} byteLength`);
  assertNonNegativeInteger(
    output.capturedByteLength,
    `${label} capturedByteLength`
  );
  if (
    output.truncated !== false ||
    output.capturedByteLength !== output.byteLength
  ) {
    throw new TypeError(`${label} was not captured exactly.`);
  }
};

const assertControllerProcess = (
  receipt: ControlledStaticRootlessControllerProcessReceipt,
  label: string
): void => {
  if (
    receipt.application !== 'podman' ||
    !Array.isArray(receipt.args) ||
    receipt.args.some((argument) => typeof argument !== 'string') ||
    receipt.cwd !== 'repository:/' ||
    receipt.signal !== null ||
    receipt.timedOut !== false
  ) {
    throw new TypeError(`${label} identity drifted.`);
  }
  assertDigest(receipt.environmentDigest, `${label} environment`);
  assertNonNegativeInteger(receipt.startedAtEpochMs, `${label} start`);
  assertNonNegativeInteger(receipt.completedAtEpochMs, `${label} completion`);
  if (receipt.completedAtEpochMs < receipt.startedAtEpochMs) {
    throw new TypeError(`${label} completed before it started.`);
  }
  assertOutput(receipt.stdout, `${label} stdout`);
  assertOutput(receipt.stderr, `${label} stderr`);
};

const authorityDigest = (
  authority: Readonly<Record<string, unknown>>
): string => digestBytes(canonicalJsonText(authority));

export const controlledStaticRootlessResultAllowlist = (
  stage: ControlledStaticRootlessStage
): readonly string[] => RESULT_ALLOWLIST[stage];

export const createControlledStaticRootlessStageCleanupAuthority = (input: {
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  containerName: string;
  executionId: string;
  imageDigest: string;
  remove: ControlledStaticRootlessControllerProcessReceipt;
  absence: ControlledStaticRootlessControllerProcessReceipt;
  residualQuery: ControlledStaticRootlessControllerProcessReceipt;
}): ControlledStaticRootlessStageCleanupAuthority => {
  const expectedStage = CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER[input.ordinal];
  if (
    input.stage !== expectedStage ||
    !/^prodivix-g3-v6-static-(?:version|install|isolation|typecheck|build|test)-[a-f0-9]{8}$/u.test(
      input.containerName
    ) ||
    !/^g3-v6-[a-f0-9]{16}-(?:version|install|isolation|typecheck|build|test)-[0-5]$/u.test(
      input.executionId
    ) ||
    !OCI_DIGEST_PATTERN.test(input.imageDigest)
  ) {
    throw new TypeError('Rootless stage cleanup identity drifted.');
  }
  assertControllerProcess(input.remove, 'Rootless cleanup remove');
  assertControllerProcess(input.absence, 'Rootless cleanup absence');
  assertControllerProcess(
    input.residualQuery,
    'Rootless cleanup residual query'
  );
  if (
    !sameCanonicalJson(input.remove.args, [
      'rm',
      '--force',
      '--ignore',
      input.containerName,
    ]) ||
    input.remove.exitCode !== 0 ||
    !sameCanonicalJson(input.absence.args, [
      'container',
      'exists',
      input.containerName,
    ]) ||
    input.absence.exitCode !== 1 ||
    !sameCanonicalJson(input.residualQuery.args, [
      'ps',
      '--all',
      '--filter',
      `label=prodivix.remote-execution=${input.executionId}`,
      '--format',
      '{{.ID}}',
    ]) ||
    input.residualQuery.exitCode !== 0 ||
    input.residualQuery.stdout.byteLength !== 0 ||
    input.residualQuery.stdout.digest !== EMPTY_DIGEST
  ) {
    throw new TypeError('Rootless outer cleanup did not prove zero residual.');
  }
  const base = Object.freeze({
    format:
      'prodivix.controlled-static-rootless-stage-cleanup-authority.v1' as const,
    stage: input.stage,
    ordinal: input.ordinal,
    container: Object.freeze({
      name: input.containerName,
      executionId: input.executionId,
      imageDigest: input.imageDigest,
    }),
    action: 'podman-rm-force-then-absence-and-label-query' as const,
    remove: input.remove,
    absence: input.absence,
    residualQuery: input.residualQuery,
    processProof: 'removed-container-with-private-pid-namespace' as const,
    workspaceProof: 'removed-container-tmpfs' as const,
    containerRemoved: true as const,
    residualContainerCount: 0 as const,
    residualProcessCount: 0 as const,
    residualWorkspaceCount: 0 as const,
    killOnContainerExit: true as const,
    cleanupVerified: true as const,
  });
  return Object.freeze({
    ...base,
    authorityDigest: authorityDigest(base),
  });
};

export const createControlledStaticRootlessStageAuthority = (input: {
  stage: ControlledStaticRootlessStage;
  ordinal: number;
  requestDigest: string;
  snapshotDigest: string;
  projectManifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  rollupVersion: string;
  rollupImplementation: string;
  rollupAliasSpec: string;
  esbuildVersion: string;
  esbuildImplementation: string;
  esbuildAliasSpec: string;
  sourceBaselineDigest: string;
  providerFileSetDigest: string;
  observedInputFileSetDigest: string;
  observedInputFileCount: number;
  packageImportDigest: string | null;
  resultSetDigest: string;
  innerAuthorityDigest: string;
  innerCleanupClaim: ControlledStaticRootlessStageAuthority['innerCleanupClaim'];
  command: ControlledStaticRootlessCommandReceipt;
  providerProcess: ControlledStaticRootlessControllerProcessReceipt;
  cleanup: ControlledStaticRootlessStageCleanupAuthority;
}): ControlledStaticRootlessStageAuthority => {
  const expectedStage = CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER[input.ordinal];
  if (
    input.stage !== expectedStage ||
    input.command.stage !== input.stage ||
    !input.command.application ||
    !Array.isArray(input.command.args) ||
    input.command.args.some((argument) => typeof argument !== 'string') ||
    input.command.cwd !== 'workspace:/' ||
    input.command.executionBoundary !== 'sandbox' ||
    input.command.exitCode !== 0 ||
    input.command.signal !== null ||
    input.command.timedOut !== false ||
    input.cleanup.stage !== input.stage ||
    input.cleanup.ordinal !== input.ordinal ||
    input.rollupVersion !== '4.62.3' ||
    input.rollupImplementation !== '@rollup/wasm-node' ||
    input.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3' ||
    input.esbuildVersion !== '0.27.7' ||
    input.esbuildImplementation !== 'esbuild-wasm' ||
    input.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7'
  ) {
    throw new TypeError('Rootless stage authority identity drifted.');
  }
  if (
    !input.innerCleanupClaim ||
    typeof input.innerCleanupClaim !== 'object' ||
    Array.isArray(input.innerCleanupClaim) ||
    !sameCanonicalJson(Object.keys(input.innerCleanupClaim).sort(), [
      'cleanupVerified',
      'directCommandCount',
      'residualProcessCount',
      'source',
    ]) ||
    input.innerCleanupClaim.source !== 'sandbox-self-report' ||
    input.innerCleanupClaim.directCommandCount !== 1 ||
    input.innerCleanupClaim.residualProcessCount !== 0 ||
    input.innerCleanupClaim.cleanupVerified !== true
  ) {
    throw new TypeError('Rootless inner cleanup self-report fields drifted.');
  }
  assertDigest(input.command.environmentDigest, 'Rootless command environment');
  assertNonNegativeInteger(
    input.command.startedAtEpochMs,
    'Rootless command start'
  );
  assertNonNegativeInteger(
    input.command.completedAtEpochMs,
    'Rootless command completion'
  );
  if (
    input.command.completedAtEpochMs < input.command.startedAtEpochMs ||
    !input.command.tool.binary ||
    !input.command.tool.version
  ) {
    throw new TypeError('Rootless command receipt drifted.');
  }
  assertOutput(input.command.stdout, 'Rootless command stdout');
  assertOutput(input.command.stderr, 'Rootless command stderr');
  for (const [label, value] of [
    ['request', input.requestDigest],
    ['snapshot', input.snapshotDigest],
    ['project manifest', input.projectManifestDigest],
    ['lock', input.lockDigest],
    ['toolchain file set', input.toolchainFileSetDigest],
    ['source baseline', input.sourceBaselineDigest],
    ['provider file set', input.providerFileSetDigest],
    ['observed input file set', input.observedInputFileSetDigest],
    ['result set', input.resultSetDigest],
    ['inner authority', input.innerAuthorityDigest],
  ] as const) {
    assertDigest(value, `Rootless stage ${label}`);
  }
  if (input.packageImportDigest !== null) {
    assertDigest(input.packageImportDigest, 'Rootless package import');
  }
  assertNonNegativeInteger(
    input.observedInputFileCount,
    'Rootless observed input file count'
  );
  if (
    input.observedInputFileSetDigest !== input.providerFileSetDigest ||
    (input.ordinal < 2
      ? input.packageImportDigest !== null
      : input.packageImportDigest === null)
  ) {
    throw new TypeError('Rootless stage fresh baseline drifted.');
  }
  assertControllerProcess(
    input.providerProcess,
    `Rootless ${input.stage} provider process`
  );
  if (
    input.providerProcess.exitCode !== 0 ||
    !input.providerProcess.args.includes(
      `--name=${input.cleanup.container.name}`
    ) ||
    !input.providerProcess.args.includes(
      `--label=prodivix.remote-execution=${input.cleanup.container.executionId}`
    ) ||
    !input.providerProcess.args.includes('--network=none') ||
    !input.providerProcess.args.includes('--read-only') ||
    input.providerProcess.args.some(
      (argument) =>
        argument === '-v' ||
        argument.startsWith('--volume') ||
        argument.startsWith('--mount')
    )
  ) {
    throw new TypeError('Rootless stage provider boundary drifted.');
  }
  if (
    input.providerProcess.completedAtEpochMs >
    input.cleanup.remove.startedAtEpochMs
  ) {
    throw new TypeError('Rootless cleanup started before stage completion.');
  }
  const base = Object.freeze({
    format: 'prodivix.controlled-static-rootless-stage-authority.v1' as const,
    stage: input.stage,
    ordinal: input.ordinal,
    requestDigest: input.requestDigest,
    snapshotDigest: input.snapshotDigest,
    projectManifestDigest: input.projectManifestDigest,
    lockDigest: input.lockDigest,
    toolchainFileSetDigest: input.toolchainFileSetDigest,
    rollupVersion: '4.62.3' as const,
    rollupImplementation: '@rollup/wasm-node' as const,
    rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3' as const,
    esbuildVersion: '0.27.7' as const,
    esbuildImplementation: 'esbuild-wasm' as const,
    esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7' as const,
    sourceBaselineDigest: input.sourceBaselineDigest,
    providerFileSetDigest: input.providerFileSetDigest,
    observedInputFileSetDigest: input.observedInputFileSetDigest,
    observedInputFileCount: input.observedInputFileCount,
    packageImportDigest: input.packageImportDigest,
    freshBaseline: Object.freeze({
      nodeModulesAbsent: true as const,
      buildOutputAbsent: true as const,
      testOutputAbsent: true as const,
      coverageOutputAbsent: true as const,
      priorStageResultCount: 0 as const,
      forbiddenPaths: Object.freeze([]) as readonly never[],
    }),
    resultAllowlist: RESULT_ALLOWLIST[input.stage],
    resultSetDigest: input.resultSetDigest,
    innerAuthorityDigest: input.innerAuthorityDigest,
    innerCleanupClaim: input.innerCleanupClaim,
    command: input.command,
    providerProcess: input.providerProcess,
    cleanup: input.cleanup,
  });
  return Object.freeze({
    ...base,
    authorityDigest: authorityDigest(base),
  });
};

const withoutAuthorityDigest = <T extends { authorityDigest: string }>(
  value: T
): Omit<T, 'authorityDigest'> => {
  const { authorityDigest: _authorityDigest, ...base } = value;
  return base;
};

export const assertControlledStaticRootlessStageAuthoritySequence = (
  stages: readonly ControlledStaticRootlessStageAuthority[]
): void => {
  if (stages.length !== CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER.length) {
    throw new TypeError('Rootless stage authority count drifted.');
  }
  const containerNames = new Set<string>();
  const executionIds = new Set<string>();
  let sourceBaselineDigest: string | undefined;
  let projectManifestDigest: string | undefined;
  let lockDigest: string | undefined;
  let toolchainFileSetDigest: string | undefined;
  let rollupVersion: string | undefined;
  let rollupImplementation: string | undefined;
  let rollupAliasSpec: string | undefined;
  let esbuildVersion: string | undefined;
  let esbuildImplementation: string | undefined;
  let esbuildAliasSpec: string | undefined;
  let packageImportDigest: string | undefined;
  let previousCleanupCompletedAt = 0;
  for (const [ordinal, stage] of stages.entries()) {
    const expectedStage = CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER[ordinal]!;
    const validatedCleanup =
      createControlledStaticRootlessStageCleanupAuthority({
        stage: stage.cleanup.stage,
        ordinal: stage.cleanup.ordinal,
        containerName: stage.cleanup.container.name,
        executionId: stage.cleanup.container.executionId,
        imageDigest: stage.cleanup.container.imageDigest,
        remove: stage.cleanup.remove,
        absence: stage.cleanup.absence,
        residualQuery: stage.cleanup.residualQuery,
      });
    if (!sameCanonicalJson(validatedCleanup, stage.cleanup)) {
      throw new TypeError(
        `Rootless ${expectedStage} cleanup authority drifted.`
      );
    }
    const validatedStage = createControlledStaticRootlessStageAuthority({
      stage: stage.stage,
      ordinal: stage.ordinal,
      requestDigest: stage.requestDigest,
      snapshotDigest: stage.snapshotDigest,
      projectManifestDigest: stage.projectManifestDigest,
      lockDigest: stage.lockDigest,
      toolchainFileSetDigest: stage.toolchainFileSetDigest,
      rollupVersion: stage.rollupVersion,
      rollupImplementation: stage.rollupImplementation,
      rollupAliasSpec: stage.rollupAliasSpec,
      esbuildVersion: stage.esbuildVersion,
      esbuildImplementation: stage.esbuildImplementation,
      esbuildAliasSpec: stage.esbuildAliasSpec,
      sourceBaselineDigest: stage.sourceBaselineDigest,
      providerFileSetDigest: stage.providerFileSetDigest,
      observedInputFileSetDigest: stage.observedInputFileSetDigest,
      observedInputFileCount: stage.observedInputFileCount,
      packageImportDigest: stage.packageImportDigest,
      resultSetDigest: stage.resultSetDigest,
      innerAuthorityDigest: stage.innerAuthorityDigest,
      innerCleanupClaim: stage.innerCleanupClaim,
      command: stage.command,
      providerProcess: stage.providerProcess,
      cleanup: stage.cleanup,
    });
    if (!sameCanonicalJson(validatedStage, stage)) {
      throw new TypeError(`Rootless ${expectedStage} stage authority drifted.`);
    }
    if (
      stage.stage !== expectedStage ||
      stage.ordinal !== ordinal ||
      stage.command.stage !== expectedStage ||
      stage.command.executionBoundary !== 'sandbox' ||
      stage.cleanup.stage !== expectedStage ||
      stage.cleanup.ordinal !== ordinal ||
      stage.cleanup.cleanupVerified !== true ||
      stage.cleanup.containerRemoved !== true ||
      stage.cleanup.residualContainerCount !== 0 ||
      stage.cleanup.residualProcessCount !== 0 ||
      stage.cleanup.residualWorkspaceCount !== 0 ||
      stage.freshBaseline.nodeModulesAbsent !== true ||
      stage.freshBaseline.buildOutputAbsent !== true ||
      stage.freshBaseline.testOutputAbsent !== true ||
      stage.freshBaseline.coverageOutputAbsent !== true ||
      stage.freshBaseline.priorStageResultCount !== 0 ||
      stage.freshBaseline.forbiddenPaths.length !== 0 ||
      stage.providerFileSetDigest !== stage.observedInputFileSetDigest ||
      !sameCanonicalJson(stage.resultAllowlist, RESULT_ALLOWLIST[expectedStage])
    ) {
      throw new TypeError(`Rootless ${expectedStage} stage authority drifted.`);
    }
    if (
      stage.cleanup.authorityDigest !==
        authorityDigest(withoutAuthorityDigest(stage.cleanup)) ||
      stage.authorityDigest !== authorityDigest(withoutAuthorityDigest(stage))
    ) {
      throw new TypeError(
        `Rootless ${expectedStage} stage authority digest drifted.`
      );
    }
    if (stage.providerProcess.startedAtEpochMs < previousCleanupCompletedAt) {
      throw new TypeError(
        'Rootless stages overlapped or began before prior cleanup.'
      );
    }
    previousCleanupCompletedAt = stage.cleanup.residualQuery.completedAtEpochMs;
    sourceBaselineDigest ??= stage.sourceBaselineDigest;
    if (stage.sourceBaselineDigest !== sourceBaselineDigest) {
      throw new TypeError('Rootless source baseline changed between stages.');
    }
    projectManifestDigest ??= stage.projectManifestDigest;
    lockDigest ??= stage.lockDigest;
    toolchainFileSetDigest ??= stage.toolchainFileSetDigest;
    rollupVersion ??= stage.rollupVersion;
    rollupImplementation ??= stage.rollupImplementation;
    rollupAliasSpec ??= stage.rollupAliasSpec;
    esbuildVersion ??= stage.esbuildVersion;
    esbuildImplementation ??= stage.esbuildImplementation;
    esbuildAliasSpec ??= stage.esbuildAliasSpec;
    if (
      stage.projectManifestDigest !== projectManifestDigest ||
      stage.lockDigest !== lockDigest ||
      stage.toolchainFileSetDigest !== toolchainFileSetDigest ||
      stage.rollupVersion !== rollupVersion ||
      stage.rollupImplementation !== rollupImplementation ||
      stage.rollupAliasSpec !== rollupAliasSpec ||
      stage.esbuildVersion !== esbuildVersion ||
      stage.esbuildImplementation !== esbuildImplementation ||
      stage.esbuildAliasSpec !== esbuildAliasSpec
    ) {
      throw new TypeError(
        'Rootless manifest, lock, or toolchain binding changed between stages.'
      );
    }
    if (ordinal < 2) {
      if (stage.packageImportDigest !== null) {
        throw new TypeError(
          'Rootless pre-install stage imported a prior result.'
        );
      }
    } else {
      packageImportDigest ??= stage.packageImportDigest ?? undefined;
      if (
        !packageImportDigest ||
        stage.packageImportDigest !== packageImportDigest
      ) {
        throw new TypeError(
          'Rootless package import changed between fresh stages.'
        );
      }
    }
    if (
      containerNames.has(stage.cleanup.container.name) ||
      executionIds.has(stage.cleanup.container.executionId)
    ) {
      throw new TypeError('Rootless stage container identity was reused.');
    }
    containerNames.add(stage.cleanup.container.name);
    executionIds.add(stage.cleanup.container.executionId);
  }
};

export const createControlledStaticRootlessAggregateAuthority = (
  stages: readonly ControlledStaticRootlessStageAuthority[]
): ControlledStaticRootlessAggregateAuthority => {
  assertControlledStaticRootlessStageAuthoritySequence(stages);
  const first = stages[0]!;
  const packageImportDigest = stages[2]!.packageImportDigest;
  if (!packageImportDigest) {
    throw new TypeError(
      'Rootless aggregate package import authority is missing.'
    );
  }
  const base = Object.freeze({
    format:
      'prodivix.controlled-static-rootless-aggregate-stage-authority.v1' as const,
    requestDigest: first.requestDigest,
    snapshotDigest: first.snapshotDigest,
    projectManifestDigest: first.projectManifestDigest,
    lockDigest: first.lockDigest,
    toolchainFileSetDigest: first.toolchainFileSetDigest,
    rollupVersion: first.rollupVersion,
    rollupImplementation: first.rollupImplementation,
    rollupAliasSpec: first.rollupAliasSpec,
    esbuildVersion: first.esbuildVersion,
    esbuildImplementation: first.esbuildImplementation,
    esbuildAliasSpec: first.esbuildAliasSpec,
    sourceBaselineDigest: first.sourceBaselineDigest,
    packageImportDigest,
    stageOrder: CONTROLLED_STATIC_ROOTLESS_STAGE_ORDER,
    stages: Object.freeze(
      stages.map((stage) =>
        Object.freeze({
          stage: stage.stage,
          ordinal: stage.ordinal,
          stageAuthorityDigest: stage.authorityDigest,
          cleanupAuthorityDigest: stage.cleanup.authorityDigest,
        })
      )
    ),
    activeContainerCount: 0 as const,
    activeProcessCount: 0 as const,
    activeWorkspaceCount: 0 as const,
    cleanupVerified: true as const,
  });
  return Object.freeze({
    ...base,
    authorityDigest: authorityDigest(base),
  });
};

export const assertControlledStaticRootlessAggregateAuthority = (
  aggregate: ControlledStaticRootlessAggregateAuthority,
  stages: readonly ControlledStaticRootlessStageAuthority[]
): void => {
  assertControlledStaticRootlessStageAuthoritySequence(stages);
  const expected = createControlledStaticRootlessAggregateAuthority(stages);
  if (
    aggregate.format !== expected.format ||
    aggregate.activeContainerCount !== 0 ||
    aggregate.activeProcessCount !== 0 ||
    aggregate.activeWorkspaceCount !== 0 ||
    aggregate.cleanupVerified !== true ||
    !sameCanonicalJson(aggregate.stageOrder, expected.stageOrder) ||
    !sameCanonicalJson(aggregate.stages, expected.stages) ||
    aggregate.requestDigest !== expected.requestDigest ||
    aggregate.snapshotDigest !== expected.snapshotDigest ||
    aggregate.projectManifestDigest !== expected.projectManifestDigest ||
    aggregate.lockDigest !== expected.lockDigest ||
    aggregate.toolchainFileSetDigest !== expected.toolchainFileSetDigest ||
    aggregate.rollupVersion !== expected.rollupVersion ||
    aggregate.rollupImplementation !== expected.rollupImplementation ||
    aggregate.rollupAliasSpec !== expected.rollupAliasSpec ||
    aggregate.esbuildVersion !== expected.esbuildVersion ||
    aggregate.esbuildImplementation !== expected.esbuildImplementation ||
    aggregate.esbuildAliasSpec !== expected.esbuildAliasSpec ||
    aggregate.sourceBaselineDigest !== expected.sourceBaselineDigest ||
    aggregate.packageImportDigest !== expected.packageImportDigest ||
    aggregate.authorityDigest !==
      authorityDigest(withoutAuthorityDigest(aggregate))
  ) {
    throw new TypeError('Rootless aggregate stage authority drifted.');
  }
};
