import { describe, expect, it, vi } from 'vitest';
import {
  createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest,
  createRemoteExecutionRegionalRecoveryOperator,
  decodeRemoteExecutionRegionalRecoveryOperatorEvidence,
  decodeRemoteExecutionRegionalRecoveryOperatorRequest,
  encodeRemoteExecutionRegionalRecoveryOperatorEvidence,
  encodeRemoteExecutionRegionalRecoveryOperatorRequest,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
  type RemoteExecutionRegionalRecoveryAuthorizationPort,
  type RemoteExecutionRegionalRecoveryCheckpoint,
  type RemoteExecutionRegionalRecoveryOperatorEvidence,
  type RemoteExecutionRegionalTrafficAuthority,
} from './index';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const checkpoint = (
  regionId: string,
  executionId: string,
  capturedAt: number,
  overrides: Partial<RemoteExecutionRegionalRecoveryCheckpoint> = {}
): RemoteExecutionRegionalRecoveryCheckpoint =>
  Object.freeze({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
    regionId,
    executionId,
    ownerId: `owner-${executionId}`,
    requestId: `request-${executionId}`,
    providerId: 'provider-1',
    snapshotId: 'snapshot-1',
    snapshotDigest: sha('1'),
    status: 'running',
    latestCursor: 3,
    executionStateDigest: sha('2'),
    stateDigest: sha('3'),
    capturedAt,
    lease: {
      workerId: `worker-${executionId}`,
      attempt: 1,
      acquiredAt: 1_000,
      expiresAt: 1_900,
    },
    ...overrides,
  });

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    operationId: 'operation-1',
    mode: 'planned',
    executionIds: ['execution-b', 'execution-a'],
    expectedTrafficEpoch: 1,
    initiatedAt: 1_900,
    cutoverAt: 2_000,
    ...overrides,
  }) as const;

const authorized = (): RemoteExecutionRegionalRecoveryAuthorizationPort =>
  Object.freeze({
    async consume(scope, grant) {
      expect([...grant]).toEqual([1, 2, 3]);
      return Object.freeze({
        kind: 'authorized' as const,
        scopeDigest:
          createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(scope),
        grantDigest: sha('a'),
        principalDigest: sha('b'),
        expiresAt: 2_900,
      });
    },
  });

const authority = (
  onPrepare?: () => void
): RemoteExecutionRegionalTrafficAuthority =>
  Object.freeze({
    async initialize() {
      throw new Error('unused');
    },
    async inspect() {
      throw new Error('unused');
    },
    async listCutovers() {
      throw new Error('unused');
    },
    async acquire() {
      throw new Error('unused');
    },
    async cutover(input, prepare) {
      onPrepare?.();
      const prepared = await prepare();
      return Object.freeze({
        kind: 'cutover' as const,
        state: Object.freeze({
          deploymentId: input.deploymentId,
          activeRegionId: input.targetRegionId,
          epoch: input.expectedEpoch + 1,
          checkpointDigest: prepared.checkpointDigest,
          updatedAt: input.cutoverAt,
        }),
        result: prepared.result,
      });
    },
  });

const clock = (...values: number[]): (() => number) => {
  let cursor = 0;
  return () => values[Math.min(cursor++, values.length - 1)]!;
};

describe('remote execution regional recovery operator', () => {
  it('cuts over a sorted exact batch once and exports only sanitized evidence', async () => {
    const cutoverStarted = vi.fn();
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      source: {
        capture: async (executionId, capturedAt) =>
          checkpoint('region-a', executionId, capturedAt, {
            ...(executionId === 'execution-a'
              ? { status: 'queued', lease: undefined }
              : {}),
          }),
      },
      target: {
        capture: async (executionId, capturedAt) =>
          checkpoint('region-b', executionId, capturedAt, {
            ...(executionId === 'execution-a'
              ? { status: 'queued', lease: undefined }
              : {}),
          }),
      },
      trafficAuthority: authority(cutoverStarted),
      authorization: authorized(),
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 5_000,
      maximumProofLifetimeMs: 5_000,
      maximumAcceptedRpoMs: 1_000,
      now: clock(2_000, 2_100),
    });

    const result = await operator.execute(request(), {
      authorizationGrant: Uint8Array.from([1, 2, 3]),
    });
    expect(cutoverStarted).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'cutover',
      state: { activeRegionId: 'region-b', epoch: 2 },
      evidence: {
        mode: 'planned',
        executionCount: 2,
        outcomes: {
          queuedClaim: 1,
          sameWorkerContinuation: 0,
          workerReclaim: 1,
        },
        rpo: { kind: 'exact-replicated-checkpoint', maximumMs: 0 },
        timing: { measuredRtoMs: 200 },
      },
    });
    if (result.kind !== 'cutover') throw new Error('expected cutover');
    expect(result.state.checkpointDigest).toBe(result.evidence.evidenceDigest);
    expect(result.evidence.cutoverCheckpointDigest).not.toBe(
      result.evidence.evidenceDigest
    );
    const serialized = encodeRemoteExecutionRegionalRecoveryOperatorEvidence(
      result.evidence
    );
    expect(
      decodeRemoteExecutionRegionalRecoveryOperatorEvidence(serialized)
    ).toEqual(result.evidence);
    for (const excluded of [
      'execution-a',
      'execution-b',
      'owner-execution',
      'worker-execution',
      'authorization-secret',
      'arn:aws:kms',
      'postgres://',
    ])
      expect(serialized).not.toContain(excluded);
  });

  it('performs source-unavailable recovery without touching the source probe', async () => {
    const sourceCapture = vi.fn(async () => {
      throw new Error('source database is unavailable');
    });
    const targetRows = new Map([
      [
        'execution-a',
        checkpoint('region-b', 'execution-a', 2_000, {
          status: 'queued',
          lease: undefined,
          stateDigest: sha('4'),
        }),
      ],
      [
        'execution-b',
        checkpoint('region-b', 'execution-b', 2_000, {
          terminal: {
            terminalSessionId: 'terminal-secret-id',
            revision: 3,
            expiresAt: 3_000,
            sealedStateDigest: sha('5'),
          },
          stateDigest: sha('6'),
        }),
      ],
    ]);
    const closeExecution = vi.fn(async (executionId: string) => {
      const current = targetRows.get(executionId)!;
      targetRows.set(
        executionId,
        Object.freeze({
          ...current,
          terminal: undefined,
          stateDigest: sha('7'),
        })
      );
      return 1;
    });
    const sweepExpired = vi.fn(async () => 0);
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      source: { capture: sourceCapture },
      target: {
        capture: async (executionId, capturedAt) => {
          const value = targetRows.get(executionId);
          return value ? Object.freeze({ ...value, capturedAt }) : undefined;
        },
      },
      trafficAuthority: authority(),
      authorization: authorized(),
      infrastructureFence: {
        async verify(scope, proof) {
          expect([...proof]).toEqual([4, 5, 6]);
          return Object.freeze({
            kind: 'verified' as const,
            scopeDigest:
              createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(
                scope
              ),
            fenceDigest: sha('c'),
            incidentObservedAt: 1_000,
            sourceFencedAt: 1_950,
            expiresAt: 2_900,
          });
        },
      },
      replicationAttestation: {
        async verify({ scope, targetCheckpointDigest }, proof) {
          expect([...proof]).toEqual([7, 8, 9]);
          return Object.freeze({
            kind: 'verified' as const,
            scopeDigest:
              createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(
                scope
              ),
            targetCheckpointDigest,
            attestationDigest: sha('d'),
            lastReplicatedAt: 1_800,
            expiresAt: 2_900,
          });
        },
      },
      targetTerminalBroker: { closeExecution, sweepExpired },
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 5_000,
      maximumProofLifetimeMs: 5_000,
      maximumAcceptedRpoMs: 500,
      now: clock(2_000, 2_010, 2_020, 2_100),
    });

    const result = await operator.execute(
      request({ mode: 'source-unavailable', maximumAcceptedRpoMs: 250 }),
      {
        authorizationGrant: Uint8Array.from([1, 2, 3]),
        infrastructureFenceProof: Uint8Array.from([4, 5, 6]),
        replicationAttestation: Uint8Array.from([7, 8, 9]),
      }
    );
    expect(sourceCapture).not.toHaveBeenCalled();
    expect(closeExecution).toHaveBeenCalledExactlyOnceWith(
      'execution-b',
      'transport-lost'
    );
    expect(sweepExpired).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'cutover',
      evidence: {
        mode: 'source-unavailable',
        outcomes: { queuedClaim: 1, workerReclaim: 1 },
        rpo: {
          kind: 'attested-upper-bound',
          maximumMs: 200,
          lastReplicatedAt: 1_800,
        },
        timing: { rtoStartedAt: 1_000, measuredRtoMs: 1_100 },
      },
    });
    const serialized = JSON.stringify(
      (result as { evidence: RemoteExecutionRegionalRecoveryOperatorEvidence })
        .evidence
    );
    expect(serialized).not.toContain('terminal-secret-id');
  });

  it('waits for a fenced source worker lease to expire before recovery', async () => {
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      source: { capture: vi.fn() },
      target: {
        capture: async (executionId, capturedAt) =>
          checkpoint('region-b', executionId, capturedAt, {
            lease: {
              workerId: 'worker-live',
              attempt: 1,
              acquiredAt: 1_900,
              expiresAt: 2_500,
            },
          }),
      },
      trafficAuthority: authority(),
      authorization: authorized(),
      infrastructureFence: {
        async verify(scope) {
          return {
            kind: 'verified',
            scopeDigest:
              createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(
                scope
              ),
            fenceDigest: sha('c'),
            incidentObservedAt: 1_000,
            sourceFencedAt: 1_950,
            expiresAt: 2_900,
          };
        },
      },
      replicationAttestation: {
        async verify({ scope, targetCheckpointDigest }) {
          return {
            kind: 'verified',
            scopeDigest:
              createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(
                scope
              ),
            targetCheckpointDigest,
            attestationDigest: sha('d'),
            lastReplicatedAt: 1_900,
            expiresAt: 2_900,
          };
        },
      },
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 5_000,
      maximumProofLifetimeMs: 5_000,
      maximumAcceptedRpoMs: 500,
      now: clock(2_000, 2_010, 2_020),
    });
    await expect(
      operator.execute(
        request({ mode: 'source-unavailable', maximumAcceptedRpoMs: 250 }),
        {
          authorizationGrant: Uint8Array.from([1, 2, 3]),
          infrastructureFenceProof: Uint8Array.of(1),
          replicationAttestation: Uint8Array.of(2),
        }
      )
    ).rejects.toMatchObject({ code: 'recovery-blocked' });
  });

  it('fails closed on lag, duplicate batches and verifier scope drift', async () => {
    const create = (
      authorization: RemoteExecutionRegionalRecoveryAuthorizationPort = authorized()
    ) =>
      createRemoteExecutionRegionalRecoveryOperator({
        deploymentId: 'deployment-1',
        sourceRegionId: 'region-a',
        targetRegionId: 'region-b',
        source: {
          capture: async (executionId, capturedAt) =>
            checkpoint('region-a', executionId, capturedAt),
        },
        target: {
          capture: async (executionId, capturedAt) =>
            checkpoint('region-b', executionId, capturedAt, {
              latestCursor: 2,
            }),
        },
        trafficAuthority: authority(),
        authorization,
        maximumWorkerAttempts: 3,
        maximumRequestAgeMs: 5_000,
        maximumProofLifetimeMs: 5_000,
        maximumAcceptedRpoMs: 500,
        now: () => 2_000,
      });
    await expect(
      create().execute(request(), {
        authorizationGrant: Uint8Array.from([1, 2, 3]),
      })
    ).rejects.toMatchObject({ code: 'replication-lag' });
    await expect(
      create().execute(
        request({ executionIds: ['execution-a', 'execution-a'] }),
        { authorizationGrant: Uint8Array.from([1, 2, 3]) }
      )
    ).rejects.toThrow('batch is invalid');
    await expect(
      create({
        async consume() {
          return {
            kind: 'authorized',
            scopeDigest: sha('e'),
            grantDigest: sha('a'),
            principalDigest: sha('b'),
            expiresAt: 2_900,
          };
        },
      }).execute(request(), {
        authorizationGrant: Uint8Array.from([1, 2, 3]),
      })
    ).rejects.toMatchObject({ code: 'authorization-invalid' });
  });

  it('does not propagate credential-bearing verifier failures', async () => {
    const secret = 'operator-credential-canary';
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      source: { capture: vi.fn() },
      target: { capture: vi.fn() },
      trafficAuthority: authority(),
      authorization: {
        async consume() {
          throw new Error(secret);
        },
      },
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 5_000,
      maximumProofLifetimeMs: 5_000,
      maximumAcceptedRpoMs: 500,
      now: () => 2_000,
    });
    const failure = await operator
      .execute(request(), {
        authorizationGrant: new TextEncoder().encode(secret),
      })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'authorization-denied' });
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect((failure as Error).message).not.toContain(secret);
  });

  it('rejects any mutation of an exported evidence record', async () => {
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId: 'deployment-1',
      sourceRegionId: 'region-a',
      targetRegionId: 'region-b',
      source: {
        capture: async (executionId, capturedAt) =>
          checkpoint('region-a', executionId, capturedAt),
      },
      target: {
        capture: async (executionId, capturedAt) =>
          checkpoint('region-b', executionId, capturedAt),
      },
      trafficAuthority: authority(),
      authorization: authorized(),
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 5_000,
      maximumProofLifetimeMs: 5_000,
      maximumAcceptedRpoMs: 500,
      now: clock(2_000, 2_100),
    });
    const result = await operator.execute(request(), {
      authorizationGrant: Uint8Array.from([1, 2, 3]),
    });
    if (result.kind !== 'cutover') throw new Error('expected cutover');
    const tampered = JSON.parse(
      encodeRemoteExecutionRegionalRecoveryOperatorEvidence(result.evidence)
    );
    tampered.outcomes.workerReclaim += 1;
    tampered.authorizationToken = 'must-never-be-accepted';
    expect(() =>
      decodeRemoteExecutionRegionalRecoveryOperatorEvidence(
        JSON.stringify(tampered)
      )
    ).toThrow('evidence is invalid');
  });

  it('keeps proof material outside the strict request codec', () => {
    const serialized =
      encodeRemoteExecutionRegionalRecoveryOperatorRequest(request());
    expect(
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(serialized)
    ).toEqual(request());
    expect(() =>
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(
        JSON.stringify({ ...request(), authorizationGrant: 'secret' })
      )
    ).toThrow('request is invalid');
    expect(() =>
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(
        JSON.stringify({ ...request(), mode: 'source-unavailable' })
      )
    ).toThrow('request is invalid');
    expect(() =>
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(
        JSON.stringify({
          ...request(),
          operationId: 'operation\nlog-injection',
        })
      )
    ).toThrow('request is invalid');
    expect(() =>
      decodeRemoteExecutionRegionalRecoveryOperatorRequest(
        JSON.stringify({
          ...request(),
          executionIds: ['execution-a', 'execution-a'],
        })
      )
    ).toThrow('request is invalid');
  });
});
