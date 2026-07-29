import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  goldenAuthorityCanonicalDigest,
  goldenAuthorityExactDigest,
  goldenAuthorityExactInteger,
  goldenAuthorityExactRecord,
} from './generatedProjectToolchainAuthorityDecoding';
import type { GoldenControlledStaticToolchainCommandReceipt } from './generatedProjectToolchainAuthorityTypes';
import {
  ROOTLESS_RESULT_ALLOWLIST,
  ROOTLESS_STAGE_ORDER,
  decodeRootlessCleanup,
  decodeRootlessControllerProcess,
  expectedRootlessProviderArgs,
  processArgs,
  processCompletedAt,
  processExitCode,
  type RootlessIdentity,
  type RootlessRecord,
  type RootlessStage,
} from './generatedProjectToolchainLinuxAuthorityPrimitives';

export const decodeRootlessStage = (
  value: unknown,
  input: RootlessIdentity &
    Readonly<{
      stage: RootlessStage;
      ordinal: number;
      imageDigest: string;
      providerEnvironmentDigest: string;
      packageImportDigest: string;
      command: GoldenControlledStaticToolchainCommandReceipt;
    }>
): RootlessRecord => {
  const label = `Golden rootless ${input.stage} stage`;
  const record = goldenAuthorityExactRecord(
    value,
    [
      'format',
      'stage',
      'ordinal',
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
      'sourceBaselineDigest',
      'providerFileSetDigest',
      'observedInputFileSetDigest',
      'observedInputFileCount',
      'packageImportDigest',
      'freshBaseline',
      'resultAllowlist',
      'resultSetDigest',
      'innerAuthorityDigest',
      'innerCleanupClaim',
      'command',
      'providerProcess',
      'cleanup',
      'authorityDigest',
    ],
    label
  );
  const fresh = goldenAuthorityExactRecord(
    record.freshBaseline,
    [
      'nodeModulesAbsent',
      'buildOutputAbsent',
      'testOutputAbsent',
      'coverageOutputAbsent',
      'priorStageResultCount',
      'forbiddenPaths',
    ],
    `${label} fresh baseline`
  );
  const innerCleanup = goldenAuthorityExactRecord(
    record.innerCleanupClaim,
    ['source', 'directCommandCount', 'residualProcessCount', 'cleanupVerified'],
    `${label} inner cleanup self-report`
  );
  const providerProcess = decodeRootlessControllerProcess(
    record.providerProcess,
    `${label} provider process`
  );
  const providerArgs = processArgs(providerProcess);
  const containerName =
    typeof providerArgs[4] === 'string' && providerArgs[4].startsWith('--name=')
      ? providerArgs[4].slice('--name='.length)
      : '';
  if (
    !sameCanonicalJson(
      providerArgs,
      expectedRootlessProviderArgs(providerArgs, {
        stage: input.stage,
        ordinal: input.ordinal,
        snapshotDigest: input.snapshotDigest,
        imageDigest: input.imageDigest,
        containerName,
      })
    ) ||
    providerProcess.environmentDigest !== input.providerEnvironmentDigest ||
    processExitCode(providerProcess) !== 0
  ) {
    throw new Error(`${label} provider boundary drifted.`);
  }
  const cleanup = decodeRootlessCleanup(record.cleanup, {
    stage: input.stage,
    ordinal: input.ordinal,
    snapshotDigest: input.snapshotDigest,
    imageDigest: input.imageDigest,
    providerEnvironmentDigest: input.providerEnvironmentDigest,
    providerCompletedAtEpochMs: processCompletedAt(providerProcess),
  });
  const observedInputFileCount = goldenAuthorityExactInteger(
    record.observedInputFileCount,
    `${label} observed input file count`
  );
  const packageImportDigest =
    input.ordinal < 2 ? null : input.packageImportDigest;
  if (
    record.format !==
      'prodivix.controlled-static-rootless-stage-authority.v1' ||
    record.stage !== input.stage ||
    record.ordinal !== input.ordinal ||
    record.requestDigest !== input.requestDigest ||
    record.snapshotDigest !== input.snapshotDigest ||
    record.projectManifestDigest !== input.manifestDigest ||
    record.lockDigest !== input.lockDigest ||
    record.toolchainFileSetDigest !== input.toolchainFileSetDigest ||
    record.rollupVersion !== input.rollupVersion ||
    record.rollupImplementation !== input.rollupImplementation ||
    record.rollupAliasSpec !== input.rollupAliasSpec ||
    record.esbuildVersion !== input.esbuildVersion ||
    record.esbuildImplementation !== input.esbuildImplementation ||
    record.esbuildAliasSpec !== input.esbuildAliasSpec ||
    record.observedInputFileSetDigest !== record.providerFileSetDigest ||
    observedInputFileCount < 1 ||
    record.packageImportDigest !== packageImportDigest ||
    fresh.nodeModulesAbsent !== true ||
    fresh.buildOutputAbsent !== true ||
    fresh.testOutputAbsent !== true ||
    fresh.coverageOutputAbsent !== true ||
    fresh.priorStageResultCount !== 0 ||
    !Array.isArray(fresh.forbiddenPaths) ||
    fresh.forbiddenPaths.length !== 0 ||
    !sameCanonicalJson(
      record.resultAllowlist,
      ROOTLESS_RESULT_ALLOWLIST[input.stage]
    ) ||
    innerCleanup.source !== 'sandbox-self-report' ||
    innerCleanup.directCommandCount !== 1 ||
    innerCleanup.residualProcessCount !== 0 ||
    innerCleanup.cleanupVerified !== true ||
    !sameCanonicalJson(record.command, input.command)
  ) {
    throw new Error(`${label} authority drifted.`);
  }
  const base = Object.freeze({
    format: record.format,
    stage: input.stage,
    ordinal: input.ordinal,
    requestDigest: input.requestDigest,
    snapshotDigest: input.snapshotDigest,
    projectManifestDigest: input.manifestDigest,
    lockDigest: input.lockDigest,
    toolchainFileSetDigest: input.toolchainFileSetDigest,
    rollupVersion: input.rollupVersion,
    rollupImplementation: input.rollupImplementation,
    rollupAliasSpec: input.rollupAliasSpec,
    esbuildVersion: input.esbuildVersion,
    esbuildImplementation: input.esbuildImplementation,
    esbuildAliasSpec: input.esbuildAliasSpec,
    sourceBaselineDigest: goldenAuthorityExactDigest(
      record.sourceBaselineDigest,
      `${label} source baseline`
    ),
    providerFileSetDigest: goldenAuthorityExactDigest(
      record.providerFileSetDigest,
      `${label} provider file set`
    ),
    observedInputFileSetDigest: goldenAuthorityExactDigest(
      record.observedInputFileSetDigest,
      `${label} observed input file set`
    ),
    observedInputFileCount,
    packageImportDigest,
    freshBaseline: Object.freeze({
      nodeModulesAbsent: true,
      buildOutputAbsent: true,
      testOutputAbsent: true,
      coverageOutputAbsent: true,
      priorStageResultCount: 0,
      forbiddenPaths: Object.freeze([]),
    }),
    resultAllowlist: ROOTLESS_RESULT_ALLOWLIST[input.stage],
    resultSetDigest: goldenAuthorityExactDigest(
      record.resultSetDigest,
      `${label} result set`
    ),
    innerAuthorityDigest: goldenAuthorityExactDigest(
      record.innerAuthorityDigest,
      `${label} inner authority`
    ),
    innerCleanupClaim: Object.freeze({
      source: 'sandbox-self-report',
      directCommandCount: 1,
      residualProcessCount: 0,
      cleanupVerified: true,
    }),
    command: input.command,
    providerProcess,
    cleanup,
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

export const decodeRootlessProviderEnvironment = (
  value: unknown
): RootlessRecord => {
  const record = goldenAuthorityExactRecord(
    value,
    ['keys', 'digest'],
    'Golden rootless provider environment'
  );
  const allowed = new Set([
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
  ]);
  if (
    !Array.isArray(record.keys) ||
    record.keys.some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    new Set(record.keys).size !== record.keys.length ||
    !record.keys.includes('PATH') ||
    !record.keys.includes('HOME')
  ) {
    throw new Error('Golden rootless provider environment keys drifted.');
  }
  const keys = Object.freeze(
    [...(record.keys as string[])].sort(compareUnicodeCodePoints)
  );
  if (!sameCanonicalJson(keys, record.keys)) {
    throw new Error(
      'Golden rootless provider environment keys are not canonical.'
    );
  }
  return Object.freeze({
    keys,
    digest: goldenAuthorityExactDigest(
      record.digest,
      'Golden rootless provider environment digest'
    ),
  });
};

export const decodeRootlessAggregate = (
  value: unknown,
  stages: readonly RootlessRecord[],
  packageImportDigest: string
): RootlessRecord => {
  const record = goldenAuthorityExactRecord(
    value,
    [
      'format',
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
      'sourceBaselineDigest',
      'packageImportDigest',
      'stageOrder',
      'stages',
      'activeContainerCount',
      'activeProcessCount',
      'activeWorkspaceCount',
      'cleanupVerified',
      'authorityDigest',
    ],
    'Golden rootless aggregate authority'
  );
  const first = stages[0]!;
  const base = Object.freeze({
    format: 'prodivix.controlled-static-rootless-aggregate-stage-authority.v1',
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
    stageOrder: ROOTLESS_STAGE_ORDER,
    stages: Object.freeze(
      stages.map((stage) =>
        Object.freeze({
          stage: stage.stage,
          ordinal: stage.ordinal,
          stageAuthorityDigest: stage.authorityDigest,
          cleanupAuthorityDigest: (stage.cleanup as RootlessRecord)
            .authorityDigest,
        })
      )
    ),
    activeContainerCount: 0,
    activeProcessCount: 0,
    activeWorkspaceCount: 0,
    cleanupVerified: true,
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: goldenAuthorityCanonicalDigest(base),
  });
  if (!sameCanonicalJson(authority, record)) {
    throw new Error('Golden rootless aggregate authority drifted.');
  }
  return authority;
};
