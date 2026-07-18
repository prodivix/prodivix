import {
  createCipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
} from '@prodivix/runtime-core';
import {
  REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT,
  remoteExecutionSecretEnvelopeAssociatedData,
  REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
  REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
  type RemoteExecutionClaimResult,
} from '@prodivix/runtime-remote';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  readServerFunctionInvocationTraceValue,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
} from '@prodivix/server-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteWorkerServerFunctionArtifact } from './serverFunctionArtifact';
import { createRemoteWorkerAgent } from './workerAgent';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerSandbox,
} from './worker.types';

const functionRef = Object.freeze({
  artifactId: 'code-server-greeting',
  exportName: 'getGreeting',
});

const snapshot = createExecutableProjectSnapshot({
  workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
  target: {
    presetId: 'isolated-server-function',
    framework: 'typescript',
    runtime: 'node',
  },
  files: [
    { path: 'package.json', contents: '{"private":true}' },
    {
      path: 'src/.prodivix/server-runtime/invoke.mjs',
      contents: 'export {};',
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
      contents: 'export const getGreeting = () => undefined;',
      sourceTrace: [
        {
          sourceRef: {
            kind: 'code-artifact',
            artifactId: functionRef.artifactId,
          },
        },
      ],
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
      'server-function',
      'source-trace',
      'streaming-logs',
      'timeout',
    ],
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
          auth: { kind: 'public' },
          inputSchema: true,
          outputSchema: true,
        },
      },
    },
  },
});

const request = createExecutionRequest({
  requestId: 'remote-server-function-1',
  profile: 'production',
  runtimeZone: 'server',
  workspace: snapshot.workspace,
  invocation: {
    kind: 'code',
    targetRef: {
      kind: 'code-artifact',
      artifactId: functionRef.artifactId,
    },
    entrypoint: functionRef.exportName,
    input: {
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'invocation-1:1',
      invocationId: 'invocation-1',
      attempt: 1,
      functionRef,
      input: { name: 'Ada' },
    },
  },
  requiredCapabilities: ['server-function'],
});

const protectedSnapshot = (
  auth:
    | Readonly<{ kind: 'authenticated' }>
    | Readonly<{ kind: 'permission'; permissionId: string }>
) =>
  createExecutableProjectSnapshot({
    workspace: snapshot.workspace,
    target: snapshot.target,
    files: snapshot.files,
    dependencyPlan: {
      manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
      ...(snapshot.dependencyPlan.lockFilePath
        ? { lockFilePath: snapshot.dependencyPlan.lockFilePath }
        : {}),
    },
    entrypoints: snapshot.entrypoints,
    capabilityRequirements: snapshot.capabilityRequirements,
    publicBuildConfiguration: snapshot.publicBuildConfiguration,
    resourceHints: snapshot.resourceHints,
    cacheHints: snapshot.cacheHints,
    installCommand: snapshot.installCommand,
    previewCommand: snapshot.previewCommand,
    buildCommand: snapshot.buildCommand,
    previewPlan: snapshot.previewPlan,
    buildPlan: snapshot.buildPlan,
    testPlan: snapshot.testPlan,
    serverFunctionPlan: {
      ...snapshot.serverFunctionPlan!,
      runtimeManifest: {
        schemaVersion: '1.0',
        functionsByExport: {
          getGreeting: {
            kind: 'function',
            runtimeZone: 'server',
            adapterId: 'prodivix.code-export',
            effect: 'read',
            auth,
            inputSchema: true,
            outputSchema: true,
          },
        },
      },
    },
  });

const authenticatedSnapshot = protectedSnapshot({ kind: 'authenticated' });
const permissionSnapshot = protectedSnapshot({
  kind: 'permission',
  permissionId: 'workspace.owner',
});

const authenticatedRequest = createExecutionRequest({
  ...request,
  workspace: authenticatedSnapshot.workspace,
  requestId: 'remote-authenticated-server-function-1',
});

const permissionRequest = createExecutionRequest({
  ...request,
  workspace: permissionSnapshot.workspace,
  requestId: 'remote-permission-server-function-1',
});

const secretCanary = 'worker-agent-secret-canary';
const secretSnapshot = createExecutableProjectSnapshot({
  workspace: snapshot.workspace,
  target: snapshot.target,
  files: snapshot.files,
  dependencyPlan: {
    manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
    ...(snapshot.dependencyPlan.lockFilePath
      ? { lockFilePath: snapshot.dependencyPlan.lockFilePath }
      : {}),
  },
  entrypoints: snapshot.entrypoints,
  capabilityRequirements: {
    ...snapshot.capabilityRequirements,
    production: [
      ...snapshot.capabilityRequirements.production,
      'environment-binding',
    ],
  },
  publicBuildConfiguration: snapshot.publicBuildConfiguration,
  resourceHints: snapshot.resourceHints,
  cacheHints: snapshot.cacheHints,
  installCommand: snapshot.installCommand,
  previewCommand: snapshot.previewCommand,
  buildCommand: snapshot.buildCommand,
  previewPlan: snapshot.previewPlan,
  buildPlan: snapshot.buildPlan,
  testPlan: snapshot.testPlan,
  serverFunctionPlan: {
    ...snapshot.serverFunctionPlan!,
    runtimeManifest: {
      schemaVersion: '1.0',
      functionsByExport: {
        getGreeting: {
          kind: 'function',
          runtimeZone: 'server',
          adapterId: 'prodivix.code-export',
          effect: 'read',
          auth: { kind: 'public' },
          inputSchema: true,
          outputSchema: true,
          environment: {
            secretsByField: {
              signingKey: { bindingId: 'webhook-signing-key' },
            },
          },
        },
      },
    },
  },
});
const secretRequest = createExecutionRequest({
  ...request,
  requestId: 'remote-secret-server-function-1',
  workspace: secretSnapshot.workspace,
  requiredCapabilities: ['environment-binding', 'server-function'],
});

const sealSecretEnvelope = (
  recipientPublicKey: string,
  identity: Readonly<{ workerId?: string; workerAttempt?: number }> = {}
) => {
  const ephemeral = generateKeyPairSync('x25519');
  const ephemeralJwk = ephemeral.publicKey.export({ format: 'jwk' });
  const recipient = createPublicKey({
    format: 'jwk',
    key: { kty: 'OKP', crv: 'X25519', x: recipientPublicKey },
  });
  const envelope = {
    format: REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
    algorithm: REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
    executionId: 'execution-server-function',
    workerId: identity.workerId ?? 'worker-server-function',
    workerAttempt: identity.workerAttempt ?? 1,
    workspaceId: secretSnapshot.workspace.workspaceId,
    snapshotId: secretSnapshot.workspace.snapshotId,
    functionRef,
    invocationId: 'invocation-1',
    recipientPublicKey,
    ephemeralPublicKey: ephemeralJwk.x!,
    expiresAt: 20_000,
  };
  const aad = Buffer.from(
    remoteExecutionSecretEnvelopeAssociatedData(envelope),
    'utf8'
  );
  const key = Buffer.from(
    hkdfSync(
      'sha256',
      diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }),
      Buffer.from('prodivix.remote-execution-secret-envelope.key.v1', 'utf8'),
      aad,
      32
    )
  );
  const nonce = Buffer.alloc(12, 0x51);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: { signingKey: secretCanary },
      })
    ),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Object.freeze({
    ...envelope,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  });
};

const provider = createExecutionProviderDescriptor({
  id: 'prodivix.remote.server-function',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['production'],
  runtimeZones: ['server'],
  invocationKinds: ['code'],
  capabilities: [
    'artifacts',
    'cancellation',
    'dependency-install',
    'diagnostics',
    'filesystem',
    'server-function',
    'source-trace',
    'streaming-logs',
    'timeout',
  ],
});

const claim = (
  executionRequest = request,
  executionSnapshot = snapshot,
  authority?: RemoteExecutionClaimResult['authority'],
  recovery: Readonly<{
    workerId?: string;
    leaseToken?: string;
    attempt?: number;
    status?: 'starting' | 'running' | 'cancelling';
  }> = {}
): RemoteExecutionClaimResult => ({
  lease: {
    workerId: recovery.workerId ?? 'worker-server-function',
    token: recovery.leaseToken ?? 'lease-server-function',
    attempt: recovery.attempt ?? 1,
    acquiredAt: 1,
    expiresAt: 100,
  },
  execution: {
    ownerId: 'owner-1',
    identityKey: 'identity-server-function',
    request: executionRequest,
    snapshotId: executionSnapshot.workspace.snapshotId,
    record: {
      executionId: 'execution-server-function',
      requestId: executionRequest.requestId,
      snapshotDigest: executionSnapshot.contentDigest,
      provider,
      status: recovery.status ?? 'starting',
      latestCursor: 2,
      createdAt: 1,
      startedAt: 2,
    },
    events: [],
    artifacts: [],
    cancellationIds: [],
    lease: {
      workerId: recovery.workerId ?? 'worker-server-function',
      token: recovery.leaseToken ?? 'lease-server-function',
      attempt: recovery.attempt ?? 1,
      acquiredAt: 1,
      expiresAt: 100,
    },
  },
  ...(authority ? { authority } : {}),
});

const authenticatedAuthority: NonNullable<
  RemoteExecutionClaimResult['authority']
> = Object.freeze({
  format: REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT,
  executionId: 'execution-server-function',
  workerId: 'worker-server-function',
  workerAttempt: 1,
  principal: Object.freeze({
    providerId: 'prodivix-product-session',
    principalId: 'user-1',
  }),
  permissions: Object.freeze(['workspace.owner']),
  workspaceId: authenticatedSnapshot.workspace.workspaceId,
  snapshotId: authenticatedSnapshot.workspace.snapshotId,
  expiresAt: 100,
});

describe('remote worker isolated Server Function', () => {
  it('resolves a lease-fenced encrypted Secret before sandbox execution and clears it afterward', async () => {
    const transitions: { status: string; reason?: string }[] = [];
    let claimed = false;
    let projectedFields: Readonly<Record<string, string>> | undefined;
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return claim(secretRequest, secretSnapshot);
      },
      async renew() {
        return {
          lease: claim(secretRequest, secretSnapshot).lease,
          cancellationRequested: false,
        };
      },
      async snapshot() {
        return secretSnapshot;
      },
      async resolveServerFunctionSecrets(input) {
        expect(input).toMatchObject({
          executionId: 'execution-server-function',
          workerId: 'worker-server-function',
          leaseToken: 'lease-server-function',
        });
        return sealSecretEnvelope(input.recipientPublicKey);
      },
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
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
        projectedFields = input.serverFunctionSecrets?.fields;
        expect(projectedFields).toEqual({ signingKey: secretCanary });
        expect(input.redactValues).toContain(secretCanary);
        return {
          status: 'succeeded',
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [
            createRemoteWorkerServerFunctionArtifact({
              snapshot: secretSnapshot,
              request: secretRequest,
              contents: new TextEncoder().encode(
                JSON.stringify({
                  type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
                  requestId: 'invocation-1:1',
                  ok: true,
                  result: { kind: 'value', value: { greeting: 'safe' } },
                })
              ),
            }),
          ],
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-server-function',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
    });
    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'running', reason: undefined },
      { status: 'succeeded', reason: undefined },
    ]);
    expect(projectedFields).toEqual({ signingKey: '' });
  });

  it('re-resolves Secret for a reclaimed running attempt without repeating the running transition', async () => {
    const transitions: { status: string; reason?: string }[] = [];
    let claimed = false;
    let projectedFields: Readonly<Record<string, string>> | undefined;
    const recoveredClaim = claim(secretRequest, secretSnapshot, undefined, {
      workerId: 'worker-recovery',
      leaseToken: 'lease-recovery',
      attempt: 2,
      status: 'running',
    });
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return recoveredClaim;
      },
      async renew() {
        return {
          lease: recoveredClaim.lease,
          cancellationRequested: false,
        };
      },
      async snapshot() {
        return secretSnapshot;
      },
      async resolveServerFunctionSecrets(input) {
        expect(input).toMatchObject({
          executionId: 'execution-server-function',
          workerId: 'worker-recovery',
          leaseToken: 'lease-recovery',
        });
        return sealSecretEnvelope(input.recipientPublicKey, {
          workerId: 'worker-recovery',
          workerAttempt: 2,
        });
      },
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
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
        projectedFields = input.serverFunctionSecrets?.fields;
        expect(projectedFields).toEqual({ signingKey: secretCanary });
        expect(input.redactValues).toEqual(
          expect.arrayContaining(['lease-recovery', secretCanary])
        );
        return {
          status: 'succeeded',
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [
            createRemoteWorkerServerFunctionArtifact({
              snapshot: secretSnapshot,
              request: secretRequest,
              contents: new TextEncoder().encode(
                JSON.stringify({
                  type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
                  requestId: 'invocation-1:1',
                  ok: true,
                  result: {
                    kind: 'value',
                    value: { greeting: 'recovered' },
                  },
                })
              ),
            }),
          ],
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-recovery',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([{ status: 'succeeded', reason: undefined }]);
    expect(projectedFields).toEqual({ signingKey: '' });
  });

  it('finalizes a reclaimed cancelling attempt before snapshot or Secret resolution', async () => {
    const snapshotRead = vi.fn<RemoteWorkerControlPlaneClient['snapshot']>();
    const secretResolution =
      vi.fn<
        NonNullable<
          RemoteWorkerControlPlaneClient['resolveServerFunctionSecrets']
        >
      >();
    const sandboxExecute = vi.fn<RemoteWorkerSandbox['execute']>();
    const transitions: { status: string; reason?: string }[] = [];
    let claimed = false;
    const cancellingClaim = claim(secretRequest, secretSnapshot, undefined, {
      workerId: 'worker-recovery',
      leaseToken: 'lease-recovery',
      attempt: 2,
      status: 'cancelling',
    });
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return cancellingClaim;
      },
      async renew() {
        return {
          lease: cancellingClaim.lease,
          cancellationRequested: true,
        };
      },
      snapshot: snapshotRead,
      resolveServerFunctionSecrets: secretResolution,
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
        return true;
      },
      async appendEvent() {
        return 'stored';
      },
      async uploadArtifact() {
        return 'stored';
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-recovery',
      providerId: provider.id,
      client,
      sandbox: { execute: sandboxExecute },
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'cancelled', reason: 'cancellation-requested' },
    ]);
    expect(snapshotRead).not.toHaveBeenCalled();
    expect(secretResolution).not.toHaveBeenCalled();
    expect(sandboxExecute).not.toHaveBeenCalled();
  });

  it('normalizes broker failure before sandbox execution or durable output', async () => {
    const transitions: { status: string; reason?: string }[] = [];
    const sandboxExecute = vi.fn<RemoteWorkerSandbox['execute']>();
    const appendEvent = vi.fn(async () => 'stored' as const);
    const uploadArtifact = vi.fn(async () => 'stored' as const);
    let claimed = false;
    const client: RemoteWorkerControlPlaneClient = {
      async claim() {
        if (claimed) return undefined;
        claimed = true;
        return claim(secretRequest, secretSnapshot);
      },
      async renew() {
        return {
          lease: claim(secretRequest, secretSnapshot).lease,
          cancellationRequested: false,
        };
      },
      async snapshot() {
        return secretSnapshot;
      },
      async resolveServerFunctionSecrets() {
        throw new Error('broker-credential-canary');
      },
      async transition(input) {
        transitions.push({ status: input.status, reason: input.reason });
        return true;
      },
      appendEvent,
      uploadArtifact,
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-server-function',
      providerId: provider.id,
      client,
      sandbox: { execute: sandboxExecute },
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'failed', reason: 'secret-resolution-denied' },
    ]);
    expect(sandboxExecute).not.toHaveBeenCalled();
    expect(appendEvent).not.toHaveBeenCalled();
    expect(uploadArtifact).not.toHaveBeenCalled();
    expect(JSON.stringify(transitions)).not.toContain(
      'broker-credential-canary'
    );
  });

  it('passes the exact request into production and publishes one trusted result', async () => {
    const transitions: string[] = [];
    const uploads: Parameters<
      RemoteWorkerControlPlaneClient['uploadArtifact']
    >[0][] = [];
    const events: Parameters<
      RemoteWorkerControlPlaneClient['appendEvent']
    >[0][] = [];
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
        events.push(input);
        return 'stored';
      },
      async uploadArtifact(input) {
        uploads.push(input);
        return 'stored';
      },
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute(input) {
        expect(input.profile).toBe('production');
        expect(input.request).toBe(request);
        expect(input.terminal).toBeUndefined();
        return {
          status: 'succeeded',
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [
            createRemoteWorkerServerFunctionArtifact({
              snapshot,
              request,
              contents: new TextEncoder().encode(
                JSON.stringify({
                  type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
                  requestId: 'invocation-1:1',
                  ok: true,
                  result: {
                    kind: 'value',
                    value: { greeting: 'Hello Ada' },
                  },
                })
              ),
            }),
          ],
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-server-function',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
      terminal: {
        async connect() {
          throw new Error('Production Server Function must not open Terminal.');
        },
      },
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual(['running', 'succeeded']);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.descriptor).toMatchObject({
      artifactId: `server-function-result:${snapshot.contentDigest}:invocation-1:1`,
      kind: 'report',
      metadata: { status: 'succeeded' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workerEventId: '1:server-function:trace',
      event: {
        kind: 'trace',
        trace: {
          traceId: 'server-function:execution-server-function',
          spanId: 'invocation-1:1',
          name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
          phase: 'event',
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: functionRef.artifactId,
              },
            },
          ],
        },
      },
    });
    const event = events[0]?.event;
    expect(event?.kind).toBe('trace');
    const trace =
      event?.kind === 'trace'
        ? readServerFunctionInvocationTraceValue(event.trace.detail)
        : undefined;
    expect(trace).toEqual({
      format: 'prodivix.server-function-invocation-trace.v1',
      requestId: 'invocation-1:1',
      invocationId: 'invocation-1',
      attempt: 1,
      functionRef,
      startedAt: 2,
      completedAt: 10,
      durationMs: 8,
      outcome: 'succeeded',
      resultKind: 'value',
      redacted: true,
    });
    expect(JSON.stringify(event)).not.toMatch(
      /Hello Ada|owner-1|lease-server-function|principal|authority/iu
    );
  });

  it('fails before durable output when production omits the canonical result', async () => {
    const transitions: { status: string; reason?: string }[] = [];
    const appendEvent = vi.fn(async () => 'stored' as const);
    const uploadArtifact = vi.fn(async () => 'stored' as const);
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
        transitions.push({ status: input.status, reason: input.reason });
        return true;
      },
      appendEvent,
      uploadArtifact,
    };
    const sandbox: RemoteWorkerSandbox = {
      async execute() {
        return {
          status: 'succeeded',
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [],
        };
      },
    };
    const agent = createRemoteWorkerAgent({
      workerId: 'worker-server-function',
      providerId: provider.id,
      client,
      sandbox,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 20,
      defaultTimeoutMs: 1_000,
      defaultMaximumOutputBytes: 1_000,
      now: () => 10,
    });

    await expect(agent.pollOnce()).resolves.toBe(true);
    expect(transitions).toEqual([
      { status: 'running', reason: undefined },
      { status: 'failed', reason: 'invalid-server-function-result' },
    ]);
    expect(appendEvent).not.toHaveBeenCalled();
    expect(uploadArtifact).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'authenticated',
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'workspace.owner permission',
      executionRequest: permissionRequest,
      executionSnapshot: permissionSnapshot,
    },
  ])(
    'projects an exact principal for $label without session or lease material',
    async ({ executionRequest, executionSnapshot }) => {
      const transitions: string[] = [];
      let claimed = false;
      const client: RemoteWorkerControlPlaneClient = {
        async claim() {
          if (claimed) return undefined;
          claimed = true;
          return claim(
            executionRequest,
            executionSnapshot,
            authenticatedAuthority
          );
        },
        async renew() {
          return {
            lease: claim().lease,
            cancellationRequested: false,
          };
        },
        async snapshot() {
          return executionSnapshot;
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
          expect(input.serverFunctionAuthority).toMatchObject({
            workspaceId: executionSnapshot.workspace.workspaceId,
            snapshotId: executionSnapshot.workspace.snapshotId,
            principal: authenticatedAuthority.principal,
            permissions: authenticatedAuthority.permissions,
            expiresAt: authenticatedAuthority.expiresAt,
          });
          const serialized = JSON.stringify(input.serverFunctionAuthority);
          expect(serialized).not.toContain('lease-server-function');
          expect(serialized).not.toContain('session-id-canary');
          return {
            status: 'succeeded',
            stdout: '',
            stderr: '',
            outputTruncated: false,
            artifacts: [
              createRemoteWorkerServerFunctionArtifact({
                snapshot: executionSnapshot,
                request: executionRequest,
                contents: new TextEncoder().encode(
                  JSON.stringify({
                    type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
                    requestId: 'invocation-1:1',
                    ok: true,
                    result: {
                      kind: 'value',
                      value: { greeting: 'Hello Ada' },
                    },
                  })
                ),
              }),
            ],
          };
        },
      };
      const agent = createRemoteWorkerAgent({
        workerId: 'worker-server-function',
        providerId: provider.id,
        client,
        sandbox,
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
        defaultTimeoutMs: 1_000,
        defaultMaximumOutputBytes: 1_000,
        now: () => 10,
      });
      await expect(agent.pollOnce()).resolves.toBe(true);
      expect(transitions).toEqual(['running', 'succeeded']);
    }
  );

  it.each([
    {
      label: 'missing',
      authority: undefined,
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'expired',
      authority: { ...authenticatedAuthority, expiresAt: 10 },
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'wrong worker',
      authority: { ...authenticatedAuthority, workerId: 'worker-other' },
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'wrong attempt',
      authority: { ...authenticatedAuthority, workerAttempt: 2 },
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'wrong snapshot',
      authority: { ...authenticatedAuthority, snapshotId: 'snapshot-other' },
      executionRequest: authenticatedRequest,
      executionSnapshot: authenticatedSnapshot,
    },
    {
      label: 'missing workspace.owner grant',
      authority: { ...authenticatedAuthority, permissions: [] },
      executionRequest: permissionRequest,
      executionSnapshot: permissionSnapshot,
    },
    {
      label: 'non-canonical permission grant order',
      authority: {
        ...authenticatedAuthority,
        permissions: ['workspace.write', 'workspace.owner'],
      },
      executionRequest: permissionRequest,
      executionSnapshot: permissionSnapshot,
    },
  ])(
    'fails protected execution on a $label authority lease',
    async ({ authority, executionRequest, executionSnapshot }) => {
      let sandboxCalled = false;
      const transitions: { status: string; reason?: string }[] = [];
      let claimed = false;
      const client: RemoteWorkerControlPlaneClient = {
        async claim() {
          if (claimed) return undefined;
          claimed = true;
          return claim(
            executionRequest,
            executionSnapshot,
            authority as RemoteExecutionClaimResult['authority']
          );
        },
        async renew() {
          return { lease: claim().lease, cancellationRequested: false };
        },
        async snapshot() {
          return executionSnapshot;
        },
        async transition(input) {
          transitions.push({ status: input.status, reason: input.reason });
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
        async execute() {
          sandboxCalled = true;
          throw new Error('Invalid authority reached sandbox.');
        },
      };
      const agent = createRemoteWorkerAgent({
        workerId: 'worker-server-function',
        providerId: provider.id,
        client,
        sandbox,
        leaseDurationMs: 100,
        heartbeatIntervalMs: 20,
        defaultTimeoutMs: 1_000,
        defaultMaximumOutputBytes: 1_000,
        now: () => 10,
      });
      await expect(agent.pollOnce()).resolves.toBe(true);
      expect(sandboxCalled).toBe(false);
      expect(transitions).toEqual([
        { status: 'failed', reason: 'invalid-server-function-request' },
      ]);
    }
  );
});
