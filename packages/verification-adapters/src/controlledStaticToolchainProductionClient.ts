import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  decodeExecutionBuildBundle,
  readExecutionTestReportValue,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import {
  CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT,
  CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT,
  CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT,
  CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
  encodeControlledStaticToolchainRequest,
  type ControlledStaticToolchainAuthorityReceipt,
  type ControlledStaticToolchainProjectionAuthority,
  type ControlledStaticToolchainRawEnvelope,
  type ControlledStaticToolchainResult,
} from './controlledStaticToolchainProtocol';

export const CONTROLLED_STATIC_TOOLCHAIN_PRODUCTION_CLIENT_IMPLEMENTATION_DIGEST =
  digestVerificationValue({
    format: 'prodivix.controlled-static-toolchain-production-client',
    version: 1,
    requestFormat: 'prodivix.controlled-static-toolchain-request.v1',
    resultFormat: CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
    providerSet: ['linux-rootless-podman', 'windows-appcontainer'],
    networkMode: 'none',
    liveEgressSuccessCount: 0,
    hostMountCount: 0,
    executionTimeoutMs: 170_000,
    cleanupTimeoutMs: 5_000,
    processTreeCleanup: 'term-then-bounded-force',
    toolchain: {
      pnpm: '11.9.0',
      node: '22.23.1',
      rollup: '@rollup/wasm-node@4.62.3',
      esbuild: 'esbuild-wasm@0.27.7',
    },
  });

const maximumProtocolBytes = 256 * 1024 * 1024;
const maximumDiagnosticBytes = 16 * 1024;
export const CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS =
  170_000 as const;
export const CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS = 5_000 as const;
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const exactStages = Object.freeze([
  'version',
  'install',
  'isolation',
  'typecheck',
  'build',
  'test',
]);

export type RunControlledStaticToolchainProductionInput = Readonly<{
  repositoryRoot: string;
  snapshot: ExecutableProjectSnapshot;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export const resolveControlledStaticToolchainExecutionTimeoutMs = (
  timeoutMs: number | undefined
): number => {
  const resolved =
    timeoutMs ?? CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS
  ) {
    throw new TypeError(
      'Controlled static toolchain timeout must be 1..170000ms.'
    );
  }
  return resolved;
};

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => isUnsafeObjectKey(key) || !keys.includes(key)
    )
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

const exactDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !digestPattern.test(value)) {
    throw new TypeError(`${label} is not a canonical SHA-256 digest.`);
  }
  return value;
};

const exactNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${label} is not a non-negative safe integer.`);
  }
  return Number(value);
};

const digestBytes = (value: Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

const decodeEnvelope = (
  value: unknown,
  label: string
): Readonly<{
  envelope: ControlledStaticToolchainRawEnvelope;
  bytes: Uint8Array;
}> => {
  const record = exactRecord(
    value,
    ['encoding', 'byteLength', 'digest', 'contents'],
    label
  );
  if (record.encoding !== 'base64') {
    throw new TypeError(`${label} encoding is unsupported.`);
  }
  const bytes = decodeCanonicalBase64(record.contents, {
    label: `${label}.contents`,
    maximumBytes: maximumProtocolBytes,
  });
  const byteLength = exactNonNegativeInteger(
    record.byteLength,
    `${label}.byteLength`
  );
  const digest = exactDigest(record.digest, `${label}.digest`);
  if (byteLength !== bytes.byteLength || digest !== digestBytes(bytes)) {
    throw new TypeError(`${label} content address drifted.`);
  }
  return Object.freeze({
    envelope: Object.freeze({
      encoding: 'base64',
      byteLength,
      digest,
      contents: record.contents as string,
    }),
    bytes,
  });
};

const decodeAuthorityReceipt = (
  value: unknown,
  expected: Readonly<{
    requestDigest: string;
    snapshotDigest: string;
    buildFileSetDigest: string;
    buildFileCount: number;
  }>
): ControlledStaticToolchainAuthorityReceipt => {
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
      'artifacts',
      'sandboxResultDigest',
      'receiptDigest',
    ],
    'Controlled static toolchain authority receipt'
  );
  const { receiptDigest: _receiptDigest, ...base } = record;
  if (
    record.format !== CONTROLLED_STATIC_TOOLCHAIN_AUTHORITY_RECEIPT_FORMAT ||
    (record.provider !== 'linux-rootless-podman' &&
      record.provider !== 'windows-appcontainer') ||
    record.requestDigest !== expected.requestDigest ||
    record.snapshotDigest !== expected.snapshotDigest ||
    exactDigest(record.receiptDigest, 'Toolchain authority receipt') !==
      digestVerificationValue(base)
  ) {
    throw new TypeError(
      'Controlled static toolchain authority identity drifted.'
    );
  }
  const environment = exactRecord(
    record.environment,
    ['install', 'execution'],
    'Controlled static toolchain environment'
  );
  for (const phase of ['install', 'execution'] as const) {
    const binding = exactRecord(
      environment[phase],
      ['keys', 'digest'],
      `Controlled static toolchain ${phase} environment`
    );
    if (
      !Array.isArray(binding.keys) ||
      binding.keys.some(
        (key, index, keys) =>
          typeof key !== 'string' ||
          !key ||
          (index > 0 && String(keys[index - 1]) >= key)
      )
    ) {
      throw new TypeError(
        `Controlled static toolchain ${phase} environment keys drifted.`
      );
    }
    exactDigest(
      binding.digest,
      `Controlled static toolchain ${phase} environment`
    );
  }
  if (!Array.isArray(record.commands) || record.commands.length !== 6) {
    throw new TypeError('Controlled static toolchain command set drifted.');
  }
  record.commands.forEach((value, index) => {
    const command = exactRecord(
      value,
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
    const tool = exactRecord(
      command.tool,
      Object.hasOwn(command.tool as object, 'subjectBinary')
        ? ['binary', 'version', 'subjectBinary', 'subjectVersion']
        : ['binary', 'version'],
      `Controlled static toolchain command ${index} tool`
    );
    if (
      command.stage !== exactStages[index] ||
      typeof command.application !== 'string' ||
      !command.application ||
      !Array.isArray(command.args) ||
      command.cwd !== 'workspace:/' ||
      command.executionBoundary !== 'sandbox' ||
      command.exitCode !== 0 ||
      command.signal !== null ||
      command.timedOut !== false ||
      !Number.isSafeInteger(command.startedAtEpochMs) ||
      !Number.isSafeInteger(command.completedAtEpochMs) ||
      Number(command.completedAtEpochMs) < Number(command.startedAtEpochMs) ||
      typeof tool.binary !== 'string' ||
      typeof tool.version !== 'string'
    ) {
      throw new TypeError(
        `Controlled static toolchain command ${index} failed or drifted.`
      );
    }
    exactDigest(
      command.environmentDigest,
      `Controlled static toolchain command ${index} environment`
    );
    for (const stream of ['stdout', 'stderr'] as const) {
      const output = exactRecord(
        command[stream],
        ['digest', 'byteLength', 'capturedByteLength', 'truncated'],
        `Controlled static toolchain command ${index} ${stream}`
      );
      const byteLength = exactNonNegativeInteger(
        output.byteLength,
        `Controlled static toolchain command ${index} ${stream}.byteLength`
      );
      if (
        output.truncated !== false ||
        exactNonNegativeInteger(
          output.capturedByteLength,
          `Controlled static toolchain command ${index} ${stream}.capturedByteLength`
        ) !== byteLength
      ) {
        throw new TypeError(
          `Controlled static toolchain command ${index} ${stream} was not captured exactly.`
        );
      }
      exactDigest(
        output.digest,
        `Controlled static toolchain command ${index} ${stream}`
      );
    }
  });
  const isolation = exactRecord(
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
  const provider =
    record.provider as ControlledStaticToolchainAuthorityReceipt['provider'];
  if (
    isolation.provider !== provider ||
    isolation.networkMode !== 'none' ||
    exactNonNegativeInteger(
      isolation.liveEgressAttemptCount,
      'Controlled static toolchain live-egress attempts'
    ) < 5 ||
    isolation.liveEgressSuccessCount !== 0 ||
    isolation.hostMountCount !== 0 ||
    (provider === 'linux-rootless-podman'
      ? isolation.rootFilesystem !== 'read-only'
      : isolation.rootFilesystem !== 'appcontainer-lowbox') ||
    !isPlainObject(isolation.authority)
  ) {
    throw new TypeError('Controlled static toolchain isolation failed closed.');
  }
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
    'Controlled static toolchain identity'
  );
  if (
    toolchain.pnpmVersion !== '11.9.0' ||
    toolchain.nodeVersion !== '22.23.1' ||
    toolchain.rollupVersion !== '4.62.3' ||
    toolchain.rollupImplementation !== '@rollup/wasm-node' ||
    toolchain.rollupAliasSpec !== 'npm:@rollup/wasm-node@4.62.3' ||
    toolchain.esbuildVersion !== '0.27.7' ||
    toolchain.esbuildImplementation !== 'esbuild-wasm' ||
    toolchain.esbuildAliasSpec !== 'npm:esbuild-wasm@0.27.7'
  ) {
    throw new TypeError('Controlled static toolchain versions drifted.');
  }
  for (const field of [
    'nodeBinaryDigest',
    'manifestDigest',
    'lockDigest',
    'toolchainFileSetDigest',
  ] as const) {
    exactDigest(toolchain[field], `Controlled static toolchain ${field}`);
  }
  for (const field of [
    'typescriptVersion',
    'vitestVersion',
    'viteVersion',
  ] as const) {
    if (
      typeof toolchain[field] !== 'string' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(toolchain[field])
    ) {
      throw new TypeError(`Controlled static toolchain ${field} drifted.`);
    }
  }
  const artifacts = exactRecord(
    record.artifacts,
    [
      'testReportDigest',
      'coverageSummaryDigest',
      'buildLogDigest',
      'buildFileSetDigest',
      'buildFileCount',
    ],
    'Controlled static toolchain artifacts'
  );
  for (const field of [
    'testReportDigest',
    'coverageSummaryDigest',
    'buildLogDigest',
    'buildFileSetDigest',
  ] as const) {
    exactDigest(artifacts[field], `Controlled static toolchain ${field}`);
  }
  if (
    artifacts.buildFileSetDigest !== expected.buildFileSetDigest ||
    artifacts.buildFileCount !== expected.buildFileCount
  ) {
    throw new TypeError(
      'Controlled static toolchain build artifact authority drifted.'
    );
  }
  exactDigest(record.sandboxResultDigest, 'Controlled sandbox result');
  return Object.freeze(
    record
  ) as unknown as ControlledStaticToolchainAuthorityReceipt;
};

const decodeProjectionAuthority = (
  value: unknown,
  expected: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    requestDigest: string;
    buildBundleWire: unknown;
    buildFileSetDigest: string;
    buildFileCount: number;
    buildSummary: Uint8Array;
    coverageSummary: Uint8Array;
    testReport: NonNullable<ReturnType<typeof readExecutionTestReportValue>>;
    authorityReceipt: ControlledStaticToolchainAuthorityReceipt;
  }>
): ControlledStaticToolchainProjectionAuthority => {
  const record = exactRecord(
    value,
    ['format', 'raw', 'receipt'],
    'Controlled static toolchain projection authority'
  );
  if (
    record.format !== CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT
  ) {
    throw new TypeError(
      'Controlled static toolchain projection authority format drifted.'
    );
  }
  const raw = exactRecord(
    record.raw,
    ['buildBundle', 'testReport', 'coverageSummary', 'buildLog'],
    'Controlled static raw projection authority'
  );
  const rawBuildBundle = decodeEnvelope(
    raw.buildBundle,
    'Controlled raw build bundle'
  );
  const rawTestReport = decodeEnvelope(
    raw.testReport,
    'Controlled raw Test report'
  );
  const rawCoverageSummary = decodeEnvelope(
    raw.coverageSummary,
    'Controlled raw Coverage summary'
  );
  const rawBuildLog = decodeEnvelope(raw.buildLog, 'Controlled raw Build log');
  if (
    canonicalJsonText(expected.buildBundleWire) !==
      new TextDecoder('utf-8', { fatal: true }).decode(rawBuildBundle.bytes) ||
    expected.authorityReceipt.artifacts.testReportDigest !==
      rawTestReport.envelope.digest ||
    expected.authorityReceipt.artifacts.coverageSummaryDigest !==
      rawCoverageSummary.envelope.digest ||
    expected.authorityReceipt.artifacts.buildLogDigest !==
      rawBuildLog.envelope.digest
  ) {
    throw new TypeError(
      'Controlled static raw projection inputs drifted from sandbox authority.'
    );
  }
  const receipt = exactRecord(
    record.receipt,
    [
      'format',
      'snapshotDigest',
      'target',
      'toolchainAuthorityReceiptDigest',
      'rawBuildBundleDigest',
      'rawTestReportDigest',
      'rawCoverageSummaryDigest',
      'rawBuildLogDigest',
      'projectedBuildBundleDigest',
      'projectedBuildSummaryDigest',
      'projectedCoverageSummaryDigest',
      'projectedTestReportDigest',
      'buildFileSetDigest',
      'buildFileCount',
      'receiptDigest',
    ],
    'Controlled static projection receipt'
  );
  const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
  if (
    receipt.format !== CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_RECEIPT_FORMAT ||
    receipt.snapshotDigest !== expected.snapshot.contentDigest ||
    !sameCanonicalJson(receipt.target, expected.snapshot.target) ||
    receipt.toolchainAuthorityReceiptDigest !==
      expected.authorityReceipt.receiptDigest ||
    receipt.rawBuildBundleDigest !== rawBuildBundle.envelope.digest ||
    receipt.rawTestReportDigest !== rawTestReport.envelope.digest ||
    receipt.rawCoverageSummaryDigest !== rawCoverageSummary.envelope.digest ||
    receipt.rawBuildLogDigest !== rawBuildLog.envelope.digest ||
    receipt.projectedBuildBundleDigest !== rawBuildBundle.envelope.digest ||
    receipt.projectedBuildSummaryDigest !==
      digestBytes(expected.buildSummary) ||
    receipt.projectedCoverageSummaryDigest !==
      digestBytes(expected.coverageSummary) ||
    receipt.projectedTestReportDigest !==
      digestBytes(
        new TextEncoder().encode(canonicalJsonText(expected.testReport))
      ) ||
    receipt.buildFileSetDigest !== expected.buildFileSetDigest ||
    receipt.buildFileCount !== expected.buildFileCount ||
    exactDigest(receipt.receiptDigest, 'Controlled projection receipt') !==
      digestVerificationValue(receiptBase)
  ) {
    throw new TypeError(
      'Controlled static toolchain projection receipt drifted.'
    );
  }
  return Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_PROJECTION_AUTHORITY_FORMAT,
    raw: Object.freeze({
      buildBundle: rawBuildBundle.envelope,
      testReport: rawTestReport.envelope,
      coverageSummary: rawCoverageSummary.envelope,
      buildLog: rawBuildLog.envelope,
    }),
    receipt: Object.freeze(
      receipt
    ) as unknown as ControlledStaticToolchainProjectionAuthority['receipt'],
  });
};

export const decodeControlledStaticToolchainProductionResult = (
  source: string | Uint8Array,
  expected: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    requestDigest: string;
  }>
): ControlledStaticToolchainResult => {
  const bytes =
    typeof source === 'string' ? new TextEncoder().encode(source) : source;
  if (bytes.byteLength < 1 || bytes.byteLength > maximumProtocolBytes) {
    throw new TypeError(
      'Controlled static toolchain result exceeds its byte budget.'
    );
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Controlled static toolchain result is not JSON.');
  }
  if (canonicalJsonText(value) !== text) {
    throw new TypeError(
      'Controlled static toolchain result is not canonical JSON.'
    );
  }
  const record = exactRecord(
    value,
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
  if (record.format !== CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT) {
    throw new TypeError('Controlled static toolchain result format drifted.');
  }
  const buildBundle = decodeExecutionBuildBundle(
    new TextEncoder().encode(canonicalJsonText(record.buildBundle))
  );
  if (
    buildBundle.snapshotDigest !== expected.snapshot.contentDigest ||
    !sameCanonicalJson(buildBundle.target, expected.snapshot.target)
  ) {
    throw new TypeError(
      'Controlled static build bundle drifted from its executable snapshot.'
    );
  }
  const buildSummaryRecord = exactRecord(
    record.buildSummary,
    ['encoding', 'contents'],
    'Controlled projected build summary'
  );
  const coverageSummaryRecord = exactRecord(
    record.coverageSummary,
    ['encoding', 'contents'],
    'Controlled projected coverage summary'
  );
  if (
    buildSummaryRecord.encoding !== 'base64' ||
    coverageSummaryRecord.encoding !== 'base64'
  ) {
    throw new TypeError(
      'Controlled static projected artifact encoding drifted.'
    );
  }
  const buildSummary = decodeCanonicalBase64(buildSummaryRecord.contents, {
    label: 'Controlled projected build summary',
    maximumBytes: maximumProtocolBytes,
  });
  const coverageSummary = decodeCanonicalBase64(
    coverageSummaryRecord.contents,
    {
      label: 'Controlled projected coverage summary',
      maximumBytes: maximumProtocolBytes,
    }
  );
  const testReport = readExecutionTestReportValue(record.testReport);
  if (!testReport) {
    throw new TypeError('Controlled static Test report is invalid.');
  }
  const buildFileSetDigest = digestVerificationValue(
    buildBundle.files.map(({ path, size, digest }) => ({
      digest,
      path,
      size,
    }))
  );
  const authorityReceipt = decodeAuthorityReceipt(record.authorityReceipt, {
    requestDigest: expected.requestDigest,
    snapshotDigest: expected.snapshot.contentDigest,
    buildFileSetDigest,
    buildFileCount: buildBundle.files.length,
  });
  const projectionAuthority = decodeProjectionAuthority(
    record.projectionAuthority,
    {
      snapshot: expected.snapshot,
      requestDigest: expected.requestDigest,
      buildBundleWire: record.buildBundle,
      buildFileSetDigest,
      buildFileCount: buildBundle.files.length,
      buildSummary,
      coverageSummary,
      testReport,
      authorityReceipt,
    }
  );
  return Object.freeze({
    format: CONTROLLED_STATIC_TOOLCHAIN_RESULT_FORMAT,
    buildBundle,
    buildSummary,
    coverageSummary,
    testReport,
    authorityReceipt,
    projectionAuthority,
  });
};

const minimalProductionEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { CI: '1' };
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
    if (value) environment[key] = value;
  }
  return environment;
};

const processMissing = (caught: unknown): boolean =>
  caught instanceof Error &&
  'code' in caught &&
  (caught.code === 'ESRCH' || caught.code === 'ERROR_INVALID_PARAMETER');

const waitForProcessClose = (
  child: ChildProcess,
  timeoutMs: number
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolvePromise) => {
    let settled = false;
    const complete = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.removeListener('close', close);
      resolvePromise(closed);
    };
    const close = () => complete(true);
    const timeout = setTimeout(() => complete(false), timeoutMs);
    child.once('close', close);
  });
};

const processGroupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (caught) {
    if (processMissing(caught)) return false;
    throw caught;
  }
};

const waitForProcessGroupExit = async (
  pid: number,
  timeoutMs: number
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (processGroupAlive(pid)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, Math.min(25, remaining))
    );
  }
  return true;
};

const terminateWindowsProcessTree = async (
  child: ChildProcess,
  timeoutMs: number
): Promise<void> => {
  if (!child.pid) {
    throw new Error('Controlled static toolchain process has no cleanup PID.');
  }
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) {
    throw new Error(
      'Controlled static toolchain process-tree cleanup has no SystemRoot.'
    );
  }
  const killer = spawn(
    resolve(systemRoot, 'System32/taskkill.exe'),
    ['/PID', String(child.pid), '/T', '/F'],
    {
      env: { SystemRoot: systemRoot },
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    }
  );
  const killerClosed = new Promise<boolean>((resolvePromise) => {
    let settled = false;
    const complete = (didClose: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      killer.removeListener('error', failed);
      killer.removeListener('close', closed);
      resolvePromise(didClose);
    };
    const failed = () => complete(false);
    const closed = (code: number | null) =>
      complete(code === 0 || child.exitCode !== null);
    const timeout = setTimeout(() => {
      killer.kill('SIGKILL');
      complete(false);
    }, timeoutMs);
    killer.once('error', failed);
    killer.once('close', closed);
  });
  if (!(await killerClosed)) {
    throw new Error(
      'Controlled static toolchain Windows process-tree cleanup failed.'
    );
  }
};

const terminateProcessTree = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const deadline = Date.now() + CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS;
  if (process.platform === 'win32') {
    await terminateWindowsProcessTree(
      child,
      Math.max(1, deadline - Date.now())
    );
  } else {
    if (!child.pid) {
      throw new Error(
        'Controlled static toolchain process has no cleanup PID.'
      );
    }
    const processGroupId = child.pid;
    try {
      process.kill(-processGroupId, 'SIGTERM');
    } catch (caught) {
      if (!processMissing(caught)) throw caught;
    }
    const gracefulBudgetMs = Math.min(
      4_000,
      Math.max(1, deadline - Date.now())
    );
    await waitForProcessClose(child, gracefulBudgetMs);
    if (processGroupAlive(processGroupId)) {
      try {
        process.kill(-processGroupId, 'SIGKILL');
      } catch (caught) {
        if (!processMissing(caught)) throw caught;
      }
    }
    if (
      !(await waitForProcessGroupExit(
        processGroupId,
        Math.max(1, deadline - Date.now())
      ))
    ) {
      throw new Error(
        'Controlled static toolchain process group cleanup timed out.'
      );
    }
  }
  if (
    child.exitCode === null &&
    child.signalCode === null &&
    !(await waitForProcessClose(child, Math.max(1, deadline - Date.now())))
  ) {
    throw new Error(
      'Controlled static toolchain process-tree cleanup timed out.'
    );
  }
};

/** Runs the fixed repo-owned rootless/AppContainer authority process. */
export const runControlledStaticToolchainProduction = async (
  input: RunControlledStaticToolchainProductionInput
): Promise<ControlledStaticToolchainResult> => {
  if (!isAbsolute(input.repositoryRoot)) {
    throw new TypeError(
      'Controlled static toolchain repository root must be absolute.'
    );
  }
  const timeoutMs = resolveControlledStaticToolchainExecutionTimeoutMs(
    input.timeoutMs
  );
  if (input.signal?.aborted) {
    throw new DOMException(
      'Controlled static toolchain aborted.',
      'AbortError'
    );
  }
  const repositoryRoot = await realpath(input.repositoryRoot);
  const runnerPath = await realpath(
    resolve(
      repositoryRoot,
      'packages/verification-adapters/scripts/runControlledStaticToolchain.ts'
    )
  );
  const runnerRelative = relative(repositoryRoot, runnerPath);
  const expectedRunnerRelative = [
    'packages',
    'verification-adapters',
    'scripts',
    'runControlledStaticToolchain.ts',
  ].join(sep);
  if (
    runnerRelative !== expectedRunnerRelative ||
    runnerRelative.startsWith(`..${sep}`) ||
    isAbsolute(runnerRelative)
  ) {
    throw new TypeError(
      'Controlled static toolchain runner escaped the repository root.'
    );
  }
  const encoded = encodeControlledStaticToolchainRequest(input.snapshot);
  const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [tsxCli, runnerPath], {
      cwd: repositoryRoot,
      env: minimalProductionEnvironment(),
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let diagnosticBytes = 0;
    let diagnosticsExceeded = false;
    let settled = false;
    let terminating = false;
    const settle = (
      result:
        | Readonly<{
            status: 'resolved';
            value: ControlledStaticToolchainResult;
          }>
        | Readonly<{ status: 'rejected'; error: Error }>
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
      if (result.status === 'resolved') resolvePromise(result.value);
      else rejectPromise(result.error);
    };
    const failClosed = (message: string) => {
      if (settled || terminating) return;
      terminating = true;
      void terminateProcessTree(child).then(
        () => settle({ status: 'rejected', error: new Error(message) }),
        () =>
          settle({
            status: 'rejected',
            error: new Error(
              `${message} Controlled static toolchain cleanup failed closed.`
            ),
          })
      );
    };
    const abort = () => failClosed('Controlled static toolchain aborted.');
    const timeout = setTimeout(
      () => failClosed('Controlled static toolchain timed out.'),
      timeoutMs
    );
    input.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maximumProtocolBytes) {
        failClosed('Controlled static toolchain result exceeded its budget.');
        return;
      }
      output.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      diagnosticBytes += chunk.byteLength;
      if (diagnosticBytes > maximumDiagnosticBytes) {
        diagnosticsExceeded = true;
        failClosed(
          'Controlled static toolchain diagnostics exceeded their budget.'
        );
      }
    });
    child.once('error', () => {
      if (terminating) return;
      settle({
        status: 'rejected',
        error: new Error('Controlled static toolchain process did not start.'),
      });
    });
    child.once('close', (code, signal) => {
      if (settled || terminating) return;
      if (code !== 0 || signal !== null || diagnosticsExceeded) {
        settle({
          status: 'rejected',
          error: new Error(
            'Controlled static toolchain process failed closed.'
          ),
        });
        return;
      }
      try {
        settle({
          status: 'resolved',
          value: decodeControlledStaticToolchainProductionResult(
            Buffer.concat(output),
            {
              snapshot: input.snapshot,
              requestDigest: encoded.requestDigest,
            }
          ),
        });
      } catch {
        settle({
          status: 'rejected',
          error: new Error(
            'Controlled static toolchain result validation failed closed.'
          ),
        });
      }
    });
    child.stdin.once('error', () => {
      if (!terminating) {
        failClosed('Controlled static toolchain request transport failed.');
      }
    });
    child.stdin.end(encoded.source);
  });
};
