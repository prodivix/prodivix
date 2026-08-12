import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { ControlledStaticToolchainCommandReceipt } from '../src/controlledStaticToolchainProtocol';
import {
  OCI_DIGEST_PATTERN,
  SEMVER_PATTERN,
  STAGE_ORDER,
  decodePackageImportAuthority,
  digestBytes,
  exactRecord,
  processCompletedAt,
  processStartedAt,
  readDigest,
  type DecodedControlledStaticRootlessAuthorities,
} from './controlledStaticRootlessAuthorityPrimitives';
import {
  decodeAggregateAuthority,
  decodeStageAuthority,
} from './controlledStaticRootlessStageAuthorityDecoder';

const decodeProviderEnvironment = (
  value: unknown
): Readonly<Record<string, unknown>> => {
  const environment = exactRecord(
    value,
    ['keys', 'digest'],
    'Controlled rootless provider environment'
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
    !Array.isArray(environment.keys) ||
    environment.keys.some((key) => typeof key !== 'string' || !allowed.has(key))
  ) {
    throw new TypeError(
      'Controlled rootless provider environment keys drifted.'
    );
  }
  const keys = Object.freeze(
    [...(environment.keys as string[])].sort(compareUnicodeCodePoints)
  );
  if (!sameCanonicalJson(keys, environment.keys)) {
    throw new TypeError(
      'Controlled rootless provider environment keys are not canonical.'
    );
  }
  return Object.freeze({
    keys,
    digest: readDigest(
      environment.digest,
      'Controlled rootless provider environment digest'
    ),
  });
};

export const decodeControlledStaticRootlessAuthorities = (input: {
  providerProcess: unknown;
  processTree: unknown;
  commands: readonly ControlledStaticToolchainCommandReceipt[];
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
}): DecodedControlledStaticRootlessAuthorities => {
  if (
    !OCI_DIGEST_PATTERN.test(input.imageDigest) ||
    input.rollupVersion !== '4.62.3' ||
    input.rollupImplementation !== '@rollup/wasm-node' ||
    input.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3' ||
    input.esbuildVersion !== '0.27.7' ||
    input.esbuildImplementation !== 'esbuild-wasm' ||
    input.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7'
  ) {
    throw new TypeError('Controlled rootless provider identity drifted.');
  }
  const provider = exactRecord(
    input.providerProcess,
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
    'Controlled rootless provider stage authority'
  );
  const tool = exactRecord(
    provider.tool,
    ['binary', 'version'],
    'Controlled rootless Podman tool'
  );
  const providerEnvironment = decodeProviderEnvironment(
    provider.providerEnvironment
  );
  const expectedIdentity = Object.freeze({
    requestDigest: input.requestDigest,
    snapshotDigest: input.snapshotDigest,
    manifestDigest: input.manifestDigest,
    lockDigest: input.lockDigest,
    toolchainFileSetDigest: input.toolchainFileSetDigest,
    rollupVersion: input.rollupVersion,
    rollupImplementation: input.rollupImplementation,
    rollupAliasSpec: input.rollupAliasSpec,
    esbuildVersion: input.esbuildVersion,
    esbuildImplementation: input.esbuildImplementation,
    esbuildAliasSpec: input.esbuildAliasSpec,
  });
  const packageImport = decodePackageImportAuthority(
    provider.packageImportAuthority,
    expectedIdentity
  );
  if (
    provider.format !==
      'prodivix.controlled-static-rootless-provider-stage-authority.v1' ||
    tool.binary !== 'podman' ||
    typeof tool.version !== 'string' ||
    !SEMVER_PATTERN.test(tool.version) ||
    !sameCanonicalJson(provider.stageOrder, STAGE_ORDER) ||
    !Array.isArray(provider.stages) ||
    provider.stages.length !== STAGE_ORDER.length ||
    input.commands.length !== STAGE_ORDER.length
  ) {
    throw new TypeError(
      'Controlled rootless provider stage authority drifted.'
    );
  }
  const stages = Object.freeze(
    provider.stages.map((stage, ordinal) =>
      decodeStageAuthority(stage, {
        stage: STAGE_ORDER[ordinal]!,
        ordinal,
        ...expectedIdentity,
        imageDigest: input.imageDigest,
        providerEnvironmentDigest: providerEnvironment.digest as string,
        packageImportDigest: packageImport.authorityDigest as string,
        command: input.commands[ordinal]!,
      })
    )
  );
  const sourceBaselineDigest = readDigest(
    provider.sourceBaselineDigest,
    'Controlled rootless provider source baseline'
  );
  let previousCleanupCompletedAt = 0;
  const containerNames = new Set<string>();
  const executionIds = new Set<string>();
  for (const [ordinal, stage] of stages.entries()) {
    const cleanup = stage.cleanup as Readonly<Record<string, unknown>>;
    const container = cleanup.container as Readonly<Record<string, unknown>>;
    const process = stage.providerProcess as Readonly<Record<string, unknown>>;
    if (
      stage.sourceBaselineDigest !== sourceBaselineDigest ||
      stage.projectManifestDigest !== input.manifestDigest ||
      stage.lockDigest !== input.lockDigest ||
      stage.toolchainFileSetDigest !== input.toolchainFileSetDigest ||
      stage.rollupVersion !== input.rollupVersion ||
      stage.rollupImplementation !== input.rollupImplementation ||
      stage.rollupAliasSpec !== input.rollupAliasSpec ||
      stage.esbuildVersion !== input.esbuildVersion ||
      stage.esbuildImplementation !== input.esbuildImplementation ||
      stage.esbuildAliasSpec !== input.esbuildAliasSpec ||
      processStartedAt(process) < previousCleanupCompletedAt ||
      containerNames.has(container.name as string) ||
      executionIds.has(container.executionId as string) ||
      (ordinal === 1 &&
        packageImport.installStageAuthorityDigest !== stage.authorityDigest)
    ) {
      throw new TypeError(
        'Controlled rootless stage sequence authority drifted.'
      );
    }
    previousCleanupCompletedAt = processCompletedAt(
      cleanup.residualQuery as Readonly<Record<string, unknown>>
    );
    containerNames.add(container.name as string);
    executionIds.add(container.executionId as string);
  }
  const aggregate = decodeAggregateAuthority(
    provider.aggregateStageAuthority,
    stages,
    packageImport.authorityDigest as string
  );
  const providerBase = Object.freeze({
    format: 'prodivix.controlled-static-rootless-provider-stage-authority.v1',
    tool: Object.freeze({
      binary: 'podman',
      version: tool.version,
    }),
    providerEnvironment,
    stageOrder: STAGE_ORDER,
    sourceBaselineDigest,
    packageImportAuthority: packageImport,
    aggregateStageAuthority: aggregate,
    stages,
  });
  const normalizedProvider = Object.freeze({
    ...providerBase,
    authorityDigest: digestBytes(canonicalJsonText(providerBase)),
  });
  if (!sameCanonicalJson(normalizedProvider, provider)) {
    throw new TypeError(
      'Controlled rootless provider authority digest drifted.'
    );
  }

  const tree = exactRecord(
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
    'Controlled rootless process cleanup authority'
  );
  const cleanupStages = Object.freeze(
    stages.map((stage) => stage.cleanup as Readonly<Record<string, unknown>>)
  );
  const treeBase = Object.freeze({
    format: 'prodivix.controlled-static-rootless-process-cleanup-authority.v1',
    provider: 'linux-rootless-podman',
    stageOrder: STAGE_ORDER,
    directCommandCount: STAGE_ORDER.length,
    activeContainerCount: 0,
    activeProcessCount: 0,
    activeWorkspaceCount: 0,
    killOnContainerExit: true,
    stages: cleanupStages,
    cleanupVerified: true,
  });
  const normalizedTree = Object.freeze({
    ...treeBase,
    authorityDigest: digestBytes(canonicalJsonText(treeBase)),
  });
  if (!sameCanonicalJson(normalizedTree, tree)) {
    throw new TypeError(
      'Controlled rootless process cleanup authority drifted.'
    );
  }
  return Object.freeze({
    providerProcess: normalizedProvider,
    processTree: normalizedTree,
    aggregateProviderFileSetDigest: digestBytes(
      canonicalJsonText(
        stages.map((stage) => ({
          stage: stage.stage,
          digest: stage.providerFileSetDigest,
        }))
      )
    ),
  });
};
