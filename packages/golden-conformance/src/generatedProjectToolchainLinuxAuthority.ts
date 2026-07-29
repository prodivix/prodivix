import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  goldenAuthorityCanonicalDigest,
  goldenAuthorityExactDigest,
  goldenAuthorityExactRecord,
} from './generatedProjectToolchainAuthorityDecoding';
import type {
  GoldenControlledStaticToolchainAuthorityReceipt,
  GoldenControlledStaticToolchainCommandReceipt,
} from './generatedProjectToolchainAuthorityTypes';
import {
  OCI_DIGEST_PATTERN,
  ROOTLESS_STAGE_ORDER,
  SEMVER_PATTERN,
  decodeRootlessPackageImport,
  processCompletedAt,
  processStartedAt,
  type RootlessIdentity,
  type RootlessRecord,
} from './generatedProjectToolchainLinuxAuthorityPrimitives';
import {
  decodeRootlessAggregate,
  decodeRootlessProviderEnvironment,
  decodeRootlessStage,
} from './generatedProjectToolchainLinuxAuthorityStage';

export const decodeGoldenControlledStaticRootlessAuthority = (input: {
  isolationAuthority: unknown;
  processTree: unknown;
  commands: readonly GoldenControlledStaticToolchainCommandReceipt[];
  environment: GoldenControlledStaticToolchainAuthorityReceipt['environment'];
  requestDigest: string;
  snapshotDigest: string;
  toolchain: GoldenControlledStaticToolchainAuthorityReceipt['toolchain'];
}): Readonly<{
  isolationAuthority: RootlessRecord;
  processTree: RootlessRecord;
}> => {
  const identity: RootlessIdentity = Object.freeze({
    requestDigest: input.requestDigest,
    snapshotDigest: input.snapshotDigest,
    manifestDigest: input.toolchain.manifestDigest,
    lockDigest: input.toolchain.lockDigest,
    toolchainFileSetDigest: input.toolchain.toolchainFileSetDigest,
    rollupVersion: input.toolchain.rollupVersion,
    rollupImplementation: input.toolchain.rollupImplementation,
    rollupAliasSpec: input.toolchain.rollupAliasSpec,
    esbuildVersion: input.toolchain.esbuildVersion,
    esbuildImplementation: input.toolchain.esbuildImplementation,
    esbuildAliasSpec: input.toolchain.esbuildAliasSpec,
  });
  const phaseEnvironmentDigest = (
    phase: 'install' | 'execution',
    commands: readonly GoldenControlledStaticToolchainCommandReceipt[]
  ): string =>
    goldenAuthorityCanonicalDigest({
      phase,
      stages: commands.map(({ stage, environmentDigest }) => ({
        stage,
        digest: environmentDigest,
      })),
    });
  if (
    !sameCanonicalJson(input.environment.install.keys, ['HOME', 'PATH']) ||
    !sameCanonicalJson(input.environment.execution.keys, ['HOME', 'PATH']) ||
    input.environment.install.digest !==
      phaseEnvironmentDigest('install', input.commands.slice(0, 2)) ||
    input.environment.execution.digest !==
      phaseEnvironmentDigest('execution', input.commands.slice(2))
  ) {
    throw new Error('Golden rootless phase environment digest drifted.');
  }
  const isolation = goldenAuthorityExactRecord(
    input.isolationAuthority,
    [
      'provider',
      'imageDigest',
      'rootFilesystem',
      'network',
      'hostMountCount',
      'writableMounts',
      'cgroup',
      'containerEnvironmentKeys',
      'providerFileSetDigest',
      'probe',
      'providerProcess',
    ],
    'Golden rootless isolation authority'
  );
  const imageDigest =
    typeof isolation.imageDigest === 'string' ? isolation.imageDigest : '';
  const probe = goldenAuthorityExactRecord(
    isolation.probe,
    [
      'format',
      'httpDenied',
      'netDenied',
      'dnsDenied',
      'workerNetworkDenied',
      'childNetworkDenied',
      'symlinkEscapeDenied',
      'rootFilesystemWriteDenied',
      'hostMountAbsent',
      'containerSocketAbsent',
      'inheritedCredentialKeyCount',
      'egressAttemptCount',
      'egressSuccessCount',
      'linuxAttestation',
    ],
    'Golden rootless isolation probe'
  );
  const attestation = goldenAuthorityExactRecord(
    probe.linuxAttestation,
    [
      'uid',
      'gid',
      'effectiveCapabilities',
      'noNewPrivileges',
      'workspaceTmpfs',
      'temporaryTmpfs',
      'workspaceMaximumBytes',
      'temporaryMaximumBytes',
      'memoryMaximum',
      'pidsMaximum',
      'cpuMaximum',
    ],
    'Golden rootless Linux attestation'
  );
  const cgroup = goldenAuthorityExactRecord(
    isolation.cgroup,
    [
      'maximumCpuCores',
      'maximumMemoryBytes',
      'maximumPids',
      'maximumOpenFiles',
    ],
    'Golden rootless cgroup authority'
  );
  if (
    isolation.provider !== 'linux-rootless-podman' ||
    !OCI_DIGEST_PATTERN.test(imageDigest) ||
    isolation.rootFilesystem !== 'read-only' ||
    isolation.network !== 'none' ||
    isolation.hostMountCount !== 0 ||
    !sameCanonicalJson(isolation.writableMounts, [
      {
        path: 'workspace:/',
        kind: 'tmpfs',
        maximumBytes: 1024 * 1024 * 1024,
      },
      {
        path: 'tmp:/',
        kind: 'tmpfs',
        maximumBytes: 1024 * 1024 * 1024,
      },
    ]) ||
    !sameCanonicalJson(cgroup, {
      maximumCpuCores: 2,
      maximumMemoryBytes: 2_048 * 1024 * 1024,
      maximumPids: 256,
      maximumOpenFiles: 4_096,
    }) ||
    !sameCanonicalJson(isolation.containerEnvironmentKeys, ['HOME', 'PATH']) ||
    probe.format !== 'prodivix.controlled-static-isolation-probe.v1' ||
    probe.httpDenied !== true ||
    probe.netDenied !== true ||
    probe.dnsDenied !== true ||
    probe.workerNetworkDenied !== true ||
    probe.childNetworkDenied !== true ||
    probe.symlinkEscapeDenied !== true ||
    probe.rootFilesystemWriteDenied !== true ||
    probe.hostMountAbsent !== true ||
    probe.containerSocketAbsent !== true ||
    probe.inheritedCredentialKeyCount !== 0 ||
    probe.egressAttemptCount !== 5 ||
    probe.egressSuccessCount !== 0 ||
    !Number.isSafeInteger(attestation.uid) ||
    (attestation.uid as number) <= 0 ||
    !Number.isSafeInteger(attestation.gid) ||
    (attestation.gid as number) < 0 ||
    attestation.effectiveCapabilities !== '0000000000000000' ||
    attestation.noNewPrivileges !== '1' ||
    attestation.workspaceTmpfs !== true ||
    attestation.temporaryTmpfs !== true ||
    attestation.workspaceMaximumBytes !== 1024 * 1024 * 1024 ||
    attestation.temporaryMaximumBytes !== 1024 * 1024 * 1024 ||
    attestation.memoryMaximum !== String(2_048 * 1024 * 1024) ||
    attestation.pidsMaximum !== '256' ||
    attestation.cpuMaximum !== '200000 100000'
  ) {
    throw new Error('Golden rootless isolation authority failed closed.');
  }
  const provider = goldenAuthorityExactRecord(
    isolation.providerProcess,
    [
      'format',
      'tool',
      'providerEnvironment',
      'stageOrder',
      'sourceBaselineDigest',
      'packageImportAuthority',
      'aggregateStageAuthority',
      'stages',
      'authorityDigest',
    ],
    'Golden rootless provider authority'
  );
  const tool = goldenAuthorityExactRecord(
    provider.tool,
    ['binary', 'version'],
    'Golden rootless Podman tool'
  );
  const providerEnvironment = decodeRootlessProviderEnvironment(
    provider.providerEnvironment
  );
  const packageImport = decodeRootlessPackageImport(
    provider.packageImportAuthority,
    identity
  );
  if (
    provider.format !==
      'prodivix.controlled-static-rootless-provider-stage-authority.v1' ||
    tool.binary !== 'podman' ||
    typeof tool.version !== 'string' ||
    !SEMVER_PATTERN.test(tool.version) ||
    !sameCanonicalJson(provider.stageOrder, ROOTLESS_STAGE_ORDER) ||
    !Array.isArray(provider.stages) ||
    provider.stages.length !== ROOTLESS_STAGE_ORDER.length ||
    input.commands.length !== ROOTLESS_STAGE_ORDER.length
  ) {
    throw new Error('Golden rootless provider identity drifted.');
  }
  const stages = Object.freeze(
    provider.stages.map((stage, ordinal) =>
      decodeRootlessStage(stage, {
        ...identity,
        stage: ROOTLESS_STAGE_ORDER[ordinal]!,
        ordinal,
        imageDigest,
        providerEnvironmentDigest: providerEnvironment.digest as string,
        packageImportDigest: packageImport.authorityDigest as string,
        command: input.commands[ordinal]!,
      })
    )
  );
  const sourceBaselineDigest = goldenAuthorityExactDigest(
    provider.sourceBaselineDigest,
    'Golden rootless source baseline digest'
  );
  let previousCleanupCompletedAt = 0;
  const containerNames = new Set<string>();
  const executionIds = new Set<string>();
  for (const [ordinal, stage] of stages.entries()) {
    const cleanup = stage.cleanup as RootlessRecord;
    const container = cleanup.container as RootlessRecord;
    const providerProcess = stage.providerProcess as RootlessRecord;
    if (
      stage.sourceBaselineDigest !== sourceBaselineDigest ||
      stage.projectManifestDigest !== identity.manifestDigest ||
      stage.lockDigest !== identity.lockDigest ||
      stage.toolchainFileSetDigest !== identity.toolchainFileSetDigest ||
      processStartedAt(providerProcess) < previousCleanupCompletedAt ||
      containerNames.has(container.name as string) ||
      executionIds.has(container.executionId as string) ||
      (ordinal === 1 &&
        packageImport.installStageAuthorityDigest !== stage.authorityDigest)
    ) {
      throw new Error('Golden rootless stage sequence drifted.');
    }
    previousCleanupCompletedAt = processCompletedAt(
      cleanup.residualQuery as RootlessRecord
    );
    containerNames.add(container.name as string);
    executionIds.add(container.executionId as string);
  }
  const aggregate = decodeRootlessAggregate(
    provider.aggregateStageAuthority,
    stages,
    packageImport.authorityDigest as string
  );
  const providerBase = Object.freeze({
    format: provider.format,
    tool: Object.freeze({ binary: 'podman', version: tool.version }),
    providerEnvironment,
    stageOrder: ROOTLESS_STAGE_ORDER,
    sourceBaselineDigest,
    packageImportAuthority: packageImport,
    aggregateStageAuthority: aggregate,
    stages,
  });
  const normalizedProvider = Object.freeze({
    ...providerBase,
    authorityDigest: goldenAuthorityCanonicalDigest(providerBase),
  });
  if (!sameCanonicalJson(normalizedProvider, provider)) {
    throw new Error('Golden rootless provider authority digest drifted.');
  }
  const tree = goldenAuthorityExactRecord(
    input.processTree,
    [
      'format',
      'provider',
      'stageOrder',
      'directCommandCount',
      'activeContainerCount',
      'activeProcessCount',
      'activeWorkspaceCount',
      'killOnContainerExit',
      'stages',
      'cleanupVerified',
      'authorityDigest',
    ],
    'Golden rootless process-tree authority'
  );
  const cleanupStages = Object.freeze(
    stages.map((stage) => stage.cleanup as RootlessRecord)
  );
  const treeBase = Object.freeze({
    format: 'prodivix.controlled-static-rootless-process-cleanup-authority.v1',
    provider: 'linux-rootless-podman',
    stageOrder: ROOTLESS_STAGE_ORDER,
    directCommandCount: ROOTLESS_STAGE_ORDER.length,
    activeContainerCount: 0,
    activeProcessCount: 0,
    activeWorkspaceCount: 0,
    killOnContainerExit: true,
    stages: cleanupStages,
    cleanupVerified: true,
  });
  const normalizedTree = Object.freeze({
    ...treeBase,
    authorityDigest: goldenAuthorityCanonicalDigest(treeBase),
  });
  if (!sameCanonicalJson(normalizedTree, tree)) {
    throw new Error('Golden rootless process-tree authority drifted.');
  }
  const aggregateProviderFileSetDigest = goldenAuthorityCanonicalDigest(
    stages.map((stage) => ({
      stage: stage.stage,
      digest: stage.providerFileSetDigest,
    }))
  );
  if (isolation.providerFileSetDigest !== aggregateProviderFileSetDigest) {
    throw new Error('Golden rootless provider file-set authority drifted.');
  }
  const normalizedIsolation = Object.freeze({
    provider: 'linux-rootless-podman',
    imageDigest,
    rootFilesystem: 'read-only',
    network: 'none',
    hostMountCount: 0,
    writableMounts: isolation.writableMounts,
    cgroup: Object.freeze({ ...cgroup }),
    containerEnvironmentKeys: Object.freeze(['HOME', 'PATH']),
    providerFileSetDigest: aggregateProviderFileSetDigest,
    probe: Object.freeze({
      ...probe,
      linuxAttestation: Object.freeze({ ...attestation }),
    }),
    providerProcess: normalizedProvider,
  });
  if (!sameCanonicalJson(normalizedIsolation, isolation)) {
    throw new Error('Golden rootless isolation authority drifted.');
  }
  return Object.freeze({
    isolationAuthority: normalizedIsolation,
    processTree: normalizedTree,
  });
};
