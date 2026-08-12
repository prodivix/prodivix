import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  digestAgentCanonicalValue,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  digestVerificationValue,
  type VerificationEvidenceCandidate,
  type VerificationEvidenceStatement,
} from '@prodivix/verification';
import { createAgentEvaluationVerificationEvidenceBridgeAuthority } from './evaluationVerificationEvidenceBridge';

export const createVerificationEvidenceOwnerTestStatement = (
  evidenceId: string,
  attemptId: string
): VerificationEvidenceStatement =>
  Object.freeze({
    evidenceId,
    candidateId: 'candidate:owner-state-test',
    candidateDigest: digestVerificationValue('owner-state-candidate'),
    evidenceCoreDigest: digestVerificationValue('owner-state-evidence-core'),
    projectId: 'project.owner-state-test',
    workspaceId: 'workspace.owner-state-test',
    workspaceRevision: 1,
    partitionRevisionsDigest: digestVerificationValue(
      'owner-state-partition-revisions'
    ),
    executableSnapshotDigest: digestVerificationValue(
      'owner-state-executable-snapshot'
    ),
    policyDigest: digestVerificationValue('owner-state-policy'),
    planDigest: digestVerificationValue('owner-state-plan'),
    cellId: 'cell.owner-state-test',
    checkId: 'check.owner-state-test',
    checkKind: 'integration',
    targetId: 'target.owner-state-test',
    targetPolicyDigest: digestVerificationValue('owner-state-target-policy'),
    attemptId,
    producer: Object.freeze({
      origin: 'remote',
      producerId: 'producer.owner-state-test',
      providerId: 'provider.owner-state-test',
      runId: 'run.owner-state-test',
    }),
    execution: Object.freeze({
      surface: 'preview',
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium',
      viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
      devicePixelRatio: 1,
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: digestVerificationValue('owner-state-font-set'),
    }),
    toolchainDigest: digestVerificationValue('owner-state-toolchain'),
    normalizationDigest: digestVerificationValue('owner-state-normalization'),
    controlDigest: digestVerificationValue('owner-state-control'),
    inputDigest: digestVerificationValue('owner-state-input'),
    resultDigest: digestVerificationValue('owner-state-result'),
    sourceTraceDigest: digestVerificationValue('owner-state-source-trace'),
    createdAt: '2026-08-09T00:00:00.000Z',
    retention: 'release',
    artifacts: Object.freeze([]),
  });

export const createVerificationEvidenceLifecycleFixture = (input: {
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  candidateArtifacts?: VerificationEvidenceCandidate['artifacts'];
}) => {
  const namespaceId = 'evaluation-lifecycle-test';
  const generation = 1;
  const projectId = 'project-evaluation-lifecycle';
  const workspaceId = 'workspace-evaluation-lifecycle';
  const workspaceRevision = 7;
  const verificationPlanDigest = digestAgentCanonicalValue(
    'verification-lifecycle-plan'
  );
  const cellId = 'cell-evaluation-lifecycle';
  const issuanceBindingDigest = digestAgentCanonicalValue({
    namespaceId,
    evaluationPlanDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    generation,
    workspaceId,
    workspaceRevision,
    projectId,
    verificationPlanDigest,
    cellId,
  });
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId,
    projectId,
    workspaceRevision,
    partitionRevisionsDigest: digestAgentCanonicalValue('partitions'),
    policyRevision: 1,
    policyDigest: digestAgentCanonicalValue('policy'),
    policyEvaluationInstant: '2026-08-08T00:00:00.000Z',
    impactDigest: digestAgentCanonicalValue('impact'),
    planDigest: verificationPlanDigest,
    cellId,
    checkId: 'check-evaluation-lifecycle',
    checkKind: 'integration',
    targetId: 'target-evaluation-lifecycle',
    attemptId: input.descriptor.attemptId,
    runId: 'verification-run-evaluation-lifecycle',
    providerId: 'verification-provider-evaluation-lifecycle',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'remote-attested' as const,
    retentionRequest: Object.freeze({
      successful: 'release' as const,
      failed: 'session' as const,
      protectReleaseEvidence: true,
    }),
    maximumClosureEvidenceRecords: 32,
    issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:10:00.000Z',
  });
  const grantDigest = digestAgentCanonicalValue(grantBase);
  const receiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
    version: 1 as const,
    namespaceId,
    evaluationPlanDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    generation,
    verificationPlanDigest,
    cellId,
    requestDigest: digestAgentCanonicalValue('request'),
    issuanceBindingDigest,
    grant: Object.freeze({
      grantId: `attempt-grant-${grantDigest.slice(7)}`,
      grantDigest,
      workspaceId,
      projectId,
      workspaceRevision,
      partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
      policyRevision: grantBase.policyRevision,
      policyDigest: grantBase.policyDigest,
      policyEvaluationInstant: grantBase.policyEvaluationInstant,
      impactDigest: grantBase.impactDigest,
      verificationPlanDigest,
      cellId,
      checkId: grantBase.checkId,
      checkKind: grantBase.checkKind,
      targetId: grantBase.targetId,
      attemptId: grantBase.attemptId,
      runId: grantBase.runId,
      providerId: grantBase.providerId,
      producerId: grantBase.producerId,
      trustCeiling: grantBase.trustCeiling,
      retentionRequest: grantBase.retentionRequest,
      maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
      issuedBy: grantBase.issuedBy,
      issuedAt: grantBase.issuedAt,
      expiresAt: grantBase.expiresAt,
    }),
  });
  const grantReceipt: AgentEvaluationVerificationAttemptGrantReceipt =
    Object.freeze({
      ...receiptBase,
      receiptDigest: digestAgentCanonicalValue(receiptBase),
    });
  const authority = createAgentEvaluationVerificationEvidenceBridgeAuthority({
    namespaceId,
    evaluationPlanDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    descriptor: input.descriptor,
    generation,
    controlledWorkspaceGrantDigest: digestAgentCanonicalValue(
      'controlled-workspace-grant'
    ),
    projectId,
    workspaceId,
    workspaceRevision,
    verificationPlanDigest,
    sandboxPolicyDigest: digestAgentCanonicalValue('sandbox-policy'),
    adapterRegistryDigest: digestAgentCanonicalValue('adapter-registry'),
    baseSnapshotDigest: digestAgentCanonicalValue('base-snapshot'),
    finalSnapshotDigest: digestAgentCanonicalValue('final-snapshot'),
    verificationAttemptGrantReceipts: Object.freeze([grantReceipt]),
  });
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest: verificationPlanDigest,
        cellId,
      }),
      label: 'G4 lifecycle test cell',
    }),
  ]);
  const resultBase = Object.freeze({
    outcome: 'passed' as const,
    summary: Object.freeze({ status: 'verified' }),
    diagnosticCodes: Object.freeze([]),
    appliedExemptionIds: Object.freeze([]),
  });
  const candidateBase = Object.freeze({
    candidateId: 'candidate:evaluation-lifecycle',
    projectId,
    workspaceId,
    workspaceRevision,
    partitionRevisions: Object.freeze({
      workspaceRev: workspaceRevision,
      routeRev: 1,
      opSeq: 1,
      documentRevisions: Object.freeze({}),
    }),
    executableSnapshotDigest: digestVerificationValue('executable-snapshot'),
    policyRevision: 1,
    policyDigest: digestVerificationValue('verification-policy'),
    impactDigest: digestVerificationValue('verification-impact'),
    planDigest: verificationPlanDigest,
    policyEvaluationInstant: '2026-08-08T00:00:00.000Z',
    cellId,
    checkId: 'check-evaluation-lifecycle',
    checkKind: 'integration' as const,
    targetId: 'target-evaluation-lifecycle',
    attemptId: input.descriptor.attemptId,
    run: Object.freeze({
      runId: 'verification-run-evaluation-lifecycle',
      providerId: 'verification-provider-evaluation-lifecycle',
      surface: 'preview' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
      devicePixelRatio: 1,
      colorScheme: 'light' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: digestVerificationValue('verification-fonts'),
    }),
    timing: Object.freeze({
      startedAt: '2026-08-08T00:00:01.000Z',
      completedAt: '2026-08-08T00:00:02.000Z',
      durationMs: 1_000,
    }),
    result: Object.freeze({
      ...resultBase,
      normalizedResultDigest: digestVerificationValue(resultBase),
    }),
    provenance: Object.freeze({
      origin: 'remote' as const,
      producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
      providerId: 'verification-provider-evaluation-lifecycle',
      issuedAt: '2026-08-08T00:00:02.000Z',
      expiresAt: '2026-08-08T00:10:00.000Z',
    }),
    toolchain: Object.freeze({
      packageName: '@prodivix/verification-adapters',
      packageVersion: '0.0.0',
      buildDigest: digestVerificationValue('adapter-build'),
      toolchainDigest: digestVerificationValue('adapter-toolchain'),
      schemaDigest: digestVerificationValue('adapter-schema'),
    }),
    normalization: Object.freeze({
      packageName: '@prodivix/verification',
      packageVersion: '0.0.0',
      buildDigest: digestVerificationValue('normalization-build'),
      toolchainDigest: digestVerificationValue('normalization-toolchain'),
      schemaDigest: digestVerificationValue('normalization-schema'),
    }),
    controls: Object.freeze({
      profileDigest: digestVerificationValue('control-profile'),
      appliedDigest: digestVerificationValue('applied-controls'),
    }),
    inputs: Object.freeze({
      executableSnapshotDigest: digestVerificationValue('executable-snapshot'),
      fixtureSetDigests: Object.freeze([
        digestVerificationValue('fixture-set'),
      ]),
      baselineSetDigest: digestVerificationValue('baseline-set'),
      inputDigest: digestVerificationValue('verification-input'),
    }),
    artifacts: input.candidateArtifacts ?? Object.freeze([]),
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: digestVerificationValue('dependency-lock'),
    redaction: Object.freeze({
      policyId: 'redaction:evaluation-lifecycle',
      scannerSetDigest: digestVerificationValue('redaction-scanners'),
      droppedFieldCounts: Object.freeze({}),
      targetPolicy: Object.freeze({
        authority: 'verification-policy' as const,
        policyDigest: digestVerificationValue('verification-policy'),
        semanticTargetId: 'target-evaluation-lifecycle',
        capture: 'masked' as const,
      }),
      safe: true as const,
    }),
    requestedRetention: 'release' as const,
    promotion: Object.freeze({
      idempotencyKey: 'promotion.lifecycle.test.0001',
      deadline: '2026-08-08T00:10:00.000Z',
    }),
  }) satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>;
  const candidate: VerificationEvidenceCandidate = Object.freeze({
    ...candidateBase,
    candidateDigest: digestVerificationValue(candidateBase),
  });
  return Object.freeze({
    namespaceId,
    generation,
    projectId,
    workspaceId,
    workspaceRevision,
    verificationPlanDigest,
    cellId,
    authority,
    candidate,
  });
};
