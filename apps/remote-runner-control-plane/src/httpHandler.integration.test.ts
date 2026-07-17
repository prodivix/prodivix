import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSecretLeakGuard,
} from '@prodivix/runtime-core';
import {
  createActiveExecutionQuotaPolicy,
  createMemoryRemoteExecutionRepository,
  createMemoryRemoteExecutionSnapshotStore,
  createRemoteExecutionClient,
  createRemoteExecutionControlPlane,
  createRemoteExecutionHttpTransports,
  createRemoteExecutionTerminalBroker,
  createRemoteExecutionTerminalClient,
  createRemoteExecutionTerminalHttpTransport,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
} from '@prodivix/runtime-remote';
import { createRemoteExecutionHttpHandler } from './httpHandler';

let server: Server;
let baseUrl: string;
const httpPort = {
  async request(input: {
    url: string;
    method: 'GET' | 'POST';
    headers: Readonly<Record<string, string>>;
    body?: Uint8Array;
    maximumResponseBytes: number;
  }) {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      ...(input.body ? { body: Buffer.from(input.body) } : {}),
    });
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > input.maximumResponseBytes)
      throw new Error('HTTP response exceeded the caller byte limit.');
    return {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? undefined,
      },
      body,
    };
  },
} as const;
const provider = createExecutionProviderDescriptor({
  id: 'prodivix.remote.http-test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['filesystem', 'cancellation', 'terminal'],
});
const snapshot = createExecutableProjectSnapshot({
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: { workspace: '1' },
  },
  target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
  files: [{ path: 'package.json', contents: '{"private":true}' }],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [{ kind: 'preview', path: 'package.json' }],
  capabilityRequirements: {
    preview: ['filesystem'],
    build: ['filesystem', 'build'],
    test: ['filesystem', 'test'],
  },
  publicBuildConfiguration: [],
  resourceHints: {},
  cacheHints: { dependencyInstall: 'reuse-if-matched' },
});
const request = createExecutionRequest({
  requestId: 'request-1',
  profile: 'preview',
  runtimeZone: 'client',
  workspace: snapshot.workspace,
  invocation: {
    kind: 'workspace',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
  },
  requiredCapabilities: ['filesystem'],
});
const httpSecretCanary = 'http-secret-canary-4b61';

beforeEach(async () => {
  const repository = createMemoryRemoteExecutionRepository();
  let id = 0;
  const controlPlane = createRemoteExecutionControlPlane({
    repository,
    snapshots: createMemoryRemoteExecutionSnapshotStore(),
    authorization: createScopeRemoteExecutionAuthorizationPolicy(),
    quota: createActiveExecutionQuotaPolicy(4),
    router: createStaticRemoteExecutionProviderRouter([provider]),
    now: () => 1_000,
    createExecutionId: () => `execution-${++id}`,
    createLeaseToken: () => `lease-${++id}`,
    outputGuard: createExecutionSecretLeakGuard({
      secretValues: [httpSecretCanary],
    }),
  });
  let terminalId = 0;
  const terminalBroker = createRemoteExecutionTerminalBroker({
    resolveExecution: (executionId) => repository.get(executionId),
    createTerminalSessionId: () => `terminal-${++terminalId}`,
    createAccessToken: () => `terminal-token-${++terminalId}`,
    secretValues: [httpSecretCanary],
    now: () => 1_000,
  });
  const handler = createRemoteExecutionHttpHandler({
    controlPlane,
    terminalBroker,
    authenticator: {
      async authenticateClient(token) {
        return token === 'client-token'
          ? { subjectId: 'owner-1', scopes: ['remote-execution:*'] }
          : undefined;
      },
      async authenticateWorker(token, workerId) {
        return token === 'worker-token' && workerId === 'worker-1';
      },
    },
    async resolveClaimedSnapshot(input) {
      const execution = await repository.get(input.executionId);
      return execution?.lease?.workerId === input.workerId &&
        execution.lease.token === input.leaseToken
        ? { contentDigest: execution.record.snapshotDigest }
        : undefined;
    },
    async isCancellationRequested(input) {
      const execution = await repository.get(input.executionId);
      return execution?.lease?.workerId === input.workerId &&
        execution.lease.token === input.leaseToken
        ? execution.record.status === 'cancelling'
        : undefined;
    },
  });
  server = createServer(
    (incoming, response) => void handler(incoming, response)
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('remote runner control-plane HTTP integration', () => {
  it('serves health without exposing control-plane state', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('runs the versioned Remote client through the authenticated HTTP boundary', async () => {
    const { transport } = createRemoteExecutionHttpTransports({
      baseUrl,
      accessToken: 'client-token',
      http: httpPort,
    });
    const client = createRemoteExecutionClient({
      retryPolicy: { maxAttempts: 1 },
      transport,
    });
    const result = await client.create({
      request,
      snapshot: { kind: 'upload', snapshot },
    });
    expect(result.execution).toMatchObject({
      executionId: 'execution-1',
      status: 'queued',
    });
  });

  it('runs short-token Terminal reconnect through client and worker HTTP fences', async () => {
    const { transport } = createRemoteExecutionHttpTransports({
      baseUrl,
      accessToken: 'client-token',
      http: httpPort,
    });
    const execution = await createRemoteExecutionClient({
      retryPolicy: { maxAttempts: 1 },
      transport,
    }).create({
      request,
      snapshot: { kind: 'upload', snapshot },
    });
    const claimedResponse = await fetch(`${baseUrl}/internal/v1/claims`, {
      method: 'POST',
      headers: { authorization: 'Bearer worker-token' },
      body: JSON.stringify({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseDurationMs: 5_000,
      }),
    });
    const claimed = (await claimedResponse.json()) as {
      claim: { lease: { token: string } };
    };
    const executionId = execution.execution.executionId;
    const transition = async (status: string) =>
      fetch(`${baseUrl}/internal/v1/executions/${executionId}/transition`, {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: claimed.claim.lease.token,
          status,
        }),
      });
    expect((await transition('running')).status).toBe(200);

    const terminal = createRemoteExecutionTerminalClient({
      transport: createRemoteExecutionTerminalHttpTransport({
        baseUrl,
        executionPath: '/v1/executions',
        accessToken: 'client-token',
        http: httpPort,
      }),
    });
    const opened = await terminal.open({
      executionId,
      size: { columns: 90, rows: 24 },
    });
    await expect(
      terminal.write({
        executionId,
        terminalSessionId: opened.snapshot.terminalSessionId,
        accessToken: opened.access.token,
        clientSequence: 1,
        data: 'pwd\n',
      })
    ).resolves.toMatchObject({ status: 'accepted' });

    const commandsResponse = await fetch(
      `${baseUrl}/internal/v1/executions/${executionId}/terminal/commands`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: claimed.claim.lease.token,
          acknowledgedCommandCursor: 0,
        }),
      }
    );
    const commands = (await commandsResponse.json()) as {
      terminal: { commands: readonly { kind: string }[] };
    };
    expect(commands.terminal.commands.map((command) => command.kind)).toEqual([
      'open',
      'input',
    ]);

    for (const [index, data] of [
      'safe:http-secret-',
      'canary-',
      '4b61:tail',
    ].entries()) {
      const output = await fetch(
        `${baseUrl}/internal/v1/executions/${executionId}/terminal/output`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer worker-token' },
          body: JSON.stringify({
            workerId: 'worker-1',
            leaseToken: claimed.claim.lease.token,
            terminalSessionId: opened.snapshot.terminalSessionId,
            workerOutputId: `output-${index}`,
            stream: 'stdout',
            data,
            redacted: false,
          }),
        }
      );
      expect([200, 201]).toContain(output.status);
    }
    const read = await terminal.read({
      executionId,
      terminalSessionId: opened.snapshot.terminalSessionId,
      accessToken: opened.access.token,
      afterCursor: 0,
    });
    expect(read.records.map((record) => record.data).join('')).toBe(
      'safe:[REDACTED]:tail'
    );

    const resumed = await terminal.resume({
      executionId,
      terminalSessionId: opened.snapshot.terminalSessionId,
    });
    await expect(
      terminal.read({
        executionId,
        terminalSessionId: opened.snapshot.terminalSessionId,
        accessToken: opened.access.token,
        afterCursor: read.nextCursor,
      })
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      terminal.read({
        executionId,
        terminalSessionId: opened.snapshot.terminalSessionId,
        accessToken: resumed.access.token,
        afterCursor: read.nextCursor,
      })
    ).resolves.toMatchObject({ records: [] });
    expect((await transition('succeeded')).status).toBe(200);
    await expect(
      terminal.read({
        executionId,
        terminalSessionId: opened.snapshot.terminalSessionId,
        accessToken: resumed.access.token,
        afterCursor: read.nextCursor,
      })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('separates worker authentication and rejects stale lease transitions', async () => {
    const createClient = createRemoteExecutionClient({
      retryPolicy: { maxAttempts: 1 },
      transport: {
        async send(envelope) {
          return (
            await fetch(`${baseUrl}/v1/executions`, {
              method: 'POST',
              headers: { authorization: 'Bearer client-token' },
              body: JSON.stringify(envelope),
            })
          ).json();
        },
      },
    });
    const { contentTransport } = createRemoteExecutionHttpTransports({
      baseUrl,
      accessToken: 'client-token',
      http: httpPort,
    });
    await createClient.create({
      request,
      snapshot: { kind: 'upload', snapshot },
    });
    const denied = await fetch(`${baseUrl}/internal/v1/claims`, {
      method: 'POST',
      headers: { authorization: 'Bearer client-token' },
      body: JSON.stringify({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseDurationMs: 100,
      }),
    });
    expect(denied.status).toBe(403);
    const claimed = await fetch(`${baseUrl}/internal/v1/claims`, {
      method: 'POST',
      headers: { authorization: 'Bearer worker-token' },
      body: JSON.stringify({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseDurationMs: 100,
      }),
    });
    expect(claimed.status).toBe(200);
    const claimedBody = (await claimed.json()) as {
      claim: { lease: { token: string } };
    };
    const snapshotResponse = await fetch(
      `${baseUrl}/internal/v1/executions/execution-1/snapshot`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: claimedBody.claim.lease.token,
        }),
      }
    );
    expect(snapshotResponse.status).toBe(200);
    await expect(snapshotResponse.json()).resolves.toEqual({
      snapshot: { contentDigest: snapshot.contentDigest },
    });
    const eventResponse = await fetch(
      `${baseUrl}/internal/v1/executions/execution-1/events`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: claimedBody.claim.lease.token,
          workerEventId: 'attempt-1:stdout',
          event: {
            kind: 'log',
            log: {
              stream: 'stdout',
              level: 'info',
              message: 'build complete',
              redacted: true,
            },
          },
        }),
      }
    );
    expect(eventResponse.status).toBe(200);
    await expect(eventResponse.json()).resolves.toEqual({
      kind: 'stored',
      latestCursor: 3,
    });
    const artifactContents = new TextEncoder().encode('build artifact');
    const artifactDigest = `sha256-${createHash('sha256').update(artifactContents).digest('hex')}`;
    const artifactResponse = await fetch(
      `${baseUrl}/internal/v1/executions/execution-1/artifacts/artifact-build`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer worker-token',
          'content-type': 'application/zip',
          'x-prodivix-worker-id': 'worker-1',
          'x-prodivix-lease-token': claimedBody.claim.lease.token,
          'x-prodivix-worker-event-id': 'attempt-1:artifact-build',
          'x-prodivix-artifact-kind': 'bundle',
          'x-prodivix-artifact-size': String(artifactContents.byteLength),
          'x-prodivix-artifact-digest': artifactDigest,
          'x-prodivix-artifact-expires-at': '60000',
        },
        body: artifactContents,
      }
    );
    expect(artifactResponse.status).toBe(201);
    await expect(
      createClient.resolveArtifact({
        executionId: 'execution-1',
        artifactId: 'artifact-build',
      })
    ).resolves.toMatchObject({
      artifact: {
        artifactId: 'artifact-build',
        digest: artifactDigest,
      },
    });
    await expect(
      contentTransport.download({
        executionId: 'execution-1',
        artifactId: 'artifact-build',
        maximumBytes: 1024,
      })
    ).resolves.toEqual(artifactContents);
    const stale = await fetch(
      `${baseUrl}/internal/v1/executions/execution-1/transition`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: 'wrong-token',
          status: 'running',
        }),
      }
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual({
      error: { code: 'lease-rejected' },
    });
  });

  it('returns a stable safe rejection when worker output contains a Secret canary', async () => {
    const createClient = createRemoteExecutionClient({
      retryPolicy: { maxAttempts: 1 },
      transport: {
        async send(envelope) {
          return (
            await fetch(`${baseUrl}/v1/executions`, {
              method: 'POST',
              headers: { authorization: 'Bearer client-token' },
              body: JSON.stringify(envelope),
            })
          ).json();
        },
      },
    });
    await createClient.create({
      request,
      snapshot: { kind: 'upload', snapshot },
    });
    const claimed = await fetch(`${baseUrl}/internal/v1/claims`, {
      method: 'POST',
      headers: { authorization: 'Bearer worker-token' },
      body: JSON.stringify({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseDurationMs: 100,
      }),
    });
    const claimedBody = (await claimed.json()) as {
      claim: { lease: { token: string } };
    };
    const leaked = await fetch(
      `${baseUrl}/internal/v1/executions/execution-1/events`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer worker-token' },
        body: JSON.stringify({
          workerId: 'worker-1',
          leaseToken: claimedBody.claim.lease.token,
          workerEventId: 'attempt-1:stdout',
          event: {
            kind: 'log',
            log: {
              stream: 'stdout',
              level: 'info',
              message: httpSecretCanary,
            },
          },
        }),
      }
    );
    expect(leaked.status).toBe(409);
    const rejection = await leaked.json();
    expect(rejection).toEqual({ error: { code: 'secret-leak' } });
    expect(JSON.stringify(rejection)).not.toContain(httpSecretCanary);

    const replay = await createClient.readEvents({
      executionId: 'execution-1',
      afterCursor: 0,
    });
    expect(JSON.stringify(replay)).not.toContain(httpSecretCanary);
    expect(replay.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({
            kind: 'diagnostic',
            diagnostic: expect.objectContaining({ code: 'EXE-5004' }),
          }),
        }),
        expect.objectContaining({
          event: expect.objectContaining({
            kind: 'state',
            reason: 'secret-material-detected',
          }),
        }),
      ])
    );
  });

  it('rejects unknown worker fields and oversized bodies without reflecting input', async () => {
    const invalid = await fetch(`${baseUrl}/internal/v1/claims`, {
      method: 'POST',
      headers: { authorization: 'Bearer worker-token' },
      body: JSON.stringify({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseDurationMs: 100,
        credential: 'private',
      }),
    });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(await invalid.json())).not.toContain('private');
  });
});
