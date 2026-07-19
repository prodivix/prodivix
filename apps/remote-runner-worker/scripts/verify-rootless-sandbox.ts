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
  projectExecutableProjectRuntimeFiles,
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
  ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_DIRECTORY,
  ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_MAX_BYTES,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  normalizeServerRuntimeTestProvision,
  readIsolatedServerFunctionPlan,
  readIsolatedServerFunctionExecutionContext,
  readIsolatedServerFunctionExecutionResponse,
} from '@prodivix/server-runtime';
import {
  createRootlessPodmanSandbox,
  verifyRootlessPodmanEngine,
} from '../src/rootlessPodmanSandbox';

const execFileAsync = promisify(execFile);
const snapshotContractOnly =
  process.env.PRODIVIX_ROOTLESS_SNAPSHOT_CONTRACT_ONLY === '1';
const rootlessSecretCanary = 'rootless-secret-material-canary';
const serverFunctionProbeTimeoutMs = 45_000;
const podman = process.env.PRODIVIX_ROOTLESS_PODMAN_COMMAND ?? 'podman';
const baseImage =
  process.env.PRODIVIX_ROOTLESS_BASE_IMAGE ??
  'docker.io/library/node:22-bookworm-slim';
const gateImage = 'localhost/prodivix-remote-sandbox:gate';
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const evidencePath = process.env.PRODIVIX_ROOTLESS_EVIDENCE_PATH;
const goldenSnapshotPath =
  process.env.PRODIVIX_GOLDEN_SNAPSHOT_PATH?.trim() ||
  (snapshotContractOnly ? 'contract-only' : undefined);
const goldenCatalogSnapshotPath =
  process.env.PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH?.trim() ||
  (snapshotContractOnly ? 'contract-only' : undefined);
const installNetworkName =
  process.env.PRODIVIX_ROOTLESS_INSTALL_NETWORK?.trim() ||
  (snapshotContractOnly ? 'contract-only' : undefined);
const installProxyUrl =
  process.env.PRODIVIX_ROOTLESS_INSTALL_PROXY_URL?.trim() ||
  (snapshotContractOnly ? 'http://contract-only.invalid/' : undefined);
const installProxyContainer =
  process.env.PRODIVIX_ROOTLESS_INSTALL_PROXY_CONTAINER?.trim() ||
  (snapshotContractOnly ? 'contract-only' : undefined);
if (!goldenSnapshotPath)
  throw new TypeError('PRODIVIX_GOLDEN_SNAPSHOT_PATH is required.');
if (!goldenCatalogSnapshotPath)
  throw new TypeError('PRODIVIX_GOLDEN_CATALOG_SNAPSHOT_PATH is required.');
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
  JSON.stringify(authority.permissions) !== JSON.stringify(['workspace.owner', 'workspace.read', 'workspace.write']) ||
  !authority.permissions.includes('workspace.read') ||
  authority.expiresAt <= Date.now())
  throw new TypeError('workspace.read + Secret Server Function Gate authority is invalid.');
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

const isolatedWorkspaceReadServerFunctionSource = String.raw`
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const request = JSON.parse(fs.readFileSync('/workspace/.prodivix/server-function-invocation.json', 'utf8'));
const authorityPath = '/workspace/.prodivix/server-function-authority.json';
const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
fs.rmSync(authorityPath);
if (JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify(['expiresAt', 'format', 'permissions', 'principal', 'snapshotId', 'workspaceId']) ||
  JSON.stringify(Object.keys(authority.principal ?? {}).sort()) !== JSON.stringify(['principalId', 'providerId']) ||
  authority.format !== 'prodivix.isolated-server-function-authority.v1' ||
  authority.workspaceId !== 'workspace-gate-server-function-read' ||
  authority.snapshotId !== 'snapshot-gate-server-function-read' ||
  JSON.stringify(authority.permissions) !== JSON.stringify(['workspace.read']) ||
  !authority.permissions.includes('workspace.read') ||
  authority.expiresAt <= Date.now())
  throw new TypeError('workspace.read Server Function Gate authority is invalid.');
if (fs.existsSync('/workspace/.prodivix/server-function-secrets.json'))
  throw new TypeError('workspace.read unexpectedly received Secret material.');
const validateInput = new Ajv2020({ strict: true }).compile({
  type: 'object', required: ['name'], properties: { name: { type: 'string' } }, additionalProperties: false,
});
if (!validateInput(request.input)) throw new TypeError('workspace.read Server Function Gate input is invalid.');
const { getWorkspaceLabel } = await import('./function.mjs');
const result = await getWorkspaceLabel(request.input, Object.freeze({ principal: authority.principal }));
fs.mkdirSync('/workspace/.prodivix', { recursive: true });
fs.writeFileSync('/workspace/.prodivix/server-function-result.json', JSON.stringify({
  type: 'prodivix.execution-server-function-gateway-response.v1',
  requestId: request.requestId,
  ok: true,
  result,
}));
`;

const isolatedSourceMutationTargetPath = `${ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_DIRECTORY}/module-002.ts`;
const isolatedSourceMutationInitialSource =
  "export const rootlessProjectValue = 'before';\n";
const isolatedSourceMutationReplacementSource =
  "export const rootlessProjectValue = 'after';\n";
const isolatedSourceMutationServerFunctionSource = String.raw`
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const request = JSON.parse(fs.readFileSync('/workspace/.prodivix/server-function-invocation.json', 'utf8'));
const authorityPath = '/workspace/.prodivix/server-function-authority.json';
const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
fs.rmSync(authorityPath);
if (JSON.stringify(Object.keys(authority).sort()) !== JSON.stringify(['expiresAt', 'format', 'permissions', 'principal', 'snapshotId', 'workspaceId']) ||
  JSON.stringify(Object.keys(authority.principal ?? {}).sort()) !== JSON.stringify(['principalId', 'providerId']) ||
  authority.format !== 'prodivix.isolated-server-function-authority.v1' ||
  authority.workspaceId !== 'workspace-gate-server-function-write' ||
  authority.snapshotId !== 'snapshot-gate-server-function-write' ||
  JSON.stringify(authority.permissions) !== JSON.stringify(['workspace.owner', 'workspace.read', 'workspace.write']) ||
  !authority.permissions.includes('workspace.write') ||
  authority.expiresAt <= Date.now())
  throw new TypeError('workspace.write Server Function Gate authority is invalid.');
if (fs.existsSync('/workspace/.prodivix/server-function-secrets.json'))
  throw new TypeError('workspace.write unexpectedly received Secret material.');
const validateInput = new Ajv2020({ strict: true }).compile({
  type: 'object', required: ['source'], properties: { source: { type: 'string' } }, additionalProperties: false,
});
if (!validateInput(request.input)) throw new TypeError('workspace.write Server Function Gate input is invalid.');
let mutationCompleted = false;
const replaceProjectSource = async (mutation) => {
  if (mutationCompleted ||
    JSON.stringify(Object.keys(mutation ?? {}).sort()) !== JSON.stringify(['artifactId', 'source']) ||
    mutation.artifactId !== 'code-rootless-source-target' ||
    typeof mutation.source !== 'string' || mutation.source.includes('\0') ||
    Buffer.byteLength(mutation.source, 'utf8') > ${ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_MAX_BYTES})
    throw new TypeError('workspace.write project-source mutation is invalid.');
  fs.writeFileSync('/workspace/${isolatedSourceMutationTargetPath}', mutation.source, 'utf8');
  mutationCompleted = true;
};
const { replaceRootlessProjectSource } = await import('./function.mjs');
const result = await replaceRootlessProjectSource(
  request.input,
  Object.freeze({ principal: authority.principal, replaceProjectSource }),
);
if (!mutationCompleted) throw new TypeError('workspace.write source mutation is required.');
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
            auth: { kind: 'permission', permissionId: 'workspace.read' },
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
      permissions: ['workspace.owner', 'workspace.read', 'workspace.write'],
      expiresAt: Date.now() + 60_000,
    }),
    secrets: {
      format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
      fields: { signingKey: rootlessSecretCanary },
    },
  });
};

const isolatedWorkspaceReadServerFunctionFixture = () => {
  const base = isolatedServerFunctionFixture().snapshot;
  const functionRef = Object.freeze({
    artifactId: 'code-rootless-workspace-read',
    exportName: 'getWorkspaceLabel',
  });
  const workspace = Object.freeze({
    workspaceId: 'workspace-gate-server-function-read',
    snapshotId: 'snapshot-gate-server-function-read',
    partitionRevisions: Object.freeze({ workspace: '1' }),
  });
  const readSnapshot = createExecutableProjectSnapshot({
    workspace,
    target: base.target,
    files: base.files.map((file) => {
      if (file.path === 'src/.prodivix/server-runtime/invoke.mjs')
        return {
          ...file,
          contents: isolatedWorkspaceReadServerFunctionSource,
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact' as const,
                artifactId: functionRef.artifactId,
              },
            },
          ],
        };
      if (file.path === 'src/.prodivix/server-runtime/function.mjs')
        return {
          ...file,
          contents:
            "import { workspaceLabel } from './modules/module-001.mjs';\nexport const getWorkspaceLabel = async (input, context) => ({ kind: 'value', value: { label: workspaceLabel(input.name) + ' ' + context.principal.principalId } });\n",
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact' as const,
                artifactId: functionRef.artifactId,
              },
            },
          ],
        };
      if (file.path === 'src/.prodivix/server-runtime/modules/module-001.mjs')
        return {
          ...file,
          contents: "export const workspaceLabel = (name) => 'Read ' + name;\n",
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact' as const,
                artifactId: 'code-rootless-workspace-read-helper',
              },
            },
          ],
        };
      return file;
    }),
    dependencyPlan: {
      manifestFilePath: base.dependencyPlan.manifestFilePath,
      ...(base.dependencyPlan.lockFilePath
        ? { lockFilePath: base.dependencyPlan.lockFilePath }
        : {}),
    },
    entrypoints: base.entrypoints,
    capabilityRequirements: {
      ...base.capabilityRequirements,
      production: base.capabilityRequirements.production.filter(
        (capability) => capability !== 'environment-binding'
      ),
    },
    publicBuildConfiguration: base.publicBuildConfiguration,
    resourceHints: base.resourceHints,
    cacheHints: base.cacheHints,
    installCommand: base.installCommand,
    previewCommand: base.previewCommand,
    buildCommand: base.buildCommand,
    previewPlan: base.previewPlan,
    buildPlan: base.buildPlan,
    testPlan: base.testPlan,
    serverFunctionPlan: {
      ...base.serverFunctionPlan!,
      functionRef,
      runtimeManifest: {
        schemaVersion: '1.0',
        functionsByExport: {
          getWorkspaceLabel: {
            kind: 'function',
            runtimeZone: 'server',
            adapterId: 'prodivix.code-export',
            effect: 'read',
            auth: { kind: 'permission', permissionId: 'workspace.read' },
            inputSchema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
              additionalProperties: false,
            },
            outputSchema: {
              type: 'object',
              required: ['label'],
              properties: { label: { type: 'string' } },
              additionalProperties: false,
            },
          },
        },
      },
    },
  });
  const request = createExecutionRequest({
    requestId: 'remote-gate-server-function-read',
    profile: 'production',
    runtimeZone: 'server',
    workspace: readSnapshot.workspace,
    invocation: {
      kind: 'code',
      targetRef: { kind: 'code-artifact', artifactId: functionRef.artifactId },
      entrypoint: functionRef.exportName,
      input: {
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
        requestId: 'gate-server-function-read:1',
        invocationId: 'gate-server-function-read',
        attempt: 1,
        functionRef,
        input: { name: 'Workspace' },
      },
    },
    requiredCapabilities: ['server-function'],
  });
  return Object.freeze({
    snapshot: readSnapshot,
    request,
    authority: createIsolatedServerFunctionAuthority({
      workspaceId: workspace.workspaceId,
      snapshotId: workspace.snapshotId,
      principal: {
        providerId: 'prodivix-product-session',
        principalId: 'user-1',
      },
      permissions: ['workspace.read'],
      expiresAt: Date.now() + 60_000,
    }),
  });
};

const isolatedSourceMutationServerFunctionFixture = () => {
  const base = isolatedServerFunctionFixture().snapshot;
  const functionRef = Object.freeze({
    artifactId: 'code-rootless-source-mutation-action',
    exportName: 'replaceRootlessProjectSource',
  });
  const targetArtifactId = 'code-rootless-source-target';
  const workspace = Object.freeze({
    workspaceId: 'workspace-gate-server-function-write',
    snapshotId: 'snapshot-gate-server-function-write',
    partitionRevisions: Object.freeze({
      workspace: '1',
      route: '1',
      [`document:${functionRef.artifactId}:content`]: '1',
      [`document:${functionRef.artifactId}:meta`]: '1',
      [`document:${targetArtifactId}:content`]: '1',
      [`document:${targetArtifactId}:meta`]: '1',
    }),
  });
  const sourceTrace = [
    {
      sourceRef: {
        kind: 'code-artifact' as const,
        artifactId: targetArtifactId,
      },
    },
  ];
  const mutationSnapshot = createExecutableProjectSnapshot({
    workspace,
    target: base.target,
    files: [
      ...base.files.map((file) => {
        if (file.path === 'src/.prodivix/server-runtime/invoke.mjs')
          return {
            ...file,
            contents: isolatedSourceMutationServerFunctionSource,
            sourceTrace: [
              {
                sourceRef: {
                  kind: 'code-artifact' as const,
                  artifactId: functionRef.artifactId,
                },
              },
            ],
          };
        if (file.path === 'src/.prodivix/server-runtime/function.mjs')
          return {
            ...file,
            contents:
              "import { rootlessProjectValue } from './modules/module-001.mjs';\nexport const replaceRootlessProjectSource = async (input, context) => { await context.replaceProjectSource({ artifactId: 'code-rootless-source-target', source: input.source }); return { kind: 'value', value: { updated: rootlessProjectValue === 'before' } }; };\n",
            sourceTrace: [
              {
                sourceRef: {
                  kind: 'code-artifact' as const,
                  artifactId: functionRef.artifactId,
                },
              },
            ],
          };
        if (file.path === 'src/.prodivix/server-runtime/modules/module-001.mjs')
          return {
            ...file,
            contents: "export const rootlessProjectValue = 'before';\n",
            sourceTrace,
          };
        return file;
      }),
      {
        path: isolatedSourceMutationTargetPath,
        contents: isolatedSourceMutationInitialSource,
        sourceTrace,
      },
    ],
    dependencyPlan: {
      manifestFilePath: base.dependencyPlan.manifestFilePath,
      ...(base.dependencyPlan.lockFilePath
        ? { lockFilePath: base.dependencyPlan.lockFilePath }
        : {}),
    },
    entrypoints: base.entrypoints,
    capabilityRequirements: {
      ...base.capabilityRequirements,
      production: base.capabilityRequirements.production.filter(
        (capability) => capability !== 'environment-binding'
      ),
    },
    publicBuildConfiguration: base.publicBuildConfiguration,
    resourceHints: base.resourceHints,
    cacheHints: base.cacheHints,
    installCommand: base.installCommand,
    previewCommand: base.previewCommand,
    buildCommand: base.buildCommand,
    previewPlan: base.previewPlan,
    buildPlan: base.buildPlan,
    testPlan: base.testPlan,
    serverFunctionPlan: {
      ...base.serverFunctionPlan!,
      functionRef,
      runtimeManifest: {
        schemaVersion: '1.0',
        functionsByExport: {
          replaceRootlessProjectSource: {
            kind: 'route-action',
            runtimeZone: 'server',
            adapterId: 'prodivix.code-export',
            effect: 'mutation',
            auth: { kind: 'permission', permissionId: 'workspace.write' },
            inputSchema: {
              type: 'object',
              required: ['source'],
              properties: { source: { type: 'string' } },
              additionalProperties: false,
            },
            outputSchema: {
              type: 'object',
              required: ['updated'],
              properties: { updated: { const: true } },
              additionalProperties: false,
            },
            idempotency: { kind: 'invocation-key' },
          },
        },
      },
    },
  });
  const request = createExecutionRequest({
    requestId: 'remote-gate-server-function-write',
    profile: 'production',
    runtimeZone: 'server',
    workspace: mutationSnapshot.workspace,
    invocation: {
      kind: 'code',
      targetRef: { kind: 'code-artifact', artifactId: functionRef.artifactId },
      entrypoint: functionRef.exportName,
      input: {
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
        requestId: 'gate-server-function-write:1',
        invocationId: 'gate-server-function-write',
        attempt: 1,
        functionRef,
        input: { source: isolatedSourceMutationReplacementSource },
      },
    },
    requiredCapabilities: ['server-function'],
  });
  return Object.freeze({
    snapshot: mutationSnapshot,
    request,
    authority: createIsolatedServerFunctionAuthority({
      workspaceId: workspace.workspaceId,
      snapshotId: workspace.snapshotId,
      principal: {
        providerId: 'prodivix-product-session',
        principalId: 'user-1',
      },
      permissions: ['workspace.owner', 'workspace.read', 'workspace.write'],
      expiresAt: Date.now() + 60_000,
    }),
    actionArtifactId: functionRef.artifactId,
    targetArtifactId,
  });
};

if (snapshotContractOnly) {
  const readSecretFixture = isolatedServerFunctionFixture();
  const readSecretPlan = readIsolatedServerFunctionPlan(
    readSecretFixture.snapshot.serverFunctionPlan
  );
  if (
    !readSecretPlan ||
    readSecretPlan.definition.auth.kind !== 'permission' ||
    readSecretPlan.definition.auth.permissionId !== 'workspace.read' ||
    !readSecretPlan.definition.environment ||
    !readSecretFixture.snapshot.capabilityRequirements.production.includes(
      'environment-binding'
    ) ||
    readIsolatedServerFunctionExecutionContext(
      readSecretFixture.request,
      readSecretFixture.snapshot.serverFunctionPlan,
      { ...readSecretFixture.authority, permissions: ['workspace.owner'] }
    ) !== undefined
  )
    throw new Error(
      'Rootless workspace.read + Secret snapshot contract is invalid.'
    );
  const readFixture = isolatedWorkspaceReadServerFunctionFixture();
  const readPlan = readIsolatedServerFunctionPlan(
    readFixture.snapshot.serverFunctionPlan
  );
  if (
    !readPlan ||
    readPlan.definition.auth.kind !== 'permission' ||
    readPlan.definition.auth.permissionId !== 'workspace.read' ||
    readPlan.definition.environment !== undefined ||
    JSON.stringify(readFixture.authority.permissions) !==
      JSON.stringify(['workspace.read']) ||
    !readIsolatedServerFunctionExecutionContext(
      readFixture.request,
      readFixture.snapshot.serverFunctionPlan,
      readFixture.authority
    )
  )
    throw new Error('Rootless workspace.read snapshot contract is invalid.');
  const mutationFixture = isolatedSourceMutationServerFunctionFixture();
  const mutationPlan = readIsolatedServerFunctionPlan(
    mutationFixture.snapshot.serverFunctionPlan
  );
  if (
    !mutationPlan ||
    mutationPlan.definition.kind !== 'route-action' ||
    mutationPlan.definition.effect !== 'mutation' ||
    mutationPlan.definition.auth.kind !== 'permission' ||
    mutationPlan.definition.auth.permissionId !== 'workspace.write' ||
    mutationPlan.definition.idempotency?.kind !== 'invocation-key' ||
    mutationPlan.definition.environment !== undefined ||
    readIsolatedServerFunctionExecutionContext(
      mutationFixture.request,
      mutationFixture.snapshot.serverFunctionPlan,
      {
        ...mutationFixture.authority,
        permissions: readFixture.authority.permissions,
      }
    ) !== undefined ||
    !mutationFixture.snapshot.files.some(
      ({ path, sourceTrace: traces }) =>
        path === isolatedSourceMutationTargetPath &&
        traces?.length === 1 &&
        traces[0]?.sourceRef.kind === 'code-artifact' &&
        traces[0].sourceRef.artifactId === mutationFixture.targetArtifactId
    )
  )
    throw new Error('Rootless workspace.write snapshot contract is invalid.');
  const snapshotDigests = [mutationFixture.snapshot.contentDigest];
  if (
    goldenSnapshotPath !== 'contract-only' &&
    goldenCatalogSnapshotPath !== 'contract-only'
  ) {
    const goldenSnapshot = decodeRemoteExecutableProjectSnapshot(
      JSON.parse(await readFile(resolve(goldenSnapshotPath), 'utf8')) as unknown
    );
    const goldenCatalogSnapshot = decodeRemoteExecutableProjectSnapshot(
      JSON.parse(
        await readFile(resolve(goldenCatalogSnapshotPath), 'utf8')
      ) as unknown
    );
    const goldenCatalogServerProvision = normalizeServerRuntimeTestProvision(
      goldenCatalogSnapshot.serverRuntimeMockProvision
    );
    const catalogPreviewFiles = projectExecutableProjectRuntimeFiles(
      goldenCatalogSnapshot,
      'preview'
    );
    const catalogTestFiles = projectExecutableProjectRuntimeFiles(
      goldenCatalogSnapshot,
      'test'
    );
    const catalogBuildFiles = projectExecutableProjectRuntimeFiles(
      goldenCatalogSnapshot,
      'build'
    );
    const catalogTestSource = catalogTestFiles.find(
      ({ path }) => path === 'src/App.test.ts'
    )?.contents;
    const catalogAsset = goldenCatalogSnapshot.files.find(
      ({ path }) => path === 'public/catalog/product.png'
    );
    if (
      goldenSnapshot.target.presetId !== 'react-vite' ||
      !goldenSnapshot.entrypoints.some(({ kind }) => kind === 'preview') ||
      !goldenSnapshot.entrypoints.some(({ kind }) => kind === 'test') ||
      !goldenSnapshot.entrypoints.some(({ kind }) => kind === 'build') ||
      goldenCatalogSnapshot.target.presetId !== 'vue-vite' ||
      goldenCatalogSnapshot.dataMockProvision?.fixtureSetId !==
        'golden-g2-vue-catalog-crud' ||
      goldenCatalogServerProvision.fixtureSetId !==
        'golden-g2-vue-catalog-authenticated' ||
      !catalogAsset ||
      typeof catalogAsset.contents === 'string' ||
      !catalogPreviewFiles.some(
        ({ path, contents }) =>
          path === 'src/.prodivix/server-runtime-test-provision.ts' &&
          typeof contents === 'string' &&
          contents.includes('"mode":"disabled"')
      ) ||
      !catalogTestFiles.some(
        ({ path, contents }) =>
          path === 'src/.prodivix/server-runtime-test-provision.ts' &&
          typeof contents === 'string' &&
          contents.includes('"mode":"deterministic-test"')
      ) ||
      catalogBuildFiles.some(
        ({ path }) => path === 'public/.prodivix/data-mock-provision.json'
      ) ||
      typeof catalogTestSource !== 'string' ||
      !catalogTestSource.includes(
        'runs the exact mock CRUD journey through the shared standalone runtime'
      ) ||
      !catalogTestSource.includes(
        'runs authenticated Route guard/loader/action fixtures through the source-free Server Runtime adapter'
      )
    )
      throw new Error(
        'Rootless Golden snapshot contract projection is invalid.'
      );
    snapshotDigests.push(
      goldenSnapshot.contentDigest,
      goldenCatalogSnapshot.contentDigest
    );
  }
  process.stdout.write(`${snapshotDigests.join(' ')}\n`);
  process.exit(0);
}

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
  testArtifacts.primary.artifactId !== 'test-report:gate-test' ||
  testArtifacts.primary.kind !== 'report' ||
  testArtifacts.primary.mediaType !== EXECUTION_TEST_REPORT_MEDIA_TYPE ||
  testArtifacts.primary.metadata?.reportId !== 'test-report:gate-test' ||
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
  testReport.reportId !== 'test-report:gate-test' ||
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
  timeoutMs: serverFunctionProbeTimeoutMs,
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

const workspaceReadFixture = isolatedWorkspaceReadServerFunctionFixture();
const workspaceReadResult = await sandbox.execute({
  executionId: 'gate-server-function-read',
  snapshot: workspaceReadFixture.snapshot,
  request: workspaceReadFixture.request,
  serverFunctionAuthority: workspaceReadFixture.authority,
  profile: 'production',
  timeoutMs: serverFunctionProbeTimeoutMs,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (workspaceReadResult.status !== 'succeeded')
  throw new Error(
    `Rootless workspace.read Server Function probe failed: ${workspaceReadResult.stderr}`
  );
const workspaceReadArtifacts = requireExecutionArtifacts(
  workspaceReadResult,
  'Rootless workspace.read Server Function probe'
);
if (
  workspaceReadArtifacts.filesystemDiff.changes.some(({ path }) =>
    [
      '.prodivix/server-function-invocation.json',
      '.prodivix/server-function-result.json',
      ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
      ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
    ].includes(path)
  ) ||
  workspaceReadArtifacts.primary.mediaType !==
    ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
  !workspaceReadArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === 'code-rootless-workspace-read'
  ) ||
  !workspaceReadArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === 'code-rootless-workspace-read-helper'
  )
)
  throw new Error(
    'Rootless workspace.read transport or SourceTrace boundary is invalid.'
  );
const workspaceReadResponse = readIsolatedServerFunctionExecutionResponse(
  JSON.parse(
    Buffer.from(workspaceReadArtifacts.primary.contents).toString('utf8')
  ) as unknown,
  workspaceReadFixture.request,
  workspaceReadFixture.snapshot.serverFunctionPlan
);
if (
  !workspaceReadResponse?.ok ||
  workspaceReadResponse.result.kind !== 'value' ||
  JSON.stringify(workspaceReadResponse.result.value) !==
    JSON.stringify({ label: 'Read Workspace user-1' })
)
  throw new Error('Rootless workspace.read result content is invalid.');
await assertNoExecutionContainer('gate-server-function-read');

const sourceMutationFixture = isolatedSourceMutationServerFunctionFixture();
const sourceMutationResult = await sandbox.execute({
  executionId: 'gate-server-function-write',
  snapshot: sourceMutationFixture.snapshot,
  request: sourceMutationFixture.request,
  serverFunctionAuthority: sourceMutationFixture.authority,
  profile: 'production',
  timeoutMs: serverFunctionProbeTimeoutMs,
  maximumOutputBytes: 256 * 1024,
  redactValues: [],
  signal: new AbortController().signal,
});
if (sourceMutationResult.status !== 'succeeded')
  throw new Error(
    `Rootless workspace.write Server Function probe failed: ${sourceMutationResult.stderr}`
  );
if (
  !sourceMutationResult.networkTraces?.length ||
  sourceMutationResult.networkTraces.some(
    (trace) =>
      trace.sanitizedUrl !== 'https://registry.npmjs.org/' ||
      trace.outcome !== 'allowed'
  )
)
  throw new Error(
    'Rootless workspace.write install did not use the sanitized allowlist proxy.'
  );
const sourceMutationArtifacts = requireExecutionArtifacts(
  sourceMutationResult,
  'Rootless workspace.write Server Function probe'
);
const sourceMutationChange = sourceMutationArtifacts.filesystemDiff.changes[0];
if (
  sourceMutationArtifacts.filesystemDiff.changes.length !== 1 ||
  !sourceMutationArtifacts.filesystemDiff.complete ||
  sourceMutationChange?.kind !== 'modified' ||
  sourceMutationChange.path !== isolatedSourceMutationTargetPath ||
  Buffer.from(sourceMutationChange.baseline?.contents ?? []).toString(
    'utf8'
  ) !== isolatedSourceMutationInitialSource ||
  Buffer.from(sourceMutationChange.runtime?.contents ?? []).toString('utf8') !==
    isolatedSourceMutationReplacementSource ||
  sourceMutationChange.sourceTrace?.length !== 1 ||
  sourceMutationChange.sourceTrace[0]?.sourceRef.kind !== 'code-artifact' ||
  sourceMutationChange.sourceTrace[0].sourceRef.artifactId !==
    sourceMutationFixture.targetArtifactId
)
  throw new Error(
    'Rootless workspace.write did not produce one exact traced whole-file diff.'
  );
if (
  sourceMutationArtifacts.filesystemDiff.changes.some(({ path }) =>
    [
      '.prodivix/server-function-invocation.json',
      '.prodivix/server-function-result.json',
      ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
      ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
    ].includes(path)
  ) ||
  sourceMutationArtifacts.primary.mediaType !==
    ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
  !sourceMutationArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === sourceMutationFixture.actionArtifactId
  ) ||
  !sourceMutationArtifacts.primary.sourceTrace?.some(
    (trace) =>
      trace.sourceRef.kind === 'code-artifact' &&
      trace.sourceRef.artifactId === sourceMutationFixture.targetArtifactId
  )
)
  throw new Error(
    'Rootless workspace.write transport or SourceTrace boundary is invalid.'
  );
const sourceMutationResponse = readIsolatedServerFunctionExecutionResponse(
  JSON.parse(
    Buffer.from(sourceMutationArtifacts.primary.contents).toString('utf8')
  ) as unknown,
  sourceMutationFixture.request,
  sourceMutationFixture.snapshot.serverFunctionPlan
);
if (
  !sourceMutationResponse?.ok ||
  sourceMutationResponse.result.kind !== 'value' ||
  JSON.stringify(sourceMutationResponse.result.value) !==
    JSON.stringify({ updated: true }) ||
  JSON.stringify(sourceMutationResponse).includes(
    isolatedSourceMutationReplacementSource
  )
)
  throw new Error('Rootless workspace.write result content is invalid.');
await assertNoExecutionContainer('gate-server-function-write');

const goldenSnapshot = decodeRemoteExecutableProjectSnapshot(
  JSON.parse(
    await readFile(resolve(goldenSnapshotPath), { encoding: 'utf8' })
  ) as unknown
);
const executeRootlessSnapshot = async (
  snapshot: typeof goldenSnapshot,
  executionPrefix: string,
  label: string,
  profile: 'preview' | 'test' | 'build'
) => {
  const executionId = `${executionPrefix}-${profile}`;
  const result = await sandbox.execute({
    executionId,
    snapshot,
    profile,
    timeoutMs: 4 * 60_000,
    maximumOutputBytes: 16 * 1024 * 1024,
    redactValues: [],
    signal: new AbortController().signal,
  });
  if (result.status !== 'succeeded')
    throw new Error(
      `${label} rootless ${profile} failed ${JSON.stringify({
        status: result.status,
        exitCode: result.exitCode,
        reason: result.reason,
        outputTruncated: result.outputTruncated,
        artifactCount: result.artifacts?.length ?? 0,
      })}:\n${[result.stderr, result.stdout].filter(Boolean).join('\n')}`
    );
  const artifacts = requireExecutionArtifacts(
    result,
    `${label} rootless ${profile}`
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
      `${label} rootless ${profile} did not produce sanitized allowlisted install traces.`
    );
  await assertNoExecutionContainer(executionId);
  return Object.freeze({
    artifact: artifacts.primary,
    filesystemDiff: artifacts.filesystemDiff,
    networkTraces: result.networkTraces,
  });
};
const executeGolden = (profile: 'preview' | 'test' | 'build') =>
  executeRootlessSnapshot(goldenSnapshot, 'golden', 'Golden', profile);

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

const goldenCatalogSnapshot = decodeRemoteExecutableProjectSnapshot(
  JSON.parse(
    await readFile(resolve(goldenCatalogSnapshotPath), { encoding: 'utf8' })
  ) as unknown
);
const goldenCatalogServerProvision = normalizeServerRuntimeTestProvision(
  goldenCatalogSnapshot.serverRuntimeMockProvision
);
if (
  goldenCatalogSnapshot.target.presetId !== 'vue-vite' ||
  goldenCatalogSnapshot.dataMockProvision?.fixtureSetId !==
    'golden-g2-vue-catalog-crud' ||
  goldenCatalogServerProvision.fixtureSetId !==
    'golden-g2-vue-catalog-authenticated'
)
  throw new Error(
    'Authenticated Vue Catalog rootless snapshot identity is invalid.'
  );

const goldenCatalogPreview = await executeRootlessSnapshot(
  goldenCatalogSnapshot,
  'golden-catalog',
  'Authenticated Vue Catalog',
  'preview'
);
const goldenCatalogPreviewArtifact = goldenCatalogPreview.artifact;
const goldenCatalogPreviewBundle = decodeExecutionPreviewBundle(
  goldenCatalogPreviewArtifact.contents
);
if (
  goldenCatalogPreviewBundle.snapshotDigest !==
    goldenCatalogSnapshot.contentDigest ||
  goldenCatalogPreviewBundle.entryFilePath !==
    goldenCatalogSnapshot.previewPlan.entryFilePath ||
  !goldenCatalogPreviewArtifact.sourceTrace?.length
)
  throw new Error(
    'Authenticated Vue Catalog rootless Preview drifted from its exact snapshot.'
  );

const goldenCatalogBuild = await executeRootlessSnapshot(
  goldenCatalogSnapshot,
  'golden-catalog',
  'Authenticated Vue Catalog',
  'build'
);
const goldenCatalogBuildArtifact = goldenCatalogBuild.artifact;
const goldenCatalogBuildBundle = decodeExecutionBuildBundle(
  goldenCatalogBuildArtifact.contents
);
if (
  goldenCatalogBuildBundle.snapshotDigest !==
    goldenCatalogSnapshot.contentDigest ||
  !goldenCatalogBuildArtifact.sourceTrace?.length
)
  throw new Error(
    'Authenticated Vue Catalog rootless Build drifted from its exact snapshot.'
  );

const catalogAssetPath = 'catalog/product.png';
const catalogSnapshotAsset = goldenCatalogSnapshot.files.find(
  ({ path }) => path === `public/${catalogAssetPath}`
);
const catalogPreviewAsset = goldenCatalogPreviewBundle.files.find(
  ({ path }) => path === catalogAssetPath
);
const catalogBuildAsset = goldenCatalogBuildBundle.files.find(
  ({ path }) => path === catalogAssetPath
);
if (
  !catalogSnapshotAsset ||
  typeof catalogSnapshotAsset.contents === 'string' ||
  !catalogPreviewAsset ||
  !catalogBuildAsset ||
  !Buffer.from(catalogPreviewAsset.contents).equals(
    Buffer.from(catalogSnapshotAsset.contents)
  ) ||
  !Buffer.from(catalogBuildAsset.contents).equals(
    Buffer.from(catalogSnapshotAsset.contents)
  )
)
  throw new Error(
    'Authenticated Vue Catalog rootless Preview/Build changed exact Asset bytes.'
  );

const goldenCatalogTest = await executeRootlessSnapshot(
  goldenCatalogSnapshot,
  'golden-catalog',
  'Authenticated Vue Catalog',
  'test'
);
const goldenCatalogTestArtifact = goldenCatalogTest.artifact;
const goldenCatalogTestReport = readExecutionTestReportValue(
  JSON.parse(
    Buffer.from(goldenCatalogTestArtifact.contents).toString('utf8')
  ) as unknown
);
const goldenCatalogCaseNames =
  goldenCatalogTestReport?.files.flatMap((file) =>
    file.cases.map((testCase) => testCase.name)
  ) ?? [];
if (
  !goldenCatalogTestReport ||
  goldenCatalogTestReport.status !== 'passed' ||
  goldenCatalogTestReport.summary.failedCases !== 0 ||
  !goldenCatalogCaseNames.includes(
    'runs the exact mock CRUD journey through the shared standalone runtime'
  ) ||
  !goldenCatalogCaseNames.includes(
    'runs authenticated Route guard/loader/action fixtures through the source-free Server Runtime adapter'
  ) ||
  !goldenCatalogTestArtifact.sourceTrace?.length
)
  throw new Error(
    'Authenticated Vue Catalog rootless Test did not prove CRUD and Auth/Server semantics.'
  );

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
    requiredPermission: 'workspace.read',
    secretMaterial: 'one-shot-consumed',
    installNetworkTraceCount: serverFunctionResult.networkTraces.length,
    runtimeNetwork: 'none-verified',
  },
  workspaceReadServerFunctionArtifact: {
    artifactId: workspaceReadArtifacts.primary.artifactId,
    mediaType: workspaceReadArtifacts.primary.mediaType,
    size: workspaceReadArtifacts.primary.contents.byteLength,
    metadata: workspaceReadArtifacts.primary.metadata,
    sourceTraceCount: workspaceReadArtifacts.primary.sourceTrace?.length ?? 0,
    result: workspaceReadResponse,
    secretMaterial: 'none-verified',
    installNetworkTraceCount: sourceMutationResult.networkTraces.length,
    runtimeNetwork: 'none-verified',
  },
  workspaceWriteSourceMutationArtifact: {
    artifactId: sourceMutationArtifacts.primary.artifactId,
    mediaType: sourceMutationArtifacts.primary.mediaType,
    size: sourceMutationArtifacts.primary.contents.byteLength,
    metadata: sourceMutationArtifacts.primary.metadata,
    sourceTraceCount: sourceMutationArtifacts.primary.sourceTrace?.length ?? 0,
    result: sourceMutationResponse,
    filesystemDiff: {
      complete: sourceMutationArtifacts.filesystemDiff.complete,
      changeCount: sourceMutationArtifacts.filesystemDiff.changes.length,
      changeId: sourceMutationChange!.changeId,
      kind: sourceMutationChange!.kind,
      path: sourceMutationChange!.path,
      baselineSize: sourceMutationChange!.baseline?.size,
      runtimeSize: sourceMutationChange!.runtime?.size,
    },
    secretMaterial: 'none-verified',
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
  authenticatedCatalogGoldenJourney: {
    snapshotDigest: goldenCatalogSnapshot.contentDigest,
    target: goldenCatalogSnapshot.target,
    dataFixtureSetId: goldenCatalogSnapshot.dataMockProvision?.fixtureSetId,
    serverFixtureSetId: goldenCatalogServerProvision.fixtureSetId,
    exactAsset: {
      path: catalogAssetPath,
      size: catalogSnapshotAsset.contents.byteLength,
      previewDigest: catalogPreviewAsset.digest,
      buildDigest: catalogBuildAsset.digest,
    },
    preview: {
      artifactId: goldenCatalogPreviewArtifact.artifactId,
      entryFilePath: goldenCatalogPreviewBundle.entryFilePath,
      sourceTraceCount: goldenCatalogPreviewArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenCatalogPreview.networkTraces.length,
      filesystemCaptureComplete: goldenCatalogPreview.filesystemDiff.complete,
    },
    build: {
      artifactId: goldenCatalogBuildArtifact.artifactId,
      sourceTraceCount: goldenCatalogBuildArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenCatalogBuild.networkTraces.length,
      filesystemCaptureComplete: goldenCatalogBuild.filesystemDiff.complete,
    },
    test: {
      artifactId: goldenCatalogTestArtifact.artifactId,
      status: goldenCatalogTestReport.status,
      summary: goldenCatalogTestReport.summary,
      requiredCases: goldenCatalogCaseNames.filter(
        (name) =>
          name.includes('mock CRUD journey') ||
          name.includes('authenticated Route guard/loader/action')
      ),
      sourceTraceCount: goldenCatalogTestArtifact.sourceTrace?.length ?? 0,
      networkTraceCount: goldenCatalogTest.networkTraces.length,
      filesystemCaptureComplete: goldenCatalogTest.filesystemDiff.complete,
    },
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
