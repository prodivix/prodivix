import {
  createAgentCapabilityProbeProgram,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
  createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  digestAgentCanonicalValue,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4Fixture } from '../../../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
  type AgentEvaluationProductionSharedEffectExternalOwnerHealth,
} from './productionSharedEffectExecutor';
import {
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_STAGE_FORMAT,
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION,
  type AgentEvaluationProductionSharedEffectBinding,
  type AgentEvaluationProductionSharedEffectHealthInput,
  type AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';
import {
  createProductionAgentEvaluationSharedEffectHostedOwner,
  createProductionAgentEvaluationSharedEffectHostedPreactivationOwner,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding,
  isAgentEvaluationProductionSharedEffectHostedOwnerHealth,
  matchAgentEvaluationProductionSharedEffectHostedOwnerHealth,
  PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_AUTHORITY_ISSUER_ID,
  PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_DIGEST,
  type AgentEvaluationProductionSharedEffectHostedResourceContext,
  type AgentEvaluationProductionSharedEffectHostedPreactivationTransport,
  type AgentEvaluationProductionSharedEffectHostedTransport,
} from './productionSharedEffectHostedOwner';

const NOW = '2026-08-11T00:00:00.000Z' as Instant;
const TRANSPORT_CHECKED_AT = '2026-08-11T00:00:00.001Z' as Instant;
const LOOKUP_EXPIRES_AT = '2026-08-11T00:02:05.000Z' as Instant;
const READ_EXPIRES_AT = '2026-08-11T00:02:35.000Z' as Instant;
const READ_LEASE_NOT_AFTER = '2026-08-11T00:03:00.000Z' as Instant;
const RESOURCE_EXPIRES_AT = '2026-08-13T00:00:00.000Z' as Instant;

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ test: 'shared-effect-hosted-owner', label });

const planRegistrationIntents = (
  plan: ReturnType<typeof createV8EvaluationPlan>
): readonly AgentHostedRetrievalRuntimeResourceRegistrationIntent[] =>
  Object.freeze(
    plan.capabilityQualificationTargets.flatMap((target) => {
      const source =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      if (
        !source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
        (source.protocolFamily !== 'openai-responses' &&
          source.protocolFamily !== 'gemini-interactions') ||
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
      const intent =
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
            program.providerRequestIntent.publicProbeResource!.descriptorDigest,
        });
      if (
        intent.intentDigest !==
        source.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ) {
        throw new TypeError('Hosted plan registration intent drifted.');
      }
      return [intent];
    })
  );

describe('production shared-effect hosted owner', () => {
  it('discovers the exact set, reads the live resource, and never cleans the run-level set on close', async () => {
    const plan = createV8EvaluationPlan();
    const registrationIntents = planRegistrationIntents(plan);
    const scope = Object.freeze({
      namespaceId: 'namespace.v8.release',
      repositoryCommit: plan.repositoryCommit,
      planDigest: plan.planDigest,
      frozenRunDigest: digest('frozen-run'),
      runConfigArtifactBindingDigest: digest('run-config-binding'),
    });
    const exact4 = createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      ...scope,
      runtimeResourceSetId: 'runtime-resource-set.shared-effect-owner',
      registeredAt: '2026-08-10T23:59:00.000Z' as Instant,
      expiresAt: RESOURCE_EXPIRES_AT,
      registrationIntents,
    });
    const selectedResult = exact4.registrationResults.find(
      ({ authority }) =>
        authority.protocolFamily === 'openai-responses' &&
        authority.capabilityProfileId === 'g4-provider-hosted-retrieval-core'
    )!;
    const sourceAuthority = plan.capabilityQualificationTargets
      .map(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority
      )
      .find(
        (authority) =>
          authority?.protocolFamily ===
            selectedResult.authority.protocolFamily &&
          authority.capabilityProfileId ===
            selectedResult.authority.capabilityProfileId
      )!;
    const {
      authorityDigest: _sourceAuthorityDigest,
      registrationReceiptDigest: _sourceRegistrationReceiptDigest,
      ...sourceIdentityInput
    } = sourceAuthority;
    const sourceIdentity = Object.freeze(
      sourceIdentityInput
    ) as AgentProductionEvaluationRuntimeFactSourceIdentity;
    const sourceIdentityDigest = digestAgentCanonicalValue(sourceIdentity);
    const program = createAgentCapabilityProbeProgram({
      capabilityProfileId: selectedResult.authority.capabilityProfileId,
      capabilityProfileDigest: selectedResult.authority.capabilityProfileDigest,
    });
    const lookupCalls: unknown[] = [];
    const readCalls: unknown[] = [];
    const transportContexts: AgentEvaluationProductionSharedEffectHostedResourceContext[] =
      [];
    let transportCloseCalls = 0;
    let leaseOrdinal = 0;
    let clockTimeMs = Date.parse(NOW);
    const client = Object.freeze({
      async lookupRegistrationSet(
        request: Parameters<
          import('./hostedRetrievalRuntimeResourceClient').AgentEvaluationHostedRetrievalRuntimeResourceClient['lookupRegistrationSet']
        >[0]
      ) {
        lookupCalls.push(request);
        return createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
          request,
          exact4.registrationResults,
          {
            lookupAuthorityIssuerId: 'backend.hosted-runtime-registration-set',
            lookupAuthorityImplementationDigest: digest(
              'lookup-implementation'
            ),
            lookupLedgerRevision: lookupCalls.length,
            checkedAt: NOW,
            expiresAt: LOOKUP_EXPIRES_AT,
          }
        );
      },
      async readActiveResource(
        request: Parameters<
          import('./hostedRetrievalRuntimeResourceClient').AgentEvaluationHostedRetrievalRuntimeResourceClient['readActiveResource']
        >[0],
        authority: Parameters<
          import('./hostedRetrievalRuntimeResourceClient').AgentEvaluationHostedRetrievalRuntimeResourceClient['readActiveResource']
        >[1]
      ) {
        readCalls.push(Object.freeze({ request, authority }));
        const activeState =
          createAgentHostedRetrievalRuntimeResourceActiveState(
            authority,
            exact4.resourceSetCommitment,
            {
              activeOwnerInstanceId: request.readerOwnerInstanceId,
              claimGeneration: readCalls.length,
              readLeaseNotAfter: READ_LEASE_NOT_AFTER,
              updatedAt: NOW,
            }
          );
        return createAgentHostedRetrievalRuntimeResourceReadReceipt(
          request,
          authority,
          exact4.resourceSetCommitment,
          {
            activeState,
            checkedAt: NOW,
            expiresAt: READ_EXPIRES_AT,
          }
        );
      },
    });
    const transport = Object.freeze({
      authorityKind: 'production-hosted-retrieval-shared-effect' as const,
      readinessAuthority:
        'hosted-resource-read-and-provider-query-owner' as const,
      async execute({ resourceContext }) {
        transportContexts.push(resourceContext);
        return Object.freeze({
          businessResult: Object.freeze({ status: 'hosted-query-completed' }),
          effectSourceFact: Object.freeze({}) as never,
          providerRuntimeJournalResultRecordDigest: digest(
            'provider-runtime-journal-result'
          ),
          providerRuntimeResultSealReceiptDigest: digest(
            'provider-runtime-result-seal'
          ),
          transportReceiptDigest: digest('transport-receipt'),
          resultSpoolReceiptDigest: digest('result-spool-receipt'),
          normalizedEventSetDigest: digest('normalized-events'),
          sealedAt: NOW,
        });
      },
      async checkReadiness({ healthInput, resourceContext }) {
        transportContexts.push(resourceContext);
        clockTimeMs = Date.parse(TRANSPORT_CHECKED_AT);
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
          ownerKind: 'hosted-retrieval-resource' as const,
          sourceIdentityDigest: digestAgentCanonicalValue(
            healthInput.sourceIdentity
          ),
          status: 'ready' as const,
          checkedAt: TRANSPORT_CHECKED_AT,
          expiresAt: LOOKUP_EXPIRES_AT,
        });
        return Object.freeze({
          ...base,
          healthDigest: digestAgentCanonicalValue(base),
        }) satisfies AgentEvaluationProductionSharedEffectExternalOwnerHealth;
      },
      async close() {
        transportCloseCalls += 1;
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      },
    }) satisfies AgentEvaluationProductionSharedEffectHostedTransport;
    const owner = createProductionAgentEvaluationSharedEffectHostedOwner({
      scope,
      registrationIntentBindings: registrationIntents.map((intent) =>
        Object.freeze({
          protocolFamily: intent.protocolFamily,
          capabilityProfileId: intent.capabilityProfileId,
          registrationIntentDigest: intent.intentDigest,
        })
      ),
      readerOwnerInstanceId: 'reader.shared-effect-hosted-owner',
      client,
      transport,
      clock: () => new Date(clockTimeMs),
      createReadLeaseId: () =>
        `read-lease.shared-effect-hosted-owner.${++leaseOrdinal}`,
    });
    const binding = Object.freeze({
      authorityRequestDigest: digest('authority-request'),
      toolInput: Object.freeze({
        namespaceId: scope.namespaceId,
        repositoryCommit: scope.repositoryCommit,
        planDigest: scope.planDigest,
      }) as AgentEvaluationProductionSharedEffectBinding['toolInput'],
      sourceIdentity,
      sourceIdentityDigest,
    }) satisfies AgentEvaluationProductionSharedEffectBinding;
    const stage = Object.freeze({
      format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_STAGE_FORMAT,
      version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION,
      authorityRequestDigest: binding.authorityRequestDigest,
      preEffectIntentDigest: digest('pre-effect-intent'),
      ownerRequestDigest: digest('owner-request'),
      inputAuthorityBindingDigest: digest('input-authority-binding'),
      sourceIdentity,
      sourceIdentityDigest,
      registrationReceiptDigest: sourceAuthority.registrationReceiptDigest,
      stagedAt: NOW,
      expiresAt: LOOKUP_EXPIRES_AT,
      stageDigest: digest('stage'),
    }) satisfies AgentEvaluationProductionSharedEffectStage;
    const healthInput = Object.freeze({
      lookup: Object.freeze({}),
      registrationRequest: Object.freeze({}),
      sourceIdentity,
    }) as AgentEvaluationProductionSharedEffectHealthInput;

    const health = await owner.checkReadiness(healthInput);
    expect(
      isAgentEvaluationProductionSharedEffectHostedOwnerHealth(health)
    ).toBe(true);
    expect(
      matchAgentEvaluationProductionSharedEffectHostedOwnerHealth(
        health as never,
        sourceIdentityDigest,
        TRANSPORT_CHECKED_AT
      )
    ).toBe(true);
    clockTimeMs = Date.parse(NOW);
    await expect(owner.execute({ binding, stage, program })).resolves.toEqual(
      expect.objectContaining({
        businessResult: { status: 'hosted-query-completed' },
        stateVaultResolveRequest: null,
        stateVaultResolveReceipt: null,
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
      })
    );
    expect(lookupCalls).toHaveLength(2);
    expect(readCalls).toHaveLength(2);
    expect(transportContexts).toHaveLength(2);
    expect(
      transportContexts.every(
        (context) =>
          context.providerResourceAuthority.authorityDigest ===
            selectedResult.authority.authorityDigest &&
          context.registrationSetLookupRequest.registrationIntentBindings
            .length === 4
      )
    ).toBe(true);

    const liveContext = transportContexts[1]!;
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
        liveContext.providerResourceAuthority,
        liveContext.providerResourceSetCommitment,
        {
          ledgerAuthorityIssuerId: 'backend.hosted-runtime-read-ledger',
          ledgerAuthorityImplementationDigest: digest(
            'read-ledger-implementation'
          ),
          ledgerRevision: 3,
          sealedAt: NOW,
        },
        [
          {
            request: liveContext.providerResourceReadRequest,
            receipt: liveContext.providerResourceReadReceipt,
          },
        ]
      )
    ).toThrow();

    const callsBeforeClose = Object.freeze({
      lookups: lookupCalls.length,
      reads: readCalls.length,
    });
    await expect(owner.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    expect(transportCloseCalls).toBe(1);
    expect({ lookups: lookupCalls.length, reads: readCalls.length }).toEqual(
      callsBeforeClose
    );
    await expect(owner.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    await expect(owner.execute({ binding, stage, program })).rejects.toThrow(
      'closed'
    );
  }, 20_000);

  it('proves preactivation from live storage and Provider transport without discovering a set', async () => {
    const plan = createV8EvaluationPlan();
    const sourceAuthority = plan.capabilityQualificationTargets
      .map(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority
      )
      .find(
        (authority) =>
          authority?.protocolFamily === 'openai-responses' &&
          authority.capabilityProfileId === 'g4-provider-hosted-retrieval-core'
      )!;
    const {
      authorityDigest: _sourceAuthorityDigest,
      registrationReceiptDigest: _sourceRegistrationReceiptDigest,
      ...sourceIdentityInput
    } = sourceAuthority;
    const sourceIdentity = Object.freeze(
      sourceIdentityInput
    ) as AgentProductionEvaluationRuntimeFactSourceIdentity;
    const sourceIdentityDigest = digestAgentCanonicalValue(sourceIdentity);
    const ownerHealthBinding =
      createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
        'namespace.v8.release'
      );
    expect(
      PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_AUTHORITY_ISSUER_ID
    ).toBe('authority.prodivix.hosted-retrieval-runtime-resource-owner');
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST
    ).toBe(
      'sha256-ed9818c7a2b9a64b97f190bd3d9a5bd43395a021c3f20daa4b46e17247d408be'
    );
    expect(
      PRODUCTION_AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_IMPLEMENTATION_DIGEST
    ).toBe(
      'sha256-143518f5c534f4d3f646a9b5d85f09940b521b4e25826b7ed00ccc2ea68abb1d'
    );
    const storageSummary =
      createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
        namespaceId: ownerHealthBinding.namespaceId,
        schemaContractDigest: ownerHealthBinding.schemaContractDigest,
        ledgerRevision: 9,
        registrationCount: 0,
        activeResourceCount: 0,
        activeReadLeaseCount: 0,
        unfinishedCleanupCount: 0,
        overdueCount: 0,
        summarizedAt: NOW,
      });
    const ownerHealthReceipt =
      createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
        namespaceId: ownerHealthBinding.namespaceId,
        ownerAuthorityIssuerId: ownerHealthBinding.ownerAuthorityIssuerId,
        implementationDigest: ownerHealthBinding.implementationDigest,
        schemaContractDigest: ownerHealthBinding.schemaContractDigest,
        supportedOperations:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
        storageSummary,
        storageSummaryDigest: storageSummary.summaryDigest,
        checkedAt: NOW,
        expiresAt: LOOKUP_EXPIRES_AT,
      });
    let healthReads = 0;
    let transportHealthCalls = 0;
    let transportCloseCalls = 0;
    let transportSourceDigest = sourceIdentityDigest;
    let clockTimeMs = Date.parse(NOW);
    const client = Object.freeze({
      async readOwnerHealth() {
        healthReads += 1;
        return ownerHealthReceipt;
      },
    });
    const transport = Object.freeze({
      authorityKind: 'production-hosted-retrieval-shared-effect' as const,
      readinessAuthority:
        'hosted-owner-bootstrap-and-provider-query-owner' as const,
      async checkReadiness({ ownerHealthReceipt: observedReceipt }) {
        transportHealthCalls += 1;
        if (
          observedReceipt.receiptDigest !== ownerHealthReceipt.receiptDigest
        ) {
          return undefined;
        }
        clockTimeMs += 1;
        const transportCheckedAt = new Date(
          clockTimeMs
        ).toISOString() as Instant;
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
          ownerKind: 'hosted-retrieval-resource' as const,
          sourceIdentityDigest: transportSourceDigest,
          status: 'ready' as const,
          checkedAt: transportCheckedAt,
          expiresAt: LOOKUP_EXPIRES_AT,
        });
        return Object.freeze({
          ...base,
          healthDigest: digestAgentCanonicalValue(base),
        });
      },
      async close() {
        transportCloseCalls += 1;
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      },
    }) satisfies AgentEvaluationProductionSharedEffectHostedPreactivationTransport;
    const owner =
      createProductionAgentEvaluationSharedEffectHostedPreactivationOwner({
        ownerHealthBinding,
        client,
        transport,
        clock: () => new Date(clockTimeMs),
      });
    const healthInput = Object.freeze({
      lookup: Object.freeze({}),
      registrationRequest: Object.freeze({}),
      sourceIdentity,
    }) as AgentEvaluationProductionSharedEffectHealthInput;

    const health = await owner.checkReadiness(healthInput);
    expect(health).toEqual(
      expect.objectContaining({
        readinessMode: 'preactivation',
        ownerHealthReceiptDigest: ownerHealthReceipt.receiptDigest,
        ownerStorageSummaryDigest: storageSummary.summaryDigest,
        schemaContractDigest: ownerHealthBinding.schemaContractDigest,
      })
    );
    expect(
      isAgentEvaluationProductionSharedEffectHostedOwnerHealth(health)
    ).toBe(true);
    expect(
      matchAgentEvaluationProductionSharedEffectHostedOwnerHealth(
        health as never,
        sourceIdentityDigest,
        TRANSPORT_CHECKED_AT
      )
    ).toBe(true);
    await expect(owner.execute({} as never)).resolves.toBeUndefined();
    expect({ healthReads, transportHealthCalls }).toEqual({
      healthReads: 1,
      transportHealthCalls: 1,
    });

    transportSourceDigest = digest('foreign-source');
    await expect(owner.checkReadiness(healthInput)).resolves.toBeUndefined();
    expect(healthReads).toBe(2);
    expect(transportHealthCalls).toBe(2);
    await expect(owner.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    expect(transportCloseCalls).toBe(1);
    await expect(owner.checkReadiness(healthInput)).rejects.toThrow('closed');
  });
});
