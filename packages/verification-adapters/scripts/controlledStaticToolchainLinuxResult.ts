import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT,
  type ControlledStaticToolchainAuthorityReceipt,
  type ControlledStaticToolchainCommandReceipt,
} from './controlledStaticToolchainProtocol';
import { decodeControlledStaticRootlessAuthorities } from './controlledStaticRootlessAuthorityDecoder';
import type {
  ControlledStaticToolchainSandboxAuthority,
  ControlledStaticToolchainSandboxExecution,
} from './controlledStaticToolchainSandboxTypes';
import {
  decodeControlledStaticSandboxCanonicalBase64 as canonicalBase64,
  controlledStaticSandboxDigestBytes as digestBytes,
  controlledStaticSandboxExactRecord as exactRecord,
} from './controlledStaticToolchainSandboxProtocol';

const RESULT_FORMAT = 'prodivix.controlled-static-toolchain-sandbox-result.v1';
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const OCI_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const readDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be canonical SHA-256.`);
  }
  return value;
};

const readNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value as number;
};

const decodeEnvironment = (
  value: unknown
): ControlledStaticToolchainAuthorityReceipt['environment'] => {
  const environment = exactRecord(
    value,
    ['install', 'execution'],
    'Controlled sandbox environment'
  );
  const decodePhase = (
    phase: unknown,
    label: string
  ): Readonly<{ keys: readonly string[]; digest: string }> => {
    const record = exactRecord(phase, ['keys', 'digest'], label);
    if (
      !Array.isArray(record.keys) ||
      record.keys.some(
        (key, index, keys) =>
          typeof key !== 'string' ||
          !key ||
          (index > 0 && (keys[index - 1] as string) >= key)
      )
    ) {
      throw new TypeError(`${label} keys drifted.`);
    }
    return Object.freeze({
      keys: Object.freeze([...(record.keys as string[])]),
      digest: readDigest(record.digest, `${label} digest`),
    });
  };
  const install = decodePhase(
    environment.install,
    'Controlled sandbox install environment'
  );
  const execution = decodePhase(
    environment.execution,
    'Controlled sandbox execution environment'
  );
  if (
    !sameCanonicalJson(install.keys, [
      'BUN_INSTALL_CACHE_DIR',
      'HOME',
      'PATH',
      'YARN_CACHE_FOLDER',
      'npm_config_cache',
      'npm_config_store_dir',
    ]) ||
    !sameCanonicalJson(execution.keys, ['HOME', 'PATH'])
  ) {
    throw new TypeError(
      'Controlled sandbox inherited an unexpected environment.'
    );
  }
  return Object.freeze({ install, execution });
};

const expectedCommands = (
  snapshot: ExecutableProjectSnapshot,
  authority: ControlledStaticToolchainSandboxAuthority
): readonly Readonly<{
  stage: ControlledStaticToolchainCommandReceipt['stage'];
  application: string;
  args: readonly string[];
  binary: string;
  version: string;
  subjectBinary?: string;
  subjectVersion?: string;
}>[] => {
  const typecheckSubject =
    snapshot.target.presetId === 'vue-vite'
      ? 'node_modules/vue-tsc/bin/vue-tsc.js'
      : 'node_modules/typescript/bin/tsc';
  const nodeSubject = (
    stage: ControlledStaticToolchainCommandReceipt['stage'],
    subjectBinary: string,
    subjectVersion: string,
    args: readonly string[]
  ) =>
    Object.freeze({
      stage,
      application: 'node',
      args,
      binary: 'node',
      version: authority.nodeVersion,
      subjectBinary,
      subjectVersion,
    });
  return Object.freeze([
    Object.freeze({
      stage: 'version',
      application: 'pnpm',
      args: Object.freeze(['--version']),
      binary: 'pnpm',
      version: authority.pnpmVersion,
    }),
    Object.freeze({
      stage: 'install',
      application: 'pnpm',
      args: Object.freeze([
        'install',
        '--frozen-lockfile',
        '--offline',
        '--ignore-scripts',
        '--reporter=append-only',
        '--loglevel=error',
        '--frozen-store',
        '--store-dir=/opt/prodivix/pnpm-store',
        '--package-import-method=copy',
      ]),
      binary: 'pnpm',
      version: authority.pnpmVersion,
    }),
    nodeSubject(
      'isolation',
      '.prodivix/isolation-probe.mjs',
      authority.isolationProbeDigest,
      Object.freeze(['.prodivix/isolation-probe.mjs'])
    ),
    nodeSubject(
      'typecheck',
      typecheckSubject,
      authority.typescriptVersion,
      Object.freeze([
        typecheckSubject,
        ...(snapshot.target.presetId === 'vue-vite' ? ['--noEmit'] : ['-b']),
      ])
    ),
    nodeSubject(
      'build',
      'node_modules/vite/bin/vite.js',
      authority.viteVersion,
      Object.freeze([
        'node_modules/vite/bin/vite.js',
        'build',
        '--config=.prodivix/controlled-vite.config.mjs',
      ])
    ),
    nodeSubject(
      'test',
      'node_modules/vitest/vitest.mjs',
      authority.vitestVersion,
      Object.freeze([
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
      ])
    ),
  ]);
};

export const decodeControlledStaticToolchainLinuxCommands = (
  value: unknown,
  snapshot: ExecutableProjectSnapshot,
  authority: ControlledStaticToolchainSandboxAuthority
): readonly ControlledStaticToolchainCommandReceipt[] => {
  if (!Array.isArray(value) || value.length !== 6) {
    throw new TypeError('Controlled sandbox command receipt set drifted.');
  }
  const expected = expectedCommands(snapshot, authority);
  return Object.freeze(
    value.map((entry, index) => {
      const record = exactRecord(
        entry,
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
        `Controlled sandbox command ${index}`
      );
      const tool = exactRecord(
        record.tool,
        index < 2
          ? ['binary', 'version']
          : ['binary', 'version', 'subjectBinary', 'subjectVersion'],
        `Controlled sandbox command ${index} tool`
      );
      const output = (
        outputValue: unknown,
        label: string
      ): ControlledStaticToolchainCommandReceipt['stdout'] => {
        const outputRecord = exactRecord(
          outputValue,
          ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
          label
        );
        const byteLength = readNonNegativeInteger(
          outputRecord.byteLength,
          `${label} byteLength`
        );
        const capturedByteLength = readNonNegativeInteger(
          outputRecord.capturedByteLength,
          `${label} capturedByteLength`
        );
        if (
          outputRecord.truncated !== false ||
          capturedByteLength !== byteLength
        ) {
          throw new TypeError(`${label} was not captured exactly.`);
        }
        return Object.freeze({
          digest: readDigest(outputRecord.digest, `${label} digest`),
          byteLength,
          capturedByteLength,
          truncated: false,
        });
      };
      const expectedCommand = expected[index]!;
      if (
        record.stage !== expectedCommand.stage ||
        record.application !== expectedCommand.application ||
        !sameCanonicalJson(record.args, expectedCommand.args) ||
        record.cwd !== 'workspace:/' ||
        record.executionBoundary !== 'sandbox' ||
        record.exitCode !== 0 ||
        record.signal !== null ||
        record.timedOut !== false ||
        !Number.isSafeInteger(record.startedAtEpochMs) ||
        !Number.isSafeInteger(record.completedAtEpochMs) ||
        (record.completedAtEpochMs as number) <
          (record.startedAtEpochMs as number) ||
        tool.binary !== expectedCommand.binary ||
        tool.version !== expectedCommand.version ||
        tool.subjectBinary !== expectedCommand.subjectBinary ||
        tool.subjectVersion !== expectedCommand.subjectVersion
      ) {
        throw new TypeError(
          `Controlled sandbox command ${index} authority drifted.`
        );
      }
      return Object.freeze({
        stage: expectedCommand.stage,
        application: expectedCommand.application,
        args: Object.freeze([...(record.args as string[])]),
        cwd: 'workspace:/',
        executionBoundary: 'sandbox',
        environmentDigest: readDigest(
          record.environmentDigest,
          `Controlled sandbox command ${index} environment`
        ),
        tool: Object.freeze({
          binary: tool.binary as string,
          version: tool.version as string,
          ...(expectedCommand.subjectBinary
            ? {
                subjectBinary: tool.subjectBinary as string,
                subjectVersion: tool.subjectVersion as string,
              }
            : {}),
        }),
        startedAtEpochMs: record.startedAtEpochMs as number,
        completedAtEpochMs: record.completedAtEpochMs as number,
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: output(
          record.stdout,
          `Controlled sandbox command ${index} stdout`
        ),
        stderr: output(
          record.stderr,
          `Controlled sandbox command ${index} stderr`
        ),
      });
    })
  );
};

const decodeArtifactEnvelope = (value: unknown, label: string): Uint8Array => {
  const envelope = exactRecord(value, ['encoding', 'contents'], label);
  if (envelope.encoding !== 'base64') {
    throw new TypeError(`${label} encoding drifted.`);
  }
  return canonicalBase64(envelope.contents, `${label} contents`);
};

export const decodeControlledStaticToolchainLinuxResult = (
  source: string,
  snapshot: ExecutableProjectSnapshot,
  requestDigest: string,
  authority: ControlledStaticToolchainSandboxAuthority
): ControlledStaticToolchainSandboxExecution => {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new TypeError('Controlled static sandbox returned invalid JSON.');
  }
  if (canonicalJsonText(value) !== source) {
    throw new TypeError(
      'Controlled static sandbox result must be canonical JSON.'
    );
  }
  const record = exactRecord(
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
      'artifactAuthority',
      'artifacts',
      'resultDigest',
    ],
    'Controlled static sandbox result'
  );
  const resultBase = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'resultDigest')
  );
  if (
    record.format !== RESULT_FORMAT ||
    record.provider !== 'linux-rootless-podman' ||
    record.requestDigest !== requestDigest ||
    record.snapshotDigest !== snapshot.contentDigest ||
    record.resultDigest !== digestBytes(canonicalJsonText(resultBase))
  ) {
    throw new TypeError('Controlled static sandbox result identity drifted.');
  }
  const environment = decodeEnvironment(record.environment);
  const commands = decodeControlledStaticToolchainLinuxCommands(
    record.commands,
    snapshot,
    authority
  );
  const toolchain = exactRecord(
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
    'Controlled static sandbox toolchain receipt'
  );
  const expectedToolchain = Object.freeze({
    pnpmVersion: authority.pnpmVersion,
    nodeVersion: authority.nodeVersion,
    nodeBinaryDigest: readDigest(
      toolchain.nodeBinaryDigest,
      'Controlled Node binary digest'
    ),
    typescriptVersion: authority.typescriptVersion,
    vitestVersion: authority.vitestVersion,
    viteVersion: authority.viteVersion,
    rollupVersion: authority.rollupVersion,
    rollupImplementation: authority.rollupImplementation,
    rollupAliasSpec: authority.rollupAliasSpec,
    esbuildVersion: authority.esbuildVersion,
    esbuildImplementation: authority.esbuildImplementation,
    esbuildAliasSpec: authority.esbuildAliasSpec,
    manifestDigest: authority.manifestDigest,
    lockDigest: authority.lockDigest,
    toolchainFileSetDigest: authority.toolchainFileSetDigest,
  });
  if (!sameCanonicalJson(toolchain, expectedToolchain)) {
    throw new TypeError('Controlled static sandbox toolchain drifted.');
  }
  const isolation = exactRecord(
    record.isolation,
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
    'Controlled static sandbox isolation'
  );
  const probe = exactRecord(
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
    'Controlled static rootless isolation probe'
  );
  const linuxAttestation = exactRecord(
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
    'Controlled static rootless Linux attestation'
  );
  const cgroup = exactRecord(
    isolation.cgroup,
    [
      'maximumCpuCores',
      'maximumMemoryBytes',
      'maximumPids',
      'maximumOpenFiles',
    ],
    'Controlled static rootless cgroup authority'
  );
  if (
    isolation.provider !== 'linux-rootless-podman' ||
    typeof isolation.imageDigest !== 'string' ||
    !OCI_DIGEST_PATTERN.test(isolation.imageDigest) ||
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
    probe.egressAttemptCount !== 5 ||
    probe.egressSuccessCount !== 0 ||
    probe.rootFilesystemWriteDenied !== true ||
    probe.hostMountAbsent !== true ||
    probe.containerSocketAbsent !== true ||
    probe.inheritedCredentialKeyCount !== 0 ||
    !Number.isSafeInteger(linuxAttestation.uid) ||
    (linuxAttestation.uid as number) <= 0 ||
    !Number.isSafeInteger(linuxAttestation.gid) ||
    (linuxAttestation.gid as number) < 0 ||
    linuxAttestation.effectiveCapabilities !== '0000000000000000' ||
    linuxAttestation.noNewPrivileges !== '1' ||
    linuxAttestation.workspaceTmpfs !== true ||
    linuxAttestation.temporaryTmpfs !== true ||
    !Number.isSafeInteger(linuxAttestation.workspaceMaximumBytes) ||
    (linuxAttestation.workspaceMaximumBytes as number) <= 0 ||
    (linuxAttestation.workspaceMaximumBytes as number) > 1024 * 1024 * 1024 ||
    !Number.isSafeInteger(linuxAttestation.temporaryMaximumBytes) ||
    (linuxAttestation.temporaryMaximumBytes as number) <= 0 ||
    (linuxAttestation.temporaryMaximumBytes as number) > 1024 * 1024 * 1024 ||
    linuxAttestation.memoryMaximum !== String(2_048 * 1024 * 1024) ||
    linuxAttestation.pidsMaximum !== '256' ||
    linuxAttestation.cpuMaximum !== '200000 100000'
  ) {
    throw new TypeError('Controlled static sandbox isolation failed closed.');
  }
  const rootlessAuthorities = decodeControlledStaticRootlessAuthorities({
    providerProcess: isolation.providerProcess,
    processTree: record.processTree,
    commands,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    manifestDigest: authority.manifestDigest,
    lockDigest: authority.lockDigest,
    toolchainFileSetDigest: authority.toolchainFileSetDigest,
    rollupVersion: authority.rollupVersion,
    rollupImplementation: authority.rollupImplementation,
    rollupAliasSpec: authority.rollupAliasSpec,
    esbuildVersion: authority.esbuildVersion,
    esbuildImplementation: authority.esbuildImplementation,
    esbuildAliasSpec: authority.esbuildAliasSpec,
    imageDigest: isolation.imageDigest,
  });
  if (
    isolation.providerFileSetDigest !==
    rootlessAuthorities.aggregateProviderFileSetDigest
  ) {
    throw new TypeError(
      'Controlled static sandbox provider file-set authority drifted.'
    );
  }
  const normalizedIsolation = Object.freeze({
    provider: 'linux-rootless-podman',
    imageDigest: isolation.imageDigest,
    rootFilesystem: 'read-only',
    network: 'none',
    hostMountCount: 0,
    writableMounts: isolation.writableMounts,
    cgroup,
    containerEnvironmentKeys: Object.freeze(['HOME', 'PATH']),
    providerFileSetDigest: rootlessAuthorities.aggregateProviderFileSetDigest,
    probe: Object.freeze({
      ...probe,
      linuxAttestation: Object.freeze({ ...linuxAttestation }),
    }),
    providerProcess: rootlessAuthorities.providerProcess,
  });
  if (!sameCanonicalJson(normalizedIsolation, isolation)) {
    throw new TypeError(
      'Controlled static sandbox isolation authority drifted.'
    );
  }
  const processTree = rootlessAuthorities.processTree;
  const artifacts = exactRecord(
    record.artifacts,
    ['testReport', 'coverageSummary', 'buildLog', 'buildFiles'],
    'Controlled static sandbox artifacts'
  );
  const testReport = decodeArtifactEnvelope(
    artifacts.testReport,
    'Controlled static Test report'
  );
  const coverageSummary = decodeArtifactEnvelope(
    artifacts.coverageSummary,
    'Controlled static Coverage summary'
  );
  const buildLogBytes = decodeArtifactEnvelope(
    artifacts.buildLog,
    'Controlled static Build log'
  );
  let buildLog: string;
  try {
    buildLog = new TextDecoder('utf-8', { fatal: true }).decode(buildLogBytes);
  } catch {
    throw new TypeError('Controlled static Build log is not UTF-8.');
  }
  if (!Array.isArray(artifacts.buildFiles) || !artifacts.buildFiles.length) {
    throw new TypeError('Controlled static build files are missing.');
  }
  const buildFiles = Object.freeze(
    artifacts.buildFiles.map((entry, index) => {
      const file = exactRecord(
        entry,
        ['path', 'size', 'digest', 'encoding', 'contents'],
        `Controlled static build file ${index}`
      );
      const contents = decodeArtifactEnvelope(
        { encoding: file.encoding, contents: file.contents },
        `Controlled static build file ${index}`
      );
      if (
        typeof file.path !== 'string' ||
        !file.path ||
        file.path.startsWith('/') ||
        file.path.includes('\\') ||
        file.path.split('/').some((segment) => !segment || segment === '..') ||
        file.size !== contents.byteLength ||
        file.digest !== digestBytes(contents)
      ) {
        throw new TypeError(`Controlled static build file ${index} drifted.`);
      }
      return Object.freeze({
        path: file.path,
        size: contents.byteLength,
        digest: file.digest,
        contents,
      });
    })
  );
  if (new Set(buildFiles.map(({ path }) => path)).size !== buildFiles.length) {
    throw new TypeError('Controlled static build file paths are duplicated.');
  }
  const artifactAuthority = exactRecord(
    record.artifactAuthority,
    [
      'testReportDigest',
      'coverageSummaryDigest',
      'buildLogDigest',
      'buildFileSetDigest',
      'buildFileCount',
    ],
    'Controlled static artifact authority'
  );
  const buildFileSetFacts = buildFiles.map(({ path, size, digest }) => ({
    digest,
    path,
    size,
  }));
  const artifactFacts = Object.freeze({
    testReportDigest: digestBytes(testReport),
    coverageSummaryDigest: digestBytes(coverageSummary),
    buildLogDigest: digestBytes(buildLogBytes),
    buildFileSetDigest: digestBytes(canonicalJsonText(buildFileSetFacts)),
    buildFileCount: buildFiles.length,
  });
  if (!sameCanonicalJson(artifactAuthority, artifactFacts)) {
    throw new TypeError('Controlled static artifact authority drifted.');
  }
  const receiptIsolation = Object.freeze({
    provider: 'linux-rootless-podman' as const,
    networkMode: 'none' as const,
    liveEgressAttemptCount: probe.egressAttemptCount as number,
    liveEgressSuccessCount: 0 as const,
    hostMountCount: 0 as const,
    rootFilesystem: 'read-only' as const,
    authority: normalizedIsolation,
  });
  const sandboxResultDigest = digestBytes(
    canonicalJsonText({
      provider: 'linux-rootless-podman',
      requestDigest,
      snapshotDigest: snapshot.contentDigest,
      environment,
      commands,
      isolation: receiptIsolation,
      processTree,
      toolchain: expectedToolchain,
      artifacts: artifactFacts,
    })
  );
  const receiptBase = Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT,
    provider: 'linux-rootless-podman' as const,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    environment,
    commands,
    isolation: receiptIsolation,
    processTree,
    toolchain: expectedToolchain,
    artifacts: artifactFacts,
    sandboxResultDigest,
  });
  const authorityReceipt: ControlledStaticToolchainAuthorityReceipt =
    Object.freeze({
      ...receiptBase,
      receiptDigest: digestBytes(canonicalJsonText(receiptBase)),
    });
  return Object.freeze({
    testProviderRoot: '/workspace',
    buildProviderRoot: '/workspace',
    buildFiles,
    testReport,
    coverageSummary,
    buildLog,
    authorityReceipt,
  });
};
