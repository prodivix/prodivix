import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import {
  createAgentHostedRetrievalRuntimeResourceExact4Fixture,
  createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture,
  createAgentHostedRetrievalRuntimeResourceLifecycleFixture,
  createAgentHostedRetrievalRuntimeResourceRunTerminalFixture,
} from '../__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentCapabilityProbeProgram } from './agentCapabilityProbeProgram';
import {
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan,
} from '../evaluation/agentEvaluationEvidenceArchive';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceAuthoritySet,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupRequest,
  createAgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
  createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  createAgentHostedRetrievalRuntimeResourceRecoveryCandidate,
  createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  createAgentHostedRetrievalRuntimeResourceRecoveryPage,
  createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationResult,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest,
  deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord,
  isAgentHostedRetrievalRuntimeResourceAuthoritySet,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
  isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  isAgentHostedRetrievalRuntimeResourceReadReceipt,
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  isAgentHostedRetrievalRuntimeResourceRecoveryPage,
  isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  isAgentHostedRetrievalRuntimeResourceRunTerminalFence,
  isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  matchAgentHostedRetrievalRuntimeResourceActiveReadReceipt,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  matchAgentHostedRetrievalRuntimeResourceBudgetReservationPlan,
  matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger,
  matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim,
  matchAgentHostedRetrievalRuntimeResourceRunTerminalFenceLedger,
  matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  matchAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourceNetworkPolicyFrozenBinding,
  matchAgentHostedRetrievalRuntimeResourceStoredCleanupClaimAuthorityReceipt,
  matchAgentHostedRetrievalRuntimeResourceStoredRecoveryClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext,
  matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestExpectedShards,
  normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResource';
import { AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_LIFETIME_MS } from './agentNativeProviderCapabilityRuntime';

const COMMIT = 'a'.repeat(40);
const REGISTERED_AT = '2026-08-11T00:00:00.000Z' as Instant;
const RESOURCE_EXPIRES_AT = '2026-08-13T00:00:00.000Z' as Instant;
const READ_CHECKED_AT = '2026-08-11T00:01:00.000Z' as Instant;
const READ_EXPIRES_AT = '2026-08-11T00:04:00.000Z' as Instant;
const TERMINAL_AT = '2026-08-11T00:04:10.000Z' as Instant;
const FENCE_SEALED_AT = '2026-08-11T00:04:11.000Z' as Instant;
const CLEANUP_CLAIMED_AT = '2026-08-11T00:04:12.000Z' as Instant;
const CLEANUP_CLAIM_EXPIRES_AT = '2026-08-11T00:14:12.000Z' as Instant;
const CLEANUP_DISPATCHED_AT = '2026-08-11T00:04:13.000Z' as Instant;
const CLEANUP_COMPLETED_AT = '2026-08-11T00:04:14.000Z' as Instant;
const LIFECYCLE_TIMING = Object.freeze({
  readCheckedAt: READ_CHECKED_AT,
  readExpiresAt: READ_EXPIRES_AT,
  cleanupClaimedAt: CLEANUP_CLAIMED_AT,
  cleanupClaimExpiresAt: CLEANUP_CLAIM_EXPIRES_AT,
  cleanupDispatchedAt: CLEANUP_DISPATCHED_AT,
  cleanupCompletedAt: CLEANUP_COMPLETED_AT,
});

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ test: 'hosted-runtime-resource', label });

const exact4Fixture = () =>
  createAgentHostedRetrievalRuntimeResourceExact4Fixture({
    namespaceId: 'namespace.hosted-runtime',
    repositoryCommit: COMMIT,
    planDigest: digest('plan'),
    frozenRunDigest: digest('frozen-run'),
    runConfigArtifactBindingDigest: digest('run-config-binding'),
    runtimeResourceSetId: 'runtime-resource-set.g4',
    registeredAt: REGISTERED_AT,
    expiresAt: RESOURCE_EXPIRES_AT,
  });

const terminalLedger = () => {
  const firstEntry = Object.freeze({
    shardId: 'shard.alpha',
    shardLeaseGeneration: 3,
    checkpointDigest: digest('checkpoint.alpha'),
    checkpointUpdatedAt: '2026-08-11T00:04:08.000Z' as Instant,
    terminalAttempts: Object.freeze([
      Object.freeze({
        attemptId: 'attempt.alpha.1',
        attemptDigest: digest('attempt.alpha.1'),
        status: 'completed' as const,
        completedAt: '2026-08-11T00:04:07.000Z' as Instant,
      }),
      Object.freeze({
        attemptId: 'attempt.alpha.2',
        attemptDigest: digest('attempt.alpha.2'),
        status: 'completed' as const,
        completedAt: '2026-08-11T00:04:09.000Z' as Instant,
      }),
    ]),
  });
  const secondEntry = Object.freeze({
    shardId: 'shard.beta',
    shardLeaseGeneration: 5,
    checkpointDigest: digest('checkpoint.beta'),
    checkpointUpdatedAt: TERMINAL_AT,
    terminalAttempts: Object.freeze([
      Object.freeze({
        attemptId: 'attempt.beta.1',
        attemptDigest: digest('attempt.beta.1'),
        status: 'completed' as const,
        completedAt: TERMINAL_AT,
      }),
    ]),
  });
  const first =
    deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(firstEntry);
  const second =
    deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(secondEntry);
  return Object.freeze({
    expectedShardIds: Object.freeze(['shard.alpha', 'shard.beta']),
    terminalShardLedgerEntries: Object.freeze([firstEntry, secondEntry]),
    terminalShardRecords: Object.freeze([first, second]),
  });
};

const createFence = (
  binding: Readonly<{
    namespaceId?: string;
    repositoryCommit?: string;
    planDigest?: CanonicalDigest;
    frozenRunDigest?: CanonicalDigest;
    runConfigArtifactBindingDigest?: CanonicalDigest;
    runtimeResourceSetId?: string;
    maximumIdentityLength?: boolean;
  }> = {}
) => {
  const ledger = terminalLedger();
  const runTerminal =
    createAgentHostedRetrievalRuntimeResourceRunTerminalFixture({
      namespaceId:
        binding.namespaceId ??
        (binding.maximumIdentityLength
          ? `namespace.hosted-runtime.${'x'.repeat(231)}`
          : 'namespace.hosted-runtime'),
      repositoryCommit: binding.repositoryCommit ?? COMMIT,
      planDigest: binding.planDigest ?? digest('plan'),
      frozenRunDigest: binding.frozenRunDigest ?? digest('frozen-run'),
      runConfigArtifactBindingDigest:
        binding.runConfigArtifactBindingDigest ?? digest('run-config-binding'),
      runtimeResourceSetId:
        binding.runtimeResourceSetId ??
        (binding.maximumIdentityLength
          ? `runtime-resource-set.g4.${'x'.repeat(232)}`
          : 'runtime-resource-set.g4'),
      expectedShardIds: ledger.expectedShardIds,
      terminalShardLedgerEntries: ledger.terminalShardLedgerEntries,
      sealedAt: FENCE_SEALED_AT,
      maximumIdentityLength: binding.maximumIdentityLength,
    });
  return Object.freeze({
    ledger,
    fence: runTerminal.fence,
  });
};

const createLifecycle = (
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  fence: ReturnType<typeof createFence>['fence'],
  options: Readonly<{ maximumIdentityLength?: boolean }> = {}
) => {
  return createAgentHostedRetrievalRuntimeResourceLifecycleFixture({
    registrationResult,
    resourceSetCommitment,
    runTerminalFence: fence,
    timing: LIFECYCLE_TIMING,
    maximumIdentityLength: options.maximumIdentityLength,
  });
};

describe('hosted retrieval runtime resource authority', () => {
  it('constructs the exact four run-level authorities and cleanup archive family', () => {
    const ledger = terminalLedger();
    const fixture =
      createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
        namespaceId: 'namespace.hosted-runtime',
        repositoryCommit: COMMIT,
        planDigest: digest('plan'),
        frozenRunDigest: digest('frozen-run'),
        runConfigArtifactBindingDigest: digest('run-config-binding'),
        runtimeResourceSetId: 'runtime-resource-set.g4',
        registeredAt: REGISTERED_AT,
        expiresAt: RESOURCE_EXPIRES_AT,
        expectedShardIds: ledger.expectedShardIds,
        terminalShardLedgerEntries: ledger.terminalShardLedgerEntries,
        terminalFenceSealedAt: FENCE_SEALED_AT,
        timing: LIFECYCLE_TIMING,
      });
    const { fence } = fixture.runTerminal;
    const { lifecycles } = fixture;

    expect(
      isAgentHostedRetrievalRuntimeResourceAuthoritySet(fixture.authoritySet)
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceSetCommitment(
        fixture.resourceSetCommitment
      )
    ).toBe(true);
    expect(isAgentHostedRetrievalRuntimeResourceRunTerminalFence(fence)).toBe(
      true
    );
    expect(fixture.registrationResults).toHaveLength(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    );
    const firstAuthority = fixture.registrationResults[0]!.authority;
    expect(
      matchAgentHostedRetrievalRuntimeResourceBudgetReservationPlan(
        firstAuthority.budgetReservationAuthority,
        {
          namespaceId: 'namespace.hosted-runtime',
          planDigest: digest('plan'),
          reservePolicyDigest:
            firstAuthority.budgetReservationAuthority.reservePolicyDigest,
          budgetDigest: firstAuthority.budgetReservationAuthority.budgetDigest,
        }
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceNetworkPolicyFrozenBinding(
        firstAuthority.networkPolicyAuthority,
        {
          namespaceId: 'namespace.hosted-runtime',
          repositoryCommit: COMMIT,
          planDigest: digest('plan'),
          frozenRunDigest: digest('frozen-run'),
          runConfigArtifactBindingDigest: digest('run-config-binding'),
          providerConfigurationId: firstAuthority.providerConfigurationId,
          providerConfigurationDigest:
            firstAuthority.providerConfigurationDigest,
          protocolFamily: firstAuthority.protocolFamily,
        }
      )
    ).toBe(true);
    expect(
      lifecycles.every(
        ({
          readReceipt,
          readLeaseLedgerRoot,
          cleanupReceipt,
          cleanupArchiveRecord,
        }) =>
          isAgentHostedRetrievalRuntimeResourceReadReceipt(readReceipt) &&
          isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
            readLeaseLedgerRoot
          ) &&
          isAgentHostedRetrievalRuntimeResourceCleanupReceipt(cleanupReceipt) &&
          isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(
            cleanupArchiveRecord
          ) &&
          matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger(
            cleanupArchiveRecord,
            ledger.expectedShardIds,
            ledger.terminalShardLedgerEntries
          )
      )
    ).toBe(true);
    const archiveFamily = fixture.cleanupArchiveFamily;
    expect(
      isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(archiveFamily)
    ).toBe(true);
    expect(archiveFamily).toHaveLength(4);
    expect(
      archiveFamily.every(
        ({ cleanupReceipt }) =>
          cleanupReceipt.residualProviderResourceIds.length === 0
      )
    ).toBe(true);
    const archiveAccumulator =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'hostedRetrievalRuntimeResourceCleanups'
      );
    archiveFamily.forEach((record) => archiveAccumulator.append(record));
    expect(archiveAccumulator.finalize()).toBe(
      digestAgentCanonicalValue({
        recordDigests: archiveFamily
          .map(({ recordDigest }) => recordDigest)
          .sort(compareUnicodeCodePoints),
      })
    );
    const incompleteArchiveAccumulator =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'hostedRetrievalRuntimeResourceCleanups'
      );
    archiveFamily
      .slice(0, AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT - 1)
      .forEach((record) => incompleteArchiveAccumulator.append(record));
    expect(() => incompleteArchiveAccumulator.finalize()).toThrow();
  });

  it('joins the pre-plan hosted intent to the exact post-plan cleanup family', () => {
    const plan = createV8EvaluationPlan();
    const registrationIntents = plan.capabilityQualificationTargets.flatMap(
      (target) => {
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
        const probeProgram = createAgentCapabilityProbeProgram({
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
            probeProgramDigest: probeProgram.programDigest,
            publicResourceDescriptorDigest:
              probeProgram.providerRequestIntent.publicProbeResource!
                .descriptorDigest,
          });
        if (
          intent.intentDigest !==
          source.hostedRetrievalRuntimeResourceRegistrationIntentDigest
        ) {
          throw new TypeError('Hosted registration intent drifted from plan.');
        }
        return [intent];
      }
    );
    const fixture = createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      namespaceId: 'namespace.hosted-runtime',
      repositoryCommit: plan.repositoryCommit,
      planDigest: plan.planDigest,
      frozenRunDigest: digest('plan-bound-frozen-run'),
      runConfigArtifactBindingDigest: digest('plan-bound-run-config'),
      runtimeResourceSetId: 'runtime-resource-set.plan-bound',
      registeredAt: REGISTERED_AT,
      expiresAt: RESOURCE_EXPIRES_AT,
      registrationIntents,
    });
    const { fence } = createFence({
      repositoryCommit: plan.repositoryCommit,
      planDigest: plan.planDigest,
      frozenRunDigest: fixture.authoritySet.frozenRunDigest,
      runConfigArtifactBindingDigest:
        fixture.authoritySet.runConfigArtifactBindingDigest,
      runtimeResourceSetId: fixture.authoritySet.runtimeResourceSetId,
    });
    const records = fixture.registrationResults.map(
      (registrationResult) =>
        createLifecycle(
          registrationResult,
          fixture.resourceSetCommitment,
          fence
        ).cleanupArchiveRecord
    );
    expect(
      isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan(
        plan,
        records
      )
    ).toBe(true);
    expect(
      isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan(
        plan,
        records.slice(0, records.length - 1)
      )
    ).toBe(false);
    const samePlanForeignFixture =
      createAgentHostedRetrievalRuntimeResourceExact4Fixture({
        namespaceId: 'namespace.hosted-runtime',
        repositoryCommit: plan.repositoryCommit,
        planDigest: plan.planDigest,
        frozenRunDigest: fixture.authoritySet.frozenRunDigest,
        runConfigArtifactBindingDigest:
          fixture.authoritySet.runConfigArtifactBindingDigest,
        runtimeResourceSetId: fixture.authoritySet.runtimeResourceSetId,
        registeredAt: REGISTERED_AT,
        expiresAt: RESOURCE_EXPIRES_AT,
        maximumIdentityLength: true,
      });
    const samePlanForeignRecords =
      samePlanForeignFixture.registrationResults.map(
        (registrationResult) =>
          createLifecycle(
            registrationResult,
            samePlanForeignFixture.resourceSetCommitment,
            fence
          ).cleanupArchiveRecord
      );
    expect(
      isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan(
        plan,
        samePlanForeignRecords
      )
    ).toBe(false);
    const foreignFixture = exact4Fixture();
    const foreignFence = createFence().fence;
    const foreignPlanRecords = foreignFixture.registrationResults.map(
      (registrationResult) =>
        createLifecycle(
          registrationResult,
          foreignFixture.resourceSetCommitment,
          foreignFence
        ).cleanupArchiveRecord
    );
    expect(
      isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan(
        plan,
        foreignPlanRecords
      )
    ).toBe(false);
  });

  it('discovers the durable exact four post-plan registrations by pre-plan intent', () => {
    const fixture = exact4Fixture();
    const registrationIntentBindings = fixture.registrationResults.map(
      ({ registrationRequest }) =>
        Object.freeze({
          protocolFamily: registrationRequest.protocolFamily,
          capabilityProfileId: registrationRequest.capabilityProfileId,
          registrationIntentDigest:
            registrationRequest.registrationIntentDigest,
        })
    );
    const request =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        namespaceId: 'namespace.hosted-runtime',
        repositoryCommit: COMMIT,
        planDigest: digest('plan'),
        frozenRunDigest: digest('frozen-run'),
        runConfigArtifactBindingDigest: digest('run-config-binding'),
        registrationIntentBindings,
        requestedAt: REGISTERED_AT,
      });
    const seal = Object.freeze({
      lookupAuthorityIssuerId: 'backend.hosted-runtime-registration-set',
      lookupAuthorityImplementationDigest: digest(
        'registration-set-lookup-implementation'
      ),
      lookupLedgerRevision: 11,
      checkedAt: '2026-08-11T00:00:01.000Z' as Instant,
      expiresAt: '2026-08-11T00:02:06.000Z' as Instant,
    });
    const receipt =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        request,
        [...fixture.registrationResults].reverse(),
        seal
      );

    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_MAXIMUM_LIFETIME_MS
    ).toBe(AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_LIFETIME_MS);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE
    ).toBe('hosted-retrieval-runtime-resource.registration-set.read');
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(request)
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(receipt)
    ).toBe(true);
    expect(receipt.registrationResults).toEqual(fixture.registrationResults);
    expect(receipt.authoritySet).toEqual(fixture.authoritySet);
    expect(receipt.resourceSetCommitment).toEqual(
      fixture.resourceSetCommitment
    );
    expect(
      matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        receipt,
        request,
        '2026-08-11T00:01:00.000Z' as Instant
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        receipt,
        request,
        seal.expiresAt
      )
    ).toBe(false);

    const { requestDigest: _requestDigest, ...requestWireBase } = request;
    const {
      format: _requestFormat,
      version: _requestVersion,
      ...requestInput
    } = requestWireBase;
    const reorderedRequestBase = Object.freeze({
      ...requestWireBase,
      registrationIntentBindings: Object.freeze(
        [...request.registrationIntentBindings].reverse()
      ),
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
        Object.freeze({
          ...reorderedRequestBase,
          requestDigest: digestAgentCanonicalValue(reorderedRequestBase),
        })
      )
    ).toBe(false);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...requestInput,
        registrationIntentBindings: request.registrationIntentBindings.slice(
          0,
          -1
        ),
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...requestInput,
        registrationIntentBindings: Object.freeze([
          ...request.registrationIntentBindings,
          request.registrationIntentBindings[0]!,
        ]),
      })
    ).toThrow();

    const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
    const reorderedReceiptBase = Object.freeze({
      ...receiptBase,
      registrationResults: Object.freeze(
        [...receipt.registrationResults].reverse()
      ),
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        Object.freeze({
          ...reorderedReceiptBase,
          receiptDigest: digestAgentCanonicalValue(reorderedReceiptBase),
        })
      )
    ).toBe(false);
    const foreignFormatReceiptBase = Object.freeze({
      ...receiptBase,
      format: 'prodivix.foreign-hosted-registration-set-lookup-receipt',
    });
    const foreignVersionReceiptBase = Object.freeze({
      ...receiptBase,
      version: 2,
    });
    expect(
      [foreignFormatReceiptBase, foreignVersionReceiptBase].every(
        (base) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
            Object.freeze({
              ...base,
              receiptDigest: digestAgentCanonicalValue(base),
            })
          )
      )
    ).toBe(true);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        request,
        receipt.registrationResults.slice(0, -1),
        seal
      )
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        request,
        Object.freeze([
          ...receipt.registrationResults,
          receipt.registrationResults[0]!,
        ]),
        seal
      )
    ).toThrow();

    const foreign = createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      namespaceId: 'namespace.hosted-runtime',
      repositoryCommit: COMMIT,
      planDigest: digest('plan'),
      frozenRunDigest: digest('frozen-run'),
      runConfigArtifactBindingDigest: digest('run-config-binding'),
      runtimeResourceSetId: 'runtime-resource-set.foreign-discovery',
      registeredAt: REGISTERED_AT,
      expiresAt: RESOURCE_EXPIRES_AT,
      maximumIdentityLength: true,
    });
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        request,
        foreign.registrationResults,
        seal
      )
    ).toThrow();
    const foreignRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...requestInput,
        registrationIntentBindings: foreign.registrationResults.map(
          ({ registrationRequest }) =>
            Object.freeze({
              protocolFamily: registrationRequest.protocolFamily,
              capabilityProfileId: registrationRequest.capabilityProfileId,
              registrationIntentDigest:
                registrationRequest.registrationIntentDigest,
            })
        ),
      });
    const foreignReceipt =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        foreignRequest,
        foreign.registrationResults,
        seal
      );
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        foreignReceipt
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        foreignReceipt,
        request,
        '2026-08-11T00:01:00.000Z' as Instant
      )
    ).toBe(false);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        request,
        fixture.registrationResults,
        {
          ...seal,
          expiresAt: '2026-08-11T00:02:06.001Z' as Instant,
        }
      )
    ).toThrow();

    const maximumFixture =
      createAgentHostedRetrievalRuntimeResourceExact4Fixture({
        namespaceId: `namespace.${'x'.repeat(246)}`,
        repositoryCommit: COMMIT,
        planDigest: digest('maximum-lookup-plan'),
        frozenRunDigest: digest('maximum-lookup-frozen-run'),
        runConfigArtifactBindingDigest: digest('maximum-lookup-binding'),
        runtimeResourceSetId: `runtime-resource-set.${'x'.repeat(235)}`,
        registeredAt: REGISTERED_AT,
        expiresAt: RESOURCE_EXPIRES_AT,
        maximumIdentityLength: true,
        auxiliaryResourceCount: 20,
      });
    const maximumRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        namespaceId:
          maximumFixture.registrationResults[0]!.registrationRequest
            .namespaceId,
        repositoryCommit: COMMIT,
        planDigest: digest('maximum-lookup-plan'),
        frozenRunDigest: digest('maximum-lookup-frozen-run'),
        runConfigArtifactBindingDigest: digest('maximum-lookup-binding'),
        registrationIntentBindings: maximumFixture.registrationResults.map(
          ({ registrationRequest }) =>
            Object.freeze({
              protocolFamily: registrationRequest.protocolFamily,
              capabilityProfileId: registrationRequest.capabilityProfileId,
              registrationIntentDigest:
                registrationRequest.registrationIntentDigest,
            })
        ),
        requestedAt: REGISTERED_AT,
      });
    const maximumReceipt =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        maximumRequest,
        maximumFixture.registrationResults,
        {
          ...seal,
          lookupAuthorityIssuerId: `lookup-authority.${'x'.repeat(239)}`,
        }
      );
    const maximumReceiptBytes = new TextEncoder().encode(
      canonicalJsonText(maximumReceipt)
    ).byteLength;
    expect(maximumReceiptBytes).toBeLessThanOrEqual(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES
    );
    const oversizedIssuer = `${maximumReceipt.lookupAuthorityIssuerId}${'x'.repeat(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES +
        1 -
        maximumReceiptBytes
    )}`;
    const {
      receiptDigest: _maximumReceiptDigest,
      lookupAuthorityIssuerId: _maximumLookupAuthorityIssuerId,
      ...maximumReceiptRest
    } = maximumReceipt;
    const oversizedReceiptBase = Object.freeze({
      ...maximumReceiptRest,
      lookupAuthorityIssuerId: oversizedIssuer,
    });
    const oversizedReceipt = Object.freeze({
      ...oversizedReceiptBase,
      receiptDigest: digestAgentCanonicalValue(oversizedReceiptBase),
    });
    expect(
      new TextEncoder().encode(canonicalJsonText(oversizedReceipt)).byteLength
    ).toBe(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES +
        1
    );
    expect(
      isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        oversizedReceipt
      )
    ).toBe(false);
  });

  it('rejects incomplete, duplicate, foreign, and oversized exact-set projections', () => {
    const fixture = exact4Fixture();
    const registrationRequest =
      fixture.registrationResults[0]!.registrationRequest;
    const {
      format: _registrationFormat,
      version: _registrationVersion,
      requestDigest: _registrationRequestDigest,
      ...registrationInput
    } = registrationRequest;
    const foreignIntent =
      fixture.registrationResults[1]!.registrationRequest.registrationIntent;
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
        ...registrationInput,
        registrationIntent: foreignIntent,
        registrationIntentDigest: foreignIntent.intentDigest,
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
        ...registrationInput,
        namespaceId: 'namespace.foreign-hosted-runtime',
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
        ...registrationInput,
        repositoryCommit: 'b'.repeat(40),
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceAuthoritySet({
        planDigest: fixture.authoritySet.planDigest,
        frozenRunDigest: fixture.authoritySet.frozenRunDigest,
        runConfigArtifactBindingDigest:
          fixture.authoritySet.runConfigArtifactBindingDigest,
        runtimeResourceSetId: fixture.authoritySet.runtimeResourceSetId,
        authorities: fixture.authoritySet.authorities.slice(0, 3),
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceAuthoritySet({
        planDigest: fixture.authoritySet.planDigest,
        frozenRunDigest: fixture.authoritySet.frozenRunDigest,
        runConfigArtifactBindingDigest:
          fixture.authoritySet.runConfigArtifactBindingDigest,
        runtimeResourceSetId: fixture.authoritySet.runtimeResourceSetId,
        authorities: Object.freeze([
          ...fixture.authoritySet.authorities,
          fixture.authoritySet.authorities[0]!,
        ]),
      })
    ).toThrow();
    const foreign = createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      namespaceId: 'namespace.hosted-runtime',
      repositoryCommit: COMMIT,
      planDigest: digest('foreign-plan'),
      frozenRunDigest: digest('foreign-frozen-run'),
      runConfigArtifactBindingDigest: digest('foreign-binding'),
      runtimeResourceSetId: 'runtime-resource-set.foreign',
      registeredAt: REGISTERED_AT,
      expiresAt: RESOURCE_EXPIRES_AT,
    });
    expect(
      matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
        foreign.resourceSetCommitment,
        fixture.authoritySet.authorities[0]!
      )
    ).toBe(false);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceRegistrationResult(
        fixture.registrationResults[0]!.registrationRequest,
        fixture.registrationResults[0]!.authority,
        foreign.registrationResults[0]!.deletionAuthorityReceipt
      )
    ).toThrow();
    const {
      commitmentDigest: _commitmentDigest,
      authoritySetDigest: _authoritySetDigest,
      ...commitmentProjection
    } = fixture.resourceSetCommitment;
    const forgedCommitmentBase = Object.freeze({
      ...commitmentProjection,
      authoritySetDigest: digest('forged-authority-set'),
    });
    const forgedCommitment = Object.freeze({
      ...forgedCommitmentBase,
      commitmentDigest: digestAgentCanonicalValue(forgedCommitmentBase),
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceSetCommitment(forgedCommitment)
    ).toBe(true);
    const forgedFence = createFence().fence;
    const forgedArchiveRecords = fixture.registrationResults.map(
      (registrationResult) =>
        createLifecycle(registrationResult, forgedCommitment, forgedFence)
          .cleanupArchiveRecord
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
        forgedArchiveRecords
      )
    ).toThrow();
  });

  it('keeps read leases live through the native request lifetime and uses half-open expiry', () => {
    const fixture = exact4Fixture();
    const lifecycle = createLifecycle(
      fixture.registrationResults[0]!,
      fixture.resourceSetCommitment,
      createFence().fence
    );
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS
    ).toBeGreaterThanOrEqual(125_000 + 30_000);
    expect(
      matchAgentHostedRetrievalRuntimeResourceActiveReadReceipt(
        lifecycle.readReceipt,
        fixture.registrationResults[0]!.authority,
        {
          activeOwnerInstanceId: lifecycle.activeState.activeOwnerInstanceId,
          claimGeneration: lifecycle.activeState.claimGeneration,
          activeState: lifecycle.activeState,
          observedAt: READ_EXPIRES_AT,
        }
      )
    ).toBe(false);
    const tooShortExpiry = '2026-08-11T00:03:34.999Z' as Instant;
    const shortRequest = createAgentHostedRetrievalRuntimeResourceReadRequest({
      ...(({
        format: _format,
        version: _version,
        requestDigest: _digest,
        minimumExpiresAt: _minimum,
        ...base
      }) => base)(lifecycle.readRequest),
      readLeaseId: 'read-lease.too-short',
      minimumExpiresAt: tooShortExpiry,
    });
    const shortState = createAgentHostedRetrievalRuntimeResourceActiveState(
      fixture.registrationResults[0]!.authority,
      fixture.resourceSetCommitment,
      {
        activeOwnerInstanceId: shortRequest.readerOwnerInstanceId,
        claimGeneration: 2,
        readLeaseNotAfter: tooShortExpiry,
        updatedAt: READ_CHECKED_AT,
      }
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceReadReceipt(
        shortRequest,
        fixture.registrationResults[0]!.authority,
        fixture.resourceSetCommitment,
        {
          activeState: shortState,
          checkedAt: READ_CHECKED_AT,
          expiresAt: tooShortExpiry,
        }
      )
    ).toThrow();
  });

  it('binds empty read roots, Backend terminal rows, and serialized cleanup CAS', () => {
    const fixture = exact4Fixture();
    const registrationResult = fixture.registrationResults[0]!;
    const authority = registrationResult.authority;
    const { fence, ledger } = createFence();
    const lifecycle = createLifecycle(
      registrationResult,
      fixture.resourceSetCommitment,
      fence
    );
    const emptyRoot =
      createAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
        authority,
        fixture.resourceSetCommitment,
        {
          ledgerAuthorityIssuerId: 'authority.hosted-read-ledger',
          ledgerAuthorityImplementationDigest: digest(
            'read-ledger-authority-implementation'
          ),
          ledgerRevision: 32,
          sealedAt: READ_EXPIRES_AT,
        },
        Object.freeze([])
      );
    const { rootDigest: _rootDigest, ...emptyBase } = emptyRoot;
    const forgedEmptyBase = Object.freeze({
      ...emptyBase,
      readLeaseIdSetDigest: digest('forged-empty-read-leases'),
      readRequestDigestSetDigest: digest('forged-empty-read-requests'),
      readReceiptDigestSetDigest: digest('forged-empty-read-receipts'),
      activeStateDigestSetDigest: digest('forged-empty-active-states'),
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot({
        ...forgedEmptyBase,
        rootDigest: digestAgentCanonicalValue(forgedEmptyBase),
      })
    ).toBe(false);
    expect(
      matchAgentHostedRetrievalRuntimeResourceRunTerminalFenceLedger(
        fence,
        ledger.expectedShardIds,
        ledger.terminalShardRecords
      )
    ).toBe(true);
    const changedShard =
      deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord({
        shardId: 'shard.beta',
        shardLeaseGeneration: 5,
        checkpointDigest: digest('checkpoint.beta'),
        checkpointUpdatedAt: TERMINAL_AT,
        terminalAttempts: Object.freeze([
          Object.freeze({
            attemptId: 'attempt.beta.1',
            attemptDigest: digest('attempt.beta.1.changed'),
            status: 'provider-error' as const,
            completedAt: TERMINAL_AT,
          }),
        ]),
      });
    expect(
      matchAgentHostedRetrievalRuntimeResourceRunTerminalFenceLedger(
        fence,
        ledger.expectedShardIds,
        Object.freeze([ledger.terminalShardRecords[0]!, changedShard])
      )
    ).toBe(false);
    const competingClaim =
      createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
        registrationResult,
        fixture.resourceSetCommitment,
        lifecycle.activeState,
        {
          claimId: 'cleanup-claim.competing',
          claimAuthorityIssuerId: 'authority.hosted-cleanup-claims',
          claimAuthorityImplementationDigest: digest(
            'cleanup-claim-authority-implementation'
          ),
          claimLedgerRevision: 42,
          cleanupOwnerInstanceId: 'cleanup-owner.competing',
          claimGeneration: 2,
          claimedAt: CLEANUP_CLAIMED_AT,
          claimExpiresAt: CLEANUP_CLAIM_EXPIRES_AT,
        }
      );
    expect(
      isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
        competingClaim
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceStoredCleanupClaimAuthorityReceipt(
        competingClaim,
        lifecycle.cleanupClaimAuthorityReceipt
      )
    ).toBe(false);
    const competingRequest =
      createAgentHostedRetrievalRuntimeResourceCleanupRequest({
        ...(({
          format: _format,
          version: _version,
          requestDigest: _digest,
          cleanupClaimAuthorityReceiptDigest: _claim,
          cleanupOwnerInstanceId: _owner,
          ...base
        }) => base)(lifecycle.cleanupRequest),
        cleanupClaimAuthorityReceiptDigest: competingClaim.receiptDigest,
        cleanupOwnerInstanceId: competingClaim.cleanupOwnerInstanceId,
      });
    expect(
      matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim(
        competingRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        lifecycle.cleanupClaimAuthorityReceipt,
        lifecycle.activeState,
        lifecycle.readLeaseLedgerRoot,
        fence,
        null
      )
    ).toBe(false);
  });

  it('normalizes multi-attempt terminal outcomes with deterministic precedence', () => {
    expect(
      normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome('completed')
    ).toBe('completed');
    expect(
      normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome('cancelled')
    ).toBe('cancelled');
    for (const status of [
      'blocked',
      'infrastructure-error',
      'provider-error',
      'rate-limited',
      'schema-failed',
      'timed-out',
    ] as const) {
      expect(
        normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome(status)
      ).toBe('failed');
    }
    const failed = deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(
      {
        shardId: 'shard.precedence',
        shardLeaseGeneration: 1,
        checkpointDigest: digest('checkpoint.precedence'),
        checkpointUpdatedAt: TERMINAL_AT,
        terminalAttempts: Object.freeze([
          Object.freeze({
            attemptId: 'attempt.precedence.1',
            attemptDigest: digest('attempt.precedence.1'),
            status: 'cancelled' as const,
            completedAt: TERMINAL_AT,
          }),
          Object.freeze({
            attemptId: 'attempt.precedence.2',
            attemptDigest: digest('attempt.precedence.2'),
            status: 'timed-out' as const,
            completedAt: TERMINAL_AT,
          }),
        ]),
      }
    );
    expect(failed.terminalOutcome).toBe('failed');
    expect(failed.terminalAttemptCount).toBe(2);
  });

  it('requires deletion dispatch after the lease fence and carries the cleanup claim into every result', () => {
    const fixture = exact4Fixture();
    const registrationResult = fixture.registrationResults[0]!;
    const lifecycle = createLifecycle(
      registrationResult,
      fixture.resourceSetCommitment,
      createFence().fence
    );
    const earlyResults = lifecycle.resourceResults.map((result) =>
      createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
        ...(({
          format: _format,
          version: _version,
          resultDigest: _digest,
          dispatchCreatedAt: _dispatch,
          ...base
        }) => base)(result),
        dispatchCreatedAt: '2026-08-11T00:04:11.999Z' as Instant,
      })
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupReceipt(
        lifecycle.cleanupRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        lifecycle.cleanupClaimAuthorityReceipt,
        lifecycle.activeState,
        lifecycle.readLeaseLedgerRoot,
        createFence().fence,
        null,
        earlyResults
      )
    ).toThrow();
    const expiredClaimResults = lifecycle.resourceResults.map((result) =>
      createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
        ...(({
          format: _format,
          version: _version,
          resultDigest: _digest,
          dispatchCreatedAt: _dispatch,
          completedAt: _completed,
          ...base
        }) => base)(result),
        dispatchCreatedAt: CLEANUP_CLAIM_EXPIRES_AT,
        completedAt: '2026-08-11T00:14:13.000Z' as Instant,
      })
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupReceipt(
        lifecycle.cleanupRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        lifecycle.cleanupClaimAuthorityReceipt,
        lifecycle.activeState,
        lifecycle.readLeaseLedgerRoot,
        createFence().fence,
        null,
        expiredClaimResults
      )
    ).toThrow();
    const wrongClaimResults = lifecycle.resourceResults.map((result) =>
      createAgentHostedRetrievalRuntimeResourceCleanupResourceResult({
        ...(({
          format: _format,
          version: _version,
          resultDigest: _digest,
          cleanupClaimAuthorityReceiptDigest: _claim,
          ...base
        }) => base)(result),
        cleanupClaimAuthorityReceiptDigest: digest('foreign-cleanup-claim'),
      })
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupReceipt(
        lifecycle.cleanupRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        lifecycle.cleanupClaimAuthorityReceipt,
        lifecycle.activeState,
        lifecycle.readLeaseLedgerRoot,
        createFence().fence,
        null,
        wrongClaimResults
      )
    ).toThrow();
  });

  it('exposes exact bounded recovery scan, CAS claim, and zero-residual result wire', () => {
    const fixture = exact4Fixture();
    const registrationResult = fixture.registrationResults[0]!;
    const lifecycle = createLifecycle(
      registrationResult,
      fixture.resourceSetCommitment,
      createFence().fence
    );
    const scanRequest =
      createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest({
        namespaceId: registrationResult.registrationRequest.namespaceId,
        purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.listRecovery,
        pageSize: 1,
        cursor: null,
        requestedAt: CLEANUP_CLAIMED_AT,
      });
    const candidate =
      createAgentHostedRetrievalRuntimeResourceRecoveryCandidate({
        namespaceId: registrationResult.registrationRequest.namespaceId,
        repositoryCommit: COMMIT,
        planDigest: registrationResult.authority.planDigest,
        frozenRunDigest: registrationResult.authority.frozenRunDigest,
        runConfigArtifactBindingDigest:
          registrationResult.authority.runConfigArtifactBindingDigest,
        runtimeResourceSetId: registrationResult.authority.runtimeResourceSetId,
        authorityDigest: registrationResult.authorityDigest,
        resourceSetCommitmentDigest:
          fixture.resourceSetCommitment.commitmentDigest,
        activeStateDigest: lifecycle.activeState.stateDigest,
        readLeaseLedgerRootDigest: lifecycle.readLeaseLedgerRoot.rootDigest,
        storedRunTerminalFenceDigest:
          lifecycle.cleanupRequest.runTerminalFenceDigest,
        resourceExpiresAt: registrationResult.authority.expiresAt,
        eligibleAt: CLEANUP_CLAIMED_AT,
        disposition: 'run-terminal',
      });
    const page = createAgentHostedRetrievalRuntimeResourceRecoveryPage(
      scanRequest,
      {
        recoveryAuthorityIssuerId: 'authority.hosted-cleanup-claims',
        recoveryAuthorityImplementationDigest: digest(
          'cleanup-claim-authority-implementation'
        ),
        scanLedgerRevision: 40,
        candidates: Object.freeze([candidate]),
        nextCursor: null,
        scannedAt: CLEANUP_CLAIMED_AT,
      }
    );
    const claimRequest =
      createAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(page, {
        namespaceId: candidate.namespaceId,
        purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup,
        candidate,
        expectedActiveStateDigest: lifecycle.activeState.stateDigest,
        cleanupOwnerInstanceId:
          lifecycle.cleanupClaimAuthorityReceipt.cleanupOwnerInstanceId,
        claimedAt: CLEANUP_CLAIMED_AT,
      });
    const recoveryClaimReceipt =
      createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        claimRequest,
        {
          cleanupClaimAuthorityReceipt: lifecycle.cleanupClaimAuthorityReceipt,
          registrationResult,
          resourceSetCommitment: fixture.resourceSetCommitment,
          storedPriorActiveState: lifecycle.activeState,
          readLeaseLedgerRoot: lifecycle.readLeaseLedgerRoot,
          storedRunTerminalFence: lifecycle.cleanupRequest.runTerminalFence,
          overdueReceipt: null,
          cleanupRequest: lifecycle.cleanupRequest,
          claimedAt: CLEANUP_CLAIMED_AT,
          claimExpiresAt: CLEANUP_CLAIM_EXPIRES_AT,
        },
        page
      );
    const resultReadRequest =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest({
        namespaceId: candidate.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readCleanupResult,
        authorityDigest: candidate.authorityDigest,
        cleanupRequestDigest: lifecycle.cleanupRequest.requestDigest,
        recoveryClaimReceiptDigest: recoveryClaimReceipt.receiptDigest,
        requestedAt: CLEANUP_COMPLETED_AT,
      });
    const resultReadReceipt =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
        resultReadRequest,
        {
          status: 'cleaned',
          cleanupReceipt: lifecycle.cleanupReceipt,
          cleanupArchiveRecord: lifecycle.cleanupArchiveRecord,
          residualProviderResourceIds: Object.freeze([]),
          readAt: CLEANUP_COMPLETED_AT,
        }
      );
    const pendingResultReadReceipt =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
        resultReadRequest,
        {
          status: 'pending',
          cleanupReceipt: null,
          cleanupArchiveRecord: null,
          residualProviderResourceIds: null,
          readAt: CLEANUP_DISPATCHED_AT,
        }
      );
    expect(isAgentHostedRetrievalRuntimeResourceRecoveryPage(page)).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(claimRequest)
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        recoveryClaimReceipt
      )
    ).toBe(true);
    expect(recoveryClaimReceipt.claimSource).toBe('recovery');
    expect(
      matchAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        recoveryClaimReceipt,
        claimRequest
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceStoredRecoveryClaimReceipt(
        recoveryClaimReceipt,
        recoveryClaimReceipt
      )
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
        resultReadReceipt
      )
    ).toBe(true);
    expect(pendingResultReadReceipt.status).toBe('pending');
    expect(resultReadReceipt.residualProviderResourceIds).toEqual([]);
    const { requestDigest: _requestDigest, ...scanBase } = scanRequest;
    const forgedScanBase = Object.freeze({ ...scanBase, extra: 'recomputed' });
    expect(
      isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest({
        ...forgedScanBase,
        requestDigest: digestAgentCanonicalValue(forgedScanBase),
      })
    ).toBe(false);
    const { requestDigest: _claimDigest, ...claimBase } = claimRequest;
    const forgedClaimBase = Object.freeze({
      ...claimBase,
      extra: 'recomputed',
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest({
        ...forgedClaimBase,
        requestDigest: digestAgentCanonicalValue(forgedClaimBase),
      })
    ).toBe(false);
  });

  it('derives a durable terminal fence and issues a distinct post-matrix cleanup claim', () => {
    const fixture = exact4Fixture();
    const registrationResult = fixture.registrationResults[0]!;
    const { fence, ledger } = createFence();
    const lifecycle = createLifecycle(
      registrationResult,
      fixture.resourceSetCommitment,
      fence
    );
    const expectedShardIdSetDigest =
      deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest(
        ledger.expectedShardIds
      );
    const deriveRequest =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest({
        namespaceId: registrationResult.registrationRequest.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE,
        repositoryCommit: COMMIT,
        planDigest: registrationResult.authority.planDigest,
        frozenRunDigest: registrationResult.authority.frozenRunDigest,
        runConfigArtifactBindingDigest:
          registrationResult.authority.runConfigArtifactBindingDigest,
        runtimeResourceSetId: registrationResult.authority.runtimeResourceSetId,
        resourceSetCommitmentDigest:
          fixture.resourceSetCommitment.commitmentDigest,
        expectedShardCount: ledger.expectedShardIds.length,
        expectedShardIdSetDigest,
        requestedAt: FENCE_SEALED_AT,
      });
    const deriveReceipt =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        deriveRequest,
        fence,
        {
          checkedAt: FENCE_SEALED_AT,
          expiresAt: '2026-08-11T00:06:16.000Z' as Instant,
        }
      );
    const claimRequest =
      createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest({
        namespaceId: registrationResult.registrationRequest.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
        repositoryCommit: COMMIT,
        planDigest: registrationResult.authority.planDigest,
        frozenRunDigest: registrationResult.authority.frozenRunDigest,
        runConfigArtifactBindingDigest:
          registrationResult.authority.runConfigArtifactBindingDigest,
        runtimeResourceSetId: registrationResult.authority.runtimeResourceSetId,
        authorityDigest: registrationResult.authorityDigest,
        resourceSetCommitmentDigest:
          fixture.resourceSetCommitment.commitmentDigest,
        terminalFenceDeriveReceipt: deriveReceipt,
        cleanupOwnerInstanceId:
          lifecycle.cleanupClaimAuthorityReceipt.cleanupOwnerInstanceId,
        claimedAt: CLEANUP_CLAIMED_AT,
        minimumClaimExpiresAt: CLEANUP_CLAIM_EXPIRES_AT,
      });
    const claimReceipt =
      createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        claimRequest,
        {
          cleanupClaimAuthorityReceipt: lifecycle.cleanupClaimAuthorityReceipt,
          registrationResult,
          resourceSetCommitment: fixture.resourceSetCommitment,
          storedPriorActiveState: lifecycle.activeState,
          readLeaseLedgerRoot: lifecycle.readLeaseLedgerRoot,
          storedRunTerminalFence: fence,
          overdueReceipt: null,
          cleanupRequest: lifecycle.cleanupRequest,
          claimedAt: CLEANUP_CLAIMED_AT,
          claimExpiresAt: CLEANUP_CLAIM_EXPIRES_AT,
        },
        deriveReceipt
      );
    const resultReadRequest =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest({
        namespaceId: registrationResult.registrationRequest.namespaceId,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult,
        authorityDigest: registrationResult.authorityDigest,
        cleanupRequestDigest: lifecycle.cleanupRequest.requestDigest,
        recoveryClaimReceiptDigest: claimReceipt.receiptDigest,
        requestedAt: CLEANUP_COMPLETED_AT,
      });
    const resultReadReceipt =
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
        resultReadRequest,
        {
          status: 'cleaned',
          cleanupReceipt: lifecycle.cleanupReceipt,
          cleanupArchiveRecord: lifecycle.cleanupArchiveRecord,
          residualProviderResourceIds: Object.freeze([]),
          readAt: CLEANUP_COMPLETED_AT,
        }
      );

    expect(
      isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(
        deriveRequest
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestExpectedShards(
        deriveRequest,
        ledger.expectedShardIds
      )
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        deriveReceipt
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        deriveReceipt,
        deriveRequest,
        CLEANUP_CLAIMED_AT
      )
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
        claimRequest
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext(
        claimRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        fence,
        deriveReceipt
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimReceipt(
        claimReceipt,
        claimRequest
      )
    ).toBe(true);
    expect(claimReceipt.claimSource).toBe('post-matrix');
    expect(claimReceipt.candidateDigest).toBeNull();
    expect(
      isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt(
        resultReadReceipt
      )
    ).toBe(true);

    expect(
      matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        deriveReceipt,
        deriveRequest,
        deriveReceipt.expiresAt
      )
    ).toBe(false);
    expect(() =>
      deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest(
        [...ledger.expectedShardIds].reverse()
      )
    ).toThrow();
    expect(
      matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestExpectedShards(
        deriveRequest,
        ledger.expectedShardIds.slice(0, 1)
      )
    ).toBe(false);
    const foreignSetDigest = digest('foreign-runtime-resource-set');
    const foreignDeriveRequest =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest({
        ...(({
          format: _format,
          version: _version,
          requestDigest: _requestDigest,
          resourceSetCommitmentDigest: _setDigest,
          ...input
        }) => input)(deriveRequest),
        resourceSetCommitmentDigest: foreignSetDigest,
      });
    const foreignDeriveReceipt =
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        foreignDeriveRequest,
        fence,
        {
          checkedAt: FENCE_SEALED_AT,
          expiresAt: '2026-08-11T00:06:16.000Z' as Instant,
        }
      );
    const foreignClaimRequest =
      createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest({
        ...(({
          format: _format,
          version: _version,
          requestDigest: _requestDigest,
          terminalFenceDeriveReceiptDigest: _receiptDigest,
          resourceSetCommitmentDigest: _setDigest,
          terminalFenceDeriveReceipt: _receipt,
          ...input
        }) => input)(claimRequest),
        resourceSetCommitmentDigest: foreignSetDigest,
        terminalFenceDeriveReceipt: foreignDeriveReceipt,
      });
    expect(
      matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext(
        foreignClaimRequest,
        registrationResult,
        fixture.resourceSetCommitment,
        fence,
        deriveReceipt
      )
    ).toBe(false);
    const { requestDigest: _requestDigest, ...deriveRequestBase } =
      deriveRequest;
    const extraDeriveRequestBase = Object.freeze({
      ...deriveRequestBase,
      extra: 'recomputed',
    });
    expect(
      isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest({
        ...extraDeriveRequestBase,
        requestDigest: digestAgentCanonicalValue(extraDeriveRequestBase),
      })
    ).toBe(false);
  });

  it('keeps every admitted cleanup lifecycle archivable within the exact family budget', () => {
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES
    ).toBe(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES +
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES +
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES +
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 6 +
        8_192
    );
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES
    ).toBe(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES /
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    );
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES +
        1
    ).toBeGreaterThan(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES /
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    );
    const maximumIdentity = (prefix: string): string =>
      `${prefix}.${'x'.repeat(256 - prefix.length - 1)}`;
    const maximumFixtureInput = Object.freeze({
      namespaceId: maximumIdentity('namespace'),
      repositoryCommit: COMMIT,
      planDigest: digest('maximum-plan'),
      frozenRunDigest: digest('maximum-frozen-run'),
      runConfigArtifactBindingDigest: digest('maximum-run-config-binding'),
      runtimeResourceSetId: maximumIdentity('runtime-resource-set'),
      registeredAt: REGISTERED_AT,
      expiresAt: RESOURCE_EXPIRES_AT,
      maximumIdentityLength: true,
      auxiliaryResourceCount: 20,
    });
    const fixture =
      createAgentHostedRetrievalRuntimeResourceExact4Fixture(
        maximumFixtureInput
      );
    const fence = createFence({
      namespaceId: maximumFixtureInput.namespaceId,
      repositoryCommit: maximumFixtureInput.repositoryCommit,
      planDigest: maximumFixtureInput.planDigest,
      frozenRunDigest: maximumFixtureInput.frozenRunDigest,
      runConfigArtifactBindingDigest:
        maximumFixtureInput.runConfigArtifactBindingDigest,
      runtimeResourceSetId: maximumFixtureInput.runtimeResourceSetId,
      maximumIdentityLength: true,
    }).fence;
    const lifecycles = fixture.registrationResults.map((registrationResult) =>
      createLifecycle(
        registrationResult,
        fixture.resourceSetCommitment,
        fence,
        { maximumIdentityLength: true }
      )
    );
    const records = lifecycles.map(
      ({ cleanupArchiveRecord }) => cleanupArchiveRecord
    );
    const encodedBytes = (value: unknown): number =>
      new TextEncoder().encode(canonicalJsonText(value)).byteLength;
    const maximumConstructedRecordBytes = Math.max(
      ...records.map(encodedBytes)
    );
    expect(
      fixture.registrationResults.every(
        (registrationResult) =>
          encodedBytes(registrationResult) <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES
      )
    ).toBe(true);
    expect(
      lifecycles.every(
        ({ cleanupRequest }) =>
          encodedBytes(cleanupRequest) <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES
      )
    ).toBe(true);
    expect(
      lifecycles.every(
        ({ cleanupReceipt }) =>
          encodedBytes(cleanupReceipt) <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES
      )
    ).toBe(true);
    expect(
      [
        fixture.resourceSetCommitment,
        fence,
        ...lifecycles.flatMap(
          ({
            activeState,
            cleanupClaimAuthorityReceipt,
            readLeaseLedgerRoot,
          }) => [activeState, cleanupClaimAuthorityReceipt, readLeaseLedgerRoot]
        ),
      ].every(
        (component) =>
          encodedBytes(component) <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
      )
    ).toBe(true);
    expect(maximumConstructedRecordBytes).toBeLessThanOrEqual(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES
    );
    expect(encodedBytes(records)).toBeLessThanOrEqual(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES
    );
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceExact4Fixture({
        ...maximumFixtureInput,
        auxiliaryResourceCount: 21,
      })
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
        records.slice(0, 3)
      )
    ).toThrow();
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
        Object.freeze([...records, records[0]!])
      )
    ).toThrow();
  });
});
