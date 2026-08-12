import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture } from '../__tests__/agentHostedRetrievalRuntimeResourceLifecycleJournalFixtures';
import { createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture } from '../__tests__/agentHostedRetrievalRuntimeResourceLifecycleRawFixtures';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentBudgetLedger } from '../usage/agentBudgetLedger';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_MAXIMUM,
  createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
  createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptFromStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
  isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate,
  isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
  matchAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreContext,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
} from './agentHostedRetrievalRuntimeResource';

const digest = (label: string) => digestAgentCanonicalValue(label);

const createStoreSuccessor = (
  prior: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  sequence: number
): AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt => {
  const destroyedAt = new Date(
    Date.parse(prior.storedAt) + 1_000
  ).toISOString();
  const { receiptDigest: _receiptDigest, ...priorBase } = prior;
  const base = Object.freeze({
    ...priorBase,
    requestDigest: digest(`store-request-${sequence}`),
    expectedPriorTransportStoreReceiptDigest: prior.receiptDigest,
    transportLedgerRevision: prior.transportLedgerRevision + 1,
    spoolAadDigest: digest(`spool-aad-${sequence}`),
    spoolEnvelopeDigest: digest(`spool-envelope-${sequence}`),
    spoolReceiptDigest: digest(`spool-receipt-${sequence}`),
    supersededSpoolReceiptDigest: prior.spoolReceiptDigest,
    supersededSpoolDestroyedAt: destroyedAt,
    storedAt: destroyedAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

describe('hosted retrieval runtime resource lifecycle raw transport', () => {
  it('admits the maximum decoded ciphertext inside the raw request cap and rejects plus one', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture(
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
      );
    const canonicalBytes = new TextEncoder().encode(
      canonicalJsonText(fixture.storeRequest)
    ).byteLength;

    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
        fixture.storeRequest
      )
    ).toBe(true);
    expect(fixture.storeRequest.spoolWriteEnvelope.ciphertextSizeBytes).toBe(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
    );
    expect(
      fixture.storeRequest.spoolWriteEnvelope.ciphertextBase64Url
    ).toHaveLength(349_526);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    ).toBe(524_288);
    expect(canonicalBytes).toBe(370_446);
    expect(canonicalBytes).toBeLessThanOrEqual(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture(
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES +
          1
      )
    ).toThrow();
  });

  it('commits an exact progressive CAS history and destroys each superseded spool', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    const first = fixture.recoveryReceipt.transportStoreReceipt;
    const receipts = [first];
    while (
      receipts.length <
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_MAXIMUM
    ) {
      receipts.push(
        createStoreSuccessor(receipts.at(-1)!, receipts.length + 1)
      );
    }
    const history =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        receipts
      );

    expect(history.receipts).toHaveLength(4);
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        history
      )
    ).toBe(true);
    expect(
      history.receipts.slice(1).every((receipt, index) => {
        const prior = history.receipts[index]!;
        return (
          receipt.expectedPriorTransportStoreReceiptDigest ===
            prior.receiptDigest &&
          receipt.supersededSpoolReceiptDigest === prior.spoolReceiptDigest &&
          receipt.spoolReceiptDigest !== prior.spoolReceiptDigest &&
          receipt.transportLedgerRevision === prior.transportLedgerRevision + 1
        );
      })
    ).toBe(true);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        [...receipts, createStoreSuccessor(receipts.at(-1)!, 5)]
      )
    ).toThrow();

    const third = receipts[2]!;
    const { receiptDigest: _receiptDigest, ...thirdBase } = third;
    const foreignBase = Object.freeze({
      ...thirdBase,
      expectedPriorTransportStoreReceiptDigest: digest('foreign-prior-store'),
    });
    const foreign = Object.freeze({
      ...foreignBase,
      receiptDigest: digestAgentCanonicalValue(foreignBase),
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
        foreign
      )
    ).toBe(true);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        [receipts[0]!, receipts[1]!, foreign, receipts[3]!]
      )
    ).toThrow();
  });

  it('stores a bounded provider observation and rejects fully recomputed foreign context', () => {
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    const transportReceipt =
      fixture.storeRequest.transportReceiptSet.receipts[0]!;
    const authorization =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        {
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE,
          dispatchIntentDigest: fixture.intent.intentDigest,
          dispatchStageClaimReceiptDigest:
            fixture.currentRecoveryClaim.receiptDigest,
          transportReceiptDigest: transportReceipt.receiptDigest,
          mutationKind: fixture.intent.mutationKind,
          mutationSequence: fixture.intent.mutationSequence,
          providerConfigurationId: fixture.intent.providerConfigurationId,
          endpointId: fixture.intent.endpointId,
          method: 'GET',
          requestedAt: fixture.currentRecoveryClaim.claimedAt,
        }
      );
    const projectionInput = Object.freeze({
      dispatchIntentDigest: fixture.intent.intentDigest,
      dispatchStageClaimReceiptDigest:
        fixture.currentRecoveryClaim.receiptDigest,
      transportReceiptDigest: transportReceipt.receiptDigest,
      mutationKind: fixture.intent.mutationKind,
      mutationSequence: fixture.intent.mutationSequence,
      providerConfigurationId: fixture.intent.providerConfigurationId,
      endpointId: fixture.intent.endpointId,
      method: 'GET' as const,
      observationOutcome: 'already-absent' as const,
      resourceId: fixture.intent.resourceId,
      resourceRole: fixture.intent.resourceRole,
      resourceManifestDigest: null,
      httpStatus: 404,
      providerRequestId: 'provider-request.reconcile',
      requestProjectionDigest: fixture.intent.requestProjectionDigest,
      responseProjectionDigest: digest('reconcile-response-projection'),
      responseBodyDigest: digest('reconcile-response-body'),
      responseBytes: 2,
      observedAt: new Date(
        Date.parse(fixture.currentRecoveryClaim.claimedAt) + 1
      ).toISOString(),
    });
    const projection =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection(
        projectionInput
      );
    const storeRequest =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        authorization,
        projection
      );

    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        storeRequest
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreContext(
        storeRequest,
        fixture.intent,
        fixture.currentRecoveryClaim,
        transportReceipt
      )
    ).toBe(true);
    expect(
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptFromStoreRequest(
        storeRequest,
        {
          observationAuthorityIssuerId: 'authority.reconciliation',
          observationAuthorityImplementationDigest: digest(
            'reconciliation-implementation'
          ),
        }
      ).observationOutcome
    ).toBe('already-absent');

    const foreignClaimDigest = digest('foreign-current-claim');
    const {
      format: _authorizationFormat,
      version: _authorizationVersion,
      requestDigest: _authorizationDigest,
      ...authorizationInput
    } = authorization;
    const foreignAuthorization =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        {
          ...authorizationInput,
          dispatchStageClaimReceiptDigest: foreignClaimDigest,
        }
      );
    const foreignProjection =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection(
        {
          ...projectionInput,
          dispatchStageClaimReceiptDigest: foreignClaimDigest,
          responseProjectionDigest: digest('foreign-response-projection'),
        }
      );
    const foreignStore =
      createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        foreignAuthorization,
        foreignProjection
      );
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreContext(
        foreignStore,
        fixture.intent,
        fixture.currentRecoveryClaim,
        transportReceipt
      )
    ).toBe(false);
  });

  it('returns stable signed unfinished and archive pages within the bounded snapshot', () => {
    const rawFixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture();
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
        rawFixture.unfinishedPage
      )
    ).toBe(true);
    const candidate = rawFixture.unfinishedPage.candidates[0]!;
    expect(candidate.registrationRequestDigest).toBe(
      candidate.registrationRequest.requestDigest
    );
    expect(candidate.dispatchIntentSet.registrationRequestDigest).toBe(
      candidate.registrationRequest.requestDigest
    );

    const plan = createV8EvaluationPlan();
    const journalFixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        createAgentBudgetLedger(plan.budget.budget)
      );
    const requestedAt = '2026-08-03T00:00:00.000Z';
    const request =
      createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest({
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE,
        ...journalFixture.scope,
        lifecycleOwnerInstanceId: 'owner.lifecycle-archive-reader',
        pageSize: 8,
        cursor: null,
        requestedAt,
        minimumSnapshotExpiresAt: '2026-08-03T00:01:00.000Z',
      });
    const pageInput = Object.freeze({
      recoveryAuthorityIssuerId: 'authority.lifecycle-archive-reader',
      recoveryAuthorityImplementationDigest: digest(
        'lifecycle-archive-reader-implementation'
      ),
      snapshotId: 'snapshot.lifecycle-archive',
      snapshotRevision: 1,
      snapshotAt: '2026-08-03T00:00:01.000Z',
      expiresAt: '2026-08-03T00:01:01.000Z',
      archiveRecords: [journalFixture.archiveFamily.records[0]!],
      nextCursor: null,
      rollingJournalSetDigest: digest('rolling-lifecycle-journal-set'),
      archiveRootDigest: journalFixture.archiveFamily.familyDigest,
    });
    const page =
      createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(
        request,
        pageInput
      );
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(page)
    ).toBe(true);
    expect(page.archiveRecordDigests).toEqual([
      journalFixture.archiveFamily.records[0]!.archiveRecordDigest,
    ]);

    const { candidateDigest: _candidateDigest, ...candidateBase } = candidate;
    const foreignRegistrationRequest = journalFixture.registrationRequests[0]!;
    const forgedCandidateBase = Object.freeze({
      ...candidateBase,
      registrationRequest: foreignRegistrationRequest,
      registrationRequestDigest: foreignRegistrationRequest.requestDigest,
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
        Object.freeze({
          ...forgedCandidateBase,
          candidateDigest: digestAgentCanonicalValue(forgedCandidateBase),
        })
      )
    ).toBe(false);

    const {
      format: _requestFormat,
      version: _requestVersion,
      requestDigest: _requestDigest,
      ...requestInput
    } = request;
    const foreignRequest =
      createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest({
        ...requestInput,
        namespaceId: 'namespace.foreign',
      });
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(
        foreignRequest,
        pageInput
      )
    ).toThrow();
  });

  it('joins the final progressive store receipt to the immutable seal record', () => {
    const plan = createV8EvaluationPlan();
    const fixture =
      createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        createAgentBudgetLedger(plan.budget.budget)
      );
    const record = fixture.archiveFamily.records[0]!.journalRecord;
    const storeBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt' as const,
      version: 1 as const,
      requestDigest: digest('final-store-request'),
      operation: record.operation,
      registrationRequestDigest: record.registrationRequestDigest,
      expectedPriorTransportStoreReceiptDigest: null,
      transportAuthorityIssuerId: 'authority.lifecycle-transport',
      transportAuthorityImplementationDigest: digest(
        'lifecycle-transport-implementation'
      ),
      transportLedgerRevision: 1,
      dispatchIntentSetDigest: record.dispatchIntentSetDigest,
      dispatchStageClaimReceiptSetDigest:
        record.dispatchStageClaimReceiptSetDigest,
      dispatchStageClaimHistorySetDigest:
        record.dispatchStageClaimHistorySetDigest,
      transportReceiptSetDigest: record.transportReceiptSetDigest,
      spoolAadDigest: record.resultSpoolReceipt.aadDigest,
      spoolEnvelopeDigest: record.resultSpoolReceipt.envelopeDigest,
      spoolReceiptDigest: record.resultSpoolReceiptDigest,
      supersededSpoolReceiptDigest: null,
      supersededSpoolDestroyedAt: null,
      storedAt: new Date(
        Date.parse(record.resultSpoolReceipt.createdAt) + 1
      ).toISOString(),
    });
    const storeReceipt = Object.freeze({
      ...storeBase,
      receiptDigest: digestAgentCanonicalValue(storeBase),
    });
    const history =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        [storeReceipt]
      );
    const seal = createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest({
      purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.seal',
      journalRecord: record,
      transportStoreReceiptHistory: history,
      spoolDispositionReceipt: record.resultSpoolDispositionReceipt,
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest(seal)
    ).toBe(true);

    const foreignBase = Object.freeze({
      ...storeBase,
      spoolReceiptDigest: digest('foreign-final-spool'),
    });
    const foreignReceipt = Object.freeze({
      ...foreignBase,
      receiptDigest: digestAgentCanonicalValue(foreignBase),
    });
    const foreignHistory =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        [foreignReceipt]
      );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest({
        purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.seal',
        journalRecord: record,
        transportStoreReceiptHistory: foreignHistory,
        spoolDispositionReceipt: record.resultSpoolDispositionReceipt,
      })
    ).toThrow();
  });
});
