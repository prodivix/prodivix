import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionTestReport,
  toExecutionTestReportValue,
} from '@prodivix/runtime-core';
import type { RemoteExecutionClaimResult } from '@prodivix/runtime-remote';
import { createFilesystemProcessSandbox } from './filesystemProcessSandbox';
import { createRemoteWorkerAgent } from './workerAgent';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerSandbox,
} from './worker.types';

const snapshot = createExecutableProjectSnapshot({
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: { workspace: '1' },
  },
  target: { presetId: 'node-test', framework: 'node', runtime: 'node' },
  files: [{ path: 'package.json', contents: '{"private":true}' }],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [{ kind: 'build', path: 'package.json' }],
  capabilityRequirements: {
    preview: ['filesystem'],
    build: ['filesystem', 'build'],
    test: ['filesystem', 'test'],
  },
  publicBuildConfiguration: [],
  resourceHints: {},
  cacheHints: { dependencyInstall: 'isolated' },
  installCommand: { command: 'node', args: ['-e', 'process.exit(0)'] },
  buildCommand: {
    command: 'node',
    args: ['-e', "process.stdout.write('secret-value:' + 'x'.repeat(64))"],
  },
});

const provider = createExecutionProviderDescriptor({
  id: 'remote-worker-test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['build'],
  runtimeZones: ['build'],
  invocationKinds: ['build'],
  capabilities: ['filesystem', 'build'],
});
const request = createExecutionRequest({
  requestId: 'request-1',
  profile: 'build',
  runtimeZone: 'build',
  workspace: snapshot.workspace,
  invocation: {
    kind: 'build',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
  },
  requiredCapabilities: ['filesystem', 'build'],
});

const claim = (): RemoteExecutionClaimResult => ({
  lease: {
    workerId: 'worker-1',
    token: 'lease-1',
    attempt: 1,
    acquiredAt: 1,
    expiresAt: 100,
  },
  execution: {
    ownerId: 'owner-1',
    identityKey: 'identity-1',
    request,
    snapshotId: snapshot.workspace.snapshotId,
    record: {
      executionId: 'execution-1',
      requestId: request.requestId,
      snapshotDigest: snapshot.contentDigest,
      provider,
      status: 'starting',
      latestCursor: 2,
      createdAt: 1,
      startedAt: 2,
    },
    events: [],
    artifacts: [],
    cancellationIds: [],
    lease: {
      workerId: 'worker-1',
      token: 'lease-1',
      attempt: 1,
      acquiredAt: 1,
      expiresAt: 100,
    },
  },
});

describe('remote runner worker', () => {
  it('materializes, executes argv without a shell, redacts output, budgets it, and cleans up', async () => {
    const parent = await mkdtemp(resolve(tmpdir(), 'prodivix-worker-test-'));
    try {
      const result = await createFilesystemProcessSandbox({
        rootDirectory: parent,
      }).execute({
        executionId: 'execution-1',
        snapshot,
        profile: 'build',
        timeoutMs: 10_000,
        maximumOutputBytes: 32,
        redactValues: ['secret-value'],
        signal: new AbortController().signal,
      });
      expect(result.status).toBe('succeeded');
      expect(result.stdout).toContain('[REDACTED]');
      expect(result.stdout).not.toContain('secret-value');
      expect(result.outputTruncated).toBe(true);
      await expect(readdir(parent)).resolves.toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('transitions a claimed execution through running to its terminal result', async () => {
    const transitions: string[] = [];
    const eventKinds: string[] = [];
    let claimed = false;
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return claim();
      },
      async renew() {
        return { lease: claim().lease, cancellationRequested: false };
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        transitions.push(input.status);
        return true;
      },
      async appendEvent(input) {
        eventKinds.push(input.event.kind);
        return 'stored';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute() {
        return {
          status: 'succeeded',
          stdout: 'build complete',
          stderr: '',
          outputTruncated: true,
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual(['running', 'succeeded']);
    expect(eventKinds).toEqual(['log', 'log']);
    await expect(agent.pollOnce()).resolves.toBe(false);
  });

  it('publishes sanitized install Network metadata as a transport-neutral trace', async () => {
    const events: Parameters<
      RemoteWorkerControlPlaneClient['appendEvent']
    >[0]['event'][] = [];
    let claimed = false;
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return claim();
      },
      async renew() {
        return { lease: claim().lease, cancellationRequested: false };
      },
      async snapshot() {
        return snapshot;
      },
      async transition() {
        return true;
      },
      async appendEvent(input) {
        events.push(input.event);
        return 'stored';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute() {
        return {
          status: 'succeeded',
          stdout: '',
          stderr: '',
          outputTruncated: false,
          networkTraces: [
            {
              requestId: 'install-trace-1:1',
              method: 'CONNECT',
              sanitizedUrl: 'https://registry.npmjs.org/',
              protocol: 'https',
              startedAt: 100,
              completedAt: 125,
              outcome: 'allowed',
              status: 200,
              requestBytes: 12,
              responseBytes: 24,
            },
          ],
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(events).toEqual([
      {
        kind: 'trace',
        trace: expect.objectContaining({
          name: 'network.request',
          phase: 'event',
          detail: expect.objectContaining({
            format: 'prodivix.execution-network-trace.v1',
            phase: 'dependency-install',
            runtimeZone: 'build',
            sanitizedUrl: 'https://registry.npmjs.org/',
            redacted: true,
          }),
        }),
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/authorization|cookie|token=/u);
  });

  it('aborts the sandbox and never publishes terminal state after lease loss', async () => {
    const transitions: string[] = [];
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        return claim();
      },
      async renew() {
        return undefined;
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        transitions.push(input.status);
        return true;
      },
      async appendEvent() {
        return 'stored';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute(input) {
        await new Promise<void>((resolveAbort) =>
          input.signal.addEventListener('abort', () => resolveAbort(), {
            once: true,
          })
        );
        return {
          status: 'cancelled',
          stdout: '',
          stderr: '',
          outputTruncated: false,
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 30,
      heartbeatIntervalMs: 5,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual(['running']);
  });

  it('terminates work and publishes cancelled after an authenticated cancellation heartbeat', async () => {
    const transitions: string[] = [];
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        return claim();
      },
      async renew() {
        return { lease: claim().lease, cancellationRequested: true };
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        transitions.push(input.status);
        return true;
      },
      async appendEvent() {
        return 'stored';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute(input) {
        await new Promise<void>((resolveAbort) =>
          input.signal.addEventListener('abort', () => resolveAbort(), {
            once: true,
          })
        );
        return {
          status: 'cancelled',
          stdout: '',
          stderr: '',
          outputTruncated: false,
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 30,
      heartbeatIntervalMs: 5,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual(['running', 'cancelled']);
  });

  it('fails deterministically when durable output budget is exhausted', async () => {
    const transitions: Array<{ status: string; reason?: string }> = [];
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        return claim();
      },
      async renew() {
        return { lease: claim().lease, cancellationRequested: false };
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
        return true;
      },
      async appendEvent() {
        return 'budget-exceeded';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox: {
        async execute() {
          return {
            status: 'succeeded',
            stdout: 'too much output',
            stderr: '',
            outputTruncated: false,
          };
        },
      },
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'running', reason: undefined },
      { status: 'failed', reason: 'output-budget-exceeded' },
    ]);
  });

  it('publishes a canonical test.report trace before uploading the report artifact', async () => {
    const testProvider = createExecutionProviderDescriptor({
      id: 'remote-worker-test-report',
      version: '1',
      isolation: 'remote-isolated',
      profiles: ['test'],
      runtimeZones: ['test'],
      invocationKinds: ['test'],
      capabilities: ['artifacts', 'filesystem', 'test'],
    });
    const testRequest = createExecutionRequest({
      requestId: 'request-test-report',
      profile: 'test',
      runtimeZone: 'test',
      workspace: snapshot.workspace,
      invocation: {
        kind: 'test',
        targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
      requiredCapabilities: ['artifacts', 'filesystem', 'test'],
    });
    const testClaim = (): RemoteExecutionClaimResult => {
      const base = claim();
      return {
        ...base,
        execution: {
          ...base.execution,
          request: testRequest,
          record: {
            ...base.execution.record,
            requestId: testRequest.requestId,
            provider: testProvider,
          },
        },
      };
    };
    const report = createExecutionTestReport({
      reportId: 'report-1',
      tool: { name: 'vitest' },
      completedAt: 2_000,
      files: [
        {
          fileId: 'src/App.test.tsx',
          path: 'src/App.test.tsx',
          status: 'passed',
          cases: [
            {
              caseId: 'src/App.test.tsx#1',
              name: 'renders',
              status: 'passed',
            },
          ],
        },
      ],
    });
    const events: Array<
      Parameters<RemoteWorkerControlPlaneClient['appendEvent']>[0]['event']
    > = [];
    const operationOrder: string[] = [];
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        return testClaim();
      },
      async renew() {
        return { lease: testClaim().lease, cancellationRequested: false };
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        operationOrder.push(`transition:${input.status}`);
        return true;
      },
      async appendEvent(input) {
        operationOrder.push(`event:${input.event.kind}`);
        events.push(input.event);
        return 'stored';
      },
      async uploadArtifact() {
        operationOrder.push('artifact');
        return 'stored';
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: testProvider.id,
      client,
      sandbox: {
        async execute() {
          return {
            status: 'succeeded',
            stdout: '',
            stderr: '',
            outputTruncated: false,
            artifacts: [
              {
                artifactId: 'test-report',
                kind: 'report',
                mediaType: 'application/vnd.prodivix.test-report+json',
                sourceTrace: [
                  {
                    sourceRef: {
                      kind: 'workspace',
                      workspaceId: 'workspace-1',
                    },
                  },
                ],
                contents: Buffer.from(
                  JSON.stringify(toExecutionTestReportValue(report)),
                  'utf8'
                ),
              },
            ],
          };
        },
      },
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(operationOrder).toEqual([
      'transition:running',
      'event:trace',
      'artifact',
      'transition:succeeded',
    ]);
    expect(events[0]).toMatchObject({
      kind: 'trace',
      trace: {
        name: 'test.report',
        detail: { kind: 'test-report', status: 'passed' },
      },
    });
  });

  it('fails deterministically when durable artifact budget is exhausted', async () => {
    const transitions: Array<{ status: string; reason?: string }> = [];
    let uploadedDescriptor:
      | Parameters<
          RemoteWorkerControlPlaneClient['uploadArtifact']
        >[0]['descriptor']
      | undefined;
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        return claim();
      },
      async renew() {
        return { lease: claim().lease, cancellationRequested: false };
      },
      async snapshot() {
        return snapshot;
      },
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
        return true;
      },
      async appendEvent() {
        return 'stored';
      },
      async uploadArtifact(input) {
        uploadedDescriptor = input.descriptor;
        return 'budget-exceeded';
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-1',
      providerId: provider.id,
      client,
      sandbox: {
        async execute() {
          return {
            status: 'succeeded',
            stdout: '',
            stderr: '',
            outputTruncated: false,
            artifacts: [
              {
                artifactId: 'artifact-1',
                kind: 'bundle',
                mediaType: 'application/zip',
                contents: new Uint8Array([1]),
              },
            ],
          };
        },
      },
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      artifactRetentionMs: 5_000,
      now: () => 2_000,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'running', reason: undefined },
      { status: 'failed', reason: 'artifact-budget-exceeded' },
    ]);
    expect(uploadedDescriptor).toEqual({
      artifactId: 'artifact-1',
      kind: 'bundle',
      mediaType: 'application/zip',
      size: 1,
      digest:
        'sha256-4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
      expiresAt: 7_000,
      authorizationScope: 'execution:execution-1',
    });
  });
});
