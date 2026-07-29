import { createHash } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import type {
  GoldenControlledStaticToolchainAuthorityReceipt,
  GoldenControlledStaticToolchainCommandReceipt,
} from './generatedProjectToolchainAuthorityTypes';

export const stages = [
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
] as const;
type Stage = (typeof stages)[number];

const resultAllowlists: Readonly<Record<Stage, readonly string[]>> = {
  version: [],
  install: ['package-import'],
  isolation: ['isolation-observation'],
  typecheck: [],
  build: ['build-file-set', 'build-log'],
  test: ['coverage-summary', 'test-report'],
};

export const digest = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;
const imageDigest = `sha256:${'a'.repeat(64)}`;
export const requestDigest = digest('request');
export const snapshotDigest = digest('snapshot');
const manifestDigest = digest('manifest');
const lockDigest = digest('lock');
const toolchainFileSetDigest = digest('toolchain');
const rollupVersion = '4.62.3';
const rollupImplementation = '@rollup/wasm-node';
const rollupAliasSpec = 'npm:@rollup/wasm-node@4.62.3';
const esbuildVersion = '0.27.7';
const esbuildImplementation = 'esbuild-wasm';
const esbuildAliasSpec = 'npm:esbuild-wasm@0.27.7';
const sourceBaselineDigest = digest('source-baseline');
const providerEnvironmentDigest = digest('provider-environment');

export const withAuthorityDigest = <
  T extends Readonly<Record<string, unknown>>,
>(
  base: T
) =>
  Object.freeze({
    ...base,
    authorityDigest: digest(canonicalJsonText(base)),
  });

const output = (text = '') =>
  Object.freeze({
    digest: digest(text),
    byteLength: Buffer.byteLength(text),
    capturedByteLength: Buffer.byteLength(text),
    truncated: false,
  });

const controllerReceipt = (
  args: readonly string[],
  exitCode: number,
  startedAtEpochMs: number,
  stdout = ''
) =>
  Object.freeze({
    application: 'podman',
    args: Object.freeze([...args]),
    cwd: 'repository:/',
    environmentDigest: providerEnvironmentDigest,
    startedAtEpochMs,
    completedAtEpochMs: startedAtEpochMs + 1,
    exitCode,
    signal: null,
    timedOut: false,
    stdout: output(stdout),
    stderr: output(),
  });

const commandReceipt = (
  stage: Stage,
  ordinal: number
): GoldenControlledStaticToolchainCommandReceipt =>
  Object.freeze({
    stage,
    application: 'node',
    args: Object.freeze([stage]),
    cwd: 'workspace:/',
    executionBoundary: 'sandbox',
    environmentDigest: digest(`command-environment:${stage}`),
    tool: Object.freeze({
      binary: 'node',
      version: '22.23.1',
      subjectBinary: stage,
      subjectVersion: digest(`subject:${stage}`),
    }),
    startedAtEpochMs: ordinal * 100 + 10,
    completedAtEpochMs: ordinal * 100 + 11,
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: output(),
    stderr: output(),
  });

const providerArgs = (stage: Stage, ordinal: number, containerName: string) =>
  Object.freeze([
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    `--name=${containerName}`,
    `--label=prodivix.remote-execution=g3-v6-${snapshotDigest.slice(7, 23)}-${stage}-${ordinal}`,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--userns=keep-id',
    '--user=1000:1000',
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
    imageDigest,
  ]);

const createStageAuthority = (
  stage: Stage,
  ordinal: number,
  command: GoldenControlledStaticToolchainCommandReceipt,
  packageImportDigest: string | null
) => {
  const containerName = `prodivix-g3-v6-static-${stage}-${ordinal
    .toString(16)
    .padStart(8, '0')}`;
  const executionId = `g3-v6-${snapshotDigest.slice(7, 23)}-${stage}-${ordinal}`;
  const process = controllerReceipt(
    providerArgs(stage, ordinal, containerName),
    0,
    ordinal * 100 + 20
  );
  const remove = controllerReceipt(
    ['rm', '--force', '--ignore', containerName],
    0,
    ordinal * 100 + 30
  );
  const absence = controllerReceipt(
    ['container', 'exists', containerName],
    1,
    ordinal * 100 + 40
  );
  const residualQuery = controllerReceipt(
    [
      'ps',
      '--all',
      '--filter',
      `label=prodivix.remote-execution=${executionId}`,
      '--format',
      '{{.ID}}',
    ],
    0,
    ordinal * 100 + 50
  );
  const cleanup = withAuthorityDigest(
    Object.freeze({
      format: 'prodivix.controlled-static-rootless-stage-cleanup-authority.v1',
      stage,
      ordinal,
      container: Object.freeze({
        name: containerName,
        executionId,
        imageDigest,
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
    })
  );
  const providerFileSetDigest = digest(`provider-files:${stage}`);
  return withAuthorityDigest(
    Object.freeze({
      format: 'prodivix.controlled-static-rootless-stage-authority.v1',
      stage,
      ordinal,
      requestDigest,
      snapshotDigest,
      projectManifestDigest: manifestDigest,
      lockDigest,
      toolchainFileSetDigest,
      rollupVersion,
      rollupImplementation,
      rollupAliasSpec,
      esbuildVersion,
      esbuildImplementation,
      esbuildAliasSpec,
      sourceBaselineDigest,
      providerFileSetDigest,
      observedInputFileSetDigest: providerFileSetDigest,
      observedInputFileCount: ordinal < 2 ? 12 : 13,
      packageImportDigest,
      freshBaseline: Object.freeze({
        nodeModulesAbsent: true,
        buildOutputAbsent: true,
        testOutputAbsent: true,
        coverageOutputAbsent: true,
        priorStageResultCount: 0,
        forbiddenPaths: Object.freeze([]),
      }),
      resultAllowlist: Object.freeze([...resultAllowlists[stage]]),
      resultSetDigest: digest(`results:${stage}`),
      innerAuthorityDigest: digest(`inner:${stage}`),
      innerCleanupClaim: Object.freeze({
        source: 'sandbox-self-report',
        directCommandCount: 1,
        residualProcessCount: 0,
        cleanupVerified: true,
      }),
      command,
      providerProcess: process,
      cleanup,
    })
  );
};

export const createFixture = () => {
  const commands = Object.freeze(
    stages.map((stage, ordinal) => commandReceipt(stage, ordinal))
  );
  const initialStages = [
    createStageAuthority('version', 0, commands[0]!, null),
    createStageAuthority('install', 1, commands[1]!, null),
  ];
  const packageImport = withAuthorityDigest(
    Object.freeze({
      format: 'prodivix.controlled-static-rootless-package-import-authority.v1',
      producerStage: 'install',
      requestDigest,
      snapshotDigest,
      projectManifestDigest: manifestDigest,
      lockDigest,
      toolchainFileSetDigest,
      rollupVersion,
      rollupImplementation,
      rollupAliasSpec,
      esbuildVersion,
      esbuildImplementation,
      esbuildAliasSpec,
      archivePath: '.prodivix/package-import.json.gz',
      archiveDigest: digest('archive'),
      archiveByteLength: 100,
      contentDigest: digest('content'),
      manifestDigest: digest('package-manifest'),
      fileSetDigest: digest('package-files'),
      entryCount: 8,
      totalFileBytes: 1_024,
      maximumDepth: 4,
      installStageAuthorityDigest: initialStages[1]!.authorityDigest,
    })
  );
  const stageAuthorities = Object.freeze([
    ...initialStages,
    ...stages
      .slice(2)
      .map((stage, index) =>
        createStageAuthority(
          stage,
          index + 2,
          commands[index + 2]!,
          packageImport.authorityDigest
        )
      ),
  ]);
  const aggregate = withAuthorityDigest(
    Object.freeze({
      format:
        'prodivix.controlled-static-rootless-aggregate-stage-authority.v1',
      requestDigest,
      snapshotDigest,
      projectManifestDigest: manifestDigest,
      lockDigest,
      toolchainFileSetDigest,
      rollupVersion,
      rollupImplementation,
      rollupAliasSpec,
      esbuildVersion,
      esbuildImplementation,
      esbuildAliasSpec,
      sourceBaselineDigest,
      packageImportDigest: packageImport.authorityDigest,
      stageOrder: stages,
      stages: Object.freeze(
        stageAuthorities.map((stage) =>
          Object.freeze({
            stage: stage.stage,
            ordinal: stage.ordinal,
            stageAuthorityDigest: stage.authorityDigest,
            cleanupAuthorityDigest: stage.cleanup.authorityDigest,
          })
        )
      ),
      activeContainerCount: 0,
      activeProcessCount: 0,
      activeWorkspaceCount: 0,
      cleanupVerified: true,
    })
  );
  const providerProcess = withAuthorityDigest(
    Object.freeze({
      format: 'prodivix.controlled-static-rootless-provider-stage-authority.v1',
      tool: Object.freeze({ binary: 'podman', version: '5.6.2' }),
      providerEnvironment: Object.freeze({
        keys: Object.freeze(['HOME', 'PATH']),
        digest: providerEnvironmentDigest,
      }),
      stageOrder: stages,
      sourceBaselineDigest,
      packageImportAuthority: packageImport,
      aggregateStageAuthority: aggregate,
      stages: stageAuthorities,
    })
  );
  const processTree = withAuthorityDigest(
    Object.freeze({
      format:
        'prodivix.controlled-static-rootless-process-cleanup-authority.v1',
      provider: 'linux-rootless-podman',
      stageOrder: stages,
      directCommandCount: 6,
      activeContainerCount: 0,
      activeProcessCount: 0,
      activeWorkspaceCount: 0,
      killOnContainerExit: true,
      stages: Object.freeze(stageAuthorities.map((stage) => stage.cleanup)),
      cleanupVerified: true,
    })
  );
  const providerFileSetDigest = digest(
    canonicalJsonText(
      stageAuthorities.map((stage) => ({
        stage: stage.stage,
        digest: stage.providerFileSetDigest,
      }))
    )
  );
  const isolationAuthority = Object.freeze({
    provider: 'linux-rootless-podman',
    imageDigest,
    rootFilesystem: 'read-only',
    network: 'none',
    hostMountCount: 0,
    writableMounts: Object.freeze([
      Object.freeze({
        path: 'workspace:/',
        kind: 'tmpfs',
        maximumBytes: 1024 * 1024 * 1024,
      }),
      Object.freeze({
        path: 'tmp:/',
        kind: 'tmpfs',
        maximumBytes: 1024 * 1024 * 1024,
      }),
    ]),
    cgroup: Object.freeze({
      maximumCpuCores: 2,
      maximumMemoryBytes: 2_048 * 1024 * 1024,
      maximumPids: 256,
      maximumOpenFiles: 4_096,
    }),
    containerEnvironmentKeys: Object.freeze(['HOME', 'PATH']),
    providerFileSetDigest,
    probe: Object.freeze({
      format: 'prodivix.controlled-static-isolation-probe.v1',
      httpDenied: true,
      netDenied: true,
      dnsDenied: true,
      workerNetworkDenied: true,
      childNetworkDenied: true,
      symlinkEscapeDenied: true,
      rootFilesystemWriteDenied: true,
      hostMountAbsent: true,
      containerSocketAbsent: true,
      inheritedCredentialKeyCount: 0,
      egressAttemptCount: 5,
      egressSuccessCount: 0,
      linuxAttestation: Object.freeze({
        uid: 1000,
        gid: 1000,
        effectiveCapabilities: '0000000000000000',
        noNewPrivileges: '1',
        workspaceTmpfs: true,
        temporaryTmpfs: true,
        workspaceMaximumBytes: 1024 * 1024 * 1024,
        temporaryMaximumBytes: 1024 * 1024 * 1024,
        memoryMaximum: String(2_048 * 1024 * 1024),
        pidsMaximum: '256',
        cpuMaximum: '200000 100000',
      }),
    }),
    providerProcess,
  });
  return Object.freeze({
    commands,
    isolationAuthority,
    processTree,
  });
};

export const goldenRootlessToolchain = Object.freeze({
  pnpmVersion: '11.9.0',
  nodeVersion: '22.23.1',
  nodeBinaryDigest: digest('node-binary'),
  typescriptVersion: '6.0.3',
  vitestVersion: '4.1.9',
  viteVersion: '8.1.3',
  rollupVersion,
  rollupImplementation,
  rollupAliasSpec,
  esbuildVersion,
  esbuildImplementation,
  esbuildAliasSpec,
  manifestDigest,
  lockDigest,
  toolchainFileSetDigest,
} satisfies GoldenControlledStaticToolchainAuthorityReceipt['toolchain']);
