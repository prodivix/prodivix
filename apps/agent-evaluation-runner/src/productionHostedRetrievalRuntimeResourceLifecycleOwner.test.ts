import { readFileSync } from 'node:fs';
import {
  createAgentEvaluationProductionRunConfigArtifactBinding,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupRequest,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  digestAgentCanonicalValue,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture } from '../../../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient,
  AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient,
} from './hostedRetrievalRuntimeResourceLifecycleClient';
import type { AgentEvaluationHostedRetrievalRuntimeResourceProvider } from './hostedRetrievalRuntimeResourceProvider';
import {
  createAgentEvaluationHostedRetrievalRuntimeResourceSetId,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwner,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwner,
} from './productionHostedRetrievalRuntimeResourceLifecycleOwner';

const NOW = '2026-08-11T00:04:12.000Z' as Instant;
const CLAIM_EXPIRES_AT = '2026-08-11T00:14:12.000Z' as Instant;
const FENCE_EXPIRES_AT = '2026-08-11T00:06:17.000Z' as Instant;
const COMMIT = 'a'.repeat(40);

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({
    test: 'hosted-runtime-resource-lifecycle-owner',
    label,
  });

const productionBinding = () => {
  const document = materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../specs/evaluation/g4-real-model-evaluation.example.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as Record<string, unknown>
  );
  const config = requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(document, {
      clock: () => '2026-08-08T00:00:00.000Z',
      expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    }),
    '0123456789abcdef0123456789abcdef01234567'
  );
  const artifactBinding =
    createAgentEvaluationProductionRunConfigArtifactBinding({
      sourcePlanArtifactName: 'g4-plan-123456-1',
      sourcePlanArtifactDigest: `sha256:${'1'.repeat(64)}`,
      sourcePlanWorkflowRunId: '123456',
      sourcePlanWorkflowRunAttempt: 1,
      runConfigFileName: 'production-run-config.json',
      runConfigByteLength: 1_024,
      runConfigCanonicalBytesDigest: config.sourceConfigDigest,
      sourceConfigDigest: config.sourceConfigDigest,
      frozenRunDigest: config.frozenRunDigest,
      planDigest: config.plan.planDigest,
      repositoryCommit: config.plan.repositoryCommit,
    });
  return Object.freeze({ config, artifactBinding });
};

const providerCloseReceipt = () => {
  const base = Object.freeze({
    status: 'clean' as const,
    acceptedSessionCount: 0,
    completedSessionCount: 0,
    inFlightSessionCount: 0 as const,
    closedAt: NOW,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

describe('production hosted retrieval runtime resource lifecycle owner', () => {
  it('stages each request before one idempotent Provider create and seals exact four results', async () => {
    const binding = productionBinding();
    const events: string[] = [];
    const stageAttempts = new Map<string, number>();
    const resultAttempts = new Map<string, number>();
    let providerCreateCount = 0;
    let providerCloseCount = 0;
    const client = Object.freeze({
      async stageRegistration(request) {
        const attempt = (stageAttempts.get(request.requestDigest) ?? 0) + 1;
        stageAttempts.set(request.requestDigest, attempt);
        events.push(`stage:${request.requestDigest}:${attempt}`);
        if (attempt === 1) throw new Error('stage-ack-lost');
        events.push(`stage-ack:${request.requestDigest}`);
        return request;
      },
      async storeRegistrationResult(result) {
        const attempt = (resultAttempts.get(result.resultDigest) ?? 0) + 1;
        resultAttempts.set(result.resultDigest, attempt);
        events.push(`result:${result.registrationRequestDigest}:${attempt}`);
        if (attempt === 1) throw new Error('result-ack-lost');
        return result;
      },
    }) satisfies AgentEvaluationHostedRetrievalRuntimeResourcePrepareClient;
    const provider = Object.freeze({
      async createResource({ request }) {
        providerCreateCount += 1;
        expect(events.at(-1)).toBe(`stage-ack:${request.requestDigest}`);
        const key = `${request.protocolFamily}.${request.capabilityProfileId}`;
        return Object.freeze({
          providerResourceId: `resource.${key}`,
          auxiliaryResourceIds:
            request.protocolFamily === 'openai-responses'
              ? Object.freeze([`file.${key}`])
              : Object.freeze([]),
          resourceManifestDigest: digest(`manifest.${key}`),
          contentUploadReceiptDigest: digest(`upload.${key}`),
          creationDispatchIntentSetDigest: digest(`dispatch.${key}`),
          creationTransportReceiptSetDigest: digest(`transport.${key}`),
          creationResultSpoolReceiptSetDigest: digest(`spool.${key}`),
        });
      },
      async deleteResource() {
        throw new Error('prepare close attempted provider deletion');
      },
      async close() {
        providerCloseCount += 1;
        return providerCloseReceipt();
      },
    }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceProvider;
    let budgetRevision = 0;
    const owner =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourcePrepareOwner(
        {
          namespaceId: 'namespace.hosted-runtime-prepare',
          plan: binding.config.plan,
          frozenBinding: binding,
          client,
          budgetAuthorities: Object.freeze({
            async reserve({ plan, reservationId }) {
              budgetRevision += 1;
              return createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
                {
                  namespaceId: 'namespace.hosted-runtime-prepare',
                  planDigest: plan.planDigest,
                  reservePolicyDigest: plan.budget.reservePolicyDigest,
                  budgetDigest: plan.budget.budgetDigest,
                  reservationId,
                  ledgerRevision: budgetRevision,
                  demandDigest: digest(`demand.${reservationId}`),
                  demandBytesDigest: digest(`demand-bytes.${reservationId}`),
                  reservedAt: NOW,
                }
              );
            },
          }),
          provider,
          clock: () => new Date(NOW),
        }
      );

    const prepared = await owner.prepare();
    expect(prepared.registrationResults).toHaveLength(4);
    expect(prepared.authoritySet.authorities).toHaveLength(4);
    expect(prepared.resourceSetCommitment.authorityBindings).toHaveLength(4);
    expect(providerCreateCount).toBe(4);
    expect([...stageAttempts.values()]).toEqual([2, 2, 2, 2]);
    expect([...resultAttempts.values()]).toEqual([2, 2, 2, 2]);
    expect(owner.runtimeResourceSetId).toBe(
      createAgentEvaluationHostedRetrievalRuntimeResourceSetId({
        planDigest: binding.config.plan.planDigest,
        frozenRunDigest: binding.config.frozenRunDigest,
        runConfigArtifactBindingDigest: binding.artifactBinding.bindingDigest,
      })
    );
    await expect(owner.close()).resolves.toEqual(providerCloseReceipt());
    expect(providerCloseCount).toBe(1);
    await expect(owner.prepare()).rejects.toThrow();
  }, 30_000);

  it('derives one durable terminal fence, claims exact four, and recovers cleanup ACK loss through zero readback', async () => {
    const expectedShardIds = Object.freeze(['shard.alpha']);
    const fixture =
      createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
        namespaceId: 'namespace.hosted-runtime-cleanup',
        repositoryCommit: COMMIT,
        planDigest: digest('cleanup-plan'),
        frozenRunDigest: digest('cleanup-frozen-run'),
        runConfigArtifactBindingDigest: digest('cleanup-binding'),
        runtimeResourceSetId: 'runtime-resource-set.cleanup-owner',
        registeredAt: '2026-08-11T00:00:00.000Z',
        expiresAt: '2026-08-13T00:00:00.000Z',
        expectedShardIds,
        terminalShardLedgerEntries: Object.freeze([
          Object.freeze({
            shardId: 'shard.alpha',
            shardLeaseGeneration: 2,
            checkpointDigest: digest('checkpoint.alpha'),
            checkpointUpdatedAt: '2026-08-11T00:04:10.000Z' as Instant,
            terminalAttempts: Object.freeze([
              Object.freeze({
                attemptId: 'attempt.alpha',
                attemptDigest: digest('attempt.alpha'),
                status: 'completed' as const,
                completedAt: '2026-08-11T00:04:10.000Z' as Instant,
              }),
            ]),
          }),
        ]),
        terminalFenceSealedAt: '2026-08-11T00:04:11.000Z',
        timing: Object.freeze({
          readCheckedAt: '2026-08-11T00:01:00.000Z',
          readExpiresAt: '2026-08-11T00:04:00.000Z',
          cleanupClaimedAt: NOW,
          cleanupClaimExpiresAt: CLAIM_EXPIRES_AT,
          cleanupDispatchedAt: '2026-08-11T00:04:13.000Z',
          cleanupCompletedAt: '2026-08-11T00:04:14.000Z',
        }),
      });
    let deriveCalls = 0;
    let claimCalls = 0;
    let cleanupStoreCalls = 0;
    let resultReadCalls = 0;
    const stored = new Map<
      string,
      AgentHostedRetrievalRuntimeResourceCleanupReceipt
    >();
    const claims = new Map<
      string,
      AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
    >();
    const client = Object.freeze({
      async deriveTerminalFence(request) {
        deriveCalls += 1;
        return createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
          request,
          fixture.runTerminal.fence,
          { checkedAt: NOW, expiresAt: FENCE_EXPIRES_AT }
        );
      },
      async claimPostMatrixCleanup(request) {
        claimCalls += 1;
        const registrationIndex = fixture.registrationResults.findIndex(
          ({ authorityDigest }) => authorityDigest === request.authorityDigest
        );
        const lifecycle = fixture.lifecycles[registrationIndex]!;
        const registrationResult =
          fixture.registrationResults[registrationIndex]!;
        const claimAuthority =
          createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
            registrationResult,
            fixture.resourceSetCommitment,
            lifecycle.activeState,
            {
              claimId: `claim.${claimCalls}`,
              claimAuthorityIssuerId: 'authority.cleanup-owner-test',
              claimAuthorityImplementationDigest: digest(
                'cleanup-owner-implementation'
              ),
              claimLedgerRevision: 100 + claimCalls,
              cleanupOwnerInstanceId: 'cleanup-owner.post-matrix',
              claimGeneration: 2,
              claimedAt: NOW,
              claimExpiresAt: CLAIM_EXPIRES_AT,
            }
          );
        const cleanupRequest =
          createAgentHostedRetrievalRuntimeResourceCleanupRequest({
            namespaceId: 'namespace.hosted-runtime-cleanup',
            repositoryCommit: COMMIT,
            planDigest: registrationResult.authority.planDigest,
            frozenRunDigest: registrationResult.authority.frozenRunDigest,
            runConfigArtifactBindingDigest:
              registrationResult.authority.runConfigArtifactBindingDigest,
            runtimeResourceSetId:
              registrationResult.authority.runtimeResourceSetId,
            authorityDigest: registrationResult.authorityDigest,
            resourceSetCommitmentDigest:
              fixture.resourceSetCommitment.commitmentDigest,
            readLeaseLedgerRootDigest: lifecycle.readLeaseLedgerRoot.rootDigest,
            cleanupClaimAuthorityReceiptDigest: claimAuthority.receiptDigest,
            deletionAuthorityReceiptDigest:
              registrationResult.deletionAuthorityReceiptDigest,
            cleanupOwnerInstanceId: 'cleanup-owner.post-matrix',
            claimGeneration: claimAuthority.claimGeneration,
            priorActiveState: lifecycle.activeState,
            priorActiveStateDigest: lifecycle.activeState.stateDigest,
            claimedLifecycle: 'cleanup-in-progress',
            runTerminalFence: fixture.runTerminal.fence,
            runTerminalFenceDigest: fixture.runTerminal.fence.fenceDigest,
            cleanupReason: 'matrix-terminal',
            overdueReceiptDigest: null,
            requestedAt: NOW,
            deletionNotBefore: NOW,
          });
        const receipt =
          createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
            request,
            {
              cleanupClaimAuthorityReceipt: claimAuthority,
              registrationResult,
              resourceSetCommitment: fixture.resourceSetCommitment,
              storedPriorActiveState: lifecycle.activeState,
              readLeaseLedgerRoot: lifecycle.readLeaseLedgerRoot,
              storedRunTerminalFence: fixture.runTerminal.fence,
              overdueReceipt: null,
              cleanupRequest,
              claimedAt: NOW,
              claimExpiresAt: CLAIM_EXPIRES_AT,
            },
            request.terminalFenceDeriveReceipt
          );
        claims.set(receipt.receiptDigest, receipt);
        return receipt;
      },
      async storeCleanupReceipt(receipt) {
        cleanupStoreCalls += 1;
        if (cleanupStoreCalls === 1) throw new Error('cleanup-ack-lost');
        stored.set(receipt.cleanupRequestDigest, receipt);
        return receipt;
      },
      async readCleanupResult(request, claimReceipt) {
        resultReadCalls += 1;
        expect(claims.get(claimReceipt.receiptDigest)).toBe(claimReceipt);
        const cleanupReceipt = stored.get(request.cleanupRequestDigest);
        if (!cleanupReceipt) {
          return createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
            request,
            {
              status: 'pending',
              cleanupReceipt: null,
              cleanupArchiveRecord: null,
              residualProviderResourceIds: null,
              readAt: NOW,
            }
          );
        }
        const cleanupArchiveRecord =
          createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord({
            repositoryCommit: COMMIT,
            registrationResult: claimReceipt.registrationResult,
            resourceSetCommitment: claimReceipt.resourceSetCommitment,
            cleanupRequest: claimReceipt.cleanupRequest,
            storedCleanupClaimAuthorityReceipt:
              claimReceipt.cleanupClaimAuthorityReceipt,
            storedPriorActiveState: claimReceipt.storedPriorActiveState,
            readLeaseLedgerRoot: claimReceipt.readLeaseLedgerRoot,
            storedRunTerminalFence: claimReceipt.storedRunTerminalFence,
            overdueReceipt: claimReceipt.overdueReceipt,
            cleanupReceipt,
          });
        return createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
          request,
          {
            status: 'cleaned',
            cleanupReceipt,
            cleanupArchiveRecord,
            residualProviderResourceIds: Object.freeze([]),
            readAt: NOW,
          }
        );
      },
    }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceCleanupClient;
    const deleted: string[] = [];
    const provider = Object.freeze({
      async createResource() {
        throw new Error('cleanup attempted provider create');
      },
      async deleteResource({ claimReceipt, resourceId, resourceRole }) {
        deleted.push(resourceId);
        return Object.freeze({
          resourceId,
          resourceRole,
          outcome: 'deleted' as const,
          cleanupClaimAuthorityReceiptDigest:
            claimReceipt.cleanupClaimAuthorityReceiptDigest,
          dispatchIntentDigest: digest(`delete-dispatch.${resourceId}`),
          transportReceiptDigest: digest(`delete-transport.${resourceId}`),
          resultSpoolReceiptDigest: digest(`delete-spool.${resourceId}`),
          resultSpoolDispositionReceiptDigest: digest(
            `delete-spool-disposition.${resourceId}`
          ),
          dispatchCreatedAt: NOW,
          completedAt: NOW,
        });
      },
      async close() {
        return providerCloseReceipt();
      },
    }) satisfies AgentEvaluationHostedRetrievalRuntimeResourceProvider;
    const owner =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceCleanupOwner(
        {
          namespaceId: 'namespace.hosted-runtime-cleanup',
          repositoryCommit: COMMIT,
          cleanupOwnerInstanceId: 'cleanup-owner.post-matrix',
          client,
          provider,
          clock: () => new Date(NOW),
          wait: async () => {
            throw new Error('already-expired read lease unexpectedly waited');
          },
          minimumClaimLifetimeMs: 300_000,
        }
      );

    const results = await owner.cleanup(
      {
        registrationResults: fixture.registrationResults,
        resourceSetCommitment: fixture.resourceSetCommitment,
      },
      expectedShardIds
    );
    expect(results).toHaveLength(4);
    expect(
      results.every(
        (result) =>
          result.status === 'cleaned' &&
          result.residualProviderResourceIds?.length === 0
      )
    ).toBe(true);
    expect(deriveCalls).toBe(1);
    expect(claimCalls).toBe(4);
    expect(deleted).toHaveLength(6);
    expect(cleanupStoreCalls).toBe(5);
    expect(resultReadCalls).toBe(5);
  }, 30_000);
});
