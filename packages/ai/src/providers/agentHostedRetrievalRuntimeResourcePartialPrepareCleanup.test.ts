import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4Fixture } from '../__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt,
  createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt,
  createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
  isAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt,
  isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt,
  isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
  matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaim,
  matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupDeleteIntent,
  type AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
} from './agentHostedRetrievalRuntimeResource';

const digest = (label: string) => digestAgentCanonicalValue(label);

const createRegistrationFixture = () =>
  createAgentHostedRetrievalRuntimeResourceExact4Fixture({
    namespaceId: 'namespace.partial-prepare',
    repositoryCommit: 'b'.repeat(40),
    planDigest: digest('partial-prepare-plan'),
    frozenRunDigest: digest('partial-prepare-frozen-run'),
    runConfigArtifactBindingDigest: digest('partial-prepare-run-config'),
    runtimeResourceSetId: 'runtime-resource-set.partial-prepare',
    registeredAt: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-13T00:00:00.000Z',
  });

const createDeleteIntent = (
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  known: AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource,
  claimReceiptDigest: string
) => {
  const request = registrationResult.registrationRequest;
  return createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent({
    intentId: `intent.partial-cleanup.${known.resourceRole}.${known.resourceId}`,
    lifecycleOwnerAuthorityIssuerId: 'authority.partial-cleanup-owner',
    lifecycleOwnerImplementationDigest: digest(
      'partial-cleanup-owner-implementation'
    ),
    namespaceId: request.namespaceId,
    repositoryCommit: request.repositoryCommit,
    planDigest: request.planDigest,
    frozenRunDigest: request.frozenRunDigest,
    runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
    runtimeResourceSetId: request.runtimeResourceSetId,
    registrationIntentDigest: request.registrationIntentDigest,
    registrationRequestDigest: request.requestDigest,
    authorityDigest: null,
    lifecycleClaimReceiptDigest: claimReceiptDigest,
    protocolFamily: request.protocolFamily,
    capabilityProfileId: request.capabilityProfileId,
    providerConfigurationId: request.providerConfigurationId,
    providerConfigurationDigest: request.providerConfigurationDigest,
    budgetReservationId: request.budgetReservationAuthority.reservationId,
    budgetReservationAuthorityDigest: request.budgetReservationAuthorityDigest,
    operation: 'delete',
    mutationKind: 'delete-resource',
    mutationSequence: 0,
    resourceId: known.resourceId,
    resourceRole: known.resourceRole,
    endpointId: `endpoint.partial-cleanup.${known.resourceRole}`,
    endpointClass: 'provider-hosted-retrieval-resource',
    method: 'DELETE',
    requestProjectionDigest: digestAgentCanonicalValue({
      resourceId: known.resourceId,
      role: known.resourceRole,
    }),
    requestBodyDigest: digest(`delete.${known.resourceId}`),
    requestBytes: 0,
    providerIdempotencyKeyBinding: 'dispatch-intent-digest',
    createdAt: '2026-08-11T00:02:02.000Z',
  });
};

describe('hosted retrieval runtime partial-prepare cleanup authority', () => {
  it('freezes successful pre-commit resources and authorizes each exact delete', () => {
    const fixture = createRegistrationFixture();
    const registrationResults = fixture.registrationResults.slice(0, 2);
    const abort =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        abortReason: 'prepare-failed',
        expectedRegistrationSetRevision: 2,
        registrationResults,
        partialCreateJournalArchiveRecords: [],
        abortAuthorityIssuerId: 'authority.partial-prepare-abort',
        abortAuthorityImplementationDigest: digest(
          'partial-prepare-abort-implementation'
        ),
        abortedAt: '2026-08-11T00:02:00.000Z',
      });
    const request =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
        {
          namespaceId: abort.namespaceId,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE,
          partialPrepareAbortReceipt: abort,
          cleanupOwnerInstanceId: 'owner.partial-prepare-cleanup',
          claimedAt: '2026-08-11T00:02:01.000Z',
          minimumClaimExpiresAt: '2026-08-11T00:03:01.000Z',
        }
      );
    const receipt =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt(
        request,
        {
          cleanupAuthorityIssuerId: 'authority.partial-prepare-cleanup',
          cleanupAuthorityImplementationDigest: digest(
            'partial-prepare-cleanup-implementation'
          ),
          claimLedgerRevision: 3,
          claimExpiresAt: '2026-08-11T00:04:01.000Z',
        }
      );

    expect(
      isAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt(abort)
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
        request
      )
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt(
        receipt
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaim(
        request,
        receipt,
        '2026-08-11T00:02:02.000Z'
      )
    ).toBe(true);
    expect(abort.registrationRequestDigests).toHaveLength(2);
    expect(abort.knownResources.length).toBeGreaterThanOrEqual(2);

    for (const known of abort.knownResources) {
      const registrationResult = registrationResults.find(
        (candidate) =>
          candidate.registrationRequestDigest ===
          known.registrationRequestDigest
      )!;
      const intent = createDeleteIntent(
        registrationResult,
        known,
        receipt.receiptDigest
      );
      expect(intent.authorityDigest).toBeNull();
      expect(
        matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupDeleteIntent(
          intent,
          request,
          receipt,
          '2026-08-11T00:02:02.000Z'
        )
      ).toBe(true);
    }
  });

  it('rejects an empty, full exact-four, duplicate, foreign, or expired claim scope', () => {
    const fixture = createRegistrationFixture();
    const input = {
      abortReason: 'prepare-failed' as const,
      expectedRegistrationSetRevision: 1,
      partialCreateJournalArchiveRecords: [],
      abortAuthorityIssuerId: 'authority.partial-prepare-abort',
      abortAuthorityImplementationDigest: digest(
        'partial-prepare-abort-implementation'
      ),
      abortedAt: '2026-08-11T00:02:00.000Z',
    };
    expect(() =>
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        ...input,
        registrationResults: [],
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        ...input,
        registrationResults: fixture.registrationResults,
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        ...input,
        registrationResults: [
          fixture.registrationResults[0]!,
          fixture.registrationResults[0]!,
        ],
      })
    ).toThrow();

    const abort =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        ...input,
        registrationResults: [fixture.registrationResults[0]!],
      });
    const request =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
        {
          namespaceId: abort.namespaceId,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE,
          partialPrepareAbortReceipt: abort,
          cleanupOwnerInstanceId: 'owner.partial-prepare-cleanup',
          claimedAt: '2026-08-11T00:02:01.000Z',
          minimumClaimExpiresAt: '2026-08-11T00:03:01.000Z',
        }
      );
    const receipt =
      createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt(
        request,
        {
          cleanupAuthorityIssuerId: 'authority.partial-prepare-cleanup',
          cleanupAuthorityImplementationDigest: digest(
            'partial-prepare-cleanup-implementation'
          ),
          claimLedgerRevision: 1,
          claimExpiresAt: '2026-08-11T00:04:01.000Z',
        }
      );
    const known = abort.knownResources[0]!;
    const intent = createDeleteIntent(
      fixture.registrationResults[0]!,
      known,
      receipt.receiptDigest
    );
    expect(
      matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupDeleteIntent(
        intent,
        request,
        receipt,
        receipt.claimExpiresAt
      )
    ).toBe(false);
    expect(
      matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupDeleteIntent(
        Object.freeze({
          ...intent,
          resourceId: 'provider-resource.foreign',
          intentDigest: digest('fully-recomputed-foreign-intent'),
        }),
        request,
        receipt,
        receipt.claimedAt
      )
    ).toBe(false);
  });
});
