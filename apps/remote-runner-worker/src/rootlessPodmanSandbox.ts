import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type {
  ExecutableProjectCommand,
  ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createExecutionFilesystemDiff,
  createExecutionSecretLeakGuard,
  decodeExecutionFilesystemDiff,
  decodeExecutionBuildBundle,
  decodeExecutionPreviewBundle,
  encodeExecutionFilesystemDiff,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_FILESYSTEM_DIFF_FORMAT,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  projectExecutableProjectRuntimeFiles,
  toExecutionTestReportValue,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import { parseVitestExecutionTestReport } from '@prodivix/runtime-vitest';
import type {
  RemoteWorkerSandbox,
  RemoteWorkerSandboxArtifact,
  RemoteWorkerSandboxNetworkTrace,
  RemoteWorkerSandboxResult,
} from './worker.types';
import { createRootlessPodmanTerminalProcess } from './rootlessPodmanTerminal';

const execFileAsync = promisify(execFile);
const stopRetryIntervalMs = 50;
const stopEscalationMs = 5_000;
const stopDeadlineMs = 10_000;
const installCompleteMarker = 'PRODIVIX_SANDBOX_INSTALL_COMPLETE_V1';
const continueExecutionToken = 'PRODIVIX_SANDBOX_CONTINUE_V1';
const captureReadyMarker = 'PRODIVIX_SANDBOX_CAPTURE_READY_V1';
const captureExecutionToken = 'PRODIVIX_SANDBOX_CAPTURE_V1';

const podmanProcessEnvironment = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
  CONTAINERS_CONF: process.env.CONTAINERS_CONF,
  CONTAINERS_STORAGE_CONF: process.env.CONTAINERS_STORAGE_CONF,
});

export type RootlessPodmanSandboxLimits = Readonly<{
  maximumCpuCores: number;
  maximumMemoryMb: number;
  maximumDiskMb: number;
  maximumPids: number;
  maximumOpenFiles: number;
  temporaryDirectoryMb: number;
  maximumArtifactBytes: number;
}>;

export type CreateRootlessPodmanSandboxOptions = Readonly<{
  imageReference: string;
  podmanCommand?: string;
  installNetworkPolicy?: RootlessPodmanInstallNetworkPolicy;
  limits: RootlessPodmanSandboxLimits;
  now?: () => number;
}>;

export type RootlessPodmanInstallNetworkPolicy =
  | Readonly<{ mode: 'none' }>
  | Readonly<{
      mode: 'proxy-allowlist';
      networkName: string;
      proxyUrl: string;
      proxyContainerName: string;
      allowedHosts: readonly string[];
    }>;

const imageIsImmutable = (value: string): boolean =>
  /^sha256:[a-f0-9]{64}$/u.test(value) || /@sha256:[a-f0-9]{64}$/u.test(value);

const positive = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0)
    throw new TypeError(`${label} must be positive.`);
  return value;
};

const profileCommand = (
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build'
): ExecutableProjectCommand =>
  profile === 'preview'
    ? snapshot.previewPlan.command
    : profile === 'test'
      ? snapshot.testPlan.command
      : snapshot.buildCommand;

const rootlessFromInfo = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const host = (value as { host?: unknown }).host;
  if (!host || typeof host !== 'object') return false;
  const security = (host as { security?: unknown }).security;
  return (
    !!security &&
    typeof security === 'object' &&
    (security as { rootless?: unknown }).rootless === true
  );
};

export const verifyRootlessPodmanEngine = async (
  podmanCommand = 'podman'
): Promise<void> => {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(podmanCommand, [
      'info',
      '--format',
      'json',
    ]));
  } catch {
    throw new Error('Rootless Podman is required but is not available.');
  }
  let info: unknown;
  try {
    info = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error('Podman returned an invalid engine descriptor.');
  }
  if (!rootlessFromInfo(info))
    throw new Error('Podman engine is not running rootless.');
};

export const createRootlessPodmanRunArguments = (
  input: Readonly<{
    name: string;
    imageReference: string;
    uid: number;
    gid: number;
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
    pids: number;
    openFiles: number;
    temporaryDirectoryMb: number;
    executionId?: string;
    installNetworkName?: string;
    installProxyUrl?: string;
  }>
): readonly string[] => {
  const proxyEnvironment = input.installProxyUrl
    ? [
        `--env=HTTP_PROXY=${input.installProxyUrl}`,
        `--env=HTTPS_PROXY=${input.installProxyUrl}`,
        `--env=NO_PROXY=localhost,127.0.0.1,::1`,
      ]
    : [];
  return Object.freeze([
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    `--name=${input.name}`,
    `--label=prodivix.remote-execution=${input.executionId ?? input.name}`,
    `--network=${input.installNetworkName ?? 'none'}`,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--userns=keep-id',
    `--user=${input.uid}:${input.gid}`,
    '--pid=private',
    '--ipc=private',
    '--uts=private',
    '--cgroupns=private',
    '--log-driver=none',
    ...proxyEnvironment,
    `--cpus=${input.cpuCores}`,
    `--memory=${input.memoryMb}m`,
    `--memory-swap=${input.memoryMb}m`,
    `--pids-limit=${input.pids}`,
    `--ulimit=nofile=${input.openFiles}:${input.openFiles}`,
    '--ulimit=core=0:0',
    `--tmpfs=/workspace:rw,nosuid,nodev,size=${input.diskMb}m,mode=0777`,
    `--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=${input.temporaryDirectoryMb}m,mode=1777`,
    '--workdir=/workspace',
    input.imageReference,
  ]);
};

type Output = {
  stdout: string;
  stderr: string;
  usedBytes: number;
  truncated: boolean;
};

const appendOutput = (
  output: Output,
  stream: 'stdout' | 'stderr',
  chunk: Buffer,
  maximumBytes: number
): void => {
  const remaining = Math.max(0, maximumBytes - output.usedBytes);
  const accepted = chunk.subarray(0, remaining);
  output[stream] += accepted.toString('utf8');
  output.usedBytes += accepted.byteLength;
  if (accepted.byteLength < chunk.byteLength) output.truncated = true;
};

const payload = (
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build',
  maximumOutputBytes: number,
  maximumArtifactBytes: number
) => {
  const canonicalPaths = new Set(snapshot.files.map((file) => file.path));
  const runtimeFiles = projectExecutableProjectRuntimeFiles(snapshot, profile);
  return JSON.stringify({
    profile,
    snapshotDigest: snapshot.contentDigest,
    workspace: snapshot.workspace,
    target: snapshot.target,
    previewPlan: snapshot.previewPlan,
    buildPlan: snapshot.buildPlan,
    testPlan: { reportFilePath: snapshot.testPlan.reportFilePath },
    maximumOutputBytes,
    maximumArtifactBytes,
    files: runtimeFiles.map((file) => ({
      path: file.path,
      contents: Buffer.from(file.contents).toString('base64'),
      capture: canonicalPaths.has(file.path),
    })),
    ignoredPaths: [snapshot.testPlan.reportFilePath],
    ignoredDirectories: [
      '.git',
      '.cache',
      '.vite',
      'coverage',
      'node_modules',
      snapshot.previewPlan.outputDirectoryPath,
      snapshot.buildPlan.outputDirectoryPath,
    ].filter((path, index, paths) => paths.indexOf(path) === index),
    publicEnvironment: snapshot.publicBuildConfiguration.map((entry) => ({
      name: entry.name,
      value: entry.value,
    })),
    installCommand: {
      command: snapshot.installCommand.command,
      args: [...(snapshot.installCommand.args ?? [])],
    },
    command: {
      command: profileCommand(snapshot, profile).command,
      args: [...(profileCommand(snapshot, profile).args ?? [])],
    },
  });
};

const normalizeInstallNetworkPolicy = (
  policy: RootlessPodmanInstallNetworkPolicy | undefined
): RootlessPodmanInstallNetworkPolicy => {
  if (!policy || policy.mode === 'none') return Object.freeze({ mode: 'none' });
  if (
    policy.mode !== 'proxy-allowlist' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/u.test(policy.networkName)
  )
    throw new TypeError('Sandbox install network policy is invalid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/u.test(policy.proxyContainerName))
    throw new TypeError('Sandbox install proxy container is invalid.');
  let proxyUrl: URL;
  try {
    proxyUrl = new URL(policy.proxyUrl);
  } catch {
    throw new TypeError('Sandbox install proxy URL is invalid.');
  }
  if (
    proxyUrl.protocol !== 'http:' ||
    proxyUrl.username ||
    proxyUrl.password ||
    proxyUrl.pathname !== '/' ||
    proxyUrl.search ||
    proxyUrl.hash ||
    proxyUrl.hostname !== policy.proxyContainerName
  )
    throw new TypeError(
      'Sandbox install proxy URL is not infrastructure-safe.'
    );
  const allowedHosts = Object.freeze(
    [...new Set(policy.allowedHosts)].sort().map((host) => {
      if (
        !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
          host
        )
      )
        throw new TypeError('Sandbox install egress host is invalid.');
      return host;
    })
  );
  if (!allowedHosts.length)
    throw new TypeError('Sandbox install egress allowlist is empty.');
  return Object.freeze({
    mode: 'proxy-allowlist',
    networkName: policy.networkName,
    proxyUrl: proxyUrl.toString(),
    proxyContainerName: policy.proxyContainerName,
    allowedHosts,
  });
};

export const createRootlessInstallProxyUrl = (
  proxyUrl: string,
  traceId: string
): string => {
  const url = new URL(proxyUrl);
  url.username = traceId;
  url.password = 'prodivix-sandbox';
  return url.toString();
};

const assertInstallProxyPolicy = async (
  podmanCommand: string,
  policy: Extract<
    RootlessPodmanInstallNetworkPolicy,
    { mode: 'proxy-allowlist' }
  >
): Promise<void> => {
  const [
    { stdout: internal },
    { stdout: networks },
    { stdout: environment },
    { stdout: running },
  ] = await Promise.all([
    execFileAsync(podmanCommand, ['network', 'inspect', policy.networkName], {
      env: podmanProcessEnvironment(),
    }),
    execFileAsync(
      podmanCommand,
      [
        'inspect',
        '--format',
        '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{"\\n"}}{{end}}',
        policy.proxyContainerName,
      ],
      { env: podmanProcessEnvironment() }
    ),
    execFileAsync(
      podmanCommand,
      [
        'inspect',
        '--format',
        '{{range .Config.Env}}{{println .}}{{end}}',
        policy.proxyContainerName,
      ],
      { env: podmanProcessEnvironment() }
    ),
    execFileAsync(
      podmanCommand,
      ['inspect', '--format', '{{.State.Running}}', policy.proxyContainerName],
      { env: podmanProcessEnvironment() }
    ),
  ]);
  let internalNetwork = false;
  try {
    const descriptors = JSON.parse(internal) as unknown;
    internalNetwork =
      Array.isArray(descriptors) &&
      descriptors.length === 1 &&
      !!descriptors[0] &&
      typeof descriptors[0] === 'object' &&
      (descriptors[0] as { internal?: unknown }).internal === true;
  } catch {
    internalNetwork = false;
  }
  const configuredAllowlist = environment
    .split(/\r?\n/u)
    .find((entry) => entry.startsWith('PRODIVIX_INSTALL_EGRESS_ALLOWLIST='))
    ?.slice('PRODIVIX_INSTALL_EGRESS_ALLOWLIST='.length)
    .split(',')
    .filter(Boolean)
    .sort();
  if (
    !internalNetwork ||
    running.trim() !== 'true' ||
    !networks.split(/\r?\n/u).includes(policy.networkName) ||
    JSON.stringify(configuredAllowlist) !== JSON.stringify(policy.allowedHosts)
  )
    throw new Error(
      'Sandbox install egress proxy policy could not be verified.'
    );
};

export const decodeRootlessInstallProxyTraces = (
  output: string,
  traceId: string
): readonly RemoteWorkerSandboxNetworkTrace[] => {
  const traces: RemoteWorkerSandboxNetworkTrace[] = [];
  for (const line of output.split(/\r?\n/u)) {
    if (!line.includes(traceId)) continue;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new TypeError('Install proxy returned an invalid trace.');
    }
    const record = exactRecord(
      value,
      [
        'protocol',
        'requestId',
        'method',
        'host',
        'port',
        'startedAt',
        'completedAt',
        'outcome',
        'status',
        'requestBytes',
        'responseBytes',
      ],
      `Install proxy trace ${traces.length}`
    );
    if (
      record.protocol !== 'prodivix.install-egress-trace.v1' ||
      record.requestId !== traceId ||
      record.method !== 'CONNECT' ||
      typeof record.host !== 'string' ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
        record.host
      ) ||
      record.port !== 443 ||
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.completedAt) ||
      (record.startedAt as number) < 0 ||
      (record.completedAt as number) < (record.startedAt as number) ||
      !['allowed', 'denied', 'failed'].includes(String(record.outcome)) ||
      !Number.isSafeInteger(record.status) ||
      (record.status as number) < 100 ||
      (record.status as number) > 599 ||
      !Number.isSafeInteger(record.requestBytes) ||
      (record.requestBytes as number) < 0 ||
      !Number.isSafeInteger(record.responseBytes) ||
      (record.responseBytes as number) < 0
    )
      throw new TypeError('Install proxy trace is not canonical.');
    traces.push(
      Object.freeze({
        requestId: `${traceId}:${traces.length + 1}`,
        method: 'CONNECT',
        sanitizedUrl: `https://${record.host}/`,
        protocol: 'https',
        startedAt: record.startedAt as number,
        completedAt: record.completedAt as number,
        outcome: record.outcome as 'allowed' | 'denied' | 'failed',
        status: record.status as number,
        requestBytes: record.requestBytes as number,
        responseBytes: record.responseBytes as number,
      })
    );
    if (traces.length > 256)
      throw new TypeError('Install proxy returned too many traces.');
  }
  return Object.freeze(traces);
};

const assertContainerHasNoNetwork = async (
  podmanCommand: string,
  name: string
): Promise<void> => {
  const { stdout } = await execFileAsync(
    podmanCommand,
    [
      'inspect',
      '--format',
      '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{"\\n"}}{{end}}',
      name,
    ],
    { env: podmanProcessEnvironment() }
  );
  if (stdout.trim())
    throw new Error('Sandbox runtime network isolation could not be verified.');
};

const disconnectContainerNetwork = async (
  podmanCommand: string,
  networkName: string,
  containerName: string
): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await execFileAsync(
        podmanCommand,
        ['network', 'disconnect', '--force', networkName, containerName],
        { env: podmanProcessEnvironment() }
      );
    } catch (error) {
      lastError = error;
    }
    try {
      await assertContainerHasNoNetwork(podmanCommand, containerName);
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, stopRetryIntervalMs)
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Sandbox runtime network isolation failed.');
};

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key)))
    throw new TypeError(`${label} has unknown fields.`);
  return record;
};

const stringRecord = (
  value: unknown,
  label: string
): Readonly<Record<string, string>> => {
  const record = exactRecord(
    value,
    Object.keys(value as Record<string, unknown>),
    label
  );
  if (
    Object.keys(record).length > 32 ||
    Object.entries(record).some(
      ([key, entry]) =>
        !key ||
        key.length > 256 ||
        typeof entry !== 'string' ||
        entry.length > 4_096
    )
  )
    throw new TypeError(`${label} is invalid.`);
  return Object.freeze(record as Record<string, string>);
};

const decodeBase64 = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  )
    throw new TypeError(`${label} is not canonical base64.`);
  return new Uint8Array(Buffer.from(value, 'base64'));
};

const filesystemCapturePolicy = (snapshot: ExecutableProjectSnapshot) => {
  const canonicalPaths = new Set(snapshot.files.map((file) => file.path));
  const ignoredPaths = new Set([
    snapshot.testPlan.reportFilePath,
    ...projectExecutableProjectRuntimeFiles(snapshot).flatMap((file) =>
      canonicalPaths.has(file.path) ? [] : [file.path]
    ),
  ]);
  const ignoredDirectories = new Set([
    '.git',
    '.cache',
    '.vite',
    'coverage',
    'node_modules',
    snapshot.previewPlan.outputDirectoryPath,
    snapshot.buildPlan.outputDirectoryPath,
  ]);
  return Object.freeze({ ignoredPaths, ignoredDirectories });
};

const filesystemPathIsIgnored = (
  path: string,
  policy: ReturnType<typeof filesystemCapturePolicy>
): boolean =>
  policy.ignoredPaths.has(path) ||
  [...policy.ignoredDirectories].some(
    (directory) => path === directory || path.startsWith(`${directory}/`)
  );

const workspaceRefMatches = (
  left: ExecutableProjectSnapshot['workspace'],
  right: ExecutableProjectSnapshot['workspace']
): boolean => {
  const normalizeRevisions = (
    value: Readonly<Record<string, string>> | undefined
  ) =>
    Object.entries(value ?? {}).sort(([leftKey], [rightKey]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    );
  return (
    left.workspaceId === right.workspaceId &&
    left.snapshotId === right.snapshotId &&
    JSON.stringify(normalizeRevisions(left.partitionRevisions)) ===
      JSON.stringify(normalizeRevisions(right.partitionRevisions))
  );
};

const canonicalizeSandboxFilesystemDiff = (
  contents: Uint8Array,
  snapshot: ExecutableProjectSnapshot
): Readonly<{
  contents: Uint8Array;
  changeCount: number;
  complete: boolean;
  sourceTrace: readonly ExecutionSourceTrace[];
}> => {
  const observed = decodeExecutionFilesystemDiff(contents);
  if (
    observed.snapshotDigest !== snapshot.contentDigest ||
    !workspaceRefMatches(observed.workspace, snapshot.workspace)
  )
    throw new TypeError(
      'Sandbox filesystem diff identity does not match the executable snapshot.'
    );
  const policy = filesystemCapturePolicy(snapshot);
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  const sourceTrace: ExecutionSourceTrace[] = [];
  const sourceTraceIds = new Set<string>();
  const changes = observed.changes.map((change) => {
    if (change.sourceTrace?.length)
      throw new TypeError(
        'Sandbox filesystem diff cannot supply trusted source trace.'
      );
    if (filesystemPathIsIgnored(change.path, policy))
      throw new TypeError(
        'Sandbox filesystem diff contains a provider-managed path.'
      );
    const file = files.get(change.path);
    if ((change.kind === 'added') !== !file)
      throw new TypeError(
        'Sandbox filesystem diff change kind drifted from the snapshot.'
      );
    if (file) {
      const expectedBaseline = Buffer.from(file.contents);
      if (
        !change.baseline ||
        !Buffer.from(change.baseline.contents).equals(expectedBaseline)
      )
        throw new TypeError(
          'Sandbox filesystem diff baseline does not match the snapshot.'
        );
    }
    const traces = file?.sourceTrace ?? [];
    for (const trace of traces) {
      const id = JSON.stringify(trace);
      if (sourceTraceIds.has(id)) continue;
      sourceTraceIds.add(id);
      sourceTrace.push(trace);
    }
    return Object.freeze({
      kind: change.kind,
      path: change.path,
      ...(change.baseline
        ? { baseline: { contents: change.baseline.contents } }
        : {}),
      ...(change.runtime
        ? { runtime: { contents: change.runtime.contents } }
        : {}),
      ...(traces.length ? { sourceTrace: traces } : {}),
    });
  });
  const canonical = createExecutionFilesystemDiff({
    snapshotDigest: snapshot.contentDigest,
    workspace: snapshot.workspace,
    capturedAt: observed.capturedAt,
    complete: observed.complete,
    changes,
  });
  return Object.freeze({
    contents: encodeExecutionFilesystemDiff(canonical),
    changeCount: canonical.changes.length,
    complete: canonical.complete,
    sourceTrace: Object.freeze(sourceTrace),
  });
};

const buildSourceTrace = (snapshot: ExecutableProjectSnapshot) => {
  const paths = new Set(
    snapshot.entrypoints
      .filter((entrypoint) => entrypoint.kind === 'build')
      .map((entrypoint) => entrypoint.path)
  );
  return Object.freeze(
    snapshot.files.flatMap((file) =>
      paths.has(file.path) ? [...(file.sourceTrace ?? [])] : []
    )
  );
};

const previewSourceTrace = (snapshot: ExecutableProjectSnapshot) => {
  const paths = new Set(
    snapshot.entrypoints
      .filter((entrypoint) => entrypoint.kind === 'preview')
      .map((entrypoint) => entrypoint.path)
  );
  const traces = snapshot.files.flatMap((file) =>
    paths.has(file.path) ? [...(file.sourceTrace ?? [])] : []
  );
  return Object.freeze(
    traces.length
      ? traces
      : [
          Object.freeze({
            sourceRef: Object.freeze({
              kind: 'workspace' as const,
              workspaceId: snapshot.workspace.workspaceId,
            }),
            label: 'Remote static preview',
          }),
        ]
  );
};

const testFallbackSourceTrace = (
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionSourceTrace[] => {
  const traces = snapshot.entrypoints
    .filter((entrypoint) => entrypoint.kind === 'test')
    .flatMap(
      (entrypoint) =>
        snapshot.files.find((file) => file.path === entrypoint.path)
          ?.sourceTrace ?? []
    );
  return Object.freeze(
    traces.length
      ? traces
      : [
          Object.freeze({
            sourceRef: Object.freeze({
              kind: 'workspace' as const,
              workspaceId: snapshot.workspace.workspaceId,
            }),
            label: 'Remote project test run',
          }),
        ]
  );
};

const resolveTestSourceTrace = (
  snapshot: ExecutableProjectSnapshot,
  reportedPath: string,
  fallback: readonly ExecutionSourceTrace[]
): readonly ExecutionSourceTrace[] => {
  const normalized = reportedPath.replaceAll('\\', '/');
  const file = snapshot.files.find(
    (candidate) =>
      normalized === candidate.path || normalized.endsWith(`/${candidate.path}`)
  );
  return file?.sourceTrace?.length ? file.sourceTrace : fallback;
};

const collectTestReportSourceTrace = (
  report: ReturnType<typeof parseVitestExecutionTestReport>,
  fallback: readonly ExecutionSourceTrace[]
): readonly ExecutionSourceTrace[] => {
  const traces = report.files.flatMap((file) => file.sourceTrace ?? []);
  if (!traces.length) return fallback;
  const seen = new Set<string>();
  return Object.freeze(
    traces.filter((trace) => {
      const identity = JSON.stringify(trace);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
  );
};

export const decodeRootlessPodmanSandboxResult = (
  value: string,
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build',
  completedAt: number,
  maximumOutputBytes: number,
  maximumArtifactBytes: number
): RemoteWorkerSandboxResult => {
  const record = exactRecord(
    JSON.parse(value) as unknown,
    [
      'protocol',
      'exitCode',
      'stdout',
      'stderr',
      'outputTruncated',
      'artifacts',
    ],
    'Sandbox result'
  );
  if (
    record.protocol !== 'prodivix.sandbox-result.v1' ||
    !Number.isSafeInteger(record.exitCode) ||
    (record.exitCode as number) < 0 ||
    typeof record.outputTruncated !== 'boolean' ||
    !Array.isArray(record.artifacts) ||
    record.artifacts.length > 8
  )
    throw new TypeError('Sandbox result envelope is invalid.');
  const stdout = decodeBase64(record.stdout, 'Sandbox stdout');
  const stderr = decodeBase64(record.stderr, 'Sandbox stderr');
  if (stdout.byteLength + stderr.byteLength > maximumOutputBytes)
    throw new TypeError('Sandbox output exceeds the configured limit.');
  let artifactBytes = 0;
  const filesystemDiffArtifacts = record.artifacts.filter(
    (artifact) =>
      !!artifact &&
      typeof artifact === 'object' &&
      (artifact as { mediaType?: unknown }).mediaType ===
        EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
  );
  const primaryArtifacts = record.artifacts.filter(
    (artifact) => !filesystemDiffArtifacts.includes(artifact)
  );
  if (
    filesystemDiffArtifacts.length > 1 ||
    (profile === 'build' &&
      (record.exitCode === 0
        ? primaryArtifacts.length !== 1
        : primaryArtifacts.length !== 0)) ||
    (profile === 'test' &&
      (record.exitCode === 0
        ? primaryArtifacts.length !== 1
        : primaryArtifacts.length > 1)) ||
    (profile === 'preview' &&
      (record.exitCode === 0
        ? primaryArtifacts.length !== 1
        : primaryArtifacts.length !== 0))
  )
    throw new TypeError(
      'Sandbox artifacts do not match the requested execution profile.'
    );
  const artifacts: RemoteWorkerSandboxArtifact[] = record.artifacts.map(
    (value, index) => {
      const artifact = exactRecord(
        value,
        ['artifactId', 'kind', 'label', 'mediaType', 'metadata', 'contents'],
        `Sandbox artifact ${index}`
      );
      if (
        typeof artifact.artifactId !== 'string' ||
        !artifact.artifactId ||
        artifact.artifactId !== artifact.artifactId.trim() ||
        artifact.artifactId.length > 4_096 ||
        (artifact.kind !== 'bundle' && artifact.kind !== 'report') ||
        typeof artifact.mediaType !== 'string' ||
        !artifact.mediaType ||
        artifact.mediaType.length > 4_096 ||
        (artifact.label !== undefined &&
          (typeof artifact.label !== 'string' ||
            !artifact.label ||
            artifact.label.length > 4_096))
      )
        throw new TypeError(`Sandbox artifact ${index} is invalid.`);
      const contents = decodeBase64(
        artifact.contents,
        `Sandbox artifact ${index} contents`
      );
      let publishedContents = contents;
      let publishedArtifactId = artifact.artifactId;
      let publishedKind: RemoteWorkerSandboxArtifact['kind'] = artifact.kind;
      let publishedLabel = artifact.label;
      let publishedMediaType = artifact.mediaType;
      let publishedMetadata = stringRecord(
        artifact.metadata ?? {},
        `Sandbox artifact ${index} metadata`
      );
      let sourceTrace = buildSourceTrace(snapshot);
      if (artifact.mediaType === EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE) {
        if (
          artifact.kind !== 'report' ||
          artifact.artifactId !== `filesystem-diff:${snapshot.contentDigest}`
        )
          throw new TypeError('Sandbox filesystem diff descriptor is invalid.');
        const canonical = canonicalizeSandboxFilesystemDiff(contents, snapshot);
        publishedContents = canonical.contents;
        publishedArtifactId = `filesystem-diff:${snapshot.contentDigest}`;
        publishedKind = 'report';
        publishedLabel = 'Remote runtime filesystem changes';
        publishedMediaType = EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE;
        publishedMetadata = Object.freeze({
          format: EXECUTION_FILESYSTEM_DIFF_FORMAT,
          snapshotDigest: snapshot.contentDigest,
          workspaceSnapshotId: snapshot.workspace.snapshotId,
          changeCount: String(canonical.changeCount),
          complete: String(canonical.complete),
        });
        sourceTrace = canonical.sourceTrace;
      } else if (artifact.kind === 'bundle') {
        if (profile === 'preview') {
          const previewBundle = decodeExecutionPreviewBundle(contents);
          if (
            artifact.artifactId !==
              `preview-bundle:${snapshot.contentDigest}` ||
            artifact.mediaType !== EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE ||
            previewBundle.snapshotDigest !== snapshot.contentDigest ||
            previewBundle.entryFilePath !==
              snapshot.previewPlan.entryFilePath ||
            JSON.stringify(previewBundle.target) !==
              JSON.stringify(snapshot.target)
          )
            throw new TypeError(
              `Sandbox artifact ${index} does not match the static preview contract.`
            );
          publishedMetadata = Object.freeze({
            format: previewBundle.format,
            snapshotDigest: snapshot.contentDigest,
            presetId: previewBundle.target.presetId,
            readiness: 'ready',
            health: 'healthy',
            entryFilePath: previewBundle.entryFilePath,
            fileCount: String(previewBundle.files.length),
            unpackedBytes: String(
              previewBundle.files.reduce((total, file) => total + file.size, 0)
            ),
          });
          sourceTrace = previewSourceTrace(snapshot);
        } else {
          if (profile !== 'build')
            throw new TypeError(
              'Sandbox Build artifact has the wrong profile.'
            );
          const buildBundle = decodeExecutionBuildBundle(contents);
          if (
            artifact.artifactId !== `build-bundle:${snapshot.contentDigest}` ||
            artifact.mediaType !== EXECUTION_BUILD_BUNDLE_MEDIA_TYPE ||
            buildBundle.snapshotDigest !== snapshot.contentDigest ||
            JSON.stringify(buildBundle.target) !==
              JSON.stringify(snapshot.target)
          )
            throw new TypeError(
              `Sandbox artifact ${index} does not match the executable snapshot.`
            );
        }
      } else {
        if (profile !== 'test')
          throw new TypeError('Sandbox Test artifact has the wrong profile.');
        if (
          artifact.artifactId !== `vitest-report:${snapshot.contentDigest}` ||
          artifact.mediaType !== 'application/vnd.vitest.report+json'
        )
          throw new TypeError('Sandbox Test artifact is not a Vitest report.');
        const fallback = testFallbackSourceTrace(snapshot);
        const report = parseVitestExecutionTestReport({
          source: contents,
          reportId: `test-report:${snapshot.contentDigest}`,
          completedAt,
          sourceTrace: fallback,
          resolveSourceTrace: (reportedPath) =>
            resolveTestSourceTrace(snapshot, reportedPath, fallback),
        });
        if (
          (record.exitCode === 0 && report.status !== 'passed') ||
          (record.exitCode !== 0 && report.status !== 'failed')
        )
          throw new TypeError(
            'Sandbox Test exit code and canonical report status diverged.'
          );
        publishedContents = Buffer.from(
          JSON.stringify(toExecutionTestReportValue(report)),
          'utf8'
        );
        if (publishedContents.byteLength > maximumArtifactBytes)
          throw new TypeError(
            'Canonical Test report exceeds the configured artifact limit.'
          );
        publishedArtifactId = `test-report:${snapshot.contentDigest}`;
        publishedKind = 'report';
        publishedLabel = 'Remote project test report';
        publishedMediaType = EXECUTION_TEST_REPORT_MEDIA_TYPE;
        publishedMetadata = Object.freeze({
          reportId: report.reportId,
          status: report.status,
          snapshotDigest: snapshot.contentDigest,
          totalFiles: String(report.summary.totalFiles),
          totalCases: String(report.summary.totalCases),
          failedFiles: String(report.summary.failedFiles),
          failedCases: String(report.summary.failedCases),
        });
        sourceTrace = collectTestReportSourceTrace(report, fallback);
      }
      artifactBytes += publishedContents.byteLength;
      if (artifactBytes > maximumArtifactBytes)
        throw new TypeError('Sandbox artifacts exceed the configured limit.');
      return Object.freeze({
        artifactId: publishedArtifactId,
        kind: publishedKind,
        ...(publishedLabel ? { label: publishedLabel } : {}),
        mediaType: publishedMediaType,
        ...(sourceTrace.length ? { sourceTrace } : {}),
        metadata: publishedMetadata,
        contents: publishedContents,
      });
    }
  );
  const exitCode = record.exitCode as number;
  return Object.freeze({
    status: exitCode === 0 ? 'succeeded' : 'failed',
    exitCode,
    stdout: Buffer.from(stdout).toString('utf8'),
    stderr: Buffer.from(stderr).toString('utf8'),
    outputTruncated: record.outputTruncated,
    artifacts: Object.freeze(artifacts),
  });
};

/** Runs exact snapshots in a rootless OCI boundary without host mounts or inherited credentials. */
export const createRootlessPodmanSandbox = (
  options: CreateRootlessPodmanSandboxOptions
): RemoteWorkerSandbox => {
  if (!imageIsImmutable(options.imageReference))
    throw new TypeError(
      'Production sandbox image must use an immutable digest.'
    );
  const limits = Object.freeze({
    maximumCpuCores: positive(
      options.limits.maximumCpuCores,
      'Sandbox CPU limit'
    ),
    maximumMemoryMb: positive(
      options.limits.maximumMemoryMb,
      'Sandbox memory limit'
    ),
    maximumDiskMb: positive(options.limits.maximumDiskMb, 'Sandbox disk limit'),
    maximumPids: positive(options.limits.maximumPids, 'Sandbox PID limit'),
    maximumOpenFiles: positive(
      options.limits.maximumOpenFiles,
      'Sandbox open-file limit'
    ),
    temporaryDirectoryMb: positive(
      options.limits.temporaryDirectoryMb,
      'Sandbox temporary-directory limit'
    ),
    maximumArtifactBytes: positive(
      options.limits.maximumArtifactBytes,
      'Sandbox artifact limit'
    ),
  });
  const podmanCommand = options.podmanCommand ?? 'podman';
  const installNetworkPolicy = normalizeInstallNetworkPolicy(
    options.installNetworkPolicy
  );
  const now = options.now ?? Date.now;
  return Object.freeze({
    async execute(input): Promise<RemoteWorkerSandboxResult> {
      const outputGuard = createExecutionSecretLeakGuard({
        secretValues: input.redactValues,
      });
      if (process.platform !== 'linux' || !process.getuid || !process.getgid)
        throw new Error('Rootless Podman sandbox requires Linux.');
      const uid = process.getuid();
      const gid = process.getgid();
      if (uid === 0)
        throw new Error('Rootless sandbox worker must not run as root.');
      const name = `prodivix-${input.executionId.replace(/[^a-zA-Z0-9_.-]/gu, '-').slice(0, 40)}-${randomUUID().slice(0, 8)}`;
      const cpuCores = Math.min(
        input.snapshot.resourceHints.cpuCores ?? limits.maximumCpuCores,
        limits.maximumCpuCores
      );
      const memoryMb = Math.min(
        input.snapshot.resourceHints.memoryMb ?? limits.maximumMemoryMb,
        limits.maximumMemoryMb
      );
      const diskMb = Math.min(
        input.snapshot.resourceHints.diskMb ?? limits.maximumDiskMb,
        limits.maximumDiskMb
      );
      const installTraceId = `install-${randomUUID()}`;
      if (installNetworkPolicy.mode === 'proxy-allowlist')
        await assertInstallProxyPolicy(podmanCommand, installNetworkPolicy);
      const installProxyUrl =
        installNetworkPolicy.mode === 'proxy-allowlist'
          ? createRootlessInstallProxyUrl(
              installNetworkPolicy.proxyUrl,
              installTraceId
            )
          : undefined;
      const args = createRootlessPodmanRunArguments({
        name,
        imageReference: options.imageReference,
        uid,
        gid,
        cpuCores,
        memoryMb,
        diskMb,
        pids: limits.maximumPids,
        openFiles: limits.maximumOpenFiles,
        temporaryDirectoryMb: limits.temporaryDirectoryMb,
        executionId: input.executionId,
        ...(installNetworkPolicy.mode === 'proxy-allowlist'
          ? {
              installNetworkName: installNetworkPolicy.networkName,
              installProxyUrl,
            }
          : {}),
      });
      const output: Output = {
        stdout: '',
        stderr: '',
        usedBytes: 0,
        truncated: false,
      };
      const maximumEnvelopeBytes = Math.ceil(
        limits.maximumArtifactBytes * (4 / 3) +
          input.maximumOutputBytes * (4 / 3) +
          1024 * 1024
      );
      const child = spawn(podmanCommand, [...args], {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: podmanProcessEnvironment(),
      });
      let timedOut = false;
      let aborted = input.signal.aborted;
      let childClosed = false;
      let stopTask: Promise<void> | undefined;
      let phaseIsolationFailure = false;
      let phaseIsolationTask: Promise<void> | undefined;
      let captureTask: Promise<void> | undefined;
      let terminalDisconnect:
        | Awaited<ReturnType<NonNullable<typeof input.terminal>['connect']>>
        | undefined;
      let terminalConnectionTask: Promise<void> | undefined;
      const connectTerminal = (): Promise<void> => {
        if (!input.terminal) return Promise.resolve();
        terminalConnectionTask ??= input.terminal
          .connect(
            createRootlessPodmanTerminalProcess({
              podmanCommand,
              containerName: name,
              environment: podmanProcessEnvironment(),
            })
          )
          .then((disconnect) => {
            terminalDisconnect = disconnect;
          });
        return terminalConnectionTask;
      };
      const captureFilesystem = (): Promise<void> => {
        captureTask ??= (async () => {
          await phaseIsolationTask;
          await terminalConnectionTask;
          await terminalDisconnect?.();
          terminalDisconnect = undefined;
          if (!child.stdin.destroyed)
            child.stdin.end(`${captureExecutionToken}\n`);
        })();
        return captureTask;
      };
      const stop = (): void => {
        if (stopTask) return;
        stopTask = (async () => {
          const escalationAt = Date.now() + stopEscalationMs;
          const deadlineAt = Date.now() + stopDeadlineMs;
          while (!childClosed && Date.now() < deadlineAt) {
            try {
              await execFileAsync(
                podmanCommand,
                Date.now() < escalationAt
                  ? ['stop', '--time=1', name]
                  : ['rm', '--force', name],
                { env: podmanProcessEnvironment() }
              );
              return;
            } catch {
              if (childClosed) return;
              await new Promise((resolveDelay) =>
                setTimeout(resolveDelay, stopRetryIntervalMs)
              );
            }
          }
          if (!childClosed) child.kill('SIGKILL');
          await execFileAsync(
            podmanCommand,
            ['rm', '--force', '--ignore', name],
            { env: podmanProcessEnvironment() }
          ).catch(() => undefined);
        })();
      };
      const timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, input.timeoutMs);
      const onAbort = () => {
        aborted = true;
        stop();
      };
      input.signal.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (chunk: Buffer) =>
        appendOutput(output, 'stdout', chunk, maximumEnvelopeBytes)
      );
      let controlBuffer = '';
      child.stderr.on('data', (chunk: Buffer) => {
        appendOutput(output, 'stderr', chunk, maximumEnvelopeBytes);
        controlBuffer = `${controlBuffer}${chunk.toString('utf8')}`.slice(
          -Math.max(installCompleteMarker.length, captureReadyMarker.length) * 4
        );
        if (
          installNetworkPolicy.mode === 'proxy-allowlist' &&
          !phaseIsolationTask &&
          controlBuffer.includes(installCompleteMarker)
        ) {
          phaseIsolationTask = (async () => {
            try {
              await disconnectContainerNetwork(
                podmanCommand,
                installNetworkPolicy.networkName,
                name
              );
              child.stdin.write(`${continueExecutionToken}\n`);
              await connectTerminal();
            } catch {
              phaseIsolationFailure = true;
              stop();
            }
          })();
        }
        if (!captureTask && controlBuffer.includes(captureReadyMarker))
          void captureFilesystem().catch(() => {
            phaseIsolationFailure = true;
            stop();
          });
      });
      child.stdin.on('error', () => {
        // Podman can reject the invocation before the bounded payload finishes writing.
      });
      child.stdin.write(
        `${payload(
          input.snapshot,
          input.profile,
          input.maximumOutputBytes,
          limits.maximumArtifactBytes
        )}\n`
      );
      if (installNetworkPolicy.mode === 'none')
        child.stdin.write(`${continueExecutionToken}\n`);
      if (installNetworkPolicy.mode === 'none')
        terminalConnectionTask = connectTerminal();
      const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
        child.once('error', (error) => {
          childClosed = true;
          rejectExit(error);
        });
        child.once('close', (code) => {
          childClosed = true;
          resolveExit(code ?? 1);
        });
        if (aborted) stop();
      }).finally(() => {
        clearTimeout(timer);
        input.signal.removeEventListener('abort', onAbort);
      });
      await stopTask;
      await phaseIsolationTask;
      await captureTask;
      await terminalConnectionTask;
      await terminalDisconnect?.();
      if (phaseIsolationFailure)
        return Object.freeze({
          status: 'failed',
          exitCode: 125,
          stdout: '',
          stderr: 'Sandbox runtime network isolation failed.',
          outputTruncated: output.truncated,
          reason: 'runtime-network-isolation-failed',
        });
      let networkTraces: readonly RemoteWorkerSandboxNetworkTrace[] = [];
      if (installNetworkPolicy.mode === 'proxy-allowlist') {
        try {
          const { stdout: proxyLogs } = await execFileAsync(
            podmanCommand,
            ['logs', installNetworkPolicy.proxyContainerName],
            {
              env: podmanProcessEnvironment(),
              maxBuffer: 8 * 1024 * 1024,
            }
          );
          networkTraces = decodeRootlessInstallProxyTraces(
            proxyLogs,
            installTraceId
          );
        } catch {
          return Object.freeze({
            status: 'failed',
            exitCode: 125,
            stdout: '',
            stderr: 'Sandbox install network trace validation failed.',
            outputTruncated: output.truncated,
            reason: 'invalid-network-trace',
          });
        }
      }
      if (!aborted && !timedOut && exitCode === 0) {
        try {
          const result = decodeRootlessPodmanSandboxResult(
            output.stdout,
            input.snapshot,
            input.profile,
            now(),
            input.maximumOutputBytes,
            limits.maximumArtifactBytes
          );
          const stdout = outputGuard.redactText(result.stdout);
          const stderr = outputGuard.redactText(result.stderr);
          const artifactInspection = outputGuard.inspectValue(
            'artifact-content',
            result.artifacts ?? []
          );
          const networkInspection = outputGuard.inspectValue(
            'trace',
            networkTraces
          );
          return Object.freeze({
            ...result,
            stdout: stdout.value,
            stderr: stderr.value,
            secretLeakDetected:
              stdout.redacted ||
              stderr.redacted ||
              !artifactInspection.safe ||
              !networkInspection.safe,
            ...(networkTraces.length ? { networkTraces } : {}),
          });
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : 'Unknown decoder error.';
          const stderr = outputGuard.redactText(
            `Sandbox returned an invalid result envelope: ${detail}`
          );
          return Object.freeze({
            status: 'failed',
            exitCode: 125,
            stdout: '',
            stderr: stderr.value,
            outputTruncated: output.truncated,
            secretLeakDetected: stderr.redacted,
            reason: 'invalid-sandbox-result',
          });
        }
      }
      const stderr = outputGuard.redactText(output.stderr);
      return Object.freeze({
        status: aborted
          ? 'cancelled'
          : timedOut
            ? 'timed-out'
            : exitCode === 0
              ? 'succeeded'
              : 'failed',
        exitCode,
        stdout: '',
        stderr: stderr.value,
        outputTruncated: output.truncated,
        secretLeakDetected: stderr.redacted,
        ...(networkTraces.length ? { networkTraces } : {}),
      });
    },
  });
};
