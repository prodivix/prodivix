import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeExecutionBuildBundle,
  readExecutionTestReportValue,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  decodeGoldenControlledStaticToolchainProjectionAuthority,
  type GoldenControlledStaticToolchainProjectionAuthority,
} from './generatedProjectToolchainProjectionAuthority';
import { decodeGoldenControlledStaticRootlessAuthority } from './generatedProjectToolchainLinuxAuthority';
import { decodeGoldenControlledStaticWindowsAuthority } from './generatedProjectToolchainWindowsAuthority';
import type {
  GoldenControlledStaticToolchainAuthorityReceipt,
  GoldenControlledStaticToolchainCommandReceipt,
} from './generatedProjectToolchainAuthorityTypes';

export {
  readGoldenGeneratedProjectPackageManager,
  runGoldenStandaloneProjectCommands,
  withGoldenCoverageDependency,
  writeGoldenGeneratedProjectBundle,
  type GoldenGeneratedProjectBundle,
} from './generatedProjectLocalToolchain';
export type {
  GoldenControlledStaticToolchainAuthorityReceipt,
  GoldenControlledStaticToolchainCommandReceipt,
} from './generatedProjectToolchainAuthorityTypes';
export type {
  GoldenControlledStaticToolchainProjectionAuthority,
  GoldenControlledStaticToolchainProjectionReceipt,
  GoldenControlledStaticToolchainRawEnvelope,
} from './generatedProjectToolchainProjectionAuthority';

export type GoldenPreparedProjectToolchainEvidence = Readonly<{
  buildBundle: ExecutionBuildBundle;
  buildSummary: Uint8Array;
  coverageSummary: Uint8Array;
  testReport: ExecutionTestReport;
  authorityReceipt: GoldenControlledStaticToolchainAuthorityReceipt;
  projectionAuthority: GoldenControlledStaticToolchainProjectionAuthority;
}>;

const encodeSnapshotFile = (
  file: ExecutableProjectSnapshot['files'][number]
): Readonly<{
  path: string;
  encoding: 'utf8' | 'base64';
  contents: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
}> =>
  Object.freeze({
    path: file.path,
    encoding: typeof file.contents === 'string' ? 'utf8' : 'base64',
    contents:
      typeof file.contents === 'string'
        ? file.contents
        : Buffer.from(file.contents).toString('base64'),
    ...(file.sourceTrace ? { sourceTrace: file.sourceTrace } : {}),
  });

const decodeCanonicalBase64 = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new Error(`${label} is not canonical base64.`);
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
};

const exactResultRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  const record = value as Record<string, unknown>;
  if (
    keys.some((key) => !(key in record)) ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
  return record;
};

const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const validatedControlledAuthorityReceipts = new WeakSet<object>();

export const assertGoldenControlledStaticToolchainAuthorityReceipt = (
  receipt: GoldenControlledStaticToolchainAuthorityReceipt
): void => {
  if (!validatedControlledAuthorityReceipts.has(receipt)) {
    throw new Error(
      'Controlled static toolchain authority receipt was not issued by the strict owner decoder.'
    );
  }
};

const exactDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is not canonical SHA-256.`);
  }
  return value;
};

const exactNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is not a non-negative integer.`);
  }
  return value as number;
};

const decodeControlledAuthorityReceipt = (
  value: unknown,
  snapshot: ExecutableProjectSnapshot,
  requestDigest: string,
  buildBundle: ExecutionBuildBundle
): GoldenControlledStaticToolchainAuthorityReceipt => {
  const record = exactResultRecord(
    value,
    [
      'format',
      'provider',
      'requestDigest',
      'snapshotDigest',
      'environment',
      'commands',
      'isolation',
      'processTree',
      'toolchain',
      'artifacts',
      'sandboxResultDigest',
      'receiptDigest',
    ],
    'Controlled static toolchain authority receipt'
  );
  const receiptBase = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'receiptDigest')
  );
  if (
    record.format !==
      'prodivix.controlled-static-toolchain-authority-receipt.v1' ||
    (record.provider !== 'linux-rootless-podman' &&
      record.provider !== 'windows-appcontainer') ||
    record.requestDigest !== requestDigest ||
    record.snapshotDigest !== snapshot.contentDigest ||
    record.receiptDigest !== digestVerificationValue(receiptBase)
  ) {
    throw new Error(
      'Controlled static toolchain authority receipt identity drifted.'
    );
  }
  const provider = record.provider as
    'windows-appcontainer' | 'linux-rootless-podman';
  const environment = exactResultRecord(
    record.environment,
    ['install', 'execution'],
    'Controlled static toolchain environment'
  );
  const environmentPhase = (
    phase: unknown,
    label: string
  ): Readonly<{ keys: readonly string[]; digest: string }> => {
    const phaseRecord = exactResultRecord(phase, ['keys', 'digest'], label);
    if (
      !Array.isArray(phaseRecord.keys) ||
      phaseRecord.keys.some(
        (key, index, keys) =>
          typeof key !== 'string' ||
          !key ||
          (index > 0 && (keys[index - 1] as string) >= key)
      )
    ) {
      throw new Error(`${label} keys drifted.`);
    }
    return Object.freeze({
      keys: Object.freeze([...(phaseRecord.keys as string[])]),
      digest: exactDigest(phaseRecord.digest, `${label} digest`),
    });
  };
  const installEnvironment = environmentPhase(
    environment.install,
    'Controlled static toolchain install environment'
  );
  const executionEnvironment = environmentPhase(
    environment.execution,
    'Controlled static toolchain execution environment'
  );
  const expectedEnvironmentKeys =
    provider === 'windows-appcontainer'
      ? [
          'APPDATA',
          'CI',
          'HOME',
          'LOCALAPPDATA',
          'NPM_CONFIG_FETCH_RETRIES',
          'NPM_CONFIG_NODE_LINKER',
          'NPM_CONFIG_OFFLINE',
          'NPM_CONFIG_PACKAGE_IMPORT_METHOD',
          'NPM_CONFIG_REGISTRY',
          'NPM_CONFIG_TRUST_LOCKFILE',
          'NPM_CONFIG_WORKSPACE_DIR',
          'SystemRoot',
          'TEMP',
          'TMP',
          'USERPROFILE',
        ]
      : undefined;
  if (
    provider === 'windows-appcontainer'
      ? canonicalJsonText(installEnvironment.keys) !==
          canonicalJsonText(expectedEnvironmentKeys) ||
        canonicalJsonText(executionEnvironment.keys) !==
          canonicalJsonText(expectedEnvironmentKeys)
      : canonicalJsonText(installEnvironment.keys) !==
          canonicalJsonText([
            'BUN_INSTALL_CACHE_DIR',
            'HOME',
            'PATH',
            'YARN_CACHE_FOLDER',
            'npm_config_cache',
            'npm_config_store_dir',
          ]) ||
        canonicalJsonText(executionEnvironment.keys) !==
          canonicalJsonText(['HOME', 'PATH'])
  ) {
    throw new Error(
      'Controlled static toolchain environment key authority drifted.'
    );
  }
  const toolchain = exactResultRecord(
    record.toolchain,
    [
      'pnpmVersion',
      'nodeVersion',
      'nodeBinaryDigest',
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
    ],
    'Controlled static toolchain versions'
  );
  if (
    toolchain.pnpmVersion !== '11.9.0' ||
    toolchain.nodeVersion !== '22.23.1' ||
    toolchain.rollupVersion !== '4.62.3' ||
    toolchain.rollupImplementation !== '@rollup/wasm-node' ||
    toolchain.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3' ||
    toolchain.esbuildVersion !== '0.27.7' ||
    toolchain.esbuildImplementation !== 'esbuild-wasm' ||
    toolchain.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7' ||
    ![
      toolchain.typescriptVersion,
      toolchain.vitestVersion,
      toolchain.viteVersion,
    ].every(
      (version) =>
        typeof version === 'string' &&
        /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
    )
  ) {
    throw new Error('Controlled static toolchain version authority drifted.');
  }
  const normalizedToolchain = Object.freeze({
    pnpmVersion: toolchain.pnpmVersion,
    nodeVersion: toolchain.nodeVersion,
    nodeBinaryDigest: exactDigest(
      toolchain.nodeBinaryDigest,
      'Controlled Node binary digest'
    ),
    typescriptVersion: toolchain.typescriptVersion as string,
    vitestVersion: toolchain.vitestVersion as string,
    viteVersion: toolchain.viteVersion as string,
    rollupVersion: '4.62.3' as const,
    rollupImplementation: '@rollup/wasm-node' as const,
    rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3' as const,
    esbuildVersion: '0.27.7' as const,
    esbuildImplementation: 'esbuild-wasm' as const,
    esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7' as const,
    manifestDigest: exactDigest(
      toolchain.manifestDigest,
      'Controlled manifest digest'
    ),
    lockDigest: exactDigest(toolchain.lockDigest, 'Controlled lock digest'),
    toolchainFileSetDigest: exactDigest(
      toolchain.toolchainFileSetDigest,
      'Controlled toolchain file-set digest'
    ),
  });
  const typecheckSubject =
    snapshot.target.presetId === 'vue-vite'
      ? 'node_modules/vue-tsc/bin/vue-tsc.js'
      : 'node_modules/typescript/bin/tsc';
  type ExpectedCommand = Readonly<{
    stage: GoldenControlledStaticToolchainCommandReceipt['stage'];
    application: string;
    args: readonly string[];
    binary: string;
    version: string;
    subjectBinary?: string;
    subjectVersion?: string;
    cwd: 'workspace:/';
    executionBoundary: 'sandbox';
  }>;
  const windowsNodePrefix =
    provider === 'windows-appcontainer'
      ? ['--preserve-symlinks', '--preserve-symlinks-main']
      : [];
  const windowsPnpmPath = '.prodivix/windows-runtime/pnpm-bootstrap.mjs';
  const windowsViteNodeImportArguments =
    provider === 'windows-appcontainer'
      ? ['--import=./.prodivix/windows-runtime/esbuild-register.mjs']
      : [];
  const windowsViteConfigArguments =
    provider === 'windows-appcontainer' ? ['--configLoader=native'] : [];
  const expectedCommands: readonly ExpectedCommand[] = [
    {
      stage: 'version',
      application: provider === 'windows-appcontainer' ? 'node' : 'pnpm',
      args:
        provider === 'windows-appcontainer'
          ? [...windowsNodePrefix, windowsPnpmPath, '--version']
          : ['--version'],
      binary: 'pnpm',
      version: normalizedToolchain.pnpmVersion,
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
    {
      stage: 'install',
      application: provider === 'windows-appcontainer' ? 'node' : 'pnpm',
      args:
        provider === 'windows-appcontainer'
          ? [
              ...windowsNodePrefix,
              windowsPnpmPath,
              'install',
              '--frozen-lockfile',
              '--offline',
              '--ignore-scripts',
              '--node-linker=hoisted',
              '--trust-lockfile',
              '--fetch-retries=0',
              '--registry=https://registry.npmjs.org/',
              '--store-dir=.prodivix/pnpm-store',
              '--package-import-method=copy',
            ]
          : [
              'install',
              '--frozen-lockfile',
              '--offline',
              '--ignore-scripts',
              '--store-dir=/opt/prodivix/pnpm-store',
            ],
      binary: 'pnpm',
      version: normalizedToolchain.pnpmVersion,
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
    {
      stage: 'isolation',
      application: 'node',
      args: [...windowsNodePrefix, '.prodivix/isolation-probe.mjs'],
      binary: 'node',
      version: normalizedToolchain.nodeVersion,
      subjectBinary: '.prodivix/isolation-probe.mjs',
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
    {
      stage: 'typecheck',
      application: 'node',
      args: [
        ...windowsNodePrefix,
        typecheckSubject,
        ...(snapshot.target.presetId === 'vue-vite' ? ['--noEmit'] : ['-b']),
      ],
      binary: 'node',
      version: normalizedToolchain.nodeVersion,
      subjectBinary: typecheckSubject,
      subjectVersion: normalizedToolchain.typescriptVersion,
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
    {
      stage: 'build',
      application: 'node',
      args: [
        ...windowsNodePrefix,
        ...windowsViteNodeImportArguments,
        'node_modules/vite/bin/vite.js',
        'build',
        '--config=.prodivix/controlled-vite.config.mjs',
        ...windowsViteConfigArguments,
      ],
      binary: 'node',
      version: normalizedToolchain.nodeVersion,
      subjectBinary: 'node_modules/vite/bin/vite.js',
      subjectVersion: normalizedToolchain.viteVersion,
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
    {
      stage: 'test',
      application: 'node',
      args: [
        ...windowsNodePrefix,
        ...windowsViteNodeImportArguments,
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config=.prodivix/controlled-vite.config.mjs',
        ...windowsViteConfigArguments,
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
      binary: 'node',
      version: normalizedToolchain.nodeVersion,
      subjectBinary: 'node_modules/vitest/vitest.mjs',
      subjectVersion: normalizedToolchain.vitestVersion,
      cwd: 'workspace:/',
      executionBoundary: 'sandbox',
    },
  ];
  if (!Array.isArray(record.commands) || record.commands.length !== 6) {
    throw new Error('Controlled static toolchain command set drifted.');
  }
  const commands = Object.freeze(
    record.commands.map((command, index) => {
      const expected = expectedCommands[index]!;
      const commandRecord = exactResultRecord(
        command,
        [
          'stage',
          'application',
          'args',
          'cwd',
          'executionBoundary',
          'environmentDigest',
          'tool',
          'startedAtEpochMs',
          'completedAtEpochMs',
          'exitCode',
          'signal',
          'timedOut',
          'stdout',
          'stderr',
        ],
        `Controlled static toolchain command ${index}`
      );
      const tool = exactResultRecord(
        commandRecord.tool,
        index < 2
          ? ['binary', 'version']
          : ['binary', 'version', 'subjectBinary', 'subjectVersion'],
        `Controlled static toolchain command ${index} tool`
      );
      const output = (
        outputValue: unknown,
        label: string
      ): GoldenControlledStaticToolchainCommandReceipt['stdout'] => {
        const outputRecord = exactResultRecord(
          outputValue,
          ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
          label
        );
        const byteLength = exactNonNegativeInteger(
          outputRecord.byteLength,
          `${label} byteLength`
        );
        const capturedByteLength = exactNonNegativeInteger(
          outputRecord.capturedByteLength,
          `${label} capturedByteLength`
        );
        if (
          outputRecord.truncated !== false ||
          capturedByteLength !== byteLength
        ) {
          throw new Error(`${label} was not captured exactly.`);
        }
        return Object.freeze({
          digest: exactDigest(outputRecord.digest, `${label} digest`),
          byteLength,
          capturedByteLength,
          truncated: false,
        });
      };
      const expectedEnvironmentDigest =
        index < 2 ? installEnvironment.digest : executionEnvironment.digest;
      const commandEnvironmentDigest = exactDigest(
        commandRecord.environmentDigest,
        `Controlled static toolchain command ${index} environment`
      );
      if (
        commandRecord.stage !== expected.stage ||
        commandRecord.application !== expected.application ||
        canonicalJsonText(commandRecord.args) !==
          canonicalJsonText(expected.args) ||
        commandRecord.cwd !== expected.cwd ||
        commandRecord.executionBoundary !== expected.executionBoundary ||
        (provider === 'linux-rootless-podman' &&
          commandEnvironmentDigest !== expectedEnvironmentDigest) ||
        commandRecord.exitCode !== 0 ||
        commandRecord.signal !== null ||
        commandRecord.timedOut !== false ||
        !Number.isSafeInteger(commandRecord.startedAtEpochMs) ||
        !Number.isSafeInteger(commandRecord.completedAtEpochMs) ||
        (commandRecord.completedAtEpochMs as number) <
          (commandRecord.startedAtEpochMs as number) ||
        tool.binary !== expected.binary ||
        tool.version !== expected.version ||
        tool.subjectBinary !== expected.subjectBinary ||
        (expected.subjectVersion !== undefined &&
          tool.subjectVersion !== expected.subjectVersion) ||
        (index === 2 &&
          (typeof tool.subjectVersion !== 'string' ||
            !SHA256_PATTERN.test(tool.subjectVersion)))
      ) {
        throw new Error(
          `Controlled static toolchain command ${index} authority drifted.`
        );
      }
      return Object.freeze({
        stage: expected.stage,
        application: expected.application,
        args: Object.freeze([...(commandRecord.args as string[])]),
        cwd: expected.cwd,
        executionBoundary: expected.executionBoundary,
        environmentDigest: commandEnvironmentDigest,
        tool: Object.freeze({
          binary: expected.binary,
          version: expected.version,
          ...(expected.subjectBinary
            ? {
                subjectBinary: expected.subjectBinary,
                subjectVersion: tool.subjectVersion as string,
              }
            : {}),
        }),
        startedAtEpochMs: commandRecord.startedAtEpochMs as number,
        completedAtEpochMs: commandRecord.completedAtEpochMs as number,
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: output(
          commandRecord.stdout,
          `Controlled static toolchain command ${index} stdout`
        ),
        stderr: output(
          commandRecord.stderr,
          `Controlled static toolchain command ${index} stderr`
        ),
      });
    })
  );
  const isolationRecord = exactResultRecord(
    record.isolation,
    [
      'provider',
      'networkMode',
      'liveEgressAttemptCount',
      'liveEgressSuccessCount',
      'hostMountCount',
      'rootFilesystem',
      'authority',
    ],
    'Controlled static toolchain isolation'
  );
  const liveEgressAttemptCount = exactNonNegativeInteger(
    isolationRecord.liveEgressAttemptCount,
    'Controlled static live-egress attempt count'
  );
  if (
    isolationRecord.provider !== provider ||
    isolationRecord.networkMode !== 'none' ||
    liveEgressAttemptCount < 5 ||
    isolationRecord.liveEgressSuccessCount !== 0 ||
    isolationRecord.hostMountCount !== 0 ||
    (provider === 'linux-rootless-podman'
      ? isolationRecord.rootFilesystem !== 'read-only'
      : isolationRecord.rootFilesystem !== 'appcontainer-lowbox') ||
    !isolationRecord.authority ||
    typeof isolationRecord.authority !== 'object'
  ) {
    throw new Error(
      'Controlled static toolchain isolation receipt failed closed.'
    );
  }
  const rootFilesystem =
    provider === 'linux-rootless-podman'
      ? ('read-only' as const)
      : ('appcontainer-lowbox' as const);
  const decodedRootlessAuthority =
    provider === 'linux-rootless-podman'
      ? decodeGoldenControlledStaticRootlessAuthority({
          isolationAuthority: isolationRecord.authority,
          processTree: record.processTree,
          commands,
          requestDigest,
          snapshotDigest: snapshot.contentDigest,
          toolchain: normalizedToolchain,
        })
      : undefined;
  const normalizedEnvironment = Object.freeze({
    install: installEnvironment,
    execution: executionEnvironment,
  });
  const decodedWindowsAuthority =
    provider === 'windows-appcontainer'
      ? decodeGoldenControlledStaticWindowsAuthority({
          isolationAuthority: isolationRecord.authority,
          processTree: record.processTree,
          commands,
          toolchain: normalizedToolchain,
          environment: normalizedEnvironment,
          liveEgressAttemptCount,
        })
      : undefined;
  const normalizedIsolationAuthority =
    provider === 'windows-appcontainer'
      ? decodedWindowsAuthority!.isolationAuthority
      : (() => {
          if (!decodedRootlessAuthority) {
            throw new Error('Linux rootless authority decoder was not bound.');
          }
          return decodedRootlessAuthority.isolationAuthority;
        })();
  const artifactsRecord = exactResultRecord(
    record.artifacts,
    [
      'testReportDigest',
      'coverageSummaryDigest',
      'buildLogDigest',
      'buildFileSetDigest',
      'buildFileCount',
    ],
    'Controlled static toolchain artifact authority'
  );
  const artifacts = Object.freeze({
    testReportDigest: exactDigest(
      artifactsRecord.testReportDigest,
      'Controlled raw Test report digest'
    ),
    coverageSummaryDigest: exactDigest(
      artifactsRecord.coverageSummaryDigest,
      'Controlled raw Coverage summary digest'
    ),
    buildLogDigest: exactDigest(
      artifactsRecord.buildLogDigest,
      'Controlled raw Build log digest'
    ),
    buildFileSetDigest: exactDigest(
      artifactsRecord.buildFileSetDigest,
      'Controlled build file-set digest'
    ),
    buildFileCount: exactNonNegativeInteger(
      artifactsRecord.buildFileCount,
      'Controlled build file count'
    ),
  });
  const actualBuildFileSetDigest = digestVerificationValue(
    buildBundle.files.map(({ path, size, digest }) => ({
      digest,
      path,
      size,
    }))
  );
  if (
    artifacts.buildFileCount !== buildBundle.files.length ||
    artifacts.buildFileSetDigest !== actualBuildFileSetDigest
  ) {
    throw new Error(
      'Controlled static toolchain build artifact authority drifted.'
    );
  }
  const normalizedProcessTree =
    provider === 'windows-appcontainer'
      ? decodedWindowsAuthority!.processTree
      : (() => {
          if (!decodedRootlessAuthority) {
            throw new Error(
              'Linux rootless process-tree decoder was not bound.'
            );
          }
          return decodedRootlessAuthority.processTree;
        })();
  const normalizedIsolation = Object.freeze({
    provider,
    networkMode: 'none' as const,
    liveEgressAttemptCount,
    liveEgressSuccessCount: 0 as const,
    hostMountCount: 0 as const,
    rootFilesystem,
    authority: normalizedIsolationAuthority,
  });
  const expectedSandboxResultDigest = digestVerificationValue({
    provider,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    environment: normalizedEnvironment,
    commands,
    isolation: normalizedIsolation,
    processTree: normalizedProcessTree,
    toolchain: normalizedToolchain,
    artifacts,
  });
  if (record.sandboxResultDigest !== expectedSandboxResultDigest) {
    throw new Error(
      'Controlled static toolchain sandbox result authority drifted.'
    );
  }
  const normalizedReceipt = Object.freeze({
    format:
      'prodivix.controlled-static-toolchain-authority-receipt.v1' as const,
    provider,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    environment: normalizedEnvironment,
    commands,
    isolation: normalizedIsolation,
    processTree: normalizedProcessTree,
    toolchain: normalizedToolchain,
    artifacts,
    sandboxResultDigest: expectedSandboxResultDigest,
    receiptDigest: record.receiptDigest as string,
  });
  if (
    normalizedReceipt.receiptDigest !==
    digestVerificationValue(
      Object.fromEntries(
        Object.entries(normalizedReceipt).filter(
          ([key]) => key !== 'receiptDigest'
        )
      )
    )
  ) {
    throw new Error('Controlled static toolchain normalized receipt drifted.');
  }
  validatedControlledAuthorityReceipts.add(normalizedReceipt);
  return normalizedReceipt;
};

const decodeControlledToolchainResult = (
  source: string,
  snapshot: ExecutableProjectSnapshot,
  requestDigest: string
): GoldenPreparedProjectToolchainEvidence => {
  let raw: unknown;
  try {
    raw = JSON.parse(source) as unknown;
  } catch {
    throw new Error('Controlled static toolchain returned invalid JSON.');
  }
  if (canonicalJsonText(raw) !== source) {
    throw new Error(
      'Controlled static toolchain result is not canonical JSON.'
    );
  }
  const record = exactResultRecord(
    raw,
    [
      'format',
      'buildBundle',
      'buildSummary',
      'coverageSummary',
      'testReport',
      'authorityReceipt',
      'projectionAuthority',
    ],
    'Controlled static toolchain result'
  );
  if (record.format !== 'prodivix.controlled-static-toolchain-result.v1') {
    throw new Error('Controlled static toolchain result format drifted.');
  }
  const buildBundle = decodeExecutionBuildBundle(
    new TextEncoder().encode(canonicalJsonText(record.buildBundle))
  );
  if (
    buildBundle.snapshotDigest !== snapshot.contentDigest ||
    canonicalJsonText(buildBundle.target) !== canonicalJsonText(snapshot.target)
  ) {
    throw new Error(
      'Controlled static toolchain build bundle is not snapshot-bound.'
    );
  }
  const readEnvelopeBytes = (value: unknown, label: string): Uint8Array => {
    const envelope = exactResultRecord(value, ['encoding', 'contents'], label);
    if (envelope.encoding !== 'base64') {
      throw new Error(`${label} encoding drifted.`);
    }
    return decodeCanonicalBase64(envelope.contents, `${label}.contents`);
  };
  const testReport = readExecutionTestReportValue(record.testReport);
  if (!testReport) {
    throw new Error(
      'Controlled static toolchain Test report is not canonical.'
    );
  }
  const authorityReceipt = decodeControlledAuthorityReceipt(
    record.authorityReceipt,
    snapshot,
    requestDigest,
    buildBundle
  );
  const testCommand = authorityReceipt.commands.find(
    ({ stage }) => stage === 'test'
  );
  if (
    !testCommand ||
    (testCommand.exitCode === 0) !== (testReport.status === 'passed')
  ) {
    throw new Error(
      'Controlled Test report status diverged from its process authority.'
    );
  }
  const buildSummary = readEnvelopeBytes(record.buildSummary, 'Build summary');
  const coverageSummary = readEnvelopeBytes(
    record.coverageSummary,
    'Coverage summary'
  );
  const projectionAuthority =
    decodeGoldenControlledStaticToolchainProjectionAuthority(
      record.projectionAuthority,
      {
        snapshot,
        toolchainAuthorityReceiptDigest: authorityReceipt.receiptDigest,
        artifacts: authorityReceipt.artifacts,
        rawResultBuildBundle: record.buildBundle,
        outputs: {
          buildBundle,
          buildSummary,
          coverageSummary,
          testReport,
        },
      }
    );
  return Object.freeze({
    buildBundle,
    buildSummary,
    coverageSummary,
    testReport,
    authorityReceipt,
    projectionAuthority,
  });
};

export const runGoldenPreparedToolchainEvidence = async (
  snapshot: ExecutableProjectSnapshot
): Promise<GoldenPreparedProjectToolchainEvidence> => {
  const request = canonicalJsonText({
    format: 'prodivix.controlled-static-toolchain-request.v1',
    snapshot: {
      ...snapshot,
      files: snapshot.files.map(encodeSnapshotFile),
    },
  });
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const runnerPath = resolve(
    repoRoot,
    'packages/verification-adapters/scripts/runControlledStaticToolchain.ts'
  );
  const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
  const runnerEnvironment: NodeJS.ProcessEnv = { CI: '1' };
  for (const key of [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
    'PRODIVIX_CONTROLLED_STATIC_SANDBOX_IMAGE',
    'PRODIVIX_CONTROLLED_STATIC_NODE_PATH',
    'SystemRoot',
    'ProgramFiles',
    'LOCALAPPDATA',
    'APPDATA',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'ComSpec',
    'PATHEXT',
  ] as const) {
    const value = process.env[key];
    if (value) runnerEnvironment[key] = value;
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [tsxCli, runnerPath], {
      cwd: repoRoot,
      env: runnerEnvironment,
      shell: false,
      windowsHide: true,
    });
    const output: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    let outputBytes = 0;
    let diagnosticBytes = 0;
    let failed = false;
    child.stdout?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 256 * 1024 * 1024) {
        failed = true;
        child.kill();
        return;
      }
      output.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const remaining = Math.max(0, 16 * 1024 - diagnosticBytes);
      if (remaining > 0) {
        diagnostics.push(chunk.subarray(0, remaining));
        diagnosticBytes += Math.min(remaining, chunk.byteLength);
      }
    });
    const timeout = setTimeout(
      () => {
        failed = true;
        child.kill();
      },
      process.platform === 'win32' ? 90_000 : 210_000
    );
    child.once('error', () => {
      clearTimeout(timeout);
      rejectPromise(
        new Error('Controlled static toolchain runner could not start.')
      );
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (failed || code !== 0) {
        rejectPromise(
          new Error(
            `Controlled static toolchain runner did not succeed: ${
              Buffer.concat(diagnostics).toString('utf8').trim() ||
              'no bounded diagnostic'
            }`
          )
        );
        return;
      }
      try {
        resolvePromise(
          decodeControlledToolchainResult(
            Buffer.concat(output).toString('utf8'),
            snapshot,
            `sha256-${createHash('sha256').update(request).digest('hex')}`
          )
        );
      } catch (error) {
        rejectPromise(error);
      }
    });
    child.stdin?.end(request);
  });
};
