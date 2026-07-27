import { createExecutionSecretLeakGuard } from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  createActiveExecutionQuotaPolicy,
  createRemoteExecutionControlPlane,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
} from './remoteExecutionControlPlane';
import {
  createMemoryRemoteExecutionRepository,
  createMemoryRemoteExecutionSnapshotStore,
} from './remoteExecutionControlPlaneMemory';
import { executionValue } from './remoteExecutionCodecPrimitives';
import {
  createRemoteExecutionCreatePayload,
  createRemoteExecutionRequestEnvelope,
  decodeRemoteExecutionCreateResult,
} from './remoteExecutionProtocolCodec';
import { readRemoteExecutionServerAuthority } from './remoteExecutionServerAuthority';
import type {
  RemoteExecutionPrincipal,
  RemoteExecutionRequestEnvelope,
  RemoteExecutionResponseEnvelope,
} from './index';
import {
  createRemoteFixtureSnapshot,
  remoteFixtureProvider,
} from './__tests__/remoteExecutionFixtures';

type Collation = (this: string, other: string) => number;

/**
 * Stand-ins for hosts whose ICU collation disagrees with each other. `reversed`
 * inverts the order; `caseFolded` groups upper and lower case together the way
 * many real locales do. Neither matches Unicode code-point order, which is the
 * only ordering two processes can agree on without sharing a locale.
 */
const reversed: Collation = function (other) {
  return this < other ? 1 : this > other ? -1 : 0;
};

const caseFolded: Collation = function (other) {
  const left = this.toLowerCase();
  const right = other.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
};

const hosts: readonly (Collation | undefined)[] = [
  undefined,
  reversed,
  caseFolded,
];

/**
 * Runs `run` with the host collation replaced. Never call this concurrently:
 * the patch is global, so overlapping runs would restore each other's stub.
 */
const onHost = async <Value>(
  collation: Collation | undefined,
  run: () => Promise<Value>
): Promise<Value> => {
  const host = String.prototype.localeCompare;
  if (collation) String.prototype.localeCompare = collation;
  try {
    return await run();
  } finally {
    String.prototype.localeCompare = host;
  }
};

const onEveryHost = async <Value>(
  run: () => Promise<Value>
): Promise<readonly Value[]> => {
  const results: Value[] = [];
  for (const collation of hosts) results.push(await onHost(collation, run));
  return results;
};

const principal: RemoteExecutionPrincipal = Object.freeze({
  subjectId: 'user-1',
  scopes: ['remote-execution:*'],
});

/**
 * Keys whose locale collation order differs from code-point order: case pairs,
 * `-` (U+002D) versus `_` (U+005F), and a non-Latin key.
 */
const invocationInput = Object.freeze({
  Zulu: 'z',
  alpha: 'a',
  Alpha: 'A',
  'a-b': 'hyphen',
  a_b: 'underscore',
  中文: 'cjk',
});

const invocationInputCodePointOrder = [
  'Alpha',
  'Zulu',
  'a-b',
  'a_b',
  'alpha',
  '中文',
];

const wireRequest = Object.freeze({
  requestId: 'request-1',
  profile: 'preview',
  runtimeZone: 'client',
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: { workspace: '1', Theme: '2', theme: '3' },
  },
  invocation: {
    kind: 'workspace',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    input: invocationInput,
  },
  requiredCapabilities: ['filesystem'],
  metadata: {
    Origin: 'editor',
    origin: 'worker',
    'trace-id': 't',
    trace_id: 'u',
  },
});

const createEnvelope = (): RemoteExecutionRequestEnvelope =>
  createRemoteExecutionRequestEnvelope(
    1,
    'message-1',
    'create',
    createRemoteExecutionCreatePayload({
      request: wireRequest,
      snapshot: { kind: 'upload', snapshot: createRemoteFixtureSnapshot() },
    })
  );

const createHarness = () => {
  let executionSequence = 0;
  const repository = createMemoryRemoteExecutionRepository();
  return {
    repository,
    controlPlane: createRemoteExecutionControlPlane({
      repository,
      snapshots: createMemoryRemoteExecutionSnapshotStore(),
      authorization: createScopeRemoteExecutionAuthorizationPolicy(),
      quota: createActiveExecutionQuotaPolicy(8),
      router: createStaticRemoteExecutionProviderRouter([
        remoteFixtureProvider,
      ]),
      now: () => 1_000,
      createExecutionId: () => `execution-${++executionSequence}`,
      createLeaseToken: () => 'lease-1',
      outputGuard: createExecutionSecretLeakGuard({ secretValues: [] }),
    }),
  };
};

const successPayload = (response: RemoteExecutionResponseEnvelope): unknown => {
  if (!response.ok)
    throw new Error(`remote create failed: ${response.error.code}`);
  return response.payload;
};

const submitAndReadIdentityKey = async (
  envelope: RemoteExecutionRequestEnvelope
): Promise<string> => {
  const { controlPlane, repository } = createHarness();
  successPayload(await controlPlane.handle(envelope, { principal }));
  const stored = await repository.getByOwnerRequest('user-1', 'request-1');
  if (!stored) throw new Error('remote execution was not stored');
  return stored.identityKey;
};

describe('remote execution idempotency identity key', () => {
  it('derives one identity key across hosts whose collation disagrees', async () => {
    const envelope = createEnvelope();

    const [hostKey, reversedKey, caseFoldedKey] = await onEveryHost(() =>
      submitAndReadIdentityKey(envelope)
    );

    expect(hostKey).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(reversedKey).toBe(hostKey);
    expect(caseFoldedKey).toBe(hostKey);
  });

  it('treats a retry issued under a different collation as the same call', async () => {
    const envelope = createEnvelope();
    const { controlPlane } = createHarness();

    const first = decodeRemoteExecutionCreateResult(
      successPayload(await controlPlane.handle(envelope, { principal }))
    );
    const retry = await onHost(reversed, async () =>
      decodeRemoteExecutionCreateResult(
        successPayload(await controlPlane.handle(envelope, { principal }))
      )
    );

    expect(retry.execution.executionId).toBe(first.execution.executionId);
  });

  it('normalizes decoded record keys into code-point order on every host', async () => {
    const orders = await onEveryHost(async () =>
      Object.keys(
        executionValue(invocationInput, 'input') as Record<string, unknown>
      )
    );

    orders.forEach((order) =>
      expect(order).toEqual(invocationInputCodePointOrder)
    );
  });

  it('accepts an attested authority permission order on every host', async () => {
    const authority = {
      format: 'prodivix.remote-execution-server-authority.v1',
      principal: { providerId: 'prodivix', principalId: 'user-1' },
      permissions: ['Workspace.read', 'workspace-write', 'workspace.read'],
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      expiresAt: 2_000,
    };

    const decoded = await onEveryHost(async () =>
      readRemoteExecutionServerAuthority(authority)
    );

    decoded.forEach((entry) =>
      expect(entry?.permissions).toEqual(authority.permissions)
    );
  });
});
