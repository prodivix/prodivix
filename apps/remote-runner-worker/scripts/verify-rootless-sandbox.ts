import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  createExecutableProjectSnapshot,
  createExecutionRequest,
  decodeExecutionBuildBundle,
  decodeExecutionFilesystemDiff,
  decodeExecutionPreviewBundle,
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_DATA_RUNTIME_MANIFEST_PATH,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  readExecutionTestReportValue,
} from '@prodivix/runtime-core';
import { decodeRemoteExecutableProjectSnapshot } from '@prodivix/runtime-remote';
import {
  createIsolatedServerFunctionAuthority,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readIsolatedServerFunctionExecutionResponse,
} from '@prodivix/server-runtime';
import {
  createRootlessPodmanSandbox,
  verifyRootlessPodmanEngine,
} from '../src/rootlessPodmanSandbox';

const execFileAsync = promisify(execFile);
const rootlessSecretCanary = 'rootless-secret-material-canary';
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
  const inspected = await command([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    reference,
  ]);
  const id = /^[a-f0-9]{64}$/u.test(inspected)
    ? `sha256:${inspected}`
    : inspected;
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

const terminalSource = String.raw`
import fs from 'node:fs';
fs.mkdirSync('/workspace/dist', { recursive: true });
fs.writeFileSync('/workspace/dist/index.html', '<main>Remote Terminal ready</main>');
await new Promise((resolve) => setTimeout(resolve, 5000));
`;

const isolatedServerFunctionSource = String.raw`
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const request = JSON.parse(fs.readFileSync('/workspace/.prodivix/server-function-invocation.json', 'utf8'));
const authorityPath = '/workspace/.prodivix/server-function-authority.json';
const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
fs.rmSync(authorityPath);
const secretPath = '/workspace/.prodivix/server-function-secrets.json';
const secretMaterial = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
fs.rmSync(secretPath);
if (JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify(['expiresAt', 'format', 'permissions', 'principal', 'snapshotId', 'workspaceId']) ||
  JSON.stringify(Object.keys(authority.principal ?? {}).sort()) !== JSON.stringify(['principalId', 'providerId']) ||
  authority.format !== 'prodivix.isolated-server-function-authority.v1' ||
  authority.workspaceId !== 'workspace-gate-server-function' ||
  authority.snapshotId !== 'snapshot-gate-server-function' ||
  JSON.stringify(authority.permissions) !== JSON.stringify(['workspace.owner']) ||
  authority.expiresAt <= Date.now())
  throw new TypeError('Server Function Gate authority is invalid.');
if (secretMaterial.format !== 'prodivix.isolated-server-function-secret-material.v1' ||
  JSON.stringify(Object.keys(secretMaterial.fields ?? {})) !== JSON.stringify(['signingKey']) ||
  typeof secretMaterial.fields.signingKey !== 'string' || !secretMaterial.fields.signingKey)
  throw new TypeError('Server Function Gate Secret material is invalid.');
const validateInput = new Ajv2020({ strict: true }).compile({
  type: 'object', required: ['name'], properties: { name: { type: 'string' } }, additionalProperties: false,
});
if (!validateInput(request.input)) throw new TypeError('Server Function Gate input is invalid.');
const { getGreeting } = await import('./function.mjs');
const context = Object.freeze({
  principal: authority.principal,
  useSecret: async (field, consumer) => {
    if (field !== 'signingKey' || typeof consumer !== 'function') throw new TypeError('Secret field is invalid.');
    await consumer(secretMaterial.fields.signingKey);
  },
});
const result = await getGreeting(request.input, context);
if (JSON.stringify(result).includes(secretMaterial.fields.signingKey)) throw new TypeError('Secret output leak.');
secretMaterial.fields.signingKey = '';
fs.mkdirSync('/workspace/.prodivix', { recursive: true });
fs.writeFileSync('/workspace/.prodivix/server-function-result.json', JSON.stringify({
  type: 'prodivix.execution-server-function-gateway-response.v1',
  requestId: request.requestId,
  ok: true,
  result,
}));
`;

const isolatedServerFunctionInstallProbeSource = String.raw`
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const path of [
  '/workspace/.prodivix/server-function-invocation.json',
  '/workspace/.prodivix/server-function-authority.json',
  '/workspace/.prodivix/server-function-secrets.json',
]) {
  if (fs.existsSync(path)) throw new TypeError('Runtime projection entered the install phase.');
}
const install = spawnSync('npm', [
  'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
], { cwd: '/workspace', env: process.env, stdio: 'inherit', shell: false });
if (install.error) throw install.error;
if (install.status === 0) {
  fs.mkdirSync('/tmp/prodivix-install-trap', { recursive: true });
  fs.writeFileSync(
    '/tmp/prodivix-install-trap/server-function-secrets.json',
    JSON.stringify({ poisonedByInstall: true })
  );
  fs.symlinkSync('/tmp/prodivix-install-trap', '/workspace/.prodivix', 'dir');
}
process.exit(install.status ?? 1);
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

const isolatedServerFunctionFixture = () => {
  const functionRef = Object.freeze({
    artifactId: 'code-rootless-greeting',
    exportName: 'getGreeting',
  });
  const serverFunctionSnapshot = createExecutableProjectSnapshot({
    workspace: {
      workspaceId: 'workspace-gate-server-function',
      snapshotId: 'snapshot-gate-server-function',
      partitionRevisions: { workspace: '1' },
    },
    target: {
      presetId: 'isolated-server-function',
      framework: 'typescript',
      runtime: 'node',
    },
    files: [
      {
        path: 'package.json',
        contents:
          '{"private":true,"type":"module","dependencies":{"ajv":"8.20.0"}}',
      },
      {
        path: 'src/.prodivix/server-runtime/invoke.mjs',
        contents: isolatedServerFunctionSource,
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: functionRef.artifactId,
            },
          },
        ],
      },
      {
        path: 'src/.prodivix/server-runtime/function.mjs',
        contents:
          "import { formatGreeting } from './modules/module-001.mjs';\nexport const getGreeting = async (input, context) => { let secretLength = 0; await context.useSecret('signingKey', (material) => { secretLength = material.length; }); return { kind: 'value', value: { greeting: formatGreeting(input.name) + ' ' + context.principal.principalId, secretLength } }; };\n",
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: functionRef.artifactId,
            },
          },
        ],
      },
      {
        path: 'src/.prodivix/server-runtime/modules/module-001.mjs',
        contents: "export const formatGreeting = (name) => 'Hello ' + name;\n",
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'code-rootless-greeting-helper',
            },
          },
        ],
      },
      {
        path: 'scripts/install-phase-probe.mjs',
        contents: isolatedServerFunctionInstallProbeSource,
      },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [
      {
        kind: 'production',
        path: 'src/.prodivix/server-runtime/invoke.mjs',
      },
    ],
    capabilityRequirements: {
      preview: [],
      build: [],
      test: [],
      production: [
        'artifacts',
        'cancellation',
        'dependency-install',
        'filesystem',
        'environment-binding',
        'server-function',
        'source-trace',
        'streaming-logs',
        'timeout',
      ],
    },
    cacheHints: { dependencyInstall: 'isolated' },
    installCommand: {
      command: 'node',
      args: ['scripts/install-phase-probe.mjs'],
    },
    serverFunctionPlan: {
      format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
      command: {
        command: 'node',
        args: ['src/.prodivix/server-runtime/invoke.mjs'],
      },
      entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
      sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
      functionRef,
      runtimeManifest: {
        schemaVersion: '1.0',
        functionsByExport: {
          getGreeting: {
            kind: 'function',
            runtimeZone: 'server',
            adapterId: 'prodivix.code-export',
            effect: 'read',
            auth: { kind: 'permission', permissionId: 'workspace.owner' },
            inputSchema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
              additionalProperties: false,
            },
            outputSchema: {
              type: 'object',
              properties: {
                greeting: { type: 'string' },
                secretLength: { type: 'number' },
              },
              required: ['greeting', 'secretLength'],
              additionalProperties: false,
            },
            environment: {
              secretsByField: {
                signingKey: { bindingId: 'rootless-signing-key' },
              },
            },
          },
        },
      },
    },
  });
  const serverFunctionRequest = createExecutionRequest({
    requestId: 'remote-gate-server-function',
    profile: 'production',
    runtimeZone: 'server',
    workspace: serverFunctionSnapshot.workspace,
    invocation: {
      kind: 'code',
      targetRef: {
        kind: 'code-artifact',
        artifactId: functionRef.artifactId,
      },
      entrypoint: functionRef.exportName,
      input: {
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
        requestId: 'gate-server-function:1',
        invocationId: 'gate-server-function',
        attempt: 1,
        functionRef,
        input: { name: 'Rootless' },
      },
    },
    requiredCapabilities: ['environment-binding', 'server-function'],
  });
  return Object.freeze({
    snapshot: serverFunctionSnapshot,
    request: serverFunctionRequest,
    authority: createIsolatedServerFunctionAuthority({
      workspaceId: serverFunctionSnapshot.workspace.workspaceId,
      snapshotId: serverFunctionSnapshot.workspace.snapshotId,
      principal: {
        providerId: 'prodivix-product-session',
        principalId: 'user-1',
      },
      permissions: ['workspace.owner'],
      expiresAt: Date.now() + 60_000,
    }),
    secrets: {
      format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
      fields: { signingKey: rootlessSecretCanary },
    },
  });
};

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
    maximumMemoryMb: 2_048,
    maximumDiskMb: 1_024,
    maximumPids: 128,
    maximumOpenFiles: 1_024,
    temporaryDirectoryMb: 1_024,
    maximumArtifactBytes: 64 * 1024 * 1024,
  },
});

const requireExecutionArtifacts = (
  result: Awaited<ReturnType<typeof sandbox.execute>>,
  label: string
) => {
  const filesystemArtifacts =
    result.artifacts?.filter(
      (artifact) => artifact.mediaType === EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
    ) ?? [];
  const primaryArtifacts =
    result.artifacts?.filter(
      (artifact) => artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
    ) ?? [];
  if (filesystemArtifacts.length !== 1 || primaryArtifacts.length !== 1)
    throw new Error(
      `${label} did not produce one primary artifact and one filesystem diff.`
    );
  return Object.freeze({
    primary: primaryArtifacts[0]!,
    filesystemArtifact: filesystemArtifacts[0]!,
    filesystemDiff: decodeExecutionFilesystemDiff(
      filesystemArtifacts[0]!.contents
    ),
  });
};

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
const probeArtifacts = requireExecutionArtifacts(
  probeResult,
  'Rootless security probe'
);
if (
  probeArtifacts.primary.kind !== 'bundle' ||
  probeArtifacts.primary.metadata?.format !==
    'prodivix.execution-build-bundle.v1'
)
  throw new Error('Rootless build result artifact was not captured.');
if (
  !probeArtifacts.filesystemDiff.complete ||
  !probeArtifacts.filesystemDiff.changes.some(
    (change) => change.kind === 'added' && change.path === 'write-probe'
  )
)
  throw new Error('Rootless security probe filesystem diff is incomplete.');
const buildArtifact = probeArtifacts.primary;
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

const hostTerminalProbePath = resolve(
  repositoryRoot,
  'terminal-runtime-probe.txt'
);
const assertHostTerminalProbeAbsent = async (): Promise<void> => {
  try {
    await readFile(hostTerminalProbePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(
    'Rootless Terminal wrote its runtime file into the host Workspace.'
  );
};
await assertHostTerminalProbeAbsent();

let terminalOutput = '';
let terminalConnected = false;
let terminalTask: Promise<void> | undefined;
const terminalResult = await sandbox.execute({
  executionId: 'gate-terminal',
  snapshot: snapshot('gate-terminal', terminalSource),
  profile: 'build',
  timeoutMs: 15_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
  terminal: {
    async connect(process) {
      terminalConnected = true;
      terminalTask = (async () => {
        await process.open({
          terminalSessionId: 'gate-terminal-session',
          size: { columns: 80, rows: 24 },
          onOutput(output) {
            terminalOutput += output.data;
          },
          onExit() {},
        });
        await process.write(
          "if [ -t 0 ] && [ -t 1 ]; then printf 'PRODIVIX_TERMINAL_%s\\n' 'TTY_V1'; else printf 'PRODIVIX_TERMINAL_%s\\n' 'NO_TTY_V1'; fi\n"
        );
        await process.resize({ columns: 101, rows: 31 });
        await process.write(
          "set -- $(stty size); if [ \"$1\" = '31' ] && [ \"$2\" = '101' ]; then printf 'PRODIVIX_TERMINAL_%s\\n' 'SIZE_31_101_V1'; else printf 'PRODIVIX_TERMINAL_SIZE_MISMATCH_%sx%s\\n' \"$1\" \"$2\"; fi\n"
        );
        await process.write(
          "printf 'ephemeral-terminal-file' > /workspace/terminal-runtime-probe.txt; if [ \"$(cat /workspace/terminal-runtime-probe.txt)\" = 'ephemeral-terminal-file' ]; then printf 'PRODIVIX_TERMINAL_%s\\n' 'FS_LOCAL_V1'; fi\n"
        );
        for (let attempt = 0; attempt < 200; attempt += 1) {
          if (
            terminalOutput.includes('PRODIVIX_TERMINAL_TTY_V1') &&
            terminalOutput.includes('PRODIVIX_TERMINAL_SIZE_31_101_V1') &&
            terminalOutput.includes('PRODIVIX_TERMINAL_FS_LOCAL_V1')
          )
            break;
          if (attempt === 199) {
            const reportedSize =
              /PRODIVIX_TERMINAL_SIZE_MISMATCH_(\d+)x(\d+)/u.exec(
                terminalOutput
              );
            throw new Error(
              'Rootless PTY did not produce canonical evidence ' +
                `(tty=${terminalOutput.includes('PRODIVIX_TERMINAL_TTY_V1')}, ` +
                `size=${reportedSize ? `${reportedSize[1]}x${reportedSize[2]}` : 'missing'}, ` +
                `filesystem=${terminalOutput.includes('PRODIVIX_TERMINAL_FS_LOCAL_V1')}, ` +
                `noTty=${terminalOutput.includes('PRODIVIX_TERMINAL_NO_TTY_V1')}).`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await process.write('exit\n');
      })();
      return async () => {
        await terminalTask;
        await process.close('execution-ended');
      };
    },
  },
});
if (
  terminalResult.status !== 'succeeded' ||
  !terminalConnected ||
  !terminalOutput.includes('PRODIVIX_TERMINAL_TTY_V1') ||
  !terminalOutput.includes('PRODIVIX_TERMINAL_SIZE_31_101_V1') ||
  !terminalOutput.includes('PRODIVIX_TERMINAL_FS_LOCAL_V1') ||
  terminalOutput.includes('PRODIVIX_TERMINAL_NO_TTY_V1')
)
  throw new Error(
    `Rootless execution Terminal PTY Gate failed (status=${terminalResult.status}, connected=${terminalConnected}, tty=${terminalOutput.includes('PRODIVIX_TERMINAL_TTY_V1')}, resized=${terminalOutput.includes('PRODIVIX_TERMINAL_SIZE_31_101_V1')}, filesystem=${terminalOutput.includes('PRODIVIX_TERMINAL_FS_LOCAL_V1')}, noTty=${terminalOutput.includes('PRODIVIX_TERMINAL_NO_TTY_V1')}).`
  );
const terminalArtifacts = requireExecutionArtifacts(
  terminalResult,
  'Rootless Terminal probe'
);
const terminalFileChange = terminalArtifacts.filesystemDiff.changes.find(
  (change) => change.path === 'terminal-runtime-probe.txt'
);
if (
  terminalFileChange?.kind !== 'added' ||
  !terminalFileChange.runtime ||
  Buffer.from(terminalFileChange.runtime.contents).toString('utf8') !==
    'ephemeral-terminal-file'
)
  throw new Error(
    'Rootless Terminal file was not serialized into the filesystem diff.'
  );
await assertNoExecutionContainer('gate-terminal');
await assertHostTerminalProbeAbsent();

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
const previewArtifacts = requireExecutionArtifacts(
  previewResult,
  'Rootless Preview probe'
);
if (
  previewArtifacts.primary.kind !== 'bundle' ||
  previewArtifacts.primary.mediaType !==
    'application/vnd.prodivix.execution-preview-bundle+json' ||
  previewArtifacts.primary.metadata?.readiness !== 'ready' ||
  previewArtifacts.primary.metadata?.health !== 'healthy' ||
  !previewArtifacts.primary.sourceTrace?.length
)
  throw new Error('Rootless Preview did not produce a healthy ready bundle.');
const previewArtifact = previewArtifacts.primary;
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
const testArtifacts = requireExecutionArtifacts(
  testResult,
  'Rootless Test probe'
);
if (
  testArtifacts.primary.kind !== 'report' ||
  testArtifacts.primary.mediaType !== EXECUTION_TEST_REPORT_MEDIA_TYPE ||
  testArtifacts.primary.metadata?.status !== 'passed'
)
  throw new Error(
    'Rootless Test result was not converted to a canonical report.'
  );
const testArtifact = testArtifacts.primary;
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

const serverFunctionFixture = isolatedServerFunctionFixture();
const serverFunctionResult = await sandbox.execute({
  executionId: 'gate-server-function',
  snapshot: serverFunctionFixture.snapshot,
  request: serverFunctionFixture.request,
  serverFunctionAuthority: serverFunctionFixture.authority,
  serverFunctionSecrets: serverFunctionFixture.secrets,
  profile: 'production',
  timeoutMs: 15_000,
  maximumOutputBytes: 256 * 1024,
  redactValues: [rootlessSecretCanary],
  signal: new AbortController().signal,
});
if (serverFunctionResult.status !== 'succeeded')
  throw new Error(
    `Rootless Server Function probe failed: ${serverFunctionResult.stderr}`
  );
if (
  !serverFunctionResult.networkTraces?.length ||
  serverFunctionResult.networkTraces.some(
    (trace) =>
      trace.sanitizedUrl !== 'https://registry.npmjs.org/' ||
      trace.outcome !== 'allowed'
  )
)
  throw new Error(
    'Rootless Server Function install did not use the sanitized allowlist proxy.'
  );
const serverFunctionArtifacts = requireExecutionArtifacts(
  serverFunctionResult,
  'Rootless Server Function probe'
);
if (
  serverFunctionArtifacts.filesystemDiff.changes.some(
    ({ path }) =>
      path === '.prodivix/server-function-invocation.json' ||
      path === '.prodivix/server-function-result.json' ||
      path === ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH ||
      path === ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH
  )
)
  throw new Error(
    'Rootless Server Function transport files leaked into filesystem diff.'
  );
if (
  serverFunctionArtifacts.primary.kind !== 'report' ||
  serverFunctionArtifacts.primary.mediaType !==
    ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
  serverFunctionArtifacts.primary.metadata?.status !== 'succeeded' ||
  !serverFunctionArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === 'code-rootless-greeting'
  ) ||
  !serverFunctionArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === 'code-rootless-greeting-helper'
  )
)
  throw new Error(
    'Rootless Server Function did not produce a canonical result artifact.'
  );
const serverFunctionResponse = readIsolatedServerFunctionExecutionResponse(
  JSON.parse(
    Buffer.from(serverFunctionArtifacts.primary.contents).toString('utf8')
  ) as unknown,
  serverFunctionFixture.request,
  serverFunctionFixture.snapshot.serverFunctionPlan
);
if (
  !serverFunctionResponse?.ok ||
  serverFunctionResponse.type !==
    EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE ||
  serverFunctionResponse.result.kind !== 'value' ||
  JSON.stringify(serverFunctionResponse.result.value) !==
    JSON.stringify({
      greeting: 'Hello Rootless user-1',
      secretLength: rootlessSecretCanary.length,
    }) ||
  JSON.stringify(serverFunctionResponse).includes(rootlessSecretCanary)
)
  throw new Error('Rootless Server Function result content is invalid.');
await assertNoExecutionContainer('gate-server-function');

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
      `Golden rootless ${profile} failed ${JSON.stringify({
        status: result.status,
        exitCode: result.exitCode,
        reason: result.reason,
        outputTruncated: result.outputTruncated,
        artifactCount: result.artifacts?.length ?? 0,
      })}:\n${[result.stderr, result.stdout].filter(Boolean).join('\n')}`
    );
  const artifacts = requireExecutionArtifacts(
    result,
    `Golden rootless ${profile}`
  );
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
    artifact: artifacts.primary,
    filesystemDiff: artifacts.filesystemDiff,
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
const publicRuntimeBundlePath = (path: string): string => {
  if (!path.startsWith('public/'))
    throw new TypeError('Executable runtime asset is not public.');
  return path.slice('public/'.length);
};
const dataMockBundlePath = publicRuntimeBundlePath(
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH
);
const dataRuntimeBundlePath = publicRuntimeBundlePath(
  EXECUTABLE_PROJECT_DATA_RUNTIME_MANIFEST_PATH
);
const previewDataMock = goldenPreviewBundle.files.find(
  ({ path }) => path === dataMockBundlePath
);
const buildDataMock = goldenBuildBundle.files.find(
  ({ path }) => path === dataMockBundlePath
);
if (!previewDataMock || buildDataMock)
  throw new Error(
    'Golden rootless profile-specific Data mock projection is invalid.'
  );
const previewDataRuntime = goldenPreviewBundle.files.find(
  ({ path }) => path === dataRuntimeBundlePath
);
const buildDataRuntime = goldenBuildBundle.files.find(
  ({ path }) => path === dataRuntimeBundlePath
);
const dataRuntimeMode = (
  file: (typeof goldenBuildBundle.files)[number] | undefined
): unknown =>
  file
    ? (JSON.parse(Buffer.from(file.contents).toString('utf8')) as unknown)
    : undefined;
if (
  JSON.stringify(dataRuntimeMode(previewDataRuntime)) !==
    JSON.stringify({
      format: 'prodivix.executable-data-runtime.v1',
      mode: 'mock',
    }) ||
  JSON.stringify(dataRuntimeMode(buildDataRuntime)) !==
    JSON.stringify({
      format: 'prodivix.executable-data-runtime.v1',
      mode: 'live',
    })
)
  throw new Error(
    'Golden rootless profile-specific Data runtime manifests are invalid.'
  );
const profileSpecificDataPaths = new Set([
  dataMockBundlePath,
  dataRuntimeBundlePath,
]);
if (
  JSON.stringify(
    bundleFacts(
      goldenPreviewBundle.files.filter(
        ({ path }) => !profileSpecificDataPaths.has(path)
      )
    )
  ) !==
  JSON.stringify(
    bundleFacts(
      goldenBuildBundle.files.filter(
        ({ path }) => !profileSpecificDataPaths.has(path)
      )
    )
  )
)
  throw new Error(
    'Golden rootless Preview and Build shared output facts diverged.'
  );

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
  terminal: {
    connected: terminalConnected,
    tty: terminalOutput.includes('PRODIVIX_TERMINAL_TTY_V1'),
    resized: terminalOutput.includes('PRODIVIX_TERMINAL_SIZE_31_101_V1'),
    filesystemEphemeral: terminalOutput.includes(
      'PRODIVIX_TERMINAL_FS_LOCAL_V1'
    ),
    filesystemDiffChange: {
      kind: terminalFileChange.kind,
      path: terminalFileChange.path,
      size: terminalFileChange.runtime?.size,
    },
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
  serverFunctionArtifact: {
    artifactId: serverFunctionArtifacts.primary.artifactId,
    mediaType: serverFunctionArtifacts.primary.mediaType,
    size: serverFunctionArtifacts.primary.contents.byteLength,
    metadata: serverFunctionArtifacts.primary.metadata,
    sourceTraceCount: serverFunctionArtifacts.primary.sourceTrace?.length ?? 0,
    result: serverFunctionResponse,
    installNetworkTraceCount: serverFunctionResult.networkTraces.length,
    runtimeNetwork: 'none-verified',
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
      filesystemChangeCount: goldenPreview.filesystemDiff.changes.length,
      filesystemCaptureComplete: goldenPreview.filesystemDiff.complete,
    },
    build: {
      artifactId: goldenBuildArtifact.artifactId,
      fileCount: goldenBuildBundle.files.length,
      sourceTraceCount: goldenBuildArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenBuild.networkTraces.length,
      filesystemChangeCount: goldenBuild.filesystemDiff.changes.length,
      filesystemCaptureComplete: goldenBuild.filesystemDiff.complete,
    },
    test: {
      artifactId: goldenTestArtifact.artifactId,
      status: goldenTestReport.status,
      summary: goldenTestReport.summary,
      sourceTraceCount: goldenTestArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenTest.networkTraces.length,
      filesystemChangeCount: goldenTest.filesystemDiff.changes.length,
      filesystemCaptureComplete: goldenTest.filesystemDiff.complete,
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
