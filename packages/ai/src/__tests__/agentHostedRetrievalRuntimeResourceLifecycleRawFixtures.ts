import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentEvaluationProviderResultSpoolEnvelope } from '../evaluation/agentEvaluationEvidenceAuthenticity';
import { createAgentHostedRetrievalRuntimeResourceExact4Fixture } from './agentHostedRetrievalRuntimeResourceFixtures';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE,
  createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
  createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
} from '../providers/agentHostedRetrievalRuntimeResource';

const at = (millis: number): string => new Date(millis).toISOString();
const digest = (label: string) => digestAgentCanonicalValue(label);

const STARTED_AT = Date.parse('2026-08-01T00:00:00.000Z');
const CLAIM_LIFETIME_MS = 125_000;

export const createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim = (
  intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  prior: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt | null,
  input: Readonly<{
    claimedAtMs: number;
    ownerId: string;
    priorTransportReceiptDigest: string | null;
  }>
): AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt => {
  const initial = prior === null;
  const request =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
      {
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE,
        dispatchIntentDigest: intent.intentDigest,
        lifecycleOwnerInstanceId: input.ownerId,
        expectedDispatchLedgerRevision: prior?.dispatchLedgerRevision ?? 0,
        expectedDispatchGeneration: prior?.dispatchGeneration ?? 0,
        expectedPriorStageClaimReceiptDigest: prior?.receiptDigest ?? null,
        expectedPriorClaimExpiresAt: prior?.claimExpiresAt ?? null,
        requestedAt: at(input.claimedAtMs),
        minimumClaimExpiresAt: at(input.claimedAtMs + 60_000),
      }
    );
  return createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
    intent,
    request,
    {
      dispatchAuthorityIssuerId: 'authority.lifecycle-dispatch',
      dispatchAuthorityImplementationDigest: digest(
        'lifecycle-dispatch-implementation'
      ),
      dispatchLedgerRevision: (prior?.dispatchLedgerRevision ?? 0) + 1,
      dispatchGeneration: (prior?.dispatchGeneration ?? 0) + 1,
      generationTransition: initial
        ? 'initial-first-delivery'
        : 'expired-owner-takeover',
      deliveryDisposition: initial
        ? 'dispatch-authorized-first-delivery'
        : 'reconcile-only-replay',
      claimedAt: at(input.claimedAtMs),
      claimExpiresAt: at(input.claimedAtMs + CLAIM_LIFETIME_MS),
      priorTransportReceiptDigest: input.priorTransportReceiptDigest,
      sealedJournalRecordDigest: null,
    }
  );
};

const ciphertextBase64Url = (byteLength: number): string =>
  'A'.repeat(Math.ceil((byteLength * 8) / 6));

export type AgentHostedRetrievalRuntimeResourceLifecycleRawFixture = Readonly<{
  intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
  initialClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
  storedRecoveryClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
  currentRecoveryClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
  storedHistory: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
  currentHistory: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
  storeRequest: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest;
  recoveryReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt;
  unfinishedPage: AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage;
}>;

export const createAgentHostedRetrievalRuntimeResourceLifecycleRawFixture = (
  ciphertextBytes = 1
): AgentHostedRetrievalRuntimeResourceLifecycleRawFixture => {
  const registrationFixture =
    createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      namespaceId: 'namespace.lifecycle-test',
      repositoryCommit: 'a'.repeat(40),
      planDigest: digest('plan'),
      frozenRunDigest: digest('frozen-run'),
      runConfigArtifactBindingDigest: digest('run-config'),
      runtimeResourceSetId: 'runtime-resource-set.lifecycle-test',
      registeredAt: at(STARTED_AT),
      expiresAt: at(
        STARTED_AT +
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_LIFETIME_MS
      ),
    });
  const registrationResult = registrationFixture.registrationResults[0]!;
  const registrationRequest = registrationResult.registrationRequest;
  const authorityDigest = registrationResult.authorityDigest;
  const lifecycleClaimReceiptDigest = digest('cleanup-claim');
  const intent =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent({
      intentId: 'intent.lifecycle-delete.0',
      lifecycleOwnerAuthorityIssuerId: 'authority.lifecycle-owner',
      lifecycleOwnerImplementationDigest: digest(
        'lifecycle-owner-implementation'
      ),
      namespaceId: registrationRequest.namespaceId,
      repositoryCommit: registrationRequest.repositoryCommit,
      planDigest: registrationRequest.planDigest,
      frozenRunDigest: registrationRequest.frozenRunDigest,
      runConfigArtifactBindingDigest:
        registrationRequest.runConfigArtifactBindingDigest,
      runtimeResourceSetId: registrationRequest.runtimeResourceSetId,
      registrationIntentDigest: registrationRequest.registrationIntentDigest,
      registrationRequestDigest: registrationRequest.requestDigest,
      authorityDigest,
      lifecycleClaimReceiptDigest,
      protocolFamily: registrationRequest.protocolFamily,
      capabilityProfileId: registrationRequest.capabilityProfileId,
      providerConfigurationId: registrationRequest.providerConfigurationId,
      providerConfigurationDigest:
        registrationRequest.providerConfigurationDigest,
      budgetReservationId:
        registrationRequest.budgetReservationAuthority.reservationId,
      budgetReservationAuthorityDigest:
        registrationRequest.budgetReservationAuthorityDigest,
      operation: 'delete',
      mutationKind: 'delete-resource',
      mutationSequence: 0,
      resourceId: registrationResult.authority.providerResourceId,
      resourceRole: 'primary',
      endpointId: 'endpoint.lifecycle-delete',
      endpointClass: 'provider-hosted-retrieval-resource',
      method: 'DELETE',
      requestProjectionDigest: digest('delete-request-projection'),
      requestBodyDigest: digest('delete-request-body'),
      requestBytes: 1,
      providerIdempotencyKeyBinding: 'dispatch-intent-digest',
      createdAt: at(STARTED_AT),
    });
  const intentSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet([
      intent,
    ]);
  const initialClaim =
    createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
      intent,
      null,
      {
        claimedAtMs: STARTED_AT,
        ownerId: 'owner.lifecycle-initial',
        priorTransportReceiptDigest: null,
      }
    );
  const initialClaimSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
      intentSet,
      [initialClaim]
    );
  const storedRecoveryClaim =
    createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
      intent,
      initialClaim,
      {
        claimedAtMs: STARTED_AT + CLAIM_LIFETIME_MS,
        ownerId: 'owner.lifecycle-recovery-1',
        priorTransportReceiptDigest: null,
      }
    );
  const storedHistory =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
      intentSet,
      initialClaimSet,
      [initialClaim, storedRecoveryClaim]
    );
  const conservativeReceipt =
    createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt(
      intent,
      initialClaim,
      storedRecoveryClaim
    );
  const transportReceiptSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
      intentSet,
      initialClaimSet,
      [conservativeReceipt]
    );
  const plaintextDigest = digest('normalized-lifecycle-response');
  const businessResultDigest = digest('pending-business-result');
  const spoolCreatedAtMs = STARTED_AT + CLAIM_LIFETIME_MS + 1_000;
  const lifecycleExpiresAt = registrationRequest.minimumExpiresAt;
  const spoolAad = createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
    namespaceId: intent.namespaceId,
    repositoryCommit: intent.repositoryCommit,
    planDigest: intent.planDigest,
    frozenRunDigest: intent.frozenRunDigest,
    runConfigArtifactBindingDigest: intent.runConfigArtifactBindingDigest,
    runtimeResourceSetId: intent.runtimeResourceSetId,
    lifecycleExpiresAt,
    registrationRequestDigest: intent.registrationRequestDigest,
    authorityDigest,
    lifecycleClaimReceiptDigest,
    operation: 'delete',
    resourceId: intent.resourceId,
    resourceRole: intent.resourceRole,
    dispatchIntentSetDigest: intentSet.setDigest,
    dispatchStageClaimReceiptSetDigest: initialClaimSet.setDigest,
    dispatchStageClaimHistorySetDigest: storedHistory.setDigest,
    transportReceiptSetDigest: transportReceiptSet.setDigest,
    businessResultDigest,
    plaintextDigest,
  });
  const spoolRef =
    createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(spoolAad);
  const spoolWriteEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: spoolRef,
    algorithm: 'aes-256-gcm',
    keyId: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
    keyVersion:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
    keyRefDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
    encryptionProfileDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
    nonceBase64Url: 'A'.repeat(16),
    authenticationTagBase64Url: 'A'.repeat(22),
    ciphertextBase64Url: ciphertextBase64Url(ciphertextBytes),
    aadDigest: digestAgentCanonicalValue(spoolAad),
  });
  const spoolEnvelopeAuthority =
    createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority({
      spoolRef,
      algorithm: 'aes-256-gcm',
      keyId: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
      keyVersion:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
      keyRefDigest: spoolWriteEnvelope.keyRefDigest,
      encryptionProfileDigest: spoolWriteEnvelope.encryptionProfileDigest,
      nonceBase64Url: spoolWriteEnvelope.nonceBase64Url,
      authenticationTagBase64Url: spoolWriteEnvelope.authenticationTagBase64Url,
      ciphertextDigest: spoolWriteEnvelope.ciphertextDigest,
      ciphertextSizeBytes: spoolWriteEnvelope.ciphertextSizeBytes,
      aadDigest: spoolWriteEnvelope.aadDigest,
      plaintextDigest,
    });
  const spoolReceipt =
    createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
      spoolAad,
      spoolEnvelopeAuthority,
      {
        createdAt: at(spoolCreatedAtMs),
        expiresAt: lifecycleExpiresAt,
      }
    );
  const storeRequest =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest({
      purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.transport',
      expectedPriorTransportStoreReceiptDigest: null,
      dispatchIntentSet: intentSet,
      dispatchStageClaimReceiptSet: initialClaimSet,
      dispatchStageClaimHistorySet: storedHistory,
      transportReceiptSet,
      spoolAad,
      spoolWriteEnvelope,
      spoolEnvelopeAuthority,
      spoolReceipt,
    });
  const storeReceipt =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
      storeRequest,
      {
        transportAuthorityIssuerId: 'authority.lifecycle-transport',
        transportAuthorityImplementationDigest: digest(
          'lifecycle-transport-implementation'
        ),
        transportLedgerRevision: 1,
        supersededSpoolReceiptDigest: null,
        supersededSpoolDestroyedAt: null,
        storedAt: at(spoolCreatedAtMs + 1_000),
      }
    );
  const currentRecoveryClaim =
    createAgentHostedRetrievalRuntimeResourceLifecycleFixtureClaim(
      intent,
      storedRecoveryClaim,
      {
        claimedAtMs: STARTED_AT + CLAIM_LIFETIME_MS * 2,
        ownerId: 'owner.lifecycle-recovery-2',
        priorTransportReceiptDigest: conservativeReceipt.receiptDigest,
      }
    );
  const currentHistory =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
      intentSet,
      initialClaimSet,
      [initialClaim, storedRecoveryClaim, currentRecoveryClaim]
    );
  const recoveryRequest =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
      {
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE,
        namespaceId: intent.namespaceId,
        dispatchIntentDigest: intent.intentDigest,
        dispatchStageClaimReceiptDigest: currentRecoveryClaim.receiptDigest,
        expectedPriorTransportReceiptDigest: conservativeReceipt.receiptDigest,
        spoolRef,
        lifecycleOwnerInstanceId: currentRecoveryClaim.lifecycleOwnerInstanceId,
        requestedAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 1_000),
        minimumReceiptExpiresAt: at(
          STARTED_AT + CLAIM_LIFETIME_MS * 2 + 61_000
        ),
      }
    );
  const recoveryReceipt =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
      recoveryRequest,
      currentHistory,
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        [storeReceipt]
      ),
      storeRequest,
      storeReceipt,
      {
        recoveryAuthorityIssuerId: 'authority.lifecycle-recovery',
        recoveryAuthorityImplementationDigest: digest(
          'lifecycle-recovery-implementation'
        ),
        readAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 2_000),
        expiresAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 62_000),
      }
    );
  const unfinishedRequest =
    createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
      {
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE,
        namespaceId: intent.namespaceId,
        repositoryCommit: intent.repositoryCommit,
        planDigest: intent.planDigest,
        frozenRunDigest: intent.frozenRunDigest,
        runConfigArtifactBindingDigest: intent.runConfigArtifactBindingDigest,
        runtimeResourceSetId: intent.runtimeResourceSetId,
        lifecycleOwnerInstanceId: currentRecoveryClaim.lifecycleOwnerInstanceId,
        pageSize: 8,
        cursor: null,
        requestedAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 1_000),
        minimumSnapshotExpiresAt: at(
          STARTED_AT + CLAIM_LIFETIME_MS * 2 + 61_000
        ),
      }
    );
  const unfinishedCandidate =
    createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
      registrationRequest,
      intentSet,
      currentHistory,
      {
        unfinishedState: 'transport-stored-before-seal',
        durableTransportReceiptSetDigest: transportReceiptSet.setDigest,
        spoolRef,
        transportStoreReceiptDigest: storeReceipt.receiptDigest,
      }
    );
  const unfinishedPage =
    createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
      unfinishedRequest,
      {
        recoveryAuthorityIssuerId: 'authority.lifecycle-recovery',
        recoveryAuthorityImplementationDigest: digest(
          'lifecycle-recovery-implementation'
        ),
        snapshotId: 'snapshot.lifecycle-unfinished',
        snapshotRevision: 1,
        snapshotAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 2_000),
        expiresAt: at(STARTED_AT + CLAIM_LIFETIME_MS * 2 + 62_000),
        candidates: [unfinishedCandidate],
        nextCursor: null,
      }
    );
  return Object.freeze({
    intent,
    initialClaim,
    storedRecoveryClaim,
    currentRecoveryClaim,
    storedHistory,
    currentHistory,
    storeRequest,
    recoveryReceipt,
    unfinishedPage,
  });
};
