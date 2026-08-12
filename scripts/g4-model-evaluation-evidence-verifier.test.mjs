import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createV8EvaluationPlan,
  createV8QualificationAuthorityArchiveFixture,
} from '../packages/ai/src/__tests__/agentV8Fixtures.ts';
import { createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture } from '../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures.ts';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
  createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture,
  joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup,
} from '../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceLifecycleJournalFixtures.ts';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES,
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS,
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET,
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET,
  AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
  createAgentModelEvaluationEvidenceArchiveAttestation,
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilySummary,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveShardDescriptor,
  createAgentModelEvaluationEvidenceIndex,
  createAgentModelEvaluationEvidenceRoot,
  digestAgentModelEvaluationEvidenceArchiveRecordSet,
  encodeAgentModelEvaluationEvidenceIndex,
  encodeAgentModelEvaluationEvidenceRoot,
  isAgentModelEvaluationEvidenceArchivePhysicalCapacity,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceArchive.ts';
import { createAgentEvaluationProductionRunConfigArtifactBinding } from '../packages/ai/src/evaluation/agentEvaluationFrozenConfigCommitment.ts';
import { createAgentEvaluationEndpointSmokeReceipt } from '../packages/ai/src/evaluation/agentEvaluationEndpointSmoke.ts';
import { matchAgentEvaluationCapabilitySpecificProviderObservation } from '../packages/ai/src/evaluation/agentEvaluationProviderCapabilityObservation.ts';
import { createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence } from '../packages/ai/src/evaluation/agentEvaluationEvidenceBundle.ts';
import { AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT } from '../packages/ai/src/evaluation/agentEvaluationReleasePlan.ts';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
} from '../packages/ai/src/domain/agentCanonical.ts';
import {
  assertG4ModelEvaluationEndpointSmokeDenominator,
  assertG4ModelEvaluationCapabilityProbeProviderResourceCleanupBinding,
  assertG4ModelEvaluationEvidenceFamilyBudget,
  assertG4ModelEvaluationEvidencePhysicalArchiveBudget,
  assertG4ModelEvaluationEvidenceRoot,
  assertG4ModelEvaluationEvidenceReviewLeaseBinding,
  assertG4ModelEvaluationFrozenRunConfigBinding,
  assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins,
  assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding,
  assertG4ModelEvaluationOptionalCapabilityArchiveJoins,
  assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings,
  decodeG4ModelEvaluationArtifactFrozenRunConfig,
  loadAndVerifyG4ModelEvaluationEvidence,
  verifyG4ModelEvaluationEvidenceArchive,
} from './g4-model-evaluation-evidence-verifier.mjs';
import { createAgentBudgetLedger } from '../packages/ai/src/usage/agentBudgetLedger.ts';
import { createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily } from '../packages/ai/src/providers/agentHostedRetrievalRuntimeResource.ts';
import {
  createG4ModelEvaluationNativeBootstrapAuthorityFixture,
  createG4ModelEvaluationSemanticArchiveFixture,
  recommitG4NativeBootstrapSourceRawMutation,
  recommitG4NativeBootstrapStateVaultRawSwap,
  semanticArchiveVerifyOptions,
  writeG4ModelEvaluationSemanticArchiveFixture,
} from './g4-model-evaluation-evidence-verifier.fixture.mjs';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeReferenceBundle,
} from '../apps/agent-evaluation-runner/src/capabilityProbeAdmissionClient.ts';
import { decodeAgentEvaluationCapabilityProbeAdmissionResponse } from '../apps/agent-evaluation-runner/src/capabilityProbeAdmissionHttpClient.ts';
import {
  decodeAgentEvaluationRuntimeFactSourceOwnerHealth,
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest,
} from '../apps/agent-evaluation-runner/src/runtimeFactSourceRegistration.ts';
import { decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt } from '../apps/agent-evaluation-runner/src/runtimeFactSourceRegistrationClient.ts';

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'prodivix-g4-evidence-archive-verifier-')
);
const NOW = '2026-08-08T08:00:00.000Z';
const SOURCE_CONFIG_DIGEST = digestAgentCanonicalValue({
  source: 'frozen-run-config',
});
const FROZEN_RUN_DIGEST = digestAgentCanonicalValue({
  frozen: 'production-run',
});
const SIGNATURE = Buffer.alloc(64, 7).toString('base64url');
const PUBLIC_KEY = Buffer.alloc(32, 9).toString('base64url');
const singletonFamilySet = new Set(
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES
);
let fixtureSequence = 0;

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

const digest = (label) => digestAgentCanonicalValue({ label });

const createFixtureRunConfigArtifactBinding = (
  plan,
  {
    sourceConfigDigest = SOURCE_CONFIG_DIGEST,
    frozenRunDigest = FROZEN_RUN_DIGEST,
    planDigest = plan.planDigest,
    repositoryCommit = plan.repositoryCommit,
    ...overrides
  } = {}
) =>
  createAgentEvaluationProductionRunConfigArtifactBinding({
    sourcePlanArtifactName: 'g4-real-model-plan-test',
    sourcePlanArtifactDigest: `sha256:${'b'.repeat(64)}`,
    sourcePlanWorkflowRunId: '1234',
    sourcePlanWorkflowRunAttempt: 1,
    runConfigFileName: 'production-run-config.json',
    runConfigByteLength: 2,
    runConfigCanonicalBytesDigest: sourceConfigDigest,
    sourceConfigDigest,
    frozenRunDigest,
    planDigest,
    repositoryCommit,
    ...overrides,
  });

const createFocusedHostedLifecycleVerifierState = ({
  runtimeResourceSetId = 'runtime-resource-set.external-verifier',
} = {}) => {
  const plan = createV8EvaluationPlan();
  const runConfigArtifactBinding = createFixtureRunConfigArtifactBinding(plan);
  const scope = Object.freeze({
    namespaceId: 'g4-model-evaluation',
    repositoryCommit: plan.repositoryCommit,
    planDigest: plan.planDigest,
    frozenRunDigest: FROZEN_RUN_DIGEST,
    runConfigArtifactBindingDigest: runConfigArtifactBinding.bindingDigest,
    runtimeResourceSetId,
  });
  const journal =
    createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
      plan,
      createAgentBudgetLedger(plan.budget.budget),
      Object.freeze({
        ...AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
        settledAt: '2026-08-02T03:00:00.004Z',
      }),
      scope
    );
  const provisionalLifecycle =
    createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
      ...scope,
      registeredAt:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.startedAt,
      expiresAt:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.expiresAt,
      registrationIntents: journal.registrationIntents,
      lifecycleBudgetDemands: journal.lifecycleBudgetDemands,
      lifecycleBudgetReservationAuthorities:
        journal.budgetReservationAuthorities,
      lifecycleBudgetDigest: plan.budget.budgetDigest,
      lifecycleBudgetReservePolicyDigest: plan.budget.reservePolicyDigest,
      lifecycleAuthorityCommitments: journal.lifecycleAuthorityCommitments,
      expectedShardIds: Object.freeze(['shard.external-hosted-lifecycle']),
      terminalShardLedgerEntries: Object.freeze([
        Object.freeze({
          shardId: 'shard.external-hosted-lifecycle',
          shardLeaseGeneration: 1,
          checkpointDigest: digest('external-hosted-lifecycle-checkpoint'),
          checkpointUpdatedAt: '2026-08-02T03:00:00.000Z',
          terminalAttempts: Object.freeze([
            Object.freeze({
              attemptId: 'attempt.external-hosted-lifecycle',
              attemptDigest: digest('external-hosted-lifecycle-attempt'),
              status: 'completed',
              completedAt: '2026-08-02T02:59:59.999Z',
            }),
          ]),
        }),
      ]),
      terminalFenceSealedAt: '2026-08-02T03:00:00.001Z',
      timing: Object.freeze({
        readCheckedAt: '2026-08-02T01:00:00.010Z',
        readExpiresAt: '2026-08-02T01:03:00.010Z',
        cleanupClaimedAt: '2026-08-02T03:00:00.002Z',
        cleanupClaimExpiresAt: '2026-08-02T03:01:00.002Z',
        cleanupDispatchedAt: '2026-08-02T03:00:00.003Z',
        cleanupCompletedAt: '2026-08-02T03:00:00.004Z',
      }),
    });
  const exactLifecycle =
    joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup(
      journal,
      provisionalLifecycle
    );
  const budgetEvidence =
    createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence(
      plan,
      exactLifecycle.journal.archiveFamily
    );
  const authorityAttestation = Object.freeze({
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      budgetEvidence.journalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      budgetEvidence.bindingSetDigest,
  });
  const state = Object.freeze({
    index: Object.freeze({
      repositoryCommit: scope.repositoryCommit,
      planDigest: scope.planDigest,
      frozenRunDigest: scope.frozenRunDigest,
      runConfigArtifactBinding,
      authorityRoots: Object.freeze({
        hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
          budgetEvidence.journalSetDigest,
      }),
    }),
    singletons: Object.freeze({
      plan,
      budgetLedger: exactLifecycle.journal.budgetLedger,
      authorityAttestation,
    }),
    hostedRetrievalRuntimeResourceLifecycleJournals: new Map(
      exactLifecycle.journal.archiveFamily.records.map((record) => [
        record.archiveRecordDigest,
        record,
      ])
    ),
    hostedRetrievalRuntimeResourceCleanups: new Map(
      exactLifecycle.lifecycle.cleanupArchiveRecords.map((record) => [
        record.authorityDigest,
        record,
      ])
    ),
  });
  return Object.freeze({
    plan,
    exactLifecycle,
    budgetEvidence,
    state,
  });
};

const singletonValues = (plan) =>
  new Map([
    ['plan', plan],
    ['budgetLedger', Object.freeze({ ledgerDigest: digest('ledger') })],
    ['metricReport', Object.freeze({ reportDigest: digest('metric') })],
    ['graderReport', Object.freeze({ reportDigest: digest('grader') })],
    [
      'humanReviewReport',
      Object.freeze({ reportDigest: digest('human-review') }),
    ],
    [
      'holdoutExecutionReceipt',
      Object.freeze({ receiptDigest: digest('holdout') }),
    ],
    [
      'authorityAttestation',
      Object.freeze({ attestationDigest: digest('authority-attestation') }),
    ],
    ['manifest', Object.freeze({ manifestDigest: digest('manifest') })],
  ]);

const createAuthorityRoots = (summaryByFamily, reviewLeaseDigest) =>
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots({
    capabilityProbeAdmissionSetDigest: summaryByFamily.get(
      'capabilityProbeAdmissions'
    ).semanticDigest,
    capabilityProbeReferenceReceiptSetDigest: summaryByFamily.get(
      'capabilityProbeReferenceReceipts'
    ).semanticDigest,
    capabilityProbeProviderResourceCleanupSetDigest: summaryByFamily.get(
      'capabilityProbeProviderResourceCleanups'
    ).semanticDigest,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      summaryByFamily.get('hostedRetrievalRuntimeResourceLifecycleJournals')
        .semanticDigest,
    hostedRetrievalRuntimeResourceCleanupSetDigest: summaryByFamily.get(
      'hostedRetrievalRuntimeResourceCleanups'
    ).semanticDigest,
    capabilityEffectProviderRuntimeJournalSetDigest: summaryByFamily.get(
      'capabilityEffectProviderRuntimeJournals'
    ).semanticDigest,
    runtimeFactSourceOwnerRegistrationSetDigest: summaryByFamily.get(
      'runtimeFactSourceOwnerRegistrations'
    ).semanticDigest,
    optionalCapabilityFactSourceSetDigest: summaryByFamily.get(
      'optionalCapabilityFactSources'
    ).semanticDigest,
    optionalCapabilityFactAuthoritySetDigest: summaryByFamily.get(
      'optionalCapabilityFactAuthorities'
    ).semanticDigest,
    endpointSmokeSetDigest: summaryByFamily.get('endpointSmokeReceipts')
      .semanticDigest,
    endpointSmokeDispatchIntentSetDigest: summaryByFamily.get(
      'endpointSmokeDispatchIntents'
    ).semanticDigest,
    endpointSmokeTransportReceiptSetDigest: summaryByFamily.get(
      'endpointSmokeTransportReceipts'
    ).semanticDigest,
    endpointSmokeResultSpoolReceiptSetDigest: summaryByFamily.get(
      'endpointSmokeResultSpoolReceipts'
    ).semanticDigest,
    endpointSmokeResultSpoolDispositionReceiptSetDigest: summaryByFamily.get(
      'endpointSmokeResultSpoolDispositionReceipts'
    ).semanticDigest,
    endpointSmokeValidationFailureReceiptSetDigest: summaryByFamily.get(
      'endpointSmokeValidationFailureReceipts'
    ).semanticDigest,
    preDispatchFailureReceiptSetDigest: summaryByFamily.get(
      'preDispatchFailureReceipts'
    ).semanticDigest,
    transportDispatchIntentSetDigest: summaryByFamily.get(
      'transportDispatchIntents'
    ).semanticDigest,
    transportReceiptSetDigest:
      summaryByFamily.get('transportReceipts').semanticDigest,
    providerResultSpoolReceiptSetDigest: summaryByFamily.get(
      'providerResultSpoolReceipts'
    ).semanticDigest,
    providerResultSpoolDispositionReceiptSetDigest: summaryByFamily.get(
      'providerResultSpoolDispositionReceipts'
    ).semanticDigest,
    invocationTurnReceiptSetDigest: summaryByFamily.get(
      'invocationTurnReceipts'
    ).semanticDigest,
    invocationTurnSetReceiptSetDigest: summaryByFamily.get(
      'invocationTurnSetReceipts'
    ).semanticDigest,
    resultSubmissionReceiptSetDigest: summaryByFamily.get(
      'resultSubmissionReceipts'
    ).semanticDigest,
    attemptAuthorityOwnerReceiptSetDigest: summaryByFamily.get(
      'attemptAuthorityOwnerReceipts'
    ).semanticDigest,
    verificationAttemptGrantReceiptSetDigest: summaryByFamily.get(
      'verificationAttemptGrantReceipts'
    ).semanticDigest,
    controlledRuntimeReceiptSetDigest: summaryByFamily.get(
      'controlledRuntimeReceipts'
    ).semanticDigest,
    capabilityExecutionReceiptSetDigest: summaryByFamily.get(
      'capabilityExecutionReceipts'
    ).semanticDigest,
    capabilitySpecificReceiptSetDigest: summaryByFamily.get(
      'capabilitySpecificReceipts'
    ).semanticDigest,
    providerCapabilityObservationReceiptSetDigest: summaryByFamily.get(
      'providerCapabilityObservationReceipts'
    ).semanticDigest,
    validatedHumanReviewArtifactSetDigest: summaryByFamily.get(
      'validatedHumanReviewArtifacts'
    ).semanticDigest,
    validatedHumanMetricObservationSetDigest: summaryByFamily.get(
      'validatedHumanMetricObservations'
    ).semanticDigest,
    ...(reviewLeaseDigest === undefined ? {} : { reviewLeaseDigest }),
    reviewRasterScanReceiptSetDigest: summaryByFamily.get(
      'reviewRasterScanReceipts'
    ).semanticDigest,
    reviewCandidateRefSetDigest: summaryByFamily.get('reviewCandidateRefs')
      .semanticDigest,
    blindReviewMappingSetDigest: summaryByFamily.get('blindReviewMappingRefs')
      .semanticDigest,
    sourceReceiptSetDigest:
      summaryByFamily.get('sourceReceipts').semanticDigest,
    executionReceiptSetDigest:
      summaryByFamily.get('executionReceipts').semanticDigest,
    holdoutExecutionReceiptDigest: summaryByFamily.get(
      'holdoutExecutionReceipt'
    ).semanticDigest,
    secretCanarySetDigest: digest('secret-canary-set'),
    protectedHoldoutCanarySetDigest: digest('protected-canary-set'),
  });

const createArchiveFixture = ({
  recordsByFamily = new Map(),
  rawLineTransformByFamily = new Map(),
  exportLeaseId = 'evaluation-export-lease:test',
  reviewLeaseDigest,
  sourceConfigDigest = SOURCE_CONFIG_DIGEST,
  frozenRunDigest = FROZEN_RUN_DIGEST,
  indexPlanDigest,
  indexRepositoryCommit,
  runConfigArtifactBindingOverrides = {},
} = {}) => {
  const plan = createV8EvaluationPlan();
  const planDigest = indexPlanDigest ?? plan.planDigest;
  const repositoryCommit = indexRepositoryCommit ?? plan.repositoryCommit;
  const runConfigArtifactBinding = createFixtureRunConfigArtifactBinding(plan, {
    sourceConfigDigest,
    frozenRunDigest,
    planDigest,
    repositoryCommit,
    ...runConfigArtifactBindingOverrides,
  });
  const singletons = singletonValues(plan);
  const families = [];
  const shards = [];
  const shardBytes = new Map();
  let sequence = 0;

  for (const family of AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES) {
    let records = recordsByFamily.get(family);
    if (!records) {
      if (
        family === 'validatedHumanReviewArtifacts' &&
        reviewLeaseDigest !== undefined
      ) {
        records = [
          createAgentModelEvaluationEvidenceArchiveRecord({
            family,
            recordIndex: 0,
            value: Object.freeze({
              artifactId: 'validated-human-review-artifact.test',
              reviewLeaseDigest,
              artifactDigest: digest('validated-human-review-artifact'),
            }),
          }),
        ];
      } else if (
        family === 'validatedHumanMetricObservations' &&
        reviewLeaseDigest !== undefined
      ) {
        records = [
          createAgentModelEvaluationEvidenceArchiveRecord({
            family,
            recordIndex: 0,
            value: Object.freeze({
              observationId: 'validated-human-metric-observation.test',
              observationDigest: digest('validated-human-metric-observation'),
            }),
          }),
        ];
      } else {
        records = singletonFamilySet.has(family)
          ? [
              createAgentModelEvaluationEvidenceArchiveRecord({
                family,
                recordIndex: 0,
                value: singletons.get(family),
              }),
            ]
          : [];
      }
    }
    const semantic =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(family);
    records.forEach(({ value }) => semantic.append(value));
    const recordSetDigest = digestAgentModelEvaluationEvidenceArchiveRecordSet(
      records.map(({ recordDigest }) => recordDigest)
    );

    if (records.length === 0) {
      families.push(
        createAgentModelEvaluationEvidenceArchiveFamilySummary({
          family,
          recordCount: 0,
          semanticDigest: semantic.finalize(),
          recordSetDigest,
          shardCount: 0,
          firstOrderKey: null,
          lastOrderKey: null,
        })
      );
      continue;
    }

    const transform = rawLineTransformByFamily.get(family) ?? ((line) => line);
    const bytes = Buffer.from(
      records
        .map((record) => transform(`${canonicalJsonText(record)}\n`))
        .join(''),
      'utf8'
    );
    const descriptor = createAgentModelEvaluationEvidenceArchiveShardDescriptor(
      {
        sequence,
        family,
        familyShardIndex: 0,
        firstRecordIndex: 0,
        lastRecordIndex: records.length - 1,
        firstOrderKey: records[0].orderKey,
        lastOrderKey: records.at(-1).orderKey,
        recordCount: records.length,
        byteSize: bytes.byteLength,
        bytesDigest: digestAgentCanonicalBytes(bytes),
        recordSetDigest,
      }
    );
    shards.push(descriptor);
    shardBytes.set(descriptor.fileName, bytes);
    families.push(
      createAgentModelEvaluationEvidenceArchiveFamilySummary({
        family,
        recordCount: records.length,
        semanticDigest: semantic.finalize(),
        recordSetDigest,
        shardCount: 1,
        firstOrderKey: records[0].orderKey,
        lastOrderKey: records.at(-1).orderKey,
      })
    );
    sequence += 1;
  }

  const summaryByFamily = new Map(
    families.map((summary) => [summary.family, summary])
  );
  const authorityRoots = createAuthorityRoots(
    summaryByFamily,
    reviewLeaseDigest
  );
  const index = createAgentModelEvaluationEvidenceIndex({
    exportLeaseId,
    exportLeaseDigest: digest(`lease:${exportLeaseId}`),
    runConfigArtifactBinding,
    sourceConfigDigest,
    frozenRunDigest,
    planDigest,
    repositoryCommit,
    evidenceSetDigest: digest('evidence-set'),
    authorityPayloadDigest: digest('authority-payload'),
    authorityAttestationDigest: singletons.get('authorityAttestation')
      .attestationDigest,
    authorityRoots,
    ...(reviewLeaseDigest === undefined ? {} : { reviewLeaseDigest }),
    evaluationManifestDigest: singletons.get('manifest').manifestDigest,
    families,
    shards,
    createdAt: NOW,
  });
  const indexText = encodeAgentModelEvaluationEvidenceIndex(index);
  const indexBytes = Buffer.from(indexText, 'utf8');
  const archiveAttestation =
    createAgentModelEvaluationEvidenceArchiveAttestation({
      authorityId: 'evaluation-authority:test',
      keyId: 'evaluation-key:test',
      exportLeaseId: index.exportLeaseId,
      exportLeaseDigest: index.exportLeaseDigest,
      runConfigArtifactBinding: index.runConfigArtifactBinding,
      sourceConfigDigest: index.sourceConfigDigest,
      frozenRunDigest: index.frozenRunDigest,
      planDigest: index.planDigest,
      repositoryCommit: index.repositoryCommit,
      evidenceSetDigest: index.evidenceSetDigest,
      bundleDigest: index.bundleDigest,
      authorityPayloadDigest: index.authorityPayloadDigest,
      authorityAttestationDigest: index.authorityAttestationDigest,
      authorityRoots: index.authorityRoots,
      ...(index.reviewLeaseDigest === undefined
        ? {}
        : { reviewLeaseDigest: index.reviewLeaseDigest }),
      evaluationManifestDigest: index.evaluationManifestDigest,
      indexDigest: index.indexDigest,
      evidenceIndexArtifactDigest: digestAgentCanonicalBytes(indexBytes),
      evidenceIndexArtifactSize: indexBytes.byteLength,
      shardSetDigest: index.shardSetDigest,
      totalShardBytes: index.totalShardBytes,
      totalRecordCount: index.totalRecordCount,
      issuedAt: NOW,
      signature: SIGNATURE,
    });
  const root = createAgentModelEvaluationEvidenceRoot({
    index,
    evidenceIndexArtifactBytes: indexBytes,
    archiveAttestation,
  });
  return Object.freeze({
    plan,
    index,
    indexBytes,
    root,
    rootBytes: Buffer.from(
      encodeAgentModelEvaluationEvidenceRoot(root),
      'utf8'
    ),
    shards,
    shardBytes,
  });
};

const writeArchiveFixture = async (fixture) => {
  fixtureSequence += 1;
  const fixturePath = join(
    temporaryDirectory,
    `fixture-${fixtureSequence.toString().padStart(3, '0')}`
  );
  const archivePath = join(fixturePath, 'archive');
  const shardPath = join(
    archivePath,
    AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME
  );
  const evidenceRootPath = join(fixturePath, 'evidence-root.json');
  await mkdir(shardPath, { recursive: true });
  await writeFile(
    join(archivePath, AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME),
    fixture.indexBytes
  );
  await writeFile(evidenceRootPath, fixture.rootBytes);
  await Promise.all(
    fixture.shards.map((descriptor) =>
      writeFile(
        join(shardPath, descriptor.fileName),
        fixture.shardBytes.get(descriptor.fileName)
      )
    )
  );
  return Object.freeze({
    fixturePath,
    archivePath,
    shardPath,
    evidenceRootPath,
  });
};

const frozenConfigurationFor = (fixture) => {
  const endpointPolicyDigest =
    fixture.plan.endpointSmokeTargets[0].responseSpoolEncryptionPolicyDigest;
  return Object.freeze({
    purpose: 'production',
    sourceConfigDigest: fixture.index.sourceConfigDigest,
    frozenRunDigest: fixture.index.frozenRunDigest,
    plan: fixture.plan,
    pricingAuthorities: Object.freeze(
      Object.fromEntries(
        fixture.plan.endpointSmokeTargets.map((target, index) => [
          `pricing${index}`,
          Object.freeze({
            providerConfigurationId: target.providerConfigurationId,
            authorityDigest: target.pricingAuthorityDigest,
            source: Object.freeze({
              sourceUri: `https://pricing.example.test/${index}`,
              observedAt: NOW,
            }),
            snapshot: Object.freeze({
              pricingSnapshotId: `pricing.snapshot.${index}`,
              providerConfigurationId: target.providerConfigurationId,
              snapshotDigest: digest(`pricing-snapshot:${index}`),
            }),
          }),
        ])
      )
    ),
    responseSpoolEncryption: Object.freeze({
      encryptionProfileDigest: digest('attempt-spool-profile'),
      keyRefDigest: digest('attempt-spool-key-ref'),
      keyId: 'key.attempt-spool.test',
      keyVersion: 1,
      retention: Object.freeze({
        retentionPolicyDigest: digest('attempt-spool-retention'),
      }),
    }),
    endpointSmokeResponseSpoolEncryption: Object.freeze({
      encryptionPolicyDigest: endpointPolicyDigest,
      encryptionProfileDigest: digest('smoke-spool-profile'),
      keyRefDigest: digest('smoke-spool-key-ref'),
      keyId: 'key.smoke-spool.test',
      keyVersion: 1,
      retention: Object.freeze({
        retentionPolicyDigest: digest('smoke-spool-retention'),
      }),
    }),
  });
};

const verifyOptions = (
  fixture,
  paths,
  {
    configuration = frozenConfigurationFor(fixture),
    runConfigArtifactBinding = fixture.index.runConfigArtifactBinding,
  } = {}
) => ({
  archivePath: paths.archivePath,
  evidenceRootPath: paths.evidenceRootPath,
  repositoryCommit: fixture.plan.repositoryCommit,
  now: NOW,
  secretCanaries: ['secret-canary-verifier-test'],
  protectedHoldoutCanaries: ['protected-canary-verifier-test'],
  trustedPublicKeys: [
    Object.freeze({
      keyId: 'evaluation-key:test',
      publicKeyBase64Url: PUBLIC_KEY,
    }),
  ],
  expectedAttestationIdentity: Object.freeze({
    authorityId: 'evaluation-authority:test',
    keyId: 'evaluation-key:test',
    workflowName: 'g4-real-model-evaluation',
    workflowRunId: '1234',
    workflowRunAttempt: 1,
    jobId: 'finalize',
    environmentDigest: digest('environment'),
  }),
  humanReviewVerifier: Object.freeze({ verify: async () => true }),
  resolveFrozenRunConfig: async ({ index, plan }) => {
    assert.equal(index.indexDigest, fixture.index.indexDigest);
    assert.equal(plan.planDigest, fixture.plan.planDigest);
    return Object.freeze({ configuration, runConfigArtifactBinding });
  },
});

const smokeRecord = (plan, recordIndex, smokeTargetId) =>
  createAgentModelEvaluationEvidenceArchiveRecord({
    family: 'endpointSmokeReceipts',
    recordIndex,
    value: createAgentEvaluationEndpointSmokeReceipt({
      receiptId: `receipt.${recordIndex}.${smokeTargetId}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      smokeTargetId,
      smokeTargetDigest: digest(`target:${smokeTargetId}`),
      endpointClass: 'local',
      protocolFamily: 'openai-compatible',
      providerConfigurationId: 'provider.compatible.local',
      modelId: 'model.compatible.local.2026-08-08',
      immutableModelVersion: 'model.compatible.local.2026-08-08',
      modelLineageDigest: digest(`lineage:${smokeTargetId}`),
      inferenceConfigurationDigest: digest(`inference:${smokeTargetId}`),
      adapterDigest: digest(`adapter:${smokeTargetId}`),
      pricingAuthorityDigest: digest(`pricing:${smokeTargetId}`),
      responseSpoolEncryptionPolicyDigest: digest(
        `spool-encryption:${smokeTargetId}`
      ),
      smokeProfileDigest: digest(`profile:${smokeTargetId}`),
      invocationId: `invocation.${recordIndex}.${smokeTargetId}`,
      budgetReservationId: `reservation.${recordIndex}.${smokeTargetId}`,
      demandDigest: digest(`demand:${recordIndex}:${smokeTargetId}`),
      settlementDigest: digest(`settlement:${recordIndex}:${smokeTargetId}`),
      dispatchIntentDigest: digest(`intent:${recordIndex}:${smokeTargetId}`),
      transportReceiptDigest: digest(
        `transport:${recordIndex}:${smokeTargetId}`
      ),
      requestDigest: digest(`request:${recordIndex}:${smokeTargetId}`),
      outcome: 'failed',
      failureCategory: 'transport-not-dispatched',
      startedAt: NOW,
      completedAt: NOW,
    }),
  });

describe('G4 sharded model-evaluation evidence verifier', () => {
  test('admits the exact post-commit provider-observation family budget and rejects count+1 or bytes+1', () => {
    const budget =
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET;
    assert.equal(budget.maximumRecordCount, 98_280);
    assert.equal(budget.maximumCanonicalFamilyBytes, 1_610_219_520);
    assert.doesNotThrow(() =>
      assertG4ModelEvaluationEvidenceFamilyBudget({
        family: 'providerCapabilityObservationReceipts',
        recordCount: budget.maximumRecordCount,
        canonicalValueBytes: budget.maximumCanonicalFamilyBytes,
      })
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceFamilyBudget({
          family: 'providerCapabilityObservationReceipts',
          recordCount: budget.maximumRecordCount + 1,
          canonicalValueBytes: budget.maximumCanonicalFamilyBytes,
        }),
      /providerCapabilityObservationReceipts exceeds its frozen denominator budget/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceFamilyBudget({
          family: 'providerCapabilityObservationReceipts',
          recordCount: budget.maximumRecordCount,
          canonicalValueBytes: budget.maximumCanonicalFamilyBytes + 1,
        }),
      /providerCapabilityObservationReceipts exceeds its frozen denominator budget/u
    );
  });

  test('admits each frozen qualification-authority family budget and rejects count+1 or bytes+1', () => {
    assert.equal(
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordBytes,
      167_936
    );
    assert.equal(
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes,
      987_463_680
    );
    const families = [
      {
        family: 'capabilityProbeAdmissions',
        count:
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount,
        bytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'capabilityProbeReferenceReceipts',
        count:
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount,
        bytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'capabilityProbeProviderResourceCleanups',
        count:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
        bytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'runtimeFactSourceOwnerRegistrations',
        count:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount,
        bytes:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'capabilityEffectProviderRuntimeJournals',
        count:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordCount,
        bytes:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'hostedRetrievalRuntimeResourceLifecycleJournals',
        count:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumRecordCount,
        bytes:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'hostedRetrievalRuntimeResourceCleanups',
        count:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
        bytes:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'optionalCapabilityFactSources',
        count:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount,
        bytes:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
      {
        family: 'optionalCapabilityFactAuthorities',
        count:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount,
        bytes:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumFamilyBytes,
      },
    ];
    const productionAuthorityCanonicalValueCapSum =
      families.reduce((total, { bytes }) => total + bytes, 0) +
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes +
      AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes +
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes;
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumRecordBytes,
      196_608
    );
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
      4
    );
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      786_432
    );
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordBytes,
      196_608
    );
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordCount,
      5_880
    );
    assert.equal(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumFamilyBytes,
      1_156_055_040
    );
    assert.equal(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
      4
    );
    assert.equal(
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      786_432
    );
    assert.equal(
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes,
      3_308_032_000
    );
    assert.equal(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET.maximumCanonicalBytes,
      8_138_690_560
    );
    assert.equal(
      productionAuthorityCanonicalValueCapSum,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET.maximumCanonicalBytes
    );
    for (const { family, count, bytes } of families) {
      assert.doesNotThrow(() =>
        assertG4ModelEvaluationEvidenceFamilyBudget({
          family,
          recordCount: count,
          canonicalValueBytes: bytes,
        })
      );
      assert.throws(
        () =>
          assertG4ModelEvaluationEvidenceFamilyBudget({
            family,
            recordCount: count + 1,
            canonicalValueBytes: bytes,
          }),
        new RegExp(`${family} exceeds its frozen denominator budget`, 'u')
      );
      assert.throws(
        () =>
          assertG4ModelEvaluationEvidenceFamilyBudget({
            family,
            recordCount: count,
            canonicalValueBytes: bytes + 1,
          }),
        new RegExp(`${family} exceeds its frozen denominator budget`, 'u')
      );
    }
  });

  test('admits the exact physical archive ceiling and rejects aggregate bytes+1', () => {
    const indexBytes = 1;
    const rootBytes = 1;
    const maximumShardBytes =
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes -
      indexBytes -
      rootBytes;
    assert.equal(
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount: 1,
        totalShardBytes: maximumShardBytes,
        indexBytes,
        rootBytes,
      }),
      true
    );
    assert.equal(
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount: 1,
        totalShardBytes: maximumShardBytes + 1,
        indexBytes,
        rootBytes,
      }),
      false
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidencePhysicalArchiveBudget({
          familyUsages: [],
          indexBytes,
          rootBytes,
        }),
      /physical archive exceeds its exact 8 GiB NDJSON, index, and root budget/u
    );
  });

  test('joins the v46 exact-four hosted lifecycle family and rejects missing, duplicate, foreign, budget, and signed-root drift', () => {
    const baseline = createFocusedHostedLifecycleVerifierState();
    const admitted =
      assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
        baseline.state
      );
    assert.equal(admitted.lifecycleReservationCount, 4);
    assert.deepEqual(admitted.budgetFloor, {
      hostedSearchQueryCount: 210,
      hostedToolCallCount: 222,
      hostedAttemptToolCallCount: 210,
      hostedLifecycleToolCallCount: 12,
      providerUploadBytes: 310,
      providerStorageByteSeconds: 214_272_000,
    });

    const journalRecords =
      baseline.exactLifecycle.journal.archiveFamily.records;
    assert.throws(
      () =>
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          [...journalRecords, journalRecords[0]]
        ),
      /journal archive (?:family|order) is invalid/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
          Object.freeze({
            ...baseline.state,
            hostedRetrievalRuntimeResourceLifecycleJournals: new Map(
              journalRecords
                .slice(1)
                .map((record) => [record.archiveRecordDigest, record])
            ),
          })
        ),
      /lifecycle journal (?:family is not canonical|is incomplete)/u
    );

    const foreign = createFocusedHostedLifecycleVerifierState({
      runtimeResourceSetId:
        'runtime-resource-set.external-verifier-foreign-cleanup',
    });
    assert.throws(
      () =>
        assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
          Object.freeze({
            ...baseline.state,
            hostedRetrievalRuntimeResourceCleanups:
              foreign.state.hostedRetrievalRuntimeResourceCleanups,
          })
        ),
      /does not close the exact registrations/u
    );

    assert.throws(
      () =>
        assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
          Object.freeze({
            ...baseline.state,
            singletons: Object.freeze({
              ...baseline.state.singletons,
              budgetLedger: Object.freeze({
                ...baseline.state.singletons.budgetLedger,
                reservations:
                  baseline.state.singletons.budgetLedger.reservations.slice(1),
              }),
            }),
          })
        ),
      /budget closure drifted/u
    );
    for (const state of [
      Object.freeze({
        ...baseline.state,
        index: Object.freeze({
          ...baseline.state.index,
          authorityRoots: Object.freeze({
            ...baseline.state.index.authorityRoots,
            hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: digest(
              'foreign-hosted-lifecycle-journal-root'
            ),
          }),
        }),
      }),
      Object.freeze({
        ...baseline.state,
        singletons: Object.freeze({
          ...baseline.state.singletons,
          authorityAttestation: Object.freeze({
            ...baseline.state.singletons.authorityAttestation,
            hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
              digest('foreign-hosted-lifecycle-budget-binding-root'),
          }),
        }),
      }),
    ]) {
      assert.throws(
        () =>
          assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
            state
          ),
        /drifted from the signed Bundle authority/u
      );
    }
  });

  test('recomputes every frozen probe admission stage, acknowledgement, response, and six-reference chain', () => {
    const fixture = createV8QualificationAuthorityArchiveFixture();
    assert.equal(fixture.capabilityProbeAdmissions.length, 18);
    assert.equal(fixture.capabilityProbeReferenceReceipts.length, 108);
    for (const admission of fixture.capabilityProbeAdmissions) {
      const request = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
        admission.request
      );
      const response = decodeAgentEvaluationCapabilityProbeAdmissionResponse(
        admission.response,
        request
      );
      const references = decodeAgentEvaluationCapabilityProbeReferenceBundle(
        admission.referenceBundle,
        request,
        response.probeEvidence,
        response.ownerImplementationDigest
      );
      assert.deepEqual(request, admission.request);
      assert.deepEqual(response, admission.response);
      assert.deepEqual(references, admission.referenceBundle);
    }
  });

  test('recomputes every frozen runtime-fact source registration health, stage, acknowledgement, and receipt', () => {
    const fixture = createV8QualificationAuthorityArchiveFixture();
    assert.equal(fixture.runtimeFactSourceOwnerRegistrations.length, 15);
    for (const registration of fixture.runtimeFactSourceOwnerRegistrations) {
      const request = decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(
        registration.request
      );
      const health = decodeAgentEvaluationRuntimeFactSourceOwnerHealth(
        registration.ownerHealth,
        request
      );
      const receipt = decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt(
        registration.receipt,
        request
      );
      assert.deepEqual(request, registration.request);
      assert.deepEqual(health, registration.ownerHealth);
      assert.deepEqual(receipt, registration.receipt);
      assert.equal(receipt.ownerHealthDigest, health.healthDigest);
    }
  });

  test('joins every frozen capability-probe Provider resource cleanup through its registration, deletion, owner, and terminal receipt authority', () => {
    const fixture = createV8QualificationAuthorityArchiveFixture();
    const targets = fixture.plan.capabilityQualificationTargets.filter(
      ({ optionalCapabilitySupportAuthority }) =>
        optionalCapabilitySupportAuthority?.probeProviderResourceAuthority !==
        undefined
    );
    assert.equal(targets.length, 4);
    assert.equal(fixture.capabilityProbeProviderResourceCleanups.length, 4);
    for (const cleanupRecord of fixture.capabilityProbeProviderResourceCleanups) {
      const target = targets.find(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority
            ?.probeProviderResourceDeletionAuthorityReceipt?.requestDigest ===
          cleanupRecord.resourceRegistrationRequestDigest
      );
      const authority = target?.optionalCapabilitySupportAuthority;
      const providerResourceAuthority =
        authority?.probeProviderResourceAuthority;
      const admission = fixture.capabilityProbeAdmissions.find(
        ({ request }) =>
          request.probeProviderResourceAuthority?.authorityDigest ===
          providerResourceAuthority?.authorityDigest
      );
      assert.ok(authority);
      assert.ok(providerResourceAuthority);
      assert.ok(admission);
      assert.equal(
        assertG4ModelEvaluationCapabilityProbeProviderResourceCleanupBinding({
          cleanupRecord,
          providerResourceAuthority,
          probeProgram: authority.probeEvidence.probeProgram,
          probeObservedAt: authority.probeEvidence.receipt.probedAt,
          plannedAt: fixture.plan.plannedAt,
          repositoryCommit: fixture.plan.repositoryCommit,
          ownerImplementationDigest:
            admission.response.ownerImplementationDigest,
        }),
        cleanupRecord.cleanupReceiptDigest
      );
    }
  });

  test('joins an observed native-bootstrap raw Provider receipt through its sealed shared authority and provider observation', () => {
    const fixture = createG4ModelEvaluationNativeBootstrapAuthorityFixture();
    assert.ok(fixture.authorityRecord);
    assert.doesNotThrow(() =>
      assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
        fixture.state,
        fixture.sourceRecord,
        fixture.authorityRecord
      )
    );
    assert.equal(
      assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings(
        fixture.state,
        fixture.observation
      ),
      `${fixture.sourceRecord.attemptId}\u0000${fixture.sourceRecord.turnIndex}\u0000${fixture.sourceRecord.bootstrapSourceRequest.invocationId}`
    );
    assert.deepEqual(
      fixture.observation.facts.map(({ factKind }) => factKind),
      ['provider-event', 'provider-job-receipt']
    );
    assert.equal(fixture.state.consumedOptionalCapabilityFacts.size, 1);
    assert.doesNotThrow(() =>
      assertG4ModelEvaluationOptionalCapabilityArchiveJoins(fixture.state)
    );
  });

  test('accepts consumed, cancelled, and expired state-vault retirement lifecycles', () => {
    for (const disposition of ['consumed', 'cancelled', 'expired']) {
      const fixture = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
        nativeFactSalt: `lifecycle-${disposition}`,
        stateVaultDisposition: disposition,
      });
      assert.doesNotThrow(() =>
        assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
          fixture.state,
          fixture.sourceRecord,
          fixture.authorityRecord
        )
      );
      assert.equal(
        fixture.sourceRecord.stateVaultRetireRequest.disposition,
        disposition
      );
      assert.equal(
        fixture.sourceRecord.stateVaultRetirementReceipt.disposition,
        disposition
      );
      assert.equal(
        fixture.sourceRecord.stateVaultResolveRequest !== null,
        disposition === 'consumed'
      );
      assert.equal(
        fixture.sourceRecord.stateVaultResolveReceipt !== null,
        disposition === 'consumed'
      );
    }
  });

  test('keeps unavailable and failed native-bootstrap raw sources while forbidding synthetic shared authorities', () => {
    for (const outcome of ['unavailable', 'failed']) {
      const fixture = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
        outcome,
      });
      assert.equal(fixture.authorityRecord, undefined);
      assert.doesNotThrow(() =>
        assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
          fixture.state,
          fixture.sourceRecord,
          fixture.authorityRecord
        )
      );
      assert.doesNotThrow(() =>
        assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings(
          fixture.state,
          fixture.observation
        )
      );
      assert.deepEqual(
        fixture.observation.facts.map(({ factKind }) => factKind),
        ['provider-event']
      );
      assert.equal(fixture.state.consumedOptionalCapabilityFacts.size, 1);
      assert.doesNotThrow(() =>
        assertG4ModelEvaluationOptionalCapabilityArchiveJoins(fixture.state)
      );
    }
  });

  test('rejects missing raw Provider preimages and recomputed bootstrap stage or acknowledgement swaps', () => {
    const fixture = createG4ModelEvaluationNativeBootstrapAuthorityFixture();
    for (const mutationKind of ['missing-native-receipt', 'stage', 'ack']) {
      const sourceRecord = recommitG4NativeBootstrapSourceRawMutation(
        fixture.sourceRecord,
        mutationKind
      );
      const recordBase = { ...sourceRecord };
      delete recordBase.recordDigest;
      const sourceReceiptBase = { ...sourceRecord.sourceReceipt };
      delete sourceReceiptBase.sourceSealDigest;
      const bootstrapReceiptBase = {
        ...sourceRecord.bootstrapSourceReceipt,
      };
      delete bootstrapReceiptBase.receiptDigest;
      assert.equal(
        sourceRecord.recordDigest,
        digestAgentCanonicalValue(recordBase)
      );
      assert.equal(
        sourceRecord.sourceReceipt.sourceSealDigest,
        digestAgentCanonicalValue(sourceReceiptBase)
      );
      assert.equal(
        sourceRecord.bootstrapSourceReceipt.receiptDigest,
        digestAgentCanonicalValue(bootstrapReceiptBase)
      );
      assert.throws(
        () =>
          assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
            fixture.state,
            sourceRecord,
            fixture.authorityRecord
          ),
        /native optional-capability source is not a canonical tagged archive record/u
      );
    }
  });

  test('rejects a fully recommitted foreign vault authority and seal, resolve, retire, or retirement raw swaps', () => {
    const baseline = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
      nativeFactSalt: 'state-vault-baseline',
      stateVaultDisposition: 'consumed',
    });
    const authoritySwap =
      createG4ModelEvaluationNativeBootstrapAuthorityFixture({
        nativeFactSalt: 'state-vault-authority-swap',
        stateVaultDisposition: 'consumed',
        stateVaultAuthorityImplementationDigest: digest(
          'state-vault-authority-implementation-swap'
        ),
      });
    assert.throws(
      () =>
        assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
          baseline.state,
          authoritySwap.sourceRecord,
          authoritySwap.authorityRecord
        ),
      /state-vault seal, resolve, retirement, or frozen authority binding drifted/u
    );

    const rawSwap = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
      nativeFactSalt: 'state-vault-raw-swap',
      stateVaultDisposition: 'consumed',
    });
    for (const field of [
      'stateVaultSealRequest',
      'stateVaultSealReceipt',
      'stateVaultResolveRequest',
      'stateVaultResolveReceipt',
      'stateVaultRetireRequest',
      'stateVaultRetirementReceipt',
    ]) {
      const sourceRecord = recommitG4NativeBootstrapStateVaultRawSwap(
        baseline.sourceRecord,
        rawSwap.sourceRecord,
        field
      );
      const recordBase = { ...sourceRecord };
      delete recordBase.recordDigest;
      assert.equal(
        sourceRecord.recordDigest,
        digestAgentCanonicalValue(recordBase)
      );
      assert.throws(
        () =>
          assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
            baseline.state,
            sourceRecord,
            baseline.authorityRecord
          ),
        /native optional-capability source is not a canonical tagged archive record|state-vault seal, resolve, retirement, or frozen authority binding drifted/u
      );
    }
  });

  test('rejects fully recommitted target, native Provider receipt, and observation fact swaps', () => {
    const baseline = createG4ModelEvaluationNativeBootstrapAuthorityFixture();
    const targetSwap = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
      sourceAuthorityImplementationDigest: digest(
        'native-bootstrap-swapped-source-implementation'
      ),
    });
    assert.throws(
      () =>
        assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
          baseline.state,
          targetSwap.sourceRecord,
          targetSwap.authorityRecord
        ),
      /native optional-capability raw source drifted/u
    );

    const nativeReceiptSwap =
      createG4ModelEvaluationNativeBootstrapAuthorityFixture({
        providerResponseDigest: digest(
          'native-bootstrap-swapped-provider-response'
        ),
      });
    assert.throws(
      () =>
        assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
          baseline.state,
          nativeReceiptSwap.sourceRecord,
          nativeReceiptSwap.authorityRecord
        ),
      /native optional-capability raw source drifted/u
    );

    const factSwap = createG4ModelEvaluationNativeBootstrapAuthorityFixture({
      nativeFactSalt: 'swapped-fact',
    });
    const factSwapState = {
      ...baseline.state,
      optionalCapabilityFactSources: new Map([
        [baseline.identity, factSwap.sourceRecord],
      ]),
      optionalCapabilityFactAuthorities: new Map([
        [baseline.identity, factSwap.authorityRecord],
      ]),
      consumedOptionalCapabilityFacts: new Set(),
    };
    assert.doesNotThrow(() =>
      assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
        factSwapState,
        factSwap.sourceRecord,
        factSwap.authorityRecord
      )
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings(
          factSwapState,
          baseline.observation
        ),
      /provider capability observation drifted/u
    );
  });

  test(
    'streams the bounded 14,040-attempt semantic archive through owner, specific, grading, and required human authority to the signed terminus',
    { timeout: 600_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture();
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      const actualArchiveBytes =
        fixture.rootBytes.byteLength +
        fixture.indexBytes.byteLength +
        [...fixture.shardBytes.values()].reduce(
          (total, bytes) => total + bytes.byteLength,
          0
        );
      assert.ok(
        actualArchiveBytes <
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
      );
      const verified = await verifyG4ModelEvaluationEvidenceArchive(
        semanticArchiveVerifyOptions(fixture, paths)
      );
      assert.equal(
        verified.physicalBudget.totalArchiveBytes,
        actualArchiveBytes
      );
      assert.equal(verified.physicalBudget.familyUsages.length, 46);
      assert.equal(verified.attemptRecordCount, 14_040);
      assert.equal(verified.singletons.manifest.outcome, 'satisfied');
      assert.equal(
        verified.singletons.manifest.humanReviewReportDigest,
        verified.singletons.humanReviewReport.reportDigest
      );
      assert.ok(
        fixture.evidence.attemptAuthorityOwnerReceipts.some(
          ({ serviceKind }) => serviceKind === 'attempt-grading'
        )
      );
      assert.ok(fixture.evidence.capabilitySpecificReceipts.length > 0);
      assert.ok(
        fixture.evidence.providerCapabilityObservationReceipts.length > 0
      );
      assert.ok(
        fixture.evidence.providerCapabilityObservationReceipts.every(
          ({ facts, factAuthorities }) =>
            facts.length === factAuthorities.length
        )
      );
      const observationAuthorityKinds = new Set(
        fixture.evidence.providerCapabilityObservationReceipts.flatMap(
          ({ factAuthorities }) =>
            factAuthorities.map(
              ({ sourceAuthorityKind }) => sourceAuthorityKind
            )
        )
      );
      assert.equal(
        observationAuthorityKinds.has('native-provider-transport'),
        true
      );
      assert.equal(
        observationAuthorityKinds.has('shared-durable-capability'),
        true
      );
      assert.equal(fixture.evidence.optionalCapabilityFactSources.length, 7);
      assert.equal(
        fixture.evidence.optionalCapabilityFactAuthorities.length,
        7
      );
      const observedSharedProfiles = new Set(
        fixture.evidence.optionalCapabilityFactSources.map(
          ({ sourceReceipt }) => sourceReceipt.capabilityProfileId
        )
      );
      for (const expectedProfile of [
        'g4-provider-background-job',
        'g4-provider-hosted-retrieval-core',
        'g4-provider-hosted-retrieval-document',
        'g4-provider-isolated-cache',
        'g4-provider-reasoning-continuation',
      ]) {
        assert.equal(observedSharedProfiles.has(expectedProfile), true);
      }
      assert.equal(observedSharedProfiles.size, 5);
      assert.equal(
        fixture.evidence.capabilityProbeProviderResourceCleanups.length,
        4
      );
      assert.equal(
        fixture.evidence.hostedRetrievalRuntimeResourceCleanups.length,
        4
      );
      assert.ok(
        fixture.evidence.hostedRetrievalRuntimeResourceLifecycleJournals
          .length >= 8
      );
      assert.ok(
        fixture.evidence.capabilityEffectProviderRuntimeJournals.length > 0
      );
      const observedSpecific = fixture.evidence.capabilitySpecificReceipts.find(
        ({ providerCapabilityObservationReceiptDigest }) =>
          providerCapabilityObservationReceiptDigest !== undefined
      );
      assert.ok(observedSpecific);
      assert.ok(
        fixture.evidence.providerCapabilityObservationReceipts.some(
          ({ receiptDigest }) =>
            receiptDigest ===
            observedSpecific.providerCapabilityObservationReceiptDigest
        )
      );
      assert.ok(
        fixture.evidence.attemptAuthorityOwnerReceipts.some(
          ({ attemptId, responseProjection }) =>
            attemptId === observedSpecific.attemptId &&
            responseProjection.serviceKind === 'capability-runtime' &&
            responseProjection.specificReceiptDigests.some(
              ({ receiptDigest }) =>
                receiptDigest === observedSpecific.receiptDigest
            )
        )
      );
      assert.ok(
        fixture.evidence.attemptAuthorityOwnerReceipts.some(
          ({ attemptId, serviceKind }) =>
            attemptId === observedSpecific.attemptId &&
            serviceKind === 'attempt-grading'
        )
      );
      const providerObservationByDigest = new Map(
        fixture.evidence.providerCapabilityObservationReceipts.map(
          (receipt) => [receipt.receiptDigest, receipt]
        )
      );
      const blockedSpecifics = [
        'capability-unavailable-receipt',
        'authority-denial-receipt',
      ].map((receiptKind) => {
        const specific = fixture.evidence.capabilitySpecificReceipts.find(
          (candidate) => candidate.receiptKind === receiptKind
        );
        assert.ok(specific);
        const providerObservation = providerObservationByDigest.get(
          specific.providerCapabilityObservationReceiptDigest
        );
        assert.ok(providerObservation);
        assert.equal(
          matchAgentEvaluationCapabilitySpecificProviderObservation(
            specific,
            providerObservation
          ),
          true
        );
        return Object.freeze({ specific, providerObservation });
      });
      assert.equal(
        matchAgentEvaluationCapabilitySpecificProviderObservation(
          blockedSpecifics[0].specific,
          blockedSpecifics[1].providerObservation
        ),
        false
      );
      assert.ok(fixture.evidence.validatedHumanMetricObservations.length > 0);
    }
  );

  test(
    'rejects a fully recomputed foreign hosted runtime exact-four registration-intent set',
    { timeout: 600_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'swap-hosted-runtime-resource-registration-intents',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        fixture.evidence.hostedRetrievalRuntimeResourceCleanups.length,
        4
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /hosted (?:lifecycle (?:public budget material drifted from its frozen registration intent|journal does not close the exact registrations)|retrieval runtime resource cleanup (?:family is incomplete for its frozen plan|drifted from its exact pre-plan registration intents or frozen run))/u
      );
    }
  );

  test(
    'rejects missing, duplicate, and fully recomputed outer-source-swapped capability-effect Provider runtime journals',
    { timeout: 600_000 },
    async () => {
      for (const { mutation, expectedError } of [
        {
          mutation: 'missing-capability-effect-provider-runtime-journal',
          expectedError:
            /runtime journal drifted from its exact outer source seal/u,
        },
        {
          mutation: 'duplicate-capability-effect-provider-runtime-journal',
          expectedError:
            /(?:Provider runtime journal is duplicated|contains a swapped, duplicate, missing, or out-of-order record)/u,
        },
        {
          mutation: 'swap-capability-effect-provider-runtime-journal-source',
          expectedError:
            /runtime journal drifted from its exact outer source seal/u,
        },
      ]) {
        const fixture = createG4ModelEvaluationSemanticArchiveFixture({
          mutation,
        });
        const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
          fixture,
          rootDirectory: temporaryDirectory,
        });
        await assert.rejects(
          verifyG4ModelEvaluationEvidenceArchive(
            semanticArchiveVerifyOptions(fixture, paths)
          ),
          expectedError
        );
      }
    }
  );

  test(
    'rejects a recomputed and resigned 13,200-attempt legacy production denominator',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'legacy-13,200-production-denominator',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT, 14_040);
      assert.equal(fixture.evidence.plan.plannedJourneyCount, 13_200);
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /(?:release qualification is incomplete or unsatisfied|hosted retrieval runtime resource lifecycle journal family is not canonical)/u
      );
    }
  );

  test(
    'rejects swapped grading owners after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'swap-grading-owner-projections',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /attempt-grading owner drifted from its exact turn, capability, result\/runtime, observation, execution, grant, or timeline preimage/u
      );
    }
  );

  test(
    'rejects provider-observation adapter tampering after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'tamper-provider-observation-adapter',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /provider capability observation drifted from its exact plan, dispatch, transport, encrypted spool, normalized fact policy, or timeline/u
      );
    }
  );

  test(
    'rejects swapped provider-observation bindings after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'swap-provider-observation-bindings',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /provider capability-specific fact is synthetic, missing, or drifted from its exact frozen observation authority/u
      );
    }
  );

  test(
    'rejects provider-observation runtime-envelope authority tampering after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'tamper-provider-observation-runtime-envelope',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /providerCapabilityObservationReceipts contains an invalid domain record/u
      );
    }
  );

  test(
    'rejects capability-specific result tampering after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'tamper-capability-specific-result',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /capability-specific fact drifted from its exact plan, descriptor, turn, tool callback, material, result, timeline, or authority/u
      );
    }
  );

  test(
    'rejects a target-resolved capability descriptor swap after every raw shard, index, root, and signature commitment is recomputed',
    { timeout: 180_000 },
    async () => {
      const fixture = createG4ModelEvaluationSemanticArchiveFixture({
        mutation: 'swap-capability-specific-resolved-descriptor',
      });
      const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
        fixture,
        rootDirectory: temporaryDirectory,
      });
      assert.equal(
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          fixture.indexBytes
        ),
        fixture.root
      );
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          semanticArchiveVerifyOptions(fixture, paths)
        ),
        /capability-specific fact drifted from its exact plan, descriptor, turn, tool callback, material, result, timeline, or authority/u
      );
    }
  );

  for (const { mutation, label } of [
    {
      mutation: 'swap-provider-resource-cleanup-registration',
      label: 'capability-probe Provider resource cleanup registration',
    },
    {
      mutation: 'tamper-provider-resource-cleanup-owner',
      label: 'capability-probe Provider resource cleanup owner',
    },
    {
      mutation: 'tamper-provider-resource-cleanup-result',
      label: 'capability-probe Provider resource cleanup result',
    },
    {
      mutation: 'missing-provider-resource-cleanup',
      label: 'capability-probe Provider resource cleanup receipt',
    },
    {
      mutation: 'swap-runtime-source-registration-receipt',
      label: 'runtime-source registration receipt',
    },
    {
      mutation: 'swap-optional-fact-effect-source-receipt',
      label: 'optional-fact effect-source receipt',
    },
    {
      mutation: 'swap-optional-fact-authority-stage',
      label: 'optional-fact authority stage',
    },
    {
      mutation: 'swap-optional-fact-authority-ack',
      label: 'optional-fact authority acknowledgement',
    },
    {
      mutation: 'swap-optional-fact-runtime-envelope',
      label: 'optional-fact runtime envelope',
    },
    {
      mutation: 'swap-optional-fact-authority-result',
      label: 'optional-fact sealed result',
    },
    {
      mutation: 'swap-optional-fact-authority-binding',
      label: 'optional-fact fact-authority binding',
    },
  ]) {
    test(
      `rejects a recomputed ${label} swap after every raw shard, index, root, and signature commitment is recomputed`,
      {
        timeout:
          mutation === 'swap-optional-fact-authority-result'
            ? 300_000
            : 180_000,
      },
      async () => {
        const fixture = createG4ModelEvaluationSemanticArchiveFixture({
          mutation,
        });
        const paths = await writeG4ModelEvaluationSemanticArchiveFixture({
          fixture,
          rootDirectory: temporaryDirectory,
        });
        assert.equal(
          assertG4ModelEvaluationEvidenceRoot(
            fixture.root,
            fixture.index,
            fixture.indexBytes
          ),
          fixture.root
        );
        await assert.rejects(
          verifyG4ModelEvaluationEvidenceArchive(
            semanticArchiveVerifyOptions(fixture, paths)
          ),
          /(?:Real-model evidence shard .* contains a swapped, duplicate, missing, or out-of-order record|Evidence archive (?:capability-effect Provider runtime journal drifted from its exact outer source seal|capability-probe Provider resource cleanup|runtime-fact source registration is duplicated|provider capability observation drifted|optional-capability raw source drifted|provider capability-specific fact is synthetic))/u
        );
      }
    );
  }

  test('accepts the exact index/root publish chain and rejects v1 or raw index drift', () => {
    const fixture = createArchiveFixture();
    assert.equal(
      assertG4ModelEvaluationEvidenceRoot(
        fixture.root,
        fixture.index,
        fixture.indexBytes
      ),
      fixture.root
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceRoot(
          { ...fixture.root, version: 1 },
          fixture.index,
          fixture.indexBytes
        ),
      /root v2 has an invalid exact shape/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceRoot(
          fixture.root,
          fixture.index,
          Buffer.concat([fixture.indexBytes, Buffer.from(' ')])
        ),
      /does not bind the exact semantic index and raw index artifact/u
    );
  });

  test('requires one exact human-review lease only when the manifest binds human review', () => {
    const reviewLeaseDigest = digest('review-lease');
    const reportDigest = digest('human-review-report');
    const fixture = createArchiveFixture({ reviewLeaseDigest });
    const binding = {
      index: fixture.index,
      authorityAttestation: Object.freeze({ reviewLeaseDigest }),
      manifest: Object.freeze({
        humanReviewReportDigest: reportDigest,
        completedAt: NOW,
      }),
      humanReviewReport: Object.freeze({ reportDigest }),
      validatedHumanReviewArtifacts: Object.freeze([
        Object.freeze({
          reviewLeaseDigest,
          humanReviewReportDigest: reportDigest,
          validatedAt: NOW,
        }),
      ]),
      validatedHumanMetricObservations: Object.freeze([
        Object.freeze({
          observationId: 'validated-human-metric-observation.test',
          observationDigest: digest('validated-human-metric-observation'),
        }),
      ]),
    };
    assert.equal(
      assertG4ModelEvaluationEvidenceReviewLeaseBinding(binding),
      reviewLeaseDigest
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceReviewLeaseBinding({
          ...binding,
          authorityAttestation: Object.freeze({}),
        }),
      /human-review lease is missing, unexpected, or cross-bound incorrectly/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceReviewLeaseBinding({
          ...binding,
          validatedHumanReviewArtifacts: Object.freeze([
            Object.freeze({
              ...binding.validatedHumanReviewArtifacts[0],
              reviewLeaseDigest: digest('drifted-review-lease'),
            }),
          ]),
        }),
      /human-review lease is missing, unexpected, or cross-bound incorrectly/u
    );

    const withoutHumanReview = createArchiveFixture();
    assert.equal(
      assertG4ModelEvaluationEvidenceReviewLeaseBinding({
        index: withoutHumanReview.index,
        authorityAttestation: Object.freeze({}),
        manifest: Object.freeze({ completedAt: NOW }),
        humanReviewReport: Object.freeze({ reportDigest }),
        validatedHumanReviewArtifacts: Object.freeze([]),
        validatedHumanMetricObservations: Object.freeze([]),
      }),
      undefined
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceReviewLeaseBinding({
          ...binding,
          index: withoutHumanReview.index,
        }),
      /human-review lease is missing, unexpected, or cross-bound incorrectly/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceReviewLeaseBinding({
          ...binding,
          manifest: Object.freeze({ completedAt: NOW }),
          validatedHumanReviewArtifacts: Object.freeze([]),
        }),
      /human-review lease is missing, unexpected, or cross-bound incorrectly/u
    );
    assert.throws(
      () =>
        assertG4ModelEvaluationEvidenceRoot(
          {
            ...fixture.root,
            reviewLeaseDigest: digest('drifted-review-lease'),
          },
          fixture.index,
          fixture.indexBytes
        ),
      /root v2 has an invalid exact shape/u
    );
  });

  test('cross-binds the generated run-config artifact identity, bytes, and signed configuration digests', () => {
    const fixture = createArchiveFixture();
    const configuration = frozenConfigurationFor(fixture);
    assert.equal(
      assertG4ModelEvaluationFrozenRunConfigBinding({
        index: fixture.index,
        plan: fixture.plan,
        runConfigArtifactBinding: fixture.index.runConfigArtifactBinding,
        configuration,
      }),
      configuration
    );
    const bindingMutations = [
      { sourcePlanArtifactName: 'g4-real-model-plan-swapped' },
      { sourcePlanArtifactDigest: `sha256:${'c'.repeat(64)}` },
      { sourcePlanWorkflowRunId: '5678' },
      { sourcePlanWorkflowRunAttempt: 2 },
      { runConfigByteLength: 3 },
      {
        sourceConfigDigest: digest('drifted-source-config'),
        runConfigCanonicalBytesDigest: digest('drifted-source-config'),
      },
      { frozenRunDigest: digest('drifted-frozen-run') },
      { planDigest: digest('drifted-plan') },
      { repositoryCommit: 'f'.repeat(40) },
    ];
    for (const overrides of bindingMutations) {
      assert.throws(
        () =>
          assertG4ModelEvaluationFrozenRunConfigBinding({
            index: fixture.index,
            plan: fixture.plan,
            runConfigArtifactBinding: createFixtureRunConfigArtifactBinding(
              fixture.plan,
              overrides
            ),
            configuration,
          }),
        /frozen run configuration drifted/u
      );
    }
    for (const driftedConfiguration of [
      {
        ...configuration,
        sourceConfigDigest: digest('drifted-source-config'),
      },
      {
        ...configuration,
        frozenRunDigest: digest('drifted-frozen-run'),
      },
    ]) {
      assert.throws(
        () =>
          assertG4ModelEvaluationFrozenRunConfigBinding({
            index: fixture.index,
            plan: fixture.plan,
            runConfigArtifactBinding: fixture.index.runConfigArtifactBinding,
            configuration: driftedConfiguration,
          }),
        /frozen run configuration drifted/u
      );
    }
    assert.throws(
      () =>
        decodeG4ModelEvaluationArtifactFrozenRunConfig({
          sourceBytes: Buffer.from(
            '{"purpose":"production","purpose":"production"}',
            'utf8'
          ),
          runConfigArtifactBinding: fixture.index.runConfigArtifactBinding,
          index: fixture.index,
          plan: fixture.plan,
        }),
      /not bounded strict JSON or contains duplicate keys/u
    );
  });

  test('rejects recomputed archive artifact identity and byte-length swaps', async () => {
    const mutations = [
      { sourcePlanArtifactName: 'g4-real-model-plan-swapped' },
      { sourcePlanArtifactDigest: `sha256:${'c'.repeat(64)}` },
      { sourcePlanWorkflowRunId: '5678' },
      { sourcePlanWorkflowRunAttempt: 2 },
      { runConfigByteLength: 3 },
    ];
    for (const runConfigArtifactBindingOverrides of mutations) {
      const fixture = createArchiveFixture({
        runConfigArtifactBindingOverrides,
      });
      const paths = await writeArchiveFixture(fixture);
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          verifyOptions(fixture, paths, {
            runConfigArtifactBinding: createFixtureRunConfigArtifactBinding(
              fixture.plan
            ),
          })
        ),
        /frozen run configuration drifted/u
      );
    }
  });

  test('requires the exact five-target endpoint-smoke release denominator', () => {
    const plan = createV8EvaluationPlan();
    assert.throws(
      () =>
        assertG4ModelEvaluationEndpointSmokeDenominator({
          targets: plan.endpointSmokeTargets,
          receipts: Object.freeze([]),
        }),
      /exactly five planned targets and five passing receipts/u
    );
  });

  test('rejects legacy monolith configuration before archive admission', async () => {
    const previous = process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE;
    process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE = 'legacy-evidence.json';
    try {
      await assert.rejects(
        loadAndVerifyG4ModelEvaluationEvidence(),
        /monolith input is unsupported/u
      );
    } finally {
      if (previous === undefined) {
        delete process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE;
      } else {
        process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE = previous;
      }
    }
  });

  test('rejects missing, extra, and symbolic-link archive entries', async (context) => {
    const missingFixture = createArchiveFixture();
    const missingPaths = await writeArchiveFixture(missingFixture);
    await unlink(
      join(missingPaths.shardPath, missingFixture.shards[0].fileName)
    );
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(missingFixture, missingPaths)
      ),
      /shard set is missing, duplicated, or unexpected/u
    );

    const extraFixture = createArchiveFixture();
    const extraPaths = await writeArchiveFixture(extraFixture);
    await writeFile(join(extraPaths.archivePath, 'uncommitted.json'), '{}');
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(extraFixture, extraPaths)
      ),
      /missing or unexpected entries/u
    );

    const linkFixture = createArchiveFixture();
    const linkPaths = await writeArchiveFixture(linkFixture);
    const descriptor = linkFixture.shards[0];
    const linkPath = join(linkPaths.shardPath, descriptor.fileName);
    const targetPath = join(linkPaths.fixturePath, 'shard-target.ndjson');
    await writeFile(
      targetPath,
      linkFixture.shardBytes.get(descriptor.fileName)
    );
    await unlink(linkPath);
    try {
      await symlink(targetPath, linkPath, 'file');
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(
          verifyOptions(linkFixture, linkPaths)
        ),
        /regular non-symbolic-link files/u
      );
    } catch (error) {
      if (error?.code === 'EPERM') {
        context.diagnostic('symlink creation is unavailable on this host');
      } else {
        throw error;
      }
    }
  });

  test('rejects shard swaps and the exact shard byte limit', async () => {
    const swapFixture = createArchiveFixture();
    const swapPaths = await writeArchiveFixture(swapFixture);
    const [first, second] = swapFixture.shards;
    const firstBytes = await readFile(
      join(swapPaths.shardPath, first.fileName)
    );
    const secondBytes = await readFile(
      join(swapPaths.shardPath, second.fileName)
    );
    await writeFile(join(swapPaths.shardPath, first.fileName), secondBytes);
    await writeFile(join(swapPaths.shardPath, second.fileName), firstBytes);
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(swapFixture, swapPaths)
      ),
      /raw bytes drifted from its descriptor/u
    );

    const largeFixture = createArchiveFixture();
    const largePaths = await writeArchiveFixture(largeFixture);
    await truncate(
      join(largePaths.shardPath, largeFixture.shards[0].fileName),
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes + 1
    );
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(largeFixture, largePaths)
      ),
      /empty, oversized, unstable, or not regular/u
    );
  });

  test('rejects CRLF and non-canonical shard JSON even when the index binds the raw bytes', async () => {
    for (const transform of [
      (line) => line.replace(/\n$/u, '\r\n'),
      (line) => ` ${line}`,
    ]) {
      const fixture = createArchiveFixture({
        rawLineTransformByFamily: new Map([['plan', transform]]),
      });
      const paths = await writeArchiveFixture(fixture);
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(verifyOptions(fixture, paths)),
        /canonical NDJSON|non-canonical/u
      );
    }
  });

  test('rejects duplicate, missing, and out-of-order records despite exact raw commitments', async () => {
    const plan = createV8EvaluationPlan();
    const cases = [
      [smokeRecord(plan, 0, 'smoke.a'), smokeRecord(plan, 1, 'smoke.a')],
      [smokeRecord(plan, 1, 'smoke.a')],
      [
        smokeRecord(plan, 0, 'smoke.a'),
        smokeRecord(plan, 1, 'smoke.c'),
        smokeRecord(plan, 2, 'smoke.b'),
      ],
    ];
    for (const records of cases) {
      const fixture = createArchiveFixture({
        recordsByFamily: new Map([['endpointSmokeReceipts', records]]),
      });
      const paths = await writeArchiveFixture(fixture);
      await assert.rejects(
        verifyG4ModelEvaluationEvidenceArchive(verifyOptions(fixture, paths)),
        /swapped, duplicate, missing, or out-of-order record/u
      );
    }
  });

  test('rejects canonical record content drift and index/root mismatch', async () => {
    const original = smokeRecord(createV8EvaluationPlan(), 0, 'smoke.a');
    const contentDrift = Object.freeze({
      ...original,
      value: Object.freeze({
        ...original.value,
        receiptDigest: digest('drifted-content'),
      }),
    });
    const driftFixture = createArchiveFixture({
      recordsByFamily: new Map([['endpointSmokeReceipts', [contentDrift]]]),
    });
    const driftPaths = await writeArchiveFixture(driftFixture);
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(driftFixture, driftPaths)
      ),
      /record line is non-canonical or invalid/u
    );

    const rootFixture = createArchiveFixture();
    const rootPaths = await writeArchiveFixture(rootFixture);
    const otherFixture = createArchiveFixture({
      exportLeaseId: 'evaluation-export-lease:other',
    });
    await writeFile(
      join(
        rootPaths.archivePath,
        AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME
      ),
      otherFixture.indexBytes
    );
    await assert.rejects(
      verifyG4ModelEvaluationEvidenceArchive(
        verifyOptions(rootFixture, rootPaths)
      ),
      /does not bind the exact semantic index and raw index artifact/u
    );
  });
});
