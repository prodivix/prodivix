import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  createExecutableProjectSnapshot,
  decodeExecutionBuildBundle,
  decodeExecutionPreviewBundle,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  readExecutionTestReportValue,
} from '@prodivix/runtime-core';
import { decodeRemoteExecutableProjectSnapshot } from '@prodivix/runtime-remote';
import {
  createRootlessPodmanSandbox,
  verifyRootlessPodmanEngine,
} from '../src/rootlessPodmanSandbox';

const execFileAsync = promisify(execFile);
const podman = process.env.PRODIVIX_ROOTLESS_PODMAN_COMMAND ?? 'podman';
const baseImage =
  process.env.PRODIVIX_ROOTLESS_BASE_IMAGE ??
  'docker.io/library/node:22-bookworm-slim';
const gateImage = 'localhost/prodivix-remote-sandbox:gate';
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const evidencePath = process.env.PRODIVIX_ROOTLESS_EVIDENCE_PATH;
const goldenSnapshotPath = process.env.PRODIVIX_GOLDEN_SNAPSHOT_PATH?.trim();
const installNetworkName =
  process.env.PRODIVIX_ROOTLESS_INSTALL_NETWORK?.trim();
const installProxyUrl = process.env.PRODIVIX_ROOTLESS_INSTALL_PROXY_URL?.trim();
const installProxyContainer =
  process.env.PRODIVIX_ROOTLESS_INSTALL_PROXY_CONTAINER?.trim();
if (!goldenSnapshotPath)
  throw new TypeError('PRODIVIX_GOLDEN_SNAPSHOT_PATH is required.');
if (!installNetworkName)
  throw new TypeError('PRODIVIX_ROOTLESS_INSTALL_NETWORK is required.');
if (!installProxyUrl || !installProxyContainer)
  throw new TypeError('Rootless install proxy configuration is required.');

const command = async (args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync(podman, [...args], {
    cwd: repositoryRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
};

const immutableImageId = async (reference: string): Promise<string> => {
  const id = await command([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    reference,
  ]);
  if (!/^sha256:[a-f0-9]{64}$/u.test(id))
    throw new Error(`Container image has no immutable digest: ${reference}.`);
  return id;
};

const repositoryDigest = async (reference: string): Promise<string> => {
  const digest = await command([
    'image',
    'inspect',
    '--format',
    '{{.Digest}}',
    reference,
  ]);
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest))
    throw new Error(
      `Pulled base image has no repository digest: ${reference}.`
    );
  return digest;
};

const probeSource = String.raw`
import fs from 'node:fs';
import net from 'node:net';
const read = (path) => { try { return fs.readFileSync(path, 'utf8').trim(); } catch { return ''; } };
let rootReadOnly = false;
try { fs.writeFileSync('/prodivix-root-write-probe', 'denied'); } catch { rootReadOnly = true; }
fs.writeFileSync('/workspace/write-probe', 'ok');
fs.mkdirSync('/workspace/dist', { recursive: true });
fs.writeFileSync('/workspace/dist/gate.json', JSON.stringify({ gate: 'rootless' }));
const status = read('/proc/self/status');
const capEff = /^CapEff:\s*([0-9a-f]+)/mi.exec(status)?.[1] ?? '';
const noNewPrivs = /^NoNewPrivs:\s*(\d+)/mi.exec(status)?.[1] ?? '';
const mountInfo = read('/proc/self/mountinfo');
const workspaceMount = mountInfo.split('\n').find((line) => line.includes(' /workspace ')) ?? '';
const stat = fs.statfsSync('/workspace');
const workspaceBytes = Number(stat.blocks) * Number(stat.bsize);
const cpu = read('/sys/fs/cgroup/cpu.max');
const memory = read('/sys/fs/cgroup/memory.max');
const pids = read('/sys/fs/cgroup/pids.max');
const connectionDenied = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  const finish = (value) => { socket.destroy(); resolve(value); };
  socket.once('connect', () => finish(false));
  socket.once('error', () => finish(true));
  setTimeout(() => finish(true), 1500).unref();
});
const publicNetworkDenied = await connectionDenied('1.1.1.1', 53);
const metadataNetworkDenied = await connectionDenied('169.254.169.254', 80);
console.log(JSON.stringify({
  uid: process.getuid(),
  gid: process.getgid(),
  rootReadOnly,
  workspaceWritable: read('/workspace/write-probe') === 'ok',
  workspaceIsTmpfs: workspaceMount.includes(' - tmpfs '),
  workspaceNoSuid: workspaceMount.includes('nosuid'),
  workspaceNoDev: workspaceMount.includes('nodev'),
  workspaceBytes,
  capEff,
  noNewPrivs,
  publicNetworkDenied,
  metadataNetworkDenied,
  containerSocketAbsent: !fs.existsSync('/var/run/docker.sock') && !fs.existsSync('/run/podman/podman.sock'),
  hostPathAbsent: !fs.existsSync('/host'),
  workerSecretAbsent: process.env.REMOTE_WORKER_TOKEN === undefined,
  cpu,
  memory,
  pids,
}));
`;

const testReportSource = String.raw`
import fs from 'node:fs';
fs.mkdirSync('/workspace/.prodivix', { recursive: true });
fs.writeFileSync('/workspace/.prodivix/test-report.json', JSON.stringify({
  success: true,
  testResults: [{
    name: '/workspace/package.json',
    status: 'passed',
    assertionResults: [{
      title: 'runs inside the rootless sandbox',
      fullName: 'Remote Test runs inside the rootless sandbox',
      status: 'passed',
      duration: 1,
    }],
  }],
}));
`;

const previewSource = String.raw`
import fs from 'node:fs';
fs.mkdirSync('/workspace/dist', { recursive: true });
fs.writeFileSync('/workspace/dist/index.html', '<main>Remote Preview ready</main>');
`;

const snapshot = (
  executionId: string,
  source: string,
  profile: 'preview' | 'build' | 'test' = 'build',
  installCommand: Readonly<{
    command: 'node' | 'npm';
    args: readonly string[];
  }> = { command: 'node', args: ['-e', 'process.exit(0)'] }
) =>
  createExecutableProjectSnapshot({
    workspace: {
      workspaceId: `workspace-${executionId}`,
      snapshotId: `snapshot-${executionId}`,
      partitionRevisions: { workspace: '1' },
    },
    target: { presetId: 'rootless-gate', framework: 'node', runtime: 'node' },
    files: [
      {
        path: 'package.json',
        contents: '{"private":true}',
        sourceTrace: [
          {
            sourceRef: {
              kind: 'workspace',
              workspaceId: `workspace-${executionId}`,
            },
          },
        ],
      },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [{ kind: profile, path: 'package.json' }],
    capabilityRequirements: {
      preview: ['filesystem'],
      build: ['filesystem', 'build'],
      test: ['filesystem', 'test'],
    },
    publicBuildConfiguration: [],
    resourceHints: { cpuCores: 1, memoryMb: 256, diskMb: 64 },
    cacheHints: { dependencyInstall: 'isolated' },
    installCommand,
    buildCommand: {
      command: 'node',
      args: ['--input-type=module', '-e', source],
    },
    testPlan: {
      framework: 'vitest',
      command: {
        command: 'node',
        args: ['--input-type=module', '-e', source],
      },
      reportFilePath: '.prodivix/test-report.json',
    },
  });

const numberLimit = (value: string, label: string): number => {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${label} is not enforced.`);
  return result;
};

const assertProbe = (value: unknown): void => {
  if (!value || typeof value !== 'object')
    throw new Error('Sandbox security probe did not return an object.');
  const probe = value as Record<string, unknown>;
  for (const property of [
    'rootReadOnly',
    'workspaceWritable',
    'workspaceIsTmpfs',
    'workspaceNoSuid',
    'workspaceNoDev',
    'publicNetworkDenied',
    'metadataNetworkDenied',
    'containerSocketAbsent',
    'hostPathAbsent',
    'workerSecretAbsent',
  ]) {
    if (probe[property] !== true)
      throw new Error(`Sandbox security property failed: ${property}.`);
  }
  if (probe.uid === 0 || probe.gid === 0)
    throw new Error('Sandbox command ran as root.');
  if (probe.capEff !== '0000000000000000')
    throw new Error('Sandbox retained Linux capabilities.');
  if (probe.noNewPrivs !== '1')
    throw new Error('Sandbox no-new-privileges is not active.');
  if (
    numberLimit(String(probe.workspaceBytes), 'Workspace tmpfs') >
    72 * 1024 * 1024
  )
    throw new Error('Sandbox workspace disk limit is not enforced.');
  if (numberLimit(String(probe.memory), 'Memory') > 256 * 1024 * 1024)
    throw new Error('Sandbox memory limit is not enforced.');
  if (numberLimit(String(probe.pids), 'PID') > 128)
    throw new Error('Sandbox PID limit is not enforced.');
  const [quota, period] = String(probe.cpu).split(' ').map(Number);
  if (!quota || !period || quota / period > 1)
    throw new Error('Sandbox CPU limit is not enforced.');
};

await verifyRootlessPodmanEngine(podman);
await command(['pull', baseImage]);
const baseDigest = await repositoryDigest(baseImage);
const baseRepository = baseImage.includes('@')
  ? baseImage.slice(0, baseImage.indexOf('@'))
  : baseImage.includes(':')
    ? baseImage.slice(0, baseImage.lastIndexOf(':'))
    : baseImage;
await command([
  'build',
  '--pull=never',
  '--build-arg',
  `NODE_IMAGE=${baseRepository}@${baseDigest}`,
  '--file',
  'apps/remote-runner-worker/sandbox/Dockerfile',
  '--tag',
  gateImage,
  '.',
]);
const sandboxDigest = await immutableImageId(gateImage);
const sandbox = createRootlessPodmanSandbox({
  imageReference: sandboxDigest,
  podmanCommand: podman,
  installNetworkPolicy: {
    mode: 'proxy-allowlist',
    networkName: installNetworkName,
    proxyUrl: installProxyUrl,
    proxyContainerName: installProxyContainer,
    allowedHosts: ['registry.npmjs.org'],
  },
  limits: {
    maximumCpuCores: 1,
    maximumMemoryMb: 1_024,
    maximumDiskMb: 1_024,
    maximumPids: 128,
    maximumOpenFiles: 1_024,
    temporaryDirectoryMb: 256,
    maximumArtifactBytes: 64 * 1024 * 1024,
  },
});

const probeResult = await sandbox.execute({
  executionId: 'gate-security',
  snapshot: snapshot('gate-security', probeSource),
  profile: 'build',
  timeoutMs: 15_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (probeResult.status !== 'succeeded')
  throw new Error(`Rootless security probe failed: ${probeResult.stderr}`);
if (
  probeResult.artifacts?.length !== 1 ||
  probeResult.artifacts[0]?.kind !== 'bundle' ||
  probeResult.artifacts[0].metadata?.format !==
    'prodivix.execution-build-bundle.v1'
)
  throw new Error('Rootless build result artifact was not captured.');
const buildArtifact = probeResult.artifacts[0];
const probeLine = probeResult.stdout.trim().split(/\r?\n/u).at(-1);
if (!probeLine) throw new Error('Rootless security probe produced no result.');
const securityProbe = JSON.parse(probeLine) as unknown;
assertProbe(securityProbe);

const assertNoExecutionContainer = async (executionId: string) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const names = await command([
      'ps',
      '--all',
      '--filter',
      `label=prodivix.remote-execution=${executionId}`,
      '--format',
      '{{.Names}}',
    ]);
    if (!names) return;
    if (attempt === 19)
      throw new Error(`${executionId} left an orphan container.`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
};

await assertNoExecutionContainer('gate-security');

const deniedInstallResult = await sandbox.execute({
  executionId: 'gate-install-denied',
  snapshot: snapshot('gate-install-denied', 'process.exit(0)', 'build', {
    command: 'npm',
    args: ['view', 'react', '--registry=https://example.com'],
  }),
  profile: 'build',
  timeoutMs: 30_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (
  deniedInstallResult.status !== 'failed' ||
  !deniedInstallResult.networkTraces?.length ||
  deniedInstallResult.networkTraces.some(
    (trace) =>
      trace.outcome !== 'denied' ||
      trace.sanitizedUrl !== 'https://example.com/'
  )
)
  throw new Error('Rootless install egress allowlist did not deny the probe.');
await assertNoExecutionContainer('gate-install-denied');

const previewResult = await sandbox.execute({
  executionId: 'gate-preview',
  snapshot: snapshot('gate-preview', previewSource, 'preview'),
  profile: 'preview',
  timeoutMs: 15_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (previewResult.status !== 'succeeded')
  throw new Error(`Rootless Preview probe failed: ${previewResult.stderr}`);
if (
  previewResult.artifacts?.length !== 1 ||
  previewResult.artifacts[0]?.kind !== 'bundle' ||
  previewResult.artifacts[0].mediaType !==
    'application/vnd.prodivix.execution-preview-bundle+json' ||
  previewResult.artifacts[0].metadata?.readiness !== 'ready' ||
  previewResult.artifacts[0].metadata?.health !== 'healthy' ||
  !previewResult.artifacts[0].sourceTrace?.length
)
  throw new Error('Rootless Preview did not produce a healthy ready bundle.');
const previewArtifact = previewResult.artifacts[0];
await assertNoExecutionContainer('gate-preview');

const testResult = await sandbox.execute({
  executionId: 'gate-test',
  snapshot: snapshot('gate-test', testReportSource, 'test'),
  profile: 'test',
  timeoutMs: 15_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (testResult.status !== 'succeeded')
  throw new Error(`Rootless Test probe failed: ${testResult.stderr}`);
if (
  testResult.artifacts?.length !== 1 ||
  testResult.artifacts[0]?.kind !== 'report' ||
  testResult.artifacts[0].mediaType !== EXECUTION_TEST_REPORT_MEDIA_TYPE ||
  testResult.artifacts[0].metadata?.status !== 'passed'
)
  throw new Error(
    'Rootless Test result was not converted to a canonical report.'
  );
const testArtifact = testResult.artifacts[0];
const testReport = readExecutionTestReportValue(
  JSON.parse(Buffer.from(testArtifact.contents).toString('utf8')) as unknown
);
if (
  !testReport ||
  testReport.status !== 'passed' ||
  testReport.summary.passedFiles !== 1 ||
  testReport.summary.passedCases !== 1 ||
  !testArtifact.sourceTrace?.length
)
  throw new Error('Rootless canonical Test report is incomplete.');
await assertNoExecutionContainer('gate-test');

const goldenSnapshot = decodeRemoteExecutableProjectSnapshot(
  JSON.parse(
    await readFile(resolve(goldenSnapshotPath), { encoding: 'utf8' })
  ) as unknown
);
const executeGolden = async (profile: 'preview' | 'test' | 'build') => {
  const executionId = `golden-${profile}`;
  const result = await sandbox.execute({
    executionId,
    snapshot: goldenSnapshot,
    profile,
    timeoutMs: 4 * 60_000,
    maximumOutputBytes: 16 * 1024 * 1024,
    redactValues: [],
    signal: new AbortController().signal,
  });
  if (result.status !== 'succeeded')
    throw new Error(
      `Golden rootless ${profile} failed: ${result.stderr || result.stdout}`
    );
  if (result.artifacts?.length !== 1)
    throw new Error(`Golden rootless ${profile} produced no exact artifact.`);
  if (
    !result.networkTraces?.length ||
    result.networkTraces.some(
      (trace) =>
        trace.sanitizedUrl !== 'https://registry.npmjs.org/' ||
        trace.outcome !== 'allowed'
    )
  )
    throw new Error(
      `Golden rootless ${profile} did not produce sanitized allowlisted install traces.`
    );
  await assertNoExecutionContainer(executionId);
  return Object.freeze({
    artifact: result.artifacts[0],
    networkTraces: result.networkTraces,
  });
};

const goldenPreview = await executeGolden('preview');
const goldenPreviewArtifact = goldenPreview.artifact;
const goldenPreviewBundle = decodeExecutionPreviewBundle(
  goldenPreviewArtifact.contents
);
if (
  goldenPreviewBundle.snapshotDigest !== goldenSnapshot.contentDigest ||
  goldenPreviewBundle.entryFilePath !==
    goldenSnapshot.previewPlan.entryFilePath ||
  !goldenPreviewArtifact.sourceTrace?.length
)
  throw new Error('Golden rootless Preview drifted from its exact snapshot.');

const goldenBuild = await executeGolden('build');
const goldenBuildArtifact = goldenBuild.artifact;
const goldenBuildBundle = decodeExecutionBuildBundle(
  goldenBuildArtifact.contents
);
if (
  goldenBuildBundle.snapshotDigest !== goldenSnapshot.contentDigest ||
  !goldenBuildArtifact.sourceTrace?.length
)
  throw new Error('Golden rootless Build drifted from its exact snapshot.');
const bundleFacts = (files: typeof goldenBuildBundle.files) =>
  files.map(({ path, size, digest }) => ({ path, size, digest }));
if (
  JSON.stringify(bundleFacts(goldenPreviewBundle.files)) !==
  JSON.stringify(bundleFacts(goldenBuildBundle.files))
)
  throw new Error('Golden rootless Preview and Build output facts diverged.');

const goldenTest = await executeGolden('test');
const goldenTestArtifact = goldenTest.artifact;
const goldenTestReport = readExecutionTestReportValue(
  JSON.parse(
    Buffer.from(goldenTestArtifact.contents).toString('utf8')
  ) as unknown
);
if (
  !goldenTestReport ||
  goldenTestReport.status !== 'passed' ||
  goldenTestReport.summary.failedCases !== 0 ||
  goldenTestReport.summary.passedCases < 1 ||
  !goldenTestArtifact.sourceTrace?.length
)
  throw new Error('Golden rootless Test report is incomplete or failed.');

const cancellation = new AbortController();
setTimeout(() => cancellation.abort('gate-cancel'), 500);
const cancelled = await sandbox.execute({
  executionId: 'gate-cancel',
  snapshot: snapshot(
    'gate-cancel',
    'await new Promise((resolve) => setTimeout(resolve, 30000));'
  ),
  profile: 'build',
  timeoutMs: 10_000,
  maximumOutputBytes: 64 * 1024,
  redactValues: [],
  signal: cancellation.signal,
});
if (cancelled.status !== 'cancelled')
  throw new Error('Rootless cancellation did not stop the sandbox.');
await assertNoExecutionContainer('gate-cancel');

const timedOut = await sandbox.execute({
  executionId: 'gate-timeout',
  snapshot: snapshot(
    'gate-timeout',
    'await new Promise((resolve) => setTimeout(resolve, 30000));'
  ),
  profile: 'build',
  timeoutMs: 500,
  maximumOutputBytes: 64 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (timedOut.status !== 'timed-out')
  throw new Error('Rootless timeout did not stop the sandbox.');
await assertNoExecutionContainer('gate-timeout');

const evidence = Object.freeze({
  gate: 'g2-rootless-sandbox',
  engine: 'podman-rootless',
  baseImage: `${baseRepository}@${baseDigest}`,
  sandboxImage: sandboxDigest,
  securityProbe,
  installEgressDenial: {
    status: deniedInstallResult.status,
    trace: deniedInstallResult.networkTraces[0],
  },
  buildArtifact: {
    artifactId: buildArtifact.artifactId,
    mediaType: buildArtifact.mediaType,
    size: buildArtifact.contents.byteLength,
    metadata: buildArtifact.metadata,
    sourceTraceCount: buildArtifact.sourceTrace?.length ?? 0,
  },
  testArtifact: {
    artifactId: testArtifact.artifactId,
    mediaType: testArtifact.mediaType,
    size: testArtifact.contents.byteLength,
    metadata: testArtifact.metadata,
    sourceTraceCount: testArtifact.sourceTrace?.length ?? 0,
    reportSummary: testReport.summary,
  },
  previewArtifact: {
    artifactId: previewArtifact.artifactId,
    mediaType: previewArtifact.mediaType,
    size: previewArtifact.contents.byteLength,
    metadata: previewArtifact.metadata,
    sourceTraceCount: previewArtifact.sourceTrace?.length ?? 0,
  },
  goldenJourney: {
    snapshotDigest: goldenSnapshot.contentDigest,
    target: goldenSnapshot.target,
    sourceFileCount: goldenSnapshot.files.length,
    preview: {
      artifactId: goldenPreviewArtifact.artifactId,
      entryFilePath: goldenPreviewBundle.entryFilePath,
      fileCount: goldenPreviewBundle.files.length,
      sourceTraceCount: goldenPreviewArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenPreview.networkTraces.length,
    },
    build: {
      artifactId: goldenBuildArtifact.artifactId,
      fileCount: goldenBuildBundle.files.length,
      sourceTraceCount: goldenBuildArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenBuild.networkTraces.length,
    },
    test: {
      artifactId: goldenTestArtifact.artifactId,
      status: goldenTestReport.status,
      summary: goldenTestReport.summary,
      sourceTraceCount: goldenTestArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenTest.networkTraces.length,
    },
    installNetwork: installNetworkName,
    runtimeNetwork: 'none-verified',
  },
  cancellationCleanup: 'passed',
  timeoutCleanup: 'passed',
});
const serializedEvidence = `${JSON.stringify(evidence, null, 2)}\n`;
if (evidencePath)
  await writeFile(resolve(repositoryRoot, evidencePath), serializedEvidence, {
    encoding: 'utf8',
    flag: 'wx',
  });
process.stdout.write(serializedEvidence);
