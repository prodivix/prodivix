import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentModelEvaluationPlan } from '../evaluation/agentEvaluation.types';
import {
  createAgentHostedRetrievalRuntimeResourceLifecycleFixture,
  type AgentHostedRetrievalRuntimeResourceExact4LifecycleFixture,
  type AgentHostedRetrievalRuntimeResourceLifecycleTiming,
} from './agentHostedRetrievalRuntimeResourceFixtures';
import {
  createAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbePublicResourceMaterial,
} from '../providers/agentCapabilityProbeProgram';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  type AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  type AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  type AgentHostedRetrievalRuntimeResourceProfileId,
  type AgentHostedRetrievalRuntimeResourceProtocolFamily,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
} from '../providers/agentHostedRetrievalRuntimeResource';
import {
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
  type AgentBudgetSettlement,
} from '../usage/agentBudgetLedger';

export type AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming =
  Readonly<{
    startedAt: string;
    claimExpiresAt: string;
    transportCompletedAt: string;
    spoolCreatedAt: string;
    settledAt: string;
    expiresAt: string;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureScope =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    planDigest: string;
    frozenRunDigest: string;
    runConfigArtifactBindingDigest: string;
    runtimeResourceSetId: string;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleAuthorityCommitment =
  Readonly<{
    contentUploadReceiptDigest: string;
    creationDispatchIntentSetDigest: string;
    creationTransportReceiptSetDigest: string;
    creationResultSpoolReceiptSetDigest: string;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture =
  Readonly<{
    budgetLedger: AgentBudgetLedgerState;
    archiveFamily: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily;
    scope: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureScope;
    timing: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming;
    registrationIntents: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntent[];
    registrationRequests: readonly AgentHostedRetrievalRuntimeResourceRegistrationRequest[];
    publicResourceMaterials: readonly AgentCapabilityProbePublicResourceMaterial[];
    lifecycleBudgetDemands: readonly AgentBudgetDemand[];
    budgetReservationAuthorities: readonly AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority[];
    lifecycleAuthorityCommitments: readonly AgentHostedRetrievalRuntimeResourceLifecycleAuthorityCommitment[];
    closureBindings: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[];
    closureProjections: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection[];
  }>;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING =
  Object.freeze({
    startedAt: '2026-08-02T01:00:00.000Z',
    claimExpiresAt: '2026-08-02T01:01:00.000Z',
    transportCompletedAt: '2026-08-02T01:00:00.001Z',
    spoolCreatedAt: '2026-08-02T02:00:00.000Z',
    settledAt: '2026-08-02T03:00:00.000Z',
    expiresAt: '2026-08-09T00:00:00.000Z',
  } as const satisfies AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming);

const createLifecycleJournalArchiveRecord = (
  input: Readonly<{
    timing: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming;
    scope: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureScope;
    operation: 'create' | 'delete';
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
    providerConfigurationId: string;
    providerConfigurationDigest: string;
    registrationIntentDigest: string;
    registrationRequestDigest: string;
    budgetReservationId: string;
    budgetReservationAuthorityDigest: string;
    budgetClosureProjection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection;
    authorityDigest: string | null;
    lifecycleClaimReceiptDigest: string | null;
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
    resourceManifestDigest: string;
  }>
): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord => {
  const { timing } = input;
  const scope = Object.freeze({
    lifecycleOwnerAuthorityIssuerId: 'authority.hosted-lifecycle-fixture',
    lifecycleOwnerImplementationDigest: digestAgentCanonicalValue(
      'hosted-lifecycle-fixture-implementation'
    ),
    ...input.scope,
  });
  const mutationKinds =
    input.operation === 'delete'
      ? (['delete-resource'] as const)
      : input.protocolFamily === 'gemini-interactions'
        ? ([
            'create-primary',
            'upload-content-start',
            'upload-content-finalize',
          ] as const)
        : (['upload-content', 'create-primary'] as const);
  const intents = Object.freeze(
    mutationKinds.map((mutationKind, mutationSequence) =>
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent({
        intentId: `intent.${input.operation}.${input.protocolFamily}.${input.capabilityProfileId}.${mutationSequence}`,
        ...scope,
        registrationIntentDigest: input.registrationIntentDigest,
        registrationRequestDigest: input.registrationRequestDigest,
        authorityDigest: input.authorityDigest,
        lifecycleClaimReceiptDigest: input.lifecycleClaimReceiptDigest,
        protocolFamily: input.protocolFamily,
        capabilityProfileId: input.capabilityProfileId,
        providerConfigurationId: input.providerConfigurationId,
        providerConfigurationDigest: input.providerConfigurationDigest,
        budgetReservationId: input.budgetReservationId,
        budgetReservationAuthorityDigest:
          input.budgetReservationAuthorityDigest,
        operation: input.operation,
        mutationKind,
        mutationSequence,
        resourceId: input.operation === 'delete' ? input.resourceId : null,
        resourceRole: input.operation === 'delete' ? input.resourceRole : null,
        endpointId: `endpoint.${input.operation}.${input.protocolFamily}.${mutationSequence}`,
        endpointClass: 'provider-hosted-retrieval-resource',
        method: input.operation === 'delete' ? 'DELETE' : 'POST',
        requestProjectionDigest: digestAgentCanonicalValue({
          requestProjection: input.registrationRequestDigest,
          input: mutationSequence,
        }),
        requestBodyDigest: digestAgentCanonicalValue({
          requestBody: input.registrationRequestDigest,
          input: mutationSequence,
        }),
        requestBytes: 1,
        providerIdempotencyKeyBinding: 'dispatch-intent-digest',
        createdAt: timing.startedAt,
      })
    )
  );
  const intentSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
      intents
    );
  const claimReceipts = Object.freeze(
    intents.map((intent) => {
      const claimRequest =
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
          {
            purpose:
              'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim',
            dispatchIntentDigest: intent.intentDigest,
            lifecycleOwnerInstanceId: 'owner.hosted-lifecycle-fixture',
            expectedDispatchLedgerRevision: 0,
            expectedDispatchGeneration: 0,
            expectedPriorStageClaimReceiptDigest: null,
            expectedPriorClaimExpiresAt: null,
            requestedAt: timing.startedAt,
            minimumClaimExpiresAt: timing.claimExpiresAt,
          }
        );
      return createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        intent,
        claimRequest,
        {
          dispatchAuthorityIssuerId: 'authority.hosted-lifecycle-dispatch',
          dispatchAuthorityImplementationDigest: digestAgentCanonicalValue(
            'hosted-lifecycle-dispatch-implementation'
          ),
          dispatchLedgerRevision: 1,
          dispatchGeneration: 1,
          generationTransition: 'initial-first-delivery',
          deliveryDisposition: 'dispatch-authorized-first-delivery',
          claimedAt: timing.startedAt,
          claimExpiresAt: timing.claimExpiresAt,
          priorTransportReceiptDigest: null,
          sealedJournalRecordDigest: null,
        }
      );
    })
  );
  const claimReceiptSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
      intentSet,
      claimReceipts
    );
  const claimHistorySet =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
      intentSet,
      claimReceiptSet,
      claimReceipts
    );
  const transportReceipts = Object.freeze(
    intents.map((intent, index) => {
      const responseProjection =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
          intent,
          intent.mutationKind === 'delete-resource'
            ? {
                resourceId: input.resourceId,
                resourceRole: input.resourceRole,
                outcome: 'deleted',
                resourceManifestDigest: null,
                httpStatus: 204,
              }
            : intent.mutationKind === 'create-primary'
              ? {
                  resourceId: input.providerResourceId,
                  resourceRole: 'primary',
                  outcome: 'created',
                  resourceManifestDigest: null,
                  httpStatus: 201,
                }
              : intent.mutationKind === 'upload-content-start'
                ? {
                    resourceId: input.providerResourceId,
                    resourceRole: 'primary',
                    outcome: 'accepted',
                    resourceManifestDigest: null,
                    httpStatus: 202,
                  }
                : intent.mutationKind === 'upload-content-finalize'
                  ? {
                      resourceId: input.providerResourceId,
                      resourceRole: 'primary',
                      outcome: 'uploaded',
                      resourceManifestDigest: input.resourceManifestDigest,
                      httpStatus: 200,
                    }
                  : {
                      resourceId: input.auxiliaryResourceIds[0]!,
                      resourceRole: 'auxiliary',
                      outcome: 'uploaded',
                      resourceManifestDigest: input.resourceManifestDigest,
                      httpStatus: 200,
                    }
        );
      return createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
        intent,
        claimReceipts[index]!,
        {
          receiptId: `transport.${input.operation}.${input.protocolFamily}.${input.capabilityProfileId}.${index}`,
          dispatchState: 'dispatched',
          responseProjection,
          responseBodyDigest: digestAgentCanonicalValue({
            response: input.registrationRequestDigest,
            index,
          }),
          responseBytes: 1,
          httpStatus: responseProjection.httpStatus,
          providerRequestId: `provider-request.${input.operation}.${input.protocolFamily}.${input.capabilityProfileId}.${index}`,
          outcome: 'completed',
          errorCategory: null,
          startedAt: timing.startedAt,
          completedAt: timing.transportCompletedAt,
        }
      );
    })
  );
  const transportReceiptSet =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
      intentSet,
      claimReceiptSet,
      transportReceipts
    );
  const businessResult =
    createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult(
      input.operation === 'create'
        ? {
            operation: 'create',
            providerResourceId: input.providerResourceId,
            auxiliaryResourceIds: input.auxiliaryResourceIds,
            resourceManifestDigest: input.resourceManifestDigest,
            resourceId: null,
            resourceRole: null,
            reconciliationObservationReceiptSet: null,
            reconciliationObservationReceiptSetDigest: null,
            outcome: 'created-and-uploaded',
            completedAt: timing.transportCompletedAt,
          }
        : {
            operation: 'delete',
            providerResourceId: null,
            auxiliaryResourceIds: Object.freeze([]),
            resourceManifestDigest: null,
            resourceId: input.resourceId,
            resourceRole: input.resourceRole,
            reconciliationObservationReceiptSet: null,
            reconciliationObservationReceiptSetDigest: null,
            outcome: 'deleted',
            completedAt: timing.transportCompletedAt,
          }
    );
  const plaintextDigest = digestAgentCanonicalValue({
    result: businessResult.resultDigest,
  });
  const spoolAadInput = Object.freeze({
    namespaceId: scope.namespaceId,
    repositoryCommit: scope.repositoryCommit,
    planDigest: scope.planDigest,
    frozenRunDigest: scope.frozenRunDigest,
    runConfigArtifactBindingDigest: scope.runConfigArtifactBindingDigest,
    runtimeResourceSetId: scope.runtimeResourceSetId,
    lifecycleExpiresAt: timing.expiresAt,
    registrationRequestDigest: input.registrationRequestDigest,
    authorityDigest: input.authorityDigest,
    lifecycleClaimReceiptDigest: input.lifecycleClaimReceiptDigest,
    operation: input.operation,
    resourceId: input.operation === 'delete' ? input.resourceId : null,
    resourceRole: input.operation === 'delete' ? input.resourceRole : null,
    dispatchIntentSetDigest: intentSet.setDigest,
    dispatchStageClaimReceiptSetDigest: claimReceiptSet.setDigest,
    dispatchStageClaimHistorySetDigest: claimHistorySet.setDigest,
    transportReceiptSetDigest: transportReceiptSet.setDigest,
    businessResultDigest: businessResult.resultDigest,
    plaintextDigest,
  });
  const spoolAad =
    createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(spoolAadInput);
  const spoolEnvelopeAuthority =
    createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority({
      spoolRef:
        createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(spoolAad),
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
      ciphertextDigest: digestAgentCanonicalValue({
        ciphertext: businessResult.resultDigest,
      }),
      ciphertextSizeBytes: 1,
      aadDigest: digestAgentCanonicalValue(spoolAad),
      plaintextDigest,
    });
  const spoolReceipt =
    createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
      spoolAad,
      spoolEnvelopeAuthority,
      { createdAt: timing.spoolCreatedAt, expiresAt: timing.expiresAt }
    );
  const spoolDisposition =
    createAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
      spoolReceipt,
      {
        disposition: 'destroyed-after-business-seal',
        businessSealKind:
          input.operation === 'create'
            ? 'registration-result'
            : 'cleanup-result',
        businessSealReceiptDigest: businessResult.resultDigest,
        disposedAt: timing.settledAt,
      }
    );
  const journalRecord: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord =
    createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord({
      dispatchIntentSet: intentSet,
      dispatchStageClaimReceiptSet: claimReceiptSet,
      dispatchStageClaimHistorySet: claimHistorySet,
      transportReceiptSet,
      businessResult,
      resultSpoolReceipt: spoolReceipt,
      resultSpoolDispositionReceipt: spoolDisposition,
    });
  return createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
    journalRecord,
    {
      budgetClosureProjection:
        input.operation === 'create' ? input.budgetClosureProjection : null,
      budgetClosureProjectionDigest:
        input.budgetClosureProjection.projectionDigest,
    }
  );
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture =
  (
    plan: AgentModelEvaluationPlan,
    baseLedger: AgentBudgetLedgerState,
    timing: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming = AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
    scope?: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureScope
  ): AgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture => {
    const resolvedScope = Object.freeze(
      scope ?? {
        namespaceId: 'namespace.hosted-lifecycle-fixture',
        repositoryCommit: plan.repositoryCommit,
        planDigest: plan.planDigest,
        frozenRunDigest: digestAgentCanonicalValue(
          'hosted-lifecycle-frozen-run'
        ),
        runConfigArtifactBindingDigest: digestAgentCanonicalValue(
          'hosted-lifecycle-run-config'
        ),
        runtimeResourceSetId: 'runtime-resource-set.hosted-lifecycle-fixture',
      }
    );
    if (
      resolvedScope.repositoryCommit !== plan.repositoryCommit ||
      resolvedScope.planDigest !== plan.planDigest
    ) {
      throw new Error('Fixture hosted lifecycle scope drifted from its plan.');
    }
    const targets = plan.capabilityQualificationTargets
      .flatMap((target) => {
        const source =
          target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
        const registrationIntentDigest =
          source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
        if (
          !source ||
          !registrationIntentDigest ||
          (source.protocolFamily !== 'gemini-interactions' &&
            source.protocolFamily !== 'openai-responses') ||
          (source.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
            source.capabilityProfileId !==
              'g4-provider-hosted-retrieval-document')
        ) {
          return [];
        }
        const program = createAgentCapabilityProbeProgram({
          capabilityProfileId: source.capabilityProfileId,
          capabilityProfileDigest: source.capabilityProfileDigest,
        });
        const material = resolveAgentCapabilityProbePublicResource(program)!;
        const registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent =
          createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
            providerConfigurationId: source.providerConfigurationId,
            providerConfigurationDigest: target.providerIdentityDigest,
            protocolFamily: source.protocolFamily,
            modelId: source.modelId,
            modelLineageDigest: source.modelLineageDigest,
            adapterDigest: source.adapterDigest,
            capabilityProfileId: source.capabilityProfileId,
            capabilityProfileDigest: source.capabilityProfileDigest,
            probeProgramDigest: program.programDigest,
            publicResourceDescriptorDigest:
              material.descriptor.descriptorDigest,
          });
        if (registrationIntent.intentDigest !== registrationIntentDigest) {
          throw new Error('Fixture hosted lifecycle intent drifted.');
        }
        return [
          Object.freeze({
            orderKey: `${source.protocolFamily}\u0000${source.capabilityProfileId}\u0000${registrationIntentDigest}`,
            source,
            protocolFamily: source.protocolFamily,
            capabilityProfileId: source.capabilityProfileId,
            target,
            registrationIntent,
            material,
          }),
        ];
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(left.orderKey, right.orderKey)
      );
    if (targets.length !== 4) {
      throw new Error('Fixture hosted lifecycle intent set is incomplete.');
    }
    let budgetLedger = baseLedger;
    const records: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[] =
      [];
    const closureProjections: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection[] =
      [];
    const closureBindings: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[] =
      [];
    const registrationIntents: AgentHostedRetrievalRuntimeResourceRegistrationIntent[] =
      [];
    const registrationRequests: AgentHostedRetrievalRuntimeResourceRegistrationRequest[] =
      [];
    const publicResourceMaterials: AgentCapabilityProbePublicResourceMaterial[] =
      [];
    const lifecycleBudgetDemands: AgentBudgetDemand[] = [];
    const budgetReservationAuthorities: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority[] =
      [];
    const lifecycleAuthorityCommitments: AgentHostedRetrievalRuntimeResourceLifecycleAuthorityCommitment[] =
      [];
    for (const {
      source,
      protocolFamily,
      capabilityProfileId,
      target,
      registrationIntent,
      material,
    } of targets) {
      const demand =
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
          registrationIntent,
          material
        );
      const demandDigest = digestAgentCanonicalValue(demand);
      const key = `${protocolFamily}.${capabilityProfileId}`;
      const reservationId = `budget.hosted-lifecycle.${key}`;
      const reserved = reserveAgentBudget(budgetLedger, {
        reservationId,
        expectedRevision: budgetLedger.revision,
        demand,
        reservedAt: timing.startedAt,
      });
      if (!reserved.ok) {
        throw new Error('Fixture lifecycle budget reservation failed.');
      }
      const authority =
        createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
          namespaceId: resolvedScope.namespaceId,
          planDigest: plan.planDigest,
          reservePolicyDigest: plan.budget.reservePolicyDigest,
          budgetDigest: plan.budget.budgetDigest,
          reservationId,
          ledgerRevision: reserved.state.revision,
          demandDigest,
          demandBytesDigest: demandDigest,
          reservedAt: timing.startedAt,
        });
      const networkPolicyAuthority =
        createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
          namespaceId: resolvedScope.namespaceId,
          repositoryCommit: resolvedScope.repositoryCommit,
          planDigest: resolvedScope.planDigest,
          frozenRunDigest: resolvedScope.frozenRunDigest,
          runConfigArtifactBindingDigest:
            resolvedScope.runConfigArtifactBindingDigest,
          providerConfigurationId: source.providerConfigurationId,
          providerConfigurationDigest: target.providerIdentityDigest,
          protocolFamily,
        });
      const registrationRequest =
        createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
          ...resolvedScope,
          registrationIntent,
          registrationIntentDigest: registrationIntent.intentDigest,
          providerConfigurationId: source.providerConfigurationId,
          providerConfigurationDigest: target.providerIdentityDigest,
          protocolFamily,
          modelId: source.modelId,
          modelLineageDigest: source.modelLineageDigest,
          adapterDigest: source.adapterDigest,
          capabilityProfileId,
          capabilityProfileDigest: source.capabilityProfileDigest,
          probeProgramDigest: registrationIntent.probeProgramDigest,
          publicResourceDescriptorDigest:
            registrationIntent.publicResourceDescriptorDigest,
          budgetReservationAuthority: authority,
          budgetReservationAuthorityDigest: authority.authorityDigest,
          networkPolicyAuthority,
          networkPolicyAuthorityDigest: networkPolicyAuthority.authorityDigest,
          minimumExpiresAt: timing.expiresAt,
        });
      const settled = settleAgentBudget(reserved.state, {
        reservationId,
        expectedRevision: reserved.state.revision,
        actual: demand,
        settledAt: timing.settledAt,
      });
      if (!settled.ok) {
        throw new Error('Fixture lifecycle budget settlement failed.');
      }
      budgetLedger = settled.state;
      const reservation = budgetLedger.reservations.find(
        (candidate) => candidate.reservationId === reservationId
      )!;
      const settlement = reservation.settlement as AgentBudgetSettlement;
      const projection =
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
          authority,
          demand,
          settlement
        );
      closureProjections.push(projection);
      registrationIntents.push(registrationIntent);
      registrationRequests.push(registrationRequest);
      if (
        !publicResourceMaterials.some(
          ({ descriptor }) =>
            descriptor.descriptorDigest === material.descriptor.descriptorDigest
        )
      ) {
        publicResourceMaterials.push(material);
      }
      lifecycleBudgetDemands.push(demand);
      budgetReservationAuthorities.push(authority);
      const registrationRequestDigest = registrationRequest.requestDigest;
      const providerResourceId = `resource.${key}`;
      const auxiliaryResourceIds =
        protocolFamily === 'openai-responses'
          ? Object.freeze([`auxiliary.0.${key}`])
          : Object.freeze([]);
      const resourceManifestDigest = digestAgentCanonicalValue({
        fixture: 'hosted-runtime-resource',
        label: `resource-manifest.${key}`,
      });
      const createRecord = createLifecycleJournalArchiveRecord({
        timing,
        scope: resolvedScope,
        operation: 'create',
        protocolFamily,
        capabilityProfileId,
        providerConfigurationId: source.providerConfigurationId,
        providerConfigurationDigest: target.providerIdentityDigest,
        registrationIntentDigest: registrationIntent.intentDigest,
        registrationRequestDigest,
        budgetReservationId: reservationId,
        budgetReservationAuthorityDigest: authority.authorityDigest,
        budgetClosureProjection: projection,
        authorityDigest: null,
        lifecycleClaimReceiptDigest: null,
        resourceId: null,
        resourceRole: null,
        providerResourceId,
        auxiliaryResourceIds,
        resourceManifestDigest,
      });
      records.push(createRecord);
      const setRoot = (digests: readonly string[]): string =>
        digestAgentCanonicalValue(
          Object.freeze([...digests].sort(compareUnicodeCodePoints))
        );
      lifecycleAuthorityCommitments.push(
        Object.freeze({
          contentUploadReceiptDigest:
            createRecord.journalRecord.resultSpoolReceiptDigest,
          creationDispatchIntentSetDigest: setRoot(
            createRecord.journalRecord.dispatchIntentSet.intentDigests
          ),
          creationTransportReceiptSetDigest: setRoot(
            createRecord.journalRecord.transportReceiptSet.receiptDigests
          ),
          creationResultSpoolReceiptSetDigest: setRoot([
            createRecord.journalRecord.resultSpoolReceiptDigest,
          ]),
        })
      );
      closureBindings.push(
        Object.freeze({
          registrationRequestDigest,
          registrationIntentDigest: registrationIntent.intentDigest,
          createJournalArchiveRecordDigest: createRecord.archiveRecordDigest,
          projection,
          projectionDigest: projection.projectionDigest,
        })
      );
      for (const [resourceRole, resourceId] of [
        ...auxiliaryResourceIds.map(
          (id) => ['auxiliary' as const, id] as const
        ),
        ['primary' as const, providerResourceId] as const,
      ]) {
        records.push(
          createLifecycleJournalArchiveRecord({
            timing,
            scope: resolvedScope,
            operation: 'delete',
            protocolFamily,
            capabilityProfileId,
            providerConfigurationId: source.providerConfigurationId,
            providerConfigurationDigest: target.providerIdentityDigest,
            registrationIntentDigest: registrationIntent.intentDigest,
            registrationRequestDigest,
            budgetReservationId: reservationId,
            budgetReservationAuthorityDigest: authority.authorityDigest,
            budgetClosureProjection: projection,
            authorityDigest: digestAgentCanonicalValue({
              authority: registrationRequestDigest,
            }),
            lifecycleClaimReceiptDigest: digestAgentCanonicalValue({
              cleanupClaim: registrationRequestDigest,
            }),
            resourceId,
            resourceRole,
            providerResourceId,
            auxiliaryResourceIds,
            resourceManifestDigest,
          })
        );
      }
    }
    return Object.freeze({
      budgetLedger,
      archiveFamily:
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          records.sort((left, right) => {
            const key = (
              record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
            ) => {
              const journal = record.journalRecord;
              return `${journal.operation}\u0000${journal.registrationRequestDigest}\u0000${journal.businessResult.resourceRole ?? ''}\u0000${journal.businessResult.resourceId ?? ''}`;
            };
            return compareUnicodeCodePoints(key(left), key(right));
          })
        ),
      scope: resolvedScope,
      timing,
      registrationIntents: Object.freeze(registrationIntents),
      registrationRequests: Object.freeze(registrationRequests),
      publicResourceMaterials: Object.freeze(publicResourceMaterials),
      lifecycleBudgetDemands: Object.freeze(lifecycleBudgetDemands),
      budgetReservationAuthorities: Object.freeze(budgetReservationAuthorities),
      lifecycleAuthorityCommitments: Object.freeze(
        lifecycleAuthorityCommitments
      ),
      closureBindings: Object.freeze(closureBindings),
      closureProjections: Object.freeze(closureProjections),
    });
  };

export type AgentHostedRetrievalRuntimeResourceExact4LifecycleJournalFixture =
  Readonly<{
    journal: AgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture;
    lifecycle: AgentHostedRetrievalRuntimeResourceExact4LifecycleFixture;
  }>;

/** Rebuilds delete journals and cleanup records around the same exact claims. */
export const joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup =
  (
    journal: AgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture,
    lifecycle: AgentHostedRetrievalRuntimeResourceExact4LifecycleFixture
  ): AgentHostedRetrievalRuntimeResourceExact4LifecycleJournalFixture => {
    const createRecords = journal.archiveFamily.records.filter(
      ({ journalRecord }) => journalRecord.operation === 'create'
    );
    const createByRequest = new Map(
      createRecords.map((record) => [
        record.journalRecord.registrationRequestDigest,
        record,
      ])
    );
    const bindingByRequest = new Map(
      journal.closureBindings.map((binding) => [
        binding.registrationRequestDigest,
        binding,
      ])
    );
    if (
      lifecycle.registrationResults.length !== 4 ||
      lifecycle.lifecycles.length !== 4 ||
      createByRequest.size !== 4 ||
      bindingByRequest.size !== 4
    ) {
      throw new Error('Fixture exact-four cleanup join is incomplete.');
    }
    const deleteRecords: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[] =
      [];
    const rebuiltLifecycles = lifecycle.registrationResults.map(
      (registrationResult, index) => {
        const registrationRequest = registrationResult.registrationRequest;
        const provisional = lifecycle.lifecycles[index];
        const binding = bindingByRequest.get(registrationRequest.requestDigest);
        const createRecord = createByRequest.get(
          registrationRequest.requestDigest
        );
        const firstResourceResult = provisional?.resourceResults[0];
        if (
          !provisional ||
          !binding ||
          !createRecord ||
          !firstResourceResult ||
          binding.projection.settlement.settledAt !==
            provisional.cleanupReceipt.completedAt
        ) {
          throw new Error(
            'Fixture cleanup timing or registration request drifted from its creation closure.'
          );
        }
        const cleanupTiming: AgentHostedRetrievalRuntimeResourceLifecycleTiming =
          Object.freeze({
            readCheckedAt: provisional.readReceipt.checkedAt,
            readExpiresAt: provisional.readReceipt.expiresAt,
            cleanupClaimedAt:
              provisional.cleanupClaimAuthorityReceipt.claimedAt,
            cleanupClaimExpiresAt:
              provisional.cleanupClaimAuthorityReceipt.claimExpiresAt,
            cleanupDispatchedAt: firstResourceResult.dispatchCreatedAt,
            cleanupCompletedAt: firstResourceResult.completedAt,
          });
        const deleteJournalTiming: AgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureTiming =
          Object.freeze({
            ...journal.timing,
            startedAt: cleanupTiming.cleanupDispatchedAt,
            claimExpiresAt: cleanupTiming.cleanupClaimExpiresAt,
            transportCompletedAt: cleanupTiming.cleanupCompletedAt,
            spoolCreatedAt: cleanupTiming.cleanupCompletedAt,
            settledAt: cleanupTiming.cleanupCompletedAt,
          });
        const resourceResults: AgentHostedRetrievalRuntimeResourceCleanupResourceResult[] =
          [];
        for (const resource of provisional.resourceResults) {
          const record = createLifecycleJournalArchiveRecord({
            timing: deleteJournalTiming,
            scope: journal.scope,
            operation: 'delete',
            protocolFamily: registrationRequest.protocolFamily,
            capabilityProfileId: registrationRequest.capabilityProfileId,
            providerConfigurationId:
              registrationRequest.providerConfigurationId,
            providerConfigurationDigest:
              registrationRequest.providerConfigurationDigest,
            registrationIntentDigest:
              registrationRequest.registrationIntentDigest,
            registrationRequestDigest: registrationRequest.requestDigest,
            budgetReservationId: binding.projection.reservationId,
            budgetReservationAuthorityDigest:
              binding.projection.budgetReservationAuthorityDigest,
            budgetClosureProjection: binding.projection,
            authorityDigest: registrationResult.authorityDigest,
            lifecycleClaimReceiptDigest:
              provisional.cleanupClaimAuthorityReceipt.receiptDigest,
            resourceId: resource.resourceId,
            resourceRole: resource.resourceRole,
            providerResourceId: registrationResult.authority.providerResourceId,
            auxiliaryResourceIds:
              registrationResult.authority.auxiliaryResourceIds,
            resourceManifestDigest:
              registrationResult.authority.resourceManifestDigest,
          });
          deleteRecords.push(record);
          resourceResults.push(
            createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
              resourceId: record.journalRecord.businessResult.resourceId!,
              resourceRole: record.journalRecord.businessResult.resourceRole!,
              outcome: 'deleted',
              cleanupClaimAuthorityReceiptDigest:
                provisional.cleanupClaimAuthorityReceipt.receiptDigest,
              dispatchIntentDigest:
                record.journalRecord.dispatchIntentSetDigest,
              transportReceiptDigest:
                record.journalRecord.transportReceiptSetDigest,
              resultSpoolReceiptDigest:
                record.journalRecord.resultSpoolReceiptDigest,
              resultSpoolDispositionReceiptDigest:
                record.journalRecord.resultSpoolDispositionReceiptDigest,
              dispatchCreatedAt:
                record.journalRecord.dispatchIntentSet.intents[0]!.createdAt,
              completedAt: record.journalRecord.businessResult.completedAt,
            })
          );
        }
        const rebuilt =
          createAgentHostedRetrievalRuntimeResourceLifecycleFixture({
            registrationResult,
            resourceSetCommitment: lifecycle.resourceSetCommitment,
            runTerminalFence: lifecycle.runTerminal.fence,
            timing: cleanupTiming,
            resourceResults: Object.freeze(resourceResults),
          });
        if (
          rebuilt.cleanupClaimAuthorityReceipt.receiptDigest !==
          provisional.cleanupClaimAuthorityReceipt.receiptDigest
        ) {
          throw new Error('Fixture cleanup claim changed during exact join.');
        }
        return rebuilt;
      }
    );
    const records = [...createRecords, ...deleteRecords].sort((left, right) => {
      const key = (
        record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
      ) => {
        const value = record.journalRecord;
        return `${value.operation}\u0000${value.registrationRequestDigest}\u0000${value.businessResult.resourceRole ?? ''}\u0000${value.businessResult.resourceId ?? ''}`;
      };
      return compareUnicodeCodePoints(key(left), key(right));
    });
    const cleanupArchiveRecords = Object.freeze(
      rebuiltLifecycles.map(({ cleanupArchiveRecord }) => cleanupArchiveRecord)
    );
    return Object.freeze({
      journal: Object.freeze({
        ...journal,
        archiveFamily:
          createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
            records
          ),
      }),
      lifecycle: Object.freeze({
        ...lifecycle,
        lifecycles: Object.freeze(rebuiltLifecycles),
        cleanupArchiveRecords,
        cleanupArchiveFamily:
          createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
            cleanupArchiveRecords
          ),
      }),
    });
  };
