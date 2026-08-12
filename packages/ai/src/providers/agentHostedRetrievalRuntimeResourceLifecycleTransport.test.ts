import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture } from '../__tests__/agentHostedRetrievalRuntimeResourceLifecycleJournalFixtures';
import {
  createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim,
  createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture,
} from '../__tests__/agentHostedRetrievalRuntimeResourceLifecycleRawFixtures';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentBudgetLedger } from '../usage/agentBudgetLedger';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CLAIM_RECEIPTS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS,
  createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleEmptyTransportJournalArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  matchAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt,
  matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization,
  matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistoryPrefixDigest,
  matchAgentHostedRetrievalRuntimeResourceRecoveryLifecycleDispatchRole,
} from './agentHostedRetrievalRuntimeResource';

const digest = (label: string) => digestAgentCanonicalValue(label);

describe('hosted retrieval runtime resource lifecycle transport journal', () => {
  it('preserves first delivery and a bounded full retained/takeover claim history', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    const intentSet = fixture.storeRequest.dispatchIntentSet;
    const initialSet = fixture.storeRequest.dispatchStageClaimReceiptSet;
    const transportDigest =
      fixture.storeRequest.transportReceiptSet.receipts[0]!.receiptDigest;
    const receipts = [...fixture.currentHistory.receipts];
    let prior = fixture.currentRecoveryClaim;

    while (
      receipts.length <
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CLAIM_RECEIPTS
    ) {
      prior = createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
        fixture.intent,
        prior,
        {
          claimedAtMs: Date.parse(prior.claimExpiresAt),
          ownerId: `owner.lifecycle-recovery-${receipts.length + 1}`,
          priorTransportReceiptDigest: transportDigest,
        }
      );
      receipts.push(prior);
    }
    const maximumHistory =
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        intentSet,
        initialSet,
        receipts
      );

    expect(maximumHistory.receipts).toHaveLength(8);
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        maximumHistory
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistoryPrefixDigest(
        intentSet,
        initialSet,
        maximumHistory,
        fixture.storedHistory.setDigest
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistoryPrefixDigest(
        intentSet,
        initialSet,
        maximumHistory,
        digest('foreign-history-prefix')
      )
    ).toBe(false);

    const ninth =
      createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
        fixture.intent,
        prior,
        {
          claimedAtMs: Date.parse(prior.claimExpiresAt),
          ownerId: 'owner.lifecycle-recovery-9',
          priorTransportReceiptDigest: transportDigest,
        }
      );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        intentSet,
        initialSet,
        [...receipts, ninth]
      )
    ).toThrow();

    const retainedAt = Date.parse(fixture.currentRecoveryClaim.claimedAt) + 1;
    const foreignRetainedRequest =
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
        {
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE,
          dispatchIntentDigest: fixture.intent.intentDigest,
          lifecycleOwnerInstanceId: 'owner.foreign-unexpired',
          expectedDispatchLedgerRevision:
            fixture.currentRecoveryClaim.dispatchLedgerRevision,
          expectedDispatchGeneration:
            fixture.currentRecoveryClaim.dispatchGeneration,
          expectedPriorStageClaimReceiptDigest:
            fixture.currentRecoveryClaim.receiptDigest,
          expectedPriorClaimExpiresAt:
            fixture.currentRecoveryClaim.claimExpiresAt,
          requestedAt: new Date(retainedAt).toISOString(),
          minimumClaimExpiresAt: new Date(retainedAt + 60_000).toISOString(),
        }
      );
    const foreignRetained =
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        fixture.intent,
        foreignRetainedRequest,
        {
          dispatchAuthorityIssuerId:
            fixture.currentRecoveryClaim.dispatchAuthorityIssuerId,
          dispatchAuthorityImplementationDigest:
            fixture.currentRecoveryClaim.dispatchAuthorityImplementationDigest,
          dispatchLedgerRevision:
            fixture.currentRecoveryClaim.dispatchLedgerRevision,
          dispatchGeneration: fixture.currentRecoveryClaim.dispatchGeneration,
          generationTransition: 'generation-retained',
          deliveryDisposition: 'reconcile-only-replay',
          claimedAt: foreignRetainedRequest.requestedAt,
          claimExpiresAt: foreignRetainedRequest.minimumClaimExpiresAt,
          priorTransportReceiptDigest: transportDigest,
          sealedJournalRecordDigest: null,
        }
      );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        intentSet,
        initialSet,
        [...fixture.currentHistory.receipts, foreignRetained]
      )
    ).toThrow();
  });

  it('freezes the null-prior crash window as a deterministic zero-payload recovery sentinel', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    const receipt = fixture.storeRequest.transportReceiptSet.receipts[0]!;

    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt(
        fixture.intent,
        fixture.initialClaim,
        fixture.storedRecoveryClaim,
        receipt
      )
    ).toBe(true);
    expect(receipt.dispatchStageClaimReceiptDigest).toBe(
      fixture.initialClaim.receiptDigest
    );
    expect(receipt.startedAt).toBe(fixture.initialClaim.claimedAt);
    expect(receipt.completedAt).toBe(fixture.storedRecoveryClaim.claimedAt);
    expect(receipt.dispatchState).toBe('dispatched');
    expect(receipt.outcome).toBe('post-dispatch-unknown');
    expect(receipt.responseBodyDigest).toBeNull();
    expect(receipt.responseBytes).toBe(0);
    expect(receipt.httpStatus).toBeNull();
    expect(receipt.providerRequestId).toBeNull();
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
        fixture.intent,
        fixture.storedRecoveryClaim,
        fixture.storedRecoveryClaim.claimedAt
      )
    ).toBe(false);
  });

  it('keeps recovery create work reconcile-only with zero mutation authority', () => {
    const plan = createV8EvaluationPlan();
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        createAgentBudgetLedger(plan.budget.budget)
      );
    const record = fixture.archiveFamily.records.find(
      ({ journalRecord }) => journalRecord.operation === 'create'
    )!.journalRecord;
    const intent = record.dispatchIntentSet.intents[0]!;
    const initial = record.dispatchStageClaimReceiptSet.receipts[0]!;
    const takeover =
      createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
        intent,
        initial,
        {
          claimedAtMs: Date.parse(initial.claimExpiresAt),
          ownerId: 'owner.lifecycle-create-recovery',
          priorTransportReceiptDigest:
            record.transportReceiptSet.receipts[0]!.receiptDigest,
        }
      );
    const observedAt = new Date(
      Date.parse(takeover.claimedAt) + 1
    ).toISOString();

    expect(
      matchAgentHostedRetrievalRuntimeResourceRecoveryLifecycleDispatchRole(
        intent,
        takeover,
        null,
        observedAt
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
        intent,
        takeover,
        observedAt
      )
    ).toBe(false);
    expect(
      matchAgentHostedRetrievalRuntimeResourceRecoveryLifecycleDispatchRole(
        intent,
        initial,
        null,
        initial.claimedAt
      )
    ).toBe(false);
  });

  it('keeps original mutation sequence numbers in reconciliation subsets', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    const request =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        {
          purpose:
            'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read',
          dispatchIntentDigest: fixture.intent.intentDigest,
          dispatchStageClaimReceiptDigest:
            fixture.currentRecoveryClaim.receiptDigest,
          transportReceiptDigest:
            fixture.storeRequest.transportReceiptSet.receipts[0]!.receiptDigest,
          mutationKind: 'create-primary',
          mutationSequence: 1,
          providerConfigurationId: fixture.intent.providerConfigurationId,
          endpointId: fixture.intent.endpointId,
          method: 'GET',
          requestedAt: fixture.currentRecoveryClaim.claimedAt,
        }
      );
    const observation =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt(
        request,
        {
          observationAuthorityIssuerId: 'authority.lifecycle-observation',
          observationAuthorityImplementationDigest: digest(
            'lifecycle-observation-implementation'
          ),
          observationOutcome: 'created',
          resourceId: 'provider-resource.reconciled',
          resourceRole: 'primary',
          resourceManifestDigest: null,
          httpStatus: 200,
          providerRequestId: 'provider-request.reconciled',
          observedAt: fixture.currentRecoveryClaim.claimedAt,
        }
      );
    const set =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
        {
          operation: 'create',
          registrationRequestDigest: fixture.intent.registrationRequestDigest,
          receipts: [observation],
        }
      );

    expect(
      set.receipts.map(({ mutationSequence }) => mutationSequence)
    ).toEqual([1]);
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
        set
      )
    ).toBe(true);
  });

  it('rejects an unresolved business outcome from the immutable journal seal', () => {
    const plan = createV8EvaluationPlan();
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        createAgentBudgetLedger(plan.budget.budget)
      );
    const record = fixture.archiveFamily.records.find(
      ({ journalRecord }) => journalRecord.operation === 'create'
    )!.journalRecord;
    const unresolved =
      createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult({
        operation: 'create',
        providerResourceId: record.businessResult.providerResourceId,
        auxiliaryResourceIds: record.businessResult.auxiliaryResourceIds,
        resourceManifestDigest: record.businessResult.resourceManifestDigest,
        resourceId: null,
        resourceRole: null,
        reconciliationObservationReceiptSet: null,
        reconciliationObservationReceiptSetDigest: null,
        outcome: 'provider-outcome-unresolved',
        completedAt: record.businessResult.completedAt,
      });
    const oldSpool = record.resultSpoolReceipt;
    const aad = createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
      namespaceId: oldSpool.namespaceId,
      repositoryCommit: oldSpool.repositoryCommit,
      planDigest: oldSpool.planDigest,
      frozenRunDigest: oldSpool.frozenRunDigest,
      runConfigArtifactBindingDigest: oldSpool.runConfigArtifactBindingDigest,
      runtimeResourceSetId: oldSpool.runtimeResourceSetId,
      lifecycleExpiresAt: oldSpool.lifecycleExpiresAt,
      registrationRequestDigest: oldSpool.registrationRequestDigest,
      authorityDigest: oldSpool.authorityDigest,
      lifecycleClaimReceiptDigest: oldSpool.lifecycleClaimReceiptDigest,
      operation: oldSpool.operation,
      resourceId: oldSpool.resourceId,
      resourceRole: oldSpool.resourceRole,
      dispatchIntentSetDigest: oldSpool.dispatchIntentSetDigest,
      dispatchStageClaimReceiptSetDigest:
        oldSpool.dispatchStageClaimReceiptSetDigest,
      dispatchStageClaimHistorySetDigest:
        oldSpool.dispatchStageClaimHistorySetDigest,
      transportReceiptSetDigest: oldSpool.transportReceiptSetDigest,
      businessResultDigest: unresolved.resultDigest,
      plaintextDigest: oldSpool.plaintextDigest,
    });
    const envelope =
      createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority({
        spoolRef:
          createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(aad),
        algorithm: oldSpool.algorithm,
        keyId: oldSpool.keyId,
        keyVersion: oldSpool.keyVersion,
        keyRefDigest: oldSpool.keyRefDigest,
        encryptionProfileDigest: oldSpool.encryptionProfileDigest,
        nonceBase64Url: 'A'.repeat(16),
        authenticationTagBase64Url: 'A'.repeat(22),
        ciphertextDigest: oldSpool.ciphertextDigest,
        ciphertextSizeBytes: oldSpool.ciphertextSizeBytes,
        aadDigest: digestAgentCanonicalValue(aad),
        plaintextDigest: oldSpool.plaintextDigest,
      });
    const spool =
      createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
        aad,
        envelope,
        { createdAt: oldSpool.createdAt, expiresAt: oldSpool.expiresAt }
      );
    const disposition =
      createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
        spool,
        {
          disposition: 'destroyed-after-business-seal',
          businessSealKind: 'partial-create-result',
          businessSealReceiptDigest: unresolved.resultDigest,
          disposedAt: record.resultSpoolDispositionReceipt.disposedAt,
        }
      );

    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord({
        dispatchIntentSet: record.dispatchIntentSet,
        dispatchStageClaimReceiptSet: record.dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet: record.dispatchStageClaimHistorySet,
        transportReceiptSet: record.transportReceiptSet,
        businessResult: unresolved,
        resultSpoolReceipt: spool,
        resultSpoolDispositionReceipt: disposition,
      })
    ).toThrow();
  });

  it('admits a nonempty one-record audit family and keeps release closure exact', () => {
    const plan = createV8EvaluationPlan();
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        createAgentBudgetLedger(plan.budget.budget)
      );
    const oneRecord =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        [fixture.archiveFamily.records[0]!]
      );

    expect(oneRecord.records).toHaveLength(1);
    expect(oneRecord.closureStatus).toBe('audit-incomplete');
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        oneRecord
      )
    ).toBe(true);
    expect(fixture.archiveFamily.closureStatus).toBe('zeroed');
    expect(fixture.archiveFamily.records.length).toBeGreaterThanOrEqual(8);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        []
      )
    ).toThrow();
    const empty =
      createAgentHostedRetrievalRuntimeResourceLifecycleEmptyTransportJournalArchiveFamily(
        fixture.scope
      );
    expect(empty.records).toEqual([]);
    expect(empty.closureStatus).toBe('zeroed');
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        empty
      )
    ).toBe(true);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS
    ).toBe(88);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        Array.from(
          {
            length:
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS +
              1,
          },
          () => fixture.archiveFamily.records[0]!
        )
      )
    ).toThrow();
  });
});
