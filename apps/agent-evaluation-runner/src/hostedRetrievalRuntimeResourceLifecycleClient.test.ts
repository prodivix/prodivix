import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
  createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest,
  digestAgentCanonicalValue,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture } from '../../../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient,
} from './hostedRetrievalRuntimeResourceLifecycleClient';

const COMMIT = 'a'.repeat(40);
const REGISTERED_AT = '2026-08-11T00:00:00.000Z' as Instant;
const RESOURCE_EXPIRES_AT = '2026-08-13T00:00:00.000Z' as Instant;
const READ_CHECKED_AT = '2026-08-11T00:01:00.000Z' as Instant;
const READ_EXPIRES_AT = '2026-08-11T00:04:00.000Z' as Instant;
const TERMINAL_AT = '2026-08-11T00:04:10.000Z' as Instant;
const FENCE_SEALED_AT = '2026-08-11T00:04:11.000Z' as Instant;
const DERIVE_EXPIRES_AT = '2026-08-11T00:06:16.000Z' as Instant;
const CLAIMED_AT = '2026-08-11T00:04:12.000Z' as Instant;
const CLAIM_EXPIRES_AT = '2026-08-11T00:14:12.000Z' as Instant;
const DISPATCHED_AT = '2026-08-11T00:04:13.000Z' as Instant;
const COMPLETED_AT = '2026-08-11T00:04:14.000Z' as Instant;
const serviceToken = 'hosted-lifecycle-service-token-0123456789';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ test: 'hosted-lifecycle-client', label });

const scope = Object.freeze({
  namespaceId: 'namespace.hosted-lifecycle-client',
  repositoryCommit: COMMIT,
  planDigest: digest('plan'),
  frozenRunDigest: digest('frozen-run'),
  runConfigArtifactBindingDigest: digest('run-config-binding'),
  runtimeResourceSetId: 'runtime-resource-set.lifecycle-client',
});

const fixture = () => {
  const terminalShardLedgerEntries = Object.freeze([
    Object.freeze({
      shardId: 'shard.alpha',
      shardLeaseGeneration: 2,
      checkpointDigest: digest('checkpoint.alpha'),
      checkpointUpdatedAt: TERMINAL_AT,
      terminalAttempts: Object.freeze([
        Object.freeze({
          attemptId: 'attempt.alpha',
          attemptDigest: digest('attempt.alpha'),
          status: 'completed' as const,
          completedAt: TERMINAL_AT,
        }),
      ]),
    }),
  ]);
  return createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
    ...scope,
    registeredAt: REGISTERED_AT,
    expiresAt: RESOURCE_EXPIRES_AT,
    expectedShardIds: Object.freeze(['shard.alpha']),
    terminalShardLedgerEntries,
    terminalFenceSealedAt: FENCE_SEALED_AT,
    timing: Object.freeze({
      readCheckedAt: READ_CHECKED_AT,
      readExpiresAt: READ_EXPIRES_AT,
      cleanupClaimedAt: CLAIMED_AT,
      cleanupClaimExpiresAt: CLAIM_EXPIRES_AT,
      cleanupDispatchedAt: DISPATCHED_AT,
      cleanupCompletedAt: COMPLETED_AT,
    }),
  });
};

const environment = (
  role: 'cleanup' | 'prepare' | 'recovery',
  includeToken = true
) =>
  Object.freeze({
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
      AGENT_EVALUATION_LEDGER_BASE_URL,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: scope.namespaceId,
    [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
      scope.repositoryCommit,
    ...(includeToken
      ? { [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: serviceToken }
      : {}),
    [AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROLE_ENVIRONMENT_NAME]:
      role,
  });

const response = (value: unknown, status = 200): Response =>
  new Response(canonicalJsonText(value), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

describe('hosted retrieval runtime resource lifecycle client', () => {
  it('stages exact registrations before provider creation and replays results', async () => {
    const exact4 = fixture();
    const registration = exact4.registrationResults[0]!;
    const calls: Array<{
      purpose: string | null;
      idempotencyKey: string | null;
      body: unknown;
    }> = [];
    const client =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient(
        {
          namespaceId: scope.namespaceId,
          repositoryCommit: scope.repositoryCommit,
          environment: environment('prepare'),
          fetch: async (_url, init) => {
            const headers = new Headers(init?.headers);
            const body = JSON.parse(String(init?.body)) as unknown;
            calls.push({
              purpose: headers.get(
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER
              ),
              idempotencyKey: headers.get('Idempotency-Key'),
              body,
            });
            return response(body, calls.length === 1 ? 201 : 200);
          },
        }
      );

    await expect(
      client.stageRegistration(registration.registrationRequest)
    ).resolves.toEqual(registration.registrationRequest);
    await expect(client.storeRegistrationResult(registration)).resolves.toEqual(
      registration
    );
    expect(calls).toEqual([
      {
        purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.prepare,
        idempotencyKey: registration.registrationRequest.requestDigest,
        body: registration.registrationRequest,
      },
      {
        purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.prepare,
        idempotencyKey: registration.resultDigest,
        body: registration,
      },
    ]);
  });

  it('closes post-matrix cleanup through derive, claim, delete receipt, and ACK-loss readback', async () => {
    const exact4 = fixture();
    const lifecycle = exact4.lifecycles[0]!;
    const registration = exact4.registrationResults[0]!;
    const expectedShardIds = exact4.runTerminal.expectedShardIds;
    const deriveRequest =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest({
        namespaceId: scope.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.deriveTerminalFence,
        repositoryCommit: scope.repositoryCommit,
        planDigest: scope.planDigest,
        frozenRunDigest: scope.frozenRunDigest,
        runConfigArtifactBindingDigest: scope.runConfigArtifactBindingDigest,
        runtimeResourceSetId: scope.runtimeResourceSetId,
        resourceSetCommitmentDigest:
          exact4.resourceSetCommitment.commitmentDigest,
        expectedShardCount: expectedShardIds.length,
        expectedShardIdSetDigest:
          deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest(
            expectedShardIds
          ),
        requestedAt: FENCE_SEALED_AT,
      });
    const deriveReceipt =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        deriveRequest,
        exact4.runTerminal.fence,
        {
          checkedAt: FENCE_SEALED_AT,
          expiresAt: DERIVE_EXPIRES_AT,
        }
      );
    const claimRequest =
      createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest({
        namespaceId: scope.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
        repositoryCommit: scope.repositoryCommit,
        planDigest: scope.planDigest,
        frozenRunDigest: scope.frozenRunDigest,
        runConfigArtifactBindingDigest: scope.runConfigArtifactBindingDigest,
        runtimeResourceSetId: scope.runtimeResourceSetId,
        authorityDigest: registration.authorityDigest,
        resourceSetCommitmentDigest:
          exact4.resourceSetCommitment.commitmentDigest,
        terminalFenceDeriveReceipt: deriveReceipt,
        cleanupOwnerInstanceId:
          lifecycle.cleanupClaimAuthorityReceipt.cleanupOwnerInstanceId,
        claimedAt: CLAIMED_AT,
        minimumClaimExpiresAt: CLAIM_EXPIRES_AT,
      });
    const claimReceipt =
      createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        claimRequest,
        {
          cleanupClaimAuthorityReceipt: lifecycle.cleanupClaimAuthorityReceipt,
          registrationResult: registration,
          resourceSetCommitment: exact4.resourceSetCommitment,
          storedPriorActiveState: lifecycle.activeState,
          readLeaseLedgerRoot: lifecycle.readLeaseLedgerRoot,
          storedRunTerminalFence: exact4.runTerminal.fence,
          overdueReceipt: null,
          cleanupRequest: lifecycle.cleanupRequest,
          claimedAt: CLAIMED_AT,
          claimExpiresAt: CLAIM_EXPIRES_AT,
        },
        deriveReceipt
      );
    const readRequest =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest({
        namespaceId: scope.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult,
        authorityDigest: registration.authorityDigest,
        cleanupRequestDigest: lifecycle.cleanupRequest.requestDigest,
        recoveryClaimReceiptDigest: claimReceipt.receiptDigest,
        requestedAt: COMPLETED_AT,
      });
    let cleanupPostAttempts = 0;
    let resultReads = 0;
    const observed: Array<{ route: string; purpose: string | null }> = [];
    const client =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient(
        {
          namespaceId: scope.namespaceId,
          repositoryCommit: scope.repositoryCommit,
          environment: environment('cleanup'),
          clock: () => new Date(CLAIMED_AT),
          fetch: async (url, init) => {
            const route = String(url).split('/').at(-1)!;
            const purpose = new Headers(init?.headers).get(
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER
            );
            observed.push({ route, purpose });
            if (
              String(url).endsWith(
                `/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.terminalFenceDerivations}`
              )
            ) {
              return response(deriveReceipt, 201);
            }
            if (
              String(url).endsWith(
                `/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanupClaims}`
              )
            ) {
              return response(claimReceipt, 201);
            }
            if (
              String(url).endsWith(
                `/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.cleanups}`
              )
            ) {
              cleanupPostAttempts += 1;
              if (cleanupPostAttempts === 1) throw new Error('ack-lost');
              return response(lifecycle.cleanupReceipt);
            }
            resultReads += 1;
            return response(
              resultReads === 1
                ? createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
                    readRequest,
                    {
                      status: 'pending',
                      cleanupReceipt: null,
                      cleanupArchiveRecord: null,
                      residualProviderResourceIds: null,
                      readAt: COMPLETED_AT,
                    }
                  )
                : createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
                    readRequest,
                    {
                      status: 'cleaned',
                      cleanupReceipt: lifecycle.cleanupReceipt,
                      cleanupArchiveRecord: lifecycle.cleanupArchiveRecord,
                      residualProviderResourceIds: Object.freeze([]),
                      readAt: COMPLETED_AT,
                    }
                  )
            );
          },
        }
      );

    await expect(client.deriveTerminalFence(deriveRequest)).resolves.toEqual(
      deriveReceipt
    );
    await expect(client.claimPostMatrixCleanup(claimRequest)).resolves.toEqual(
      claimReceipt
    );
    await expect(
      client.storeCleanupReceipt(lifecycle.cleanupReceipt, claimReceipt)
    ).resolves.toBeUndefined();
    await expect(
      client.readCleanupResult(readRequest, claimReceipt)
    ).resolves.toEqual(expect.objectContaining({ status: 'pending' }));
    await expect(
      client.storeCleanupReceipt(lifecycle.cleanupReceipt, claimReceipt)
    ).resolves.toEqual(lifecycle.cleanupReceipt);
    await expect(
      client.readCleanupResult(readRequest, claimReceipt)
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'cleaned',
        residualProviderResourceIds: [],
      })
    );
    expect(observed.map(({ purpose }) => purpose)).toEqual([
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.deriveTerminalFence,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimPostMatrixCleanup,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.executePostMatrixCleanup,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.executePostMatrixCleanup,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult,
    ]);
  });

  it('fails closed for a missing service token or a foreign lifecycle role', async () => {
    const exact4 = fixture();
    const registration = exact4.registrationResults[0]!;
    let calls = 0;
    const noKeyClient =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourcePrepareClient(
        {
          namespaceId: scope.namespaceId,
          repositoryCommit: scope.repositoryCommit,
          environment: environment('prepare', false),
          fetch: async () => {
            calls += 1;
            return response(registration.registrationRequest);
          },
        }
      );
    await expect(
      noKeyClient.stageRegistration(registration.registrationRequest)
    ).resolves.toBeUndefined();
    expect(calls).toBe(0);
    expect(() =>
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceCleanupClient(
        {
          namespaceId: scope.namespaceId,
          repositoryCommit: scope.repositoryCommit,
          environment: environment('prepare'),
        }
      )
    ).toThrow();
  });
});
