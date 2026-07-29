import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { ControlledStaticToolchainCommandReceipt } from './controlledStaticToolchainProtocol';
import {
  EMPTY_DIGEST,
  RESULT_ALLOWLIST,
  STAGE_ORDER,
  decodeControllerProcess,
  digestBytes,
  exactRecord,
  processArgs,
  processCompletedAt,
  processExitCode,
  processStartedAt,
  readDigest,
  readNonNegativeInteger,
  type Stage,
} from './controlledStaticRootlessAuthorityPrimitives';

const decodeCleanupAuthority = (
  value: unknown,
  input: Readonly<{
    stage: Stage;
    ordinal: number;
    snapshotDigest: string;
    imageDigest: string;
    providerEnvironmentDigest: string;
    providerCompletedAtEpochMs: number;
  }>
): Readonly<Record<string, unknown>> => {
  const authority = exactRecord(
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
    `Controlled rootless ${input.stage} cleanup authority`
  );
  const container = exactRecord(
    authority.container,
    ['name', 'executionId', 'imageDigest'],
    `Controlled rootless ${input.stage} cleanup container`
  );
  const expectedExecutionId = `g3-v6-${input.snapshotDigest.slice(7, 23)}-${input.stage}-${input.ordinal}`;
  if (
    authority.format !==
      'prodivix.controlled-static-rootless-stage-cleanup-authority.v1' ||
    authority.stage !== input.stage ||
    authority.ordinal !== input.ordinal ||
    typeof container.name !== 'string' ||
    !new RegExp(`^prodivix-g3-v6-static-${input.stage}-[a-f0-9]{8}$`, 'u').test(
      container.name
    ) ||
    container.executionId !== expectedExecutionId ||
    container.imageDigest !== input.imageDigest ||
    authority.action !== 'podman-rm-force-then-absence-and-label-query' ||
    authority.processProof !== 'removed-container-with-private-pid-namespace' ||
    authority.workspaceProof !== 'removed-container-tmpfs' ||
    authority.containerRemoved !== true ||
    authority.residualContainerCount !== 0 ||
    authority.residualProcessCount !== 0 ||
    authority.residualWorkspaceCount !== 0 ||
    authority.killOnContainerExit !== true ||
    authority.cleanupVerified !== true
  ) {
    throw new TypeError(
      `Controlled rootless ${input.stage} cleanup identity drifted.`
    );
  }
  const remove = decodeControllerProcess(
    authority.remove,
    `Controlled rootless ${input.stage} cleanup remove`
  );
  const absence = decodeControllerProcess(
    authority.absence,
    `Controlled rootless ${input.stage} cleanup absence`
  );
  const residualQuery = decodeControllerProcess(
    authority.residualQuery,
    `Controlled rootless ${input.stage} cleanup residual query`
  );
  const environmentDigests = [
    remove.environmentDigest,
    absence.environmentDigest,
    residualQuery.environmentDigest,
  ];
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
    !sameCanonicalJson(environmentDigests, [
      input.providerEnvironmentDigest,
      input.providerEnvironmentDigest,
      input.providerEnvironmentDigest,
    ]) ||
    processStartedAt(remove) < input.providerCompletedAtEpochMs ||
    processStartedAt(absence) < processCompletedAt(remove) ||
    processStartedAt(residualQuery) < processCompletedAt(absence) ||
    (residualQuery.stdout as Readonly<Record<string, unknown>>).digest !==
      EMPTY_DIGEST ||
    (residualQuery.stdout as Readonly<Record<string, unknown>>).byteLength !== 0
  ) {
    throw new TypeError(
      `Controlled rootless ${input.stage} cleanup proof drifted.`
    );
  }
  const base = Object.freeze({
    format: 'prodivix.controlled-static-rootless-stage-cleanup-authority.v1',
    stage: input.stage,
    ordinal: input.ordinal,
    container: Object.freeze({
      name: container.name,
      executionId: expectedExecutionId,
      imageDigest: input.imageDigest,
    }),
    action: 'podman-rm-force-then-absence-and-label-query',
    remove,
    absence,
    residualQuery,
    processProof: 'removed-container-with-private-pid-namespace',
    workspaceProof: 'removed-container-tmpfs',
    containerRemoved: true,
    residualContainerCount: 0,
    residualProcessCount: 0,
    residualWorkspaceCount: 0,
    killOnContainerExit: true,
    cleanupVerified: true,
  });
  const normalized = Object.freeze({
    ...base,
    authorityDigest: digestBytes(canonicalJsonText(base)),
  });
  if (!sameCanonicalJson(normalized, authority)) {
    throw new TypeError(
      `Controlled rootless ${input.stage} cleanup authority digest drifted.`
    );
  }
  return normalized;
};

const expectedProviderArgs = (
  actual: readonly string[],
  input: Readonly<{
    stage: Stage;
    ordinal: number;
    snapshotDigest: string;
    imageDigest: string;
    containerName: string;
  }>
): readonly string[] => {
  const user = actual[11];
  if (typeof user !== 'string' || !/^--user=[1-9][0-9]*:[0-9]+$/u.test(user)) {
    throw new TypeError(
      `Controlled rootless ${input.stage} user identity drifted.`
    );
  }
  const executionId = `g3-v6-${input.snapshotDigest.slice(7, 23)}-${input.stage}-${input.ordinal}`;
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

export const decodeStageAuthority = (
  value: unknown,
  input: Readonly<{
    stage: Stage;
    ordinal: number;
    requestDigest: string;
    snapshotDigest: string;
    manifestDigest: string;
    lockDigest: string;
    toolchainFileSetDigest: string;
    rollupVersion: string;
    rollupImplementation: string;
    rollupAliasSpec: string;
    esbuildVersion: string;
    esbuildImplementation: string;
    esbuildAliasSpec: string;
    imageDigest: string;
    providerEnvironmentDigest: string;
    packageImportDigest: string;
    command: ControlledStaticToolchainCommandReceipt;
  }>
): Readonly<Record<string, unknown>> => {
  const authority = exactRecord(
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
    `Controlled rootless ${input.stage} stage authority`
  );
  const fresh = exactRecord(
    authority.freshBaseline,
    [
      'nodeModulesAbsent',
      'buildOutputAbsent',
      'testOutputAbsent',
      'coverageOutputAbsent',
      'priorStageResultCount',
      'forbiddenPaths',
    ],
    `Controlled rootless ${input.stage} fresh baseline`
  );
  const innerCleanupClaim = exactRecord(
    authority.innerCleanupClaim,
    ['source', 'directCommandCount', 'residualProcessCount', 'cleanupVerified'],
    `Controlled rootless ${input.stage} inner cleanup claim`
  );
  const providerProcess = decodeControllerProcess(
    authority.providerProcess,
    `Controlled rootless ${input.stage} provider process`
  );
  const providerArgs = processArgs(providerProcess);
  const containerName =
    typeof providerArgs[4] === 'string' && providerArgs[4].startsWith('--name=')
      ? providerArgs[4].slice('--name='.length)
      : '';
  if (
    !sameCanonicalJson(
      providerArgs,
      expectedProviderArgs(providerArgs, {
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
    throw new TypeError(
      `Controlled rootless ${input.stage} provider boundary drifted.`
    );
  }
  const cleanup = decodeCleanupAuthority(authority.cleanup, {
    stage: input.stage,
    ordinal: input.ordinal,
    snapshotDigest: input.snapshotDigest,
    imageDigest: input.imageDigest,
    providerEnvironmentDigest: input.providerEnvironmentDigest,
    providerCompletedAtEpochMs: processCompletedAt(providerProcess),
  });
  const observedInputFileCount = readNonNegativeInteger(
    authority.observedInputFileCount,
    `Controlled rootless ${input.stage} observed input file count`
  );
  const expectedPackageImportDigest =
    input.ordinal < 2 ? null : input.packageImportDigest;
  if (
    authority.format !==
      'prodivix.controlled-static-rootless-stage-authority.v1' ||
    authority.stage !== input.stage ||
    authority.ordinal !== input.ordinal ||
    authority.requestDigest !== input.requestDigest ||
    authority.snapshotDigest !== input.snapshotDigest ||
    authority.projectManifestDigest !== input.manifestDigest ||
    authority.lockDigest !== input.lockDigest ||
    authority.toolchainFileSetDigest !== input.toolchainFileSetDigest ||
    authority.rollupVersion !== input.rollupVersion ||
    authority.rollupImplementation !== input.rollupImplementation ||
    authority.rollupAliasSpec !== input.rollupAliasSpec ||
    authority.esbuildVersion !== input.esbuildVersion ||
    authority.esbuildImplementation !== input.esbuildImplementation ||
    authority.esbuildAliasSpec !== input.esbuildAliasSpec ||
    authority.observedInputFileSetDigest !== authority.providerFileSetDigest ||
    observedInputFileCount < 1 ||
    authority.packageImportDigest !== expectedPackageImportDigest ||
    fresh.nodeModulesAbsent !== true ||
    fresh.buildOutputAbsent !== true ||
    fresh.testOutputAbsent !== true ||
    fresh.coverageOutputAbsent !== true ||
    fresh.priorStageResultCount !== 0 ||
    !Array.isArray(fresh.forbiddenPaths) ||
    fresh.forbiddenPaths.length !== 0 ||
    !sameCanonicalJson(
      authority.resultAllowlist,
      RESULT_ALLOWLIST[input.stage]
    ) ||
    innerCleanupClaim.source !== 'sandbox-self-report' ||
    innerCleanupClaim.directCommandCount !== 1 ||
    innerCleanupClaim.residualProcessCount !== 0 ||
    innerCleanupClaim.cleanupVerified !== true ||
    !sameCanonicalJson(authority.command, input.command)
  ) {
    throw new TypeError(
      `Controlled rootless ${input.stage} stage authority drifted.`
    );
  }
  const base = Object.freeze({
    format: 'prodivix.controlled-static-rootless-stage-authority.v1',
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
    sourceBaselineDigest: readDigest(
      authority.sourceBaselineDigest,
      `Controlled rootless ${input.stage} source baseline`
    ),
    providerFileSetDigest: readDigest(
      authority.providerFileSetDigest,
      `Controlled rootless ${input.stage} provider file set`
    ),
    observedInputFileSetDigest: readDigest(
      authority.observedInputFileSetDigest,
      `Controlled rootless ${input.stage} observed input file set`
    ),
    observedInputFileCount,
    packageImportDigest: expectedPackageImportDigest,
    freshBaseline: Object.freeze({
      nodeModulesAbsent: true,
      buildOutputAbsent: true,
      testOutputAbsent: true,
      coverageOutputAbsent: true,
      priorStageResultCount: 0,
      forbiddenPaths: Object.freeze([]),
    }),
    resultAllowlist: RESULT_ALLOWLIST[input.stage],
    resultSetDigest: readDigest(
      authority.resultSetDigest,
      `Controlled rootless ${input.stage} result set`
    ),
    innerAuthorityDigest: readDigest(
      authority.innerAuthorityDigest,
      `Controlled rootless ${input.stage} inner authority`
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
  const normalized = Object.freeze({
    ...base,
    authorityDigest: digestBytes(canonicalJsonText(base)),
  });
  if (!sameCanonicalJson(normalized, authority)) {
    throw new TypeError(
      `Controlled rootless ${input.stage} stage authority digest drifted.`
    );
  }
  return normalized;
};

export const decodeAggregateAuthority = (
  value: unknown,
  stages: readonly Readonly<Record<string, unknown>>[],
  packageImportDigest: string
): Readonly<Record<string, unknown>> => {
  const aggregate = exactRecord(
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
    'Controlled rootless aggregate stage authority'
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
    stageOrder: STAGE_ORDER,
    stages: Object.freeze(
      stages.map((stage) =>
        Object.freeze({
          stage: stage.stage,
          ordinal: stage.ordinal,
          stageAuthorityDigest: stage.authorityDigest,
          cleanupAuthorityDigest: (
            stage.cleanup as Readonly<Record<string, unknown>>
          ).authorityDigest,
        })
      )
    ),
    activeContainerCount: 0,
    activeProcessCount: 0,
    activeWorkspaceCount: 0,
    cleanupVerified: true,
  });
  const normalized = Object.freeze({
    ...base,
    authorityDigest: digestBytes(canonicalJsonText(base)),
  });
  if (!sameCanonicalJson(normalized, aggregate)) {
    throw new TypeError(
      'Controlled rootless aggregate stage authority drifted.'
    );
  }
  return normalized;
};
