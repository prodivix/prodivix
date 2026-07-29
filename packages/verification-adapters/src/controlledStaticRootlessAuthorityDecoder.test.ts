import { createHash } from 'node:crypto';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { decodeControlledStaticRootlessAuthorities } from '../scripts/controlledStaticRootlessAuthorityDecoder';
import { decodeControlledStaticToolchainLinuxCommands } from '../scripts/controlledStaticToolchainLinuxResult';
import type { ControlledStaticToolchainCommandReceipt } from '../scripts/controlledStaticToolchainProtocol';
import type { ControlledStaticToolchainSandboxAuthority } from '../scripts/controlledStaticToolchainSandboxTypes';

const stages = [
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

const digest = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;
const imageDigest = `sha256:${'a'.repeat(64)}`;
const requestDigest = digest('request');
const snapshotDigest = digest('snapshot');
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

const withAuthorityDigest = <T extends Readonly<Record<string, unknown>>>(
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
): ControlledStaticToolchainCommandReceipt =>
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
  command: ControlledStaticToolchainCommandReceipt,
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

const createFixture = () => {
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
  return {
    commands,
    providerProcess,
    processTree,
  };
};

type AuthorityFixture = Readonly<{
  commands: readonly ControlledStaticToolchainCommandReceipt[];
  providerProcess: Readonly<Record<string, unknown>>;
  processTree: Readonly<Record<string, unknown>>;
}>;

const decode = (fixture: AuthorityFixture) =>
  decodeControlledStaticRootlessAuthorities({
    ...fixture,
    requestDigest,
    snapshotDigest,
    manifestDigest,
    lockDigest,
    toolchainFileSetDigest,
    rollupVersion,
    rollupImplementation,
    rollupAliasSpec,
    esbuildVersion,
    esbuildImplementation,
    esbuildAliasSpec,
    imageDigest,
  });

describe('controlled static rootless authority decoder', () => {
  it('rebuilds the full package, stage, aggregate, provider, and cleanup chain', () => {
    const decoded = decode(createFixture());

    expect(decoded.providerProcess).toMatchObject({
      format: 'prodivix.controlled-static-rootless-provider-stage-authority.v1',
      stageOrder: stages,
    });
    expect(decoded.processTree).toMatchObject({
      directCommandCount: 6,
      activeContainerCount: 0,
      activeProcessCount: 0,
      activeWorkspaceCount: 0,
      cleanupVerified: true,
    });
  });

  it('rejects a full-rehash package import forgery', () => {
    const fixture = createFixture();
    const packageBase = {
      ...fixture.providerProcess.packageImportAuthority,
      producerStage: 'build',
    };
    delete (packageBase as { authorityDigest?: unknown }).authorityDigest;
    const forgedPackage = withAuthorityDigest(Object.freeze(packageBase));
    const providerBase = {
      ...fixture.providerProcess,
      packageImportAuthority: forgedPackage,
    };
    delete (providerBase as { authorityDigest?: unknown }).authorityDigest;

    expect(() =>
      decode({
        ...fixture,
        providerProcess: withAuthorityDigest(Object.freeze(providerBase)),
      })
    ).toThrow(/package|provider|stage/u);
  });

  it('rejects full-rehash cleanup, stage, and process-tree forgeries', () => {
    const fixture = createFixture();
    const originalStage = fixture.providerProcess.stages[3]!;
    const cleanupBase = {
      ...originalStage.cleanup,
      residualProcessCount: 1,
    };
    delete (cleanupBase as { authorityDigest?: unknown }).authorityDigest;
    const forgedCleanup = withAuthorityDigest(Object.freeze(cleanupBase));
    const stageBase = { ...originalStage, cleanup: forgedCleanup };
    delete (stageBase as { authorityDigest?: unknown }).authorityDigest;
    const forgedStage = withAuthorityDigest(Object.freeze(stageBase));
    const forgedStages = fixture.providerProcess.stages.map((stage, index) =>
      index === 3 ? forgedStage : stage
    );
    const aggregateBase = {
      ...fixture.providerProcess.aggregateStageAuthority,
      stages: fixture.providerProcess.aggregateStageAuthority.stages.map(
        (stage, index) =>
          index === 3
            ? {
                ...stage,
                stageAuthorityDigest: forgedStage.authorityDigest,
                cleanupAuthorityDigest: forgedCleanup.authorityDigest,
              }
            : stage
      ),
    };
    delete (aggregateBase as { authorityDigest?: unknown }).authorityDigest;
    const providerBase = {
      ...fixture.providerProcess,
      stages: forgedStages,
      aggregateStageAuthority: withAuthorityDigest(
        Object.freeze(aggregateBase)
      ),
    };
    delete (providerBase as { authorityDigest?: unknown }).authorityDigest;
    const treeBase = {
      ...fixture.processTree,
      stages: fixture.processTree.stages.map((cleanup, index) =>
        index === 3 ? forgedCleanup : cleanup
      ),
    };
    delete (treeBase as { authorityDigest?: unknown }).authorityDigest;

    expect(() =>
      decode({
        ...fixture,
        providerProcess: withAuthorityDigest(Object.freeze(providerBase)),
        processTree: withAuthorityDigest(Object.freeze(treeBase)),
      })
    ).toThrow(/cleanup|stage|process/u);
  });

  it('rejects build/test command reordering', () => {
    const fixture = createFixture();
    const commands = [...fixture.commands];
    [commands[4], commands[5]] = [commands[5]!, commands[4]!];

    expect(() =>
      decode({ ...fixture, commands: Object.freeze(commands) })
    ).toThrow(/build|stage/u);
  });

  it('projects exactly six sandbox commands with build before test', () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-1',
      },
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'vite',
      },
      files: [
        {
          path: 'package.json',
          contents: '{"private":true}',
        },
        {
          path: 'src/App.test.tsx',
          contents: 'export {}',
        },
      ],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'src/App.test.tsx' }],
      capabilityRequirements: {
        preview: ['filesystem'],
        build: ['filesystem', 'build'],
        test: ['filesystem', 'test'],
      },
    });
    const authority: ControlledStaticToolchainSandboxAuthority = Object.freeze({
      pnpmVersion: '11.9.0',
      nodeVersion: '22.23.1',
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
      isolationProbeDigest: digest('isolation-probe'),
    });
    const rawCommand = (
      stage: Stage,
      ordinal: number,
      application: 'node' | 'pnpm',
      args: readonly string[],
      tool: Readonly<Record<string, string>>
    ) =>
      Object.freeze({
        stage,
        application,
        args: Object.freeze([...args]),
        cwd: 'workspace:/',
        executionBoundary: 'sandbox',
        environmentDigest: digest(`environment:${stage}`),
        tool,
        startedAtEpochMs: ordinal * 10,
        completedAtEpochMs: ordinal * 10 + 1,
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: output(),
        stderr: output(),
      });
    const nodeTool = (subjectBinary: string, subjectVersion: string) =>
      Object.freeze({
        binary: 'node',
        version: authority.nodeVersion,
        subjectBinary,
        subjectVersion,
      });
    const rawCommands = Object.freeze([
      rawCommand(
        'version',
        0,
        'pnpm',
        ['--version'],
        Object.freeze({
          binary: 'pnpm',
          version: authority.pnpmVersion,
        })
      ),
      rawCommand(
        'install',
        1,
        'pnpm',
        [
          'install',
          '--frozen-lockfile',
          '--offline',
          '--ignore-scripts',
          '--reporter=append-only',
          '--loglevel=error',
          '--store-dir=/opt/prodivix/pnpm-store',
          '--package-import-method=copy',
        ],
        Object.freeze({
          binary: 'pnpm',
          version: authority.pnpmVersion,
        })
      ),
      rawCommand(
        'isolation',
        2,
        'node',
        ['.prodivix/isolation-probe.mjs'],
        nodeTool(
          '.prodivix/isolation-probe.mjs',
          authority.isolationProbeDigest
        )
      ),
      rawCommand(
        'typecheck',
        3,
        'node',
        ['node_modules/typescript/bin/tsc', '-b'],
        nodeTool('node_modules/typescript/bin/tsc', authority.typescriptVersion)
      ),
      rawCommand(
        'build',
        4,
        'node',
        [
          'node_modules/vite/bin/vite.js',
          'build',
          '--config=.prodivix/controlled-vite.config.mjs',
        ],
        nodeTool('node_modules/vite/bin/vite.js', authority.viteVersion)
      ),
      rawCommand(
        'test',
        5,
        'node',
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          '--config=.prodivix/controlled-vite.config.mjs',
          '--reporter=default',
          '--reporter=json',
          '--no-file-parallelism',
          '--pool=threads',
          `--outputFile.json=${snapshot.testPlan.reportFilePath}`,
          '--coverage',
          '--coverage.provider=v8',
          '--coverage.reporter=json-summary',
          '--coverage.reportsDirectory=.prodivix/coverage',
        ],
        nodeTool('node_modules/vitest/vitest.mjs', authority.vitestVersion)
      ),
    ]);

    const decoded = decodeControlledStaticToolchainLinuxCommands(
      rawCommands,
      snapshot,
      authority
    );
    expect(decoded.map(({ stage }) => stage)).toEqual(stages);
    expect(
      decoded.every(({ executionBoundary }) => executionBoundary === 'sandbox')
    ).toBe(true);
    expect(() =>
      decodeControlledStaticToolchainLinuxCommands(
        [...rawCommands.slice(0, 4), rawCommands[5], rawCommands[4]],
        snapshot,
        authority
      )
    ).toThrow(/command 4 authority drifted/u);
  });
});
