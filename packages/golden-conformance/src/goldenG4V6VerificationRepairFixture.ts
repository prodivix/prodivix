import {
  createAgentActionProposal,
  createAgentApprovalDecision,
  digestAgentCanonicalValue,
  transitionAgentRunPhase,
  type AgentApprovalPreflightContext,
  type AgentCapabilityGrant,
  type AgentContextPack,
  type AgentControlCommandIdentity,
  type AgentJsonValue,
  type AgentPrincipalRef,
  type AgentRepairRegressionRequirement,
  type AgentRepairRoundReceipt,
  type AgentRunSnapshot,
  type AgentWorkspaceMutationReceipt,
} from '@prodivix/ai';
import { validateNodeGraphDocument } from '@prodivix/nodegraph';
import {
  applyVerificationRunEvent,
  createVerificationEvidenceVerifiedView,
  createVerificationRunEvent,
  createVerificationRunSnapshot,
  digestVerificationValue,
  evaluateVerificationClosure,
  uniqueVerificationText,
  type EvaluateVerificationClosureInput,
  type VerificationAttemptOutcome,
  type VerificationArtifactKind,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationEvidenceVerifiedView,
  type VerificationPlan,
  type VerificationPlanCell,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceVerificationImpactSet,
  encodeWorkspaceDocument,
  WORKSPACE_AGENT_ACTION_REGISTRY,
} from '@prodivix/workspace';
import {
  bindWorkspaceAgentRepairProposal,
  createWorkspaceAgentApplySuccessProof,
  createWorkspaceAgentProposalProjection,
  createWorkspaceAgentVerificationPlanBinding,
  evaluateWorkspaceAgentVerificationClosure,
  prepareWorkspaceAgentCommit,
  prepareWorkspaceAgentRepairRound,
  prepareWorkspaceAgentRollback,
  reconcileWorkspaceAgentCommit,
  type WorkspaceAgentProposalProjection,
} from '@prodivix/workspace-sync';
import { createGoldenG3V4Plan } from './goldenG3VerificationPlanFixture';
import {
  createGoldenG4V5ApprovalContext,
  createGoldenG4V5CommitResponse,
  GOLDEN_G4_V5_BASE_WORKSPACE,
  GOLDEN_G4_V5_GRANT,
  GOLDEN_G4_V5_POLICY,
  GOLDEN_G4_V5_PROJECTION,
  GOLDEN_G4_V5_PROPOSAL,
  GOLDEN_G4_V5_RUN,
  GOLDEN_G4_V5_TASK,
  GOLDEN_G4_V5_TIME,
  prepareGoldenG4V5Commit,
} from './goldenG4V5ProposalApprovalFixture';

const actor = Object.freeze({
  kind: 'user' as const,
  principalId: 'user.golden.g4-v5',
});

export const GOLDEN_G4_V6_PRODUCER: AgentPrincipalRef = Object.freeze({
  kind: 'service',
  principalId: 'service.golden.g4-v6',
});

export const GOLDEN_G4_V6_TIME = Object.freeze({
  verifying: '2026-08-01T12:00:08.000Z',
  repairing: '2026-08-01T12:00:09.000Z',
  repairPlan: '2026-08-01T12:00:10.000Z',
  repairApproval: '2026-08-01T12:00:11.000Z',
  repairCommit: '2026-08-01T12:00:12.000Z',
  repairAck: '2026-08-01T12:00:13.000Z',
  closure: '2026-08-01T12:04:00.000Z',
  rollbackStart: '2026-08-01T12:04:01.000Z',
  rollbackAck: '2026-08-01T12:04:02.000Z',
  rollbackExecution: '2026-08-01T12:04:10.000Z',
  rollbackClosure: '2026-08-01T12:06:00.000Z',
  expiry: '2026-08-01T12:50:00.000Z',
});

const digest = (value: unknown): string =>
  digestAgentCanonicalValue({ golden: 'g4-v6', value });

const initialPrepared = prepareGoldenG4V5Commit();
if (initialPrepared.status !== 'ready') {
  throw new Error('Golden G4 V6 could not prepare the V5 Atomic Commit.');
}
const initialAcknowledged = reconcileWorkspaceAgentCommit({
  outboxEntry: initialPrepared.outboxEntry,
  startedReceipt: initialPrepared.receipt,
  response: createGoldenG4V5CommitResponse(),
  receiptId: 'receipt.golden.g4-v6.initial.ack',
  completedAt: GOLDEN_G4_V5_TIME.ack,
});
if (initialAcknowledged.status !== 'acknowledged') {
  throw new Error('Golden G4 V6 could not reconcile the V5 Atomic Commit.');
}

export const GOLDEN_G4_V6_COMMITTED_WORKSPACE = initialAcknowledged.snapshot;
export const GOLDEN_G4_V6_COMMIT_RECEIPT = initialAcknowledged.receipt;

const evidenceInstant = (
  executionStartMs: number,
  index: number,
  offsetSeconds: number
): string =>
  new Date(
    executionStartMs + (index * 2 + offsetSeconds) * 1_000
  ).toISOString();

const artifactMediaType = (kind: VerificationArtifactKind): string =>
  kind === 'screenshot' || kind === 'visual-diff'
    ? 'image/png'
    : kind === 'build-log'
      ? 'text/plain'
      : 'application/json';

const createEvidence = (
  label: string,
  plan: VerificationPlan,
  cell: VerificationPlanCell,
  outcome: Extract<VerificationAttemptOutcome, 'passed' | 'failed'>,
  index: number,
  executionStartMs: number
): VerificationEvidence => {
  const evidenceId = `evidence.golden.g4-v6.${label}.${index}`;
  const attemptId = `attempt.golden.g4-v6.${label}.${index}`;
  const executableSnapshotDigest = digest({ label, kind: 'snapshot' });
  const scenarioProgramDigest = cell.scenarioId
    ? digest({ label, scenarioId: cell.scenarioId })
    : undefined;
  const artifactKinds = uniqueVerificationText([
    ...cell.artifactKinds,
    ...cell.evidenceRequirements.requiredArtifactKinds,
  ]) as readonly VerificationArtifactKind[];
  const artifacts = Object.freeze(
    artifactKinds.map((kind, artifactIndex) =>
      Object.freeze({
        id: `artifact.golden.g4-v6.${label}.${index}.${artifactIndex}`,
        path: `g4-v6/${label}/${index}/${kind}`,
        kind,
        digest: digest({ evidenceId, kind }),
        size: 64,
        mediaType: artifactMediaType(kind),
      })
    )
  );
  const sourceTraces = Object.freeze([]);
  const attestationDigest = digest({ evidenceId, kind: 'attestation' });
  const base = Object.freeze({
    id: evidenceId,
    projectId: GOLDEN_G4_V5_TASK.spec.projectId,
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    partitionRevisions: plan.targetPartitionRevisions,
    executableSnapshotDigest,
    ...(cell.scenarioId && scenarioProgramDigest
      ? {
          scenario: Object.freeze({
            id: cell.scenarioId,
            revision: 1,
            digest: digest({ label, scenario: cell.scenarioId }),
            programDigest: scenarioProgramDigest,
          }),
        }
      : {}),
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    impactDigest: plan.impactDigest,
    planDigest: plan.planDigest,
    policyEvaluationInstant: plan.policyEvaluationInstant,
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    targetId: cell.targetId,
    attemptId,
    run: Object.freeze({
      runId: `execution.golden.g4-v6.${label}`,
      providerId: 'golden-g4-v6-ci',
      surface: cell.surface,
      frameworkTarget: cell.frameworkTarget,
      runtimeZone: 'browser',
      ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
      operatingSystemIdentity: 'golden-linux',
      viewport: cell.viewport,
      devicePixelRatio: 1,
      colorScheme: cell.colorScheme,
      motion: cell.motion,
      locale: cell.locale,
      timezone: 'UTC',
      fontSetDigest: digest('font-set'),
    }),
    timing: Object.freeze({
      startedAt: evidenceInstant(executionStartMs, index, 0),
      completedAt: evidenceInstant(executionStartMs, index, 1),
      durationMs: 1_000,
    }),
    result: Object.freeze({
      outcome,
      normalizedResultDigest: digest({ evidenceId, outcome }),
      summary: Object.freeze({ outcome, cellId: cell.id }),
      diagnosticCodes: Object.freeze(outcome === 'failed' ? ['VER-4002'] : []),
      appliedExemptionIds: cell.appliedExemptionIds,
    }),
    provenance: Object.freeze({
      producerId: 'producer.golden.g4-v6-ci',
      trust: 'ci-attested' as const,
      ci: Object.freeze({
        repository: 'github:prodivix/prodivix',
        ref: 'refs/heads/main',
        commit: `sha1-${'a'.repeat(40)}`,
      }),
      attestationDigest,
      issuedAt: evidenceInstant(executionStartMs, index, 1),
      expiresAt: '2026-08-01T13:00:00.000Z',
    }),
    toolchain: Object.freeze({
      packageName: '@prodivix/golden-conformance',
      packageVersion: '0.0.1',
      buildDigest: digest({ cellId: cell.id, kind: 'build' }),
      toolchainDigest: cell.adapter.toolchainDigest,
      schemaDigest: digest({ cellId: cell.id, kind: 'schema' }),
    }),
    normalization: Object.freeze({
      packageName: '@prodivix/verification',
      packageVersion: '0.0.1',
      buildDigest: digest('normalization-build'),
      toolchainDigest: digest('normalization-toolchain'),
      schemaDigest: digest('normalization-schema'),
    }),
    controls: Object.freeze({
      profileDigest:
        cell.controlProfileRef.digest ?? digest('default-control-profile'),
      appliedDigest: digest({ cellId: cell.id, kind: 'controls' }),
    }),
    inputs: Object.freeze({
      executableSnapshotDigest,
      ...(scenarioProgramDigest ? { scenarioProgramDigest } : {}),
      fixtureSetDigests: Object.freeze(
        cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
      ),
      ...(cell.baselineSetRef?.digest
        ? { baselineSetDigest: cell.baselineSetRef.digest }
        : {}),
      inputDigest: cell.inputDigest,
    }),
    artifacts,
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: digest({
      frameworkTarget: cell.frameworkTarget,
      kind: 'dependency-lock',
    }),
    redactionPolicyId: 'redaction.golden.g4-v6',
    targetPolicy: cell.targetPolicy,
    createdAt: evidenceInstant(executionStartMs, index, 1),
    retention: 'change' as const,
  }) satisfies Omit<VerificationEvidence, 'manifestDigest'>;
  return Object.freeze({
    ...base,
    manifestDigest: digestVerificationValue(base),
  });
};

const createVerifiedView = (
  label: string,
  evidence: readonly VerificationEvidence[],
  closureEvaluationInstant: string
): VerificationEvidenceVerifiedView =>
  createVerificationEvidenceVerifiedView({
    closureEvaluationInstant,
    revocationRecordDigest: digest({ label, kind: 'revocation-view' }),
    records: evidence.map((candidate) =>
      Object.freeze({
        evidenceId: candidate.id,
        manifestDigest: candidate.manifestDigest,
        materializedEvidenceDigest: digestVerificationValue(candidate),
        effectiveTrust: candidate.provenance.trust,
        trustStatus: 'verified' as const,
        attestationDigest: candidate.provenance.attestationDigest,
        retentionState: 'active' as const,
        revocationRecordDigests: Object.freeze([]),
        artifacts: candidate.artifacts.map((artifact) =>
          Object.freeze({
            artifactId: artifact.id,
            digest: artifact.digest,
            status: 'available' as const,
          })
        ),
      })
    ),
  });

const applyRunEvent = (
  snapshot: VerificationRunSnapshot,
  event: ReturnType<typeof createVerificationRunEvent>
): VerificationRunSnapshot => {
  const result = applyVerificationRunEvent(snapshot, event);
  if (result.status !== 'applied') {
    throw new Error(`Golden G4 V6 run event failed: ${result.message}`);
  }
  return result.snapshot;
};

const createVerificationRun = (
  label: string,
  plan: VerificationPlan,
  evidence: readonly VerificationEvidence[],
  closure: VerificationClosure,
  executionStartMs: number,
  closureEvaluationInstant: string
): VerificationRunSnapshot => {
  const selectedCellIds = Object.freeze(plan.cells.map(({ id }) => id));
  const attemptIdByCellId = Object.freeze(
    Object.fromEntries(
      evidence.map(({ cellId, attemptId }) => [cellId, attemptId] as const)
    )
  );
  let snapshot = createVerificationRunSnapshot({
    runId: `verification.golden.g4-v6.${label}`,
    plan,
    surface: plan.cells[0]!.surface,
    scope: 'all',
    providerId: 'golden-g4-v6-ci',
    origin: 'ci',
    ci: {
      repository: 'github:prodivix/prodivix',
      ref: 'refs/heads/main',
      commit: `sha1-${'a'.repeat(40)}`,
    },
    selectedCellIds,
    attemptIdByCellId,
    createdAt: new Date(executionStartMs - 1_000).toISOString(),
  });
  let cursor = 0;
  const nextEvent = (
    occurredAt: string,
    event: Readonly<Record<string, unknown> & { kind: string }>
  ) =>
    createVerificationRunEvent({
      ...event,
      eventId: `event.golden.g4-v6.${label}.${cursor + 1}`,
      runId: snapshot.runId,
      cursor: (cursor += 1),
      occurredAt,
    } as Parameters<typeof createVerificationRunEvent>[0]);
  snapshot = applyRunEvent(
    snapshot,
    nextEvent(new Date(executionStartMs).toISOString(), {
      kind: 'run-started',
    })
  );
  evidence.forEach((candidate, index) => {
    const startedAt = evidenceInstant(executionStartMs, index, 0);
    const completedAt = evidenceInstant(executionStartMs, index, 1);
    const candidateDigest = digestVerificationValue({
      evidenceId: candidate.id,
      manifestDigest: candidate.manifestDigest,
    });
    snapshot = applyRunEvent(
      snapshot,
      nextEvent(startedAt, {
        kind: 'cell-started',
        cellId: candidate.cellId,
        attemptId: candidate.attemptId,
      })
    );
    snapshot = applyRunEvent(
      snapshot,
      nextEvent(completedAt, {
        kind: 'cell-reported',
        cellId: candidate.cellId,
        attemptId: candidate.attemptId,
        outcome: candidate.result.outcome,
        candidateDigest,
        ...(candidate.result.outcome === 'failed'
          ? { diagnosticCode: 'VER-4002' }
          : {}),
      })
    );
    snapshot = applyRunEvent(
      snapshot,
      nextEvent(completedAt, {
        kind: 'cell-promoted',
        cellId: candidate.cellId,
        attemptId: candidate.attemptId,
        candidateDigest,
        evidenceId: candidate.id,
      })
    );
  });
  snapshot = applyRunEvent(
    snapshot,
    nextEvent(
      new Date(
        executionStartMs + (evidence.length * 2 + 2) * 1_000
      ).toISOString(),
      { kind: 'run-completed' }
    )
  );
  return applyRunEvent(
    snapshot,
    nextEvent(closureEvaluationInstant, {
      kind: 'closure-evaluated',
      closureDigest: closure.closureDigest,
      verdict: closure.verdict,
    })
  );
};

export type GoldenG4V6VerificationFlow = Readonly<{
  plan: VerificationPlan;
  evidence: readonly VerificationEvidence[];
  verifiedView: VerificationEvidenceVerifiedView;
  closureInput: EvaluateVerificationClosureInput;
  verificationRun: VerificationRunSnapshot;
  binding: Extract<
    ReturnType<typeof createWorkspaceAgentVerificationPlanBinding>,
    { status: 'ready' }
  >['value'];
  closure: VerificationClosure;
  closureReceipt: Extract<
    ReturnType<typeof evaluateWorkspaceAgentVerificationClosure>,
    { status: 'ready' }
  >['value']['receipt'];
}>;

export const createGoldenG4V6VerificationFlow = (
  input: Readonly<{
    label: string;
    projection: WorkspaceAgentProposalProjection;
    approval: AgentApprovalPreflightContext;
    mutationReceipt: AgentWorkspaceMutationReceipt;
    plan: VerificationPlan;
    failedCellId?: string;
    regressionRequirements?: readonly AgentRepairRegressionRequirement[];
    executionStartedAt?: string;
    closureEvaluationInstant?: string;
    boundAt?: string;
  }>
): GoldenG4V6VerificationFlow => {
  const executionStartedAt =
    input.executionStartedAt ?? '2026-08-01T12:01:00.000Z';
  const executionStartMs = Date.parse(executionStartedAt);
  const closureEvaluationInstant =
    input.closureEvaluationInstant ?? GOLDEN_G4_V6_TIME.closure;
  const evidence = Object.freeze(
    input.plan.cells.map((cell, index) =>
      createEvidence(
        input.label,
        input.plan,
        cell,
        cell.id === input.failedCellId ? 'failed' : 'passed',
        index,
        executionStartMs
      )
    )
  );
  const verifiedView = createVerifiedView(
    input.label,
    evidence,
    closureEvaluationInstant
  );
  const closureInput = Object.freeze({
    plan: input.plan,
    evidence,
    verifiedEvidenceView: verifiedView,
    closureEvaluationInstant,
    targetRevision: input.plan.targetRevision,
    targetPartitionRevisions: input.plan.targetPartitionRevisions,
    scenarioRegistryDigest: input.plan.scenarioRegistryDigest,
    semanticSchemaDigest: input.plan.semanticSchemaDigest,
    providerSetDigest: input.plan.providerSetDigest,
    adapterRegistryDigest: input.plan.adapterRegistryDigest,
    impactDigest: input.plan.impactDigest,
    policyRevision: input.plan.policyRevision,
    policyDigest: input.plan.policyDigest,
    compilerDigest: input.plan.compilerDigest,
    plannerDigest: input.plan.plannerDigest,
    baselineSetDigests: uniqueVerificationText(
      input.plan.cells.flatMap((cell) =>
        cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        input.plan.cells.map(({ adapter }) => adapter.toolchainDigest)
      )
    ),
    revocationRecordDigest: verifiedView.revocationRecordDigest,
    revokedEvidenceIds: Object.freeze([]),
  }) satisfies EvaluateVerificationClosureInput;
  const evaluated = evaluateVerificationClosure(closureInput);
  if (evaluated.status !== 'ready') {
    throw new Error(`Golden G4 V6 Closure failed: ${evaluated.message}`);
  }
  const verificationRun = createVerificationRun(
    input.label,
    input.plan,
    evidence,
    evaluated.closure,
    executionStartMs,
    closureEvaluationInstant
  );
  const binding = createWorkspaceAgentVerificationPlanBinding({
    projection: input.projection,
    approval: input.approval,
    mutationReceipt: input.mutationReceipt,
    actualPlan: input.plan,
    verificationRun,
    regressionRequirements: input.regressionRequirements,
    bindingId: `binding.golden.g4-v6.${input.label}`,
    producer: GOLDEN_G4_V6_PRODUCER,
    boundAt: input.boundAt ?? GOLDEN_G4_V6_TIME.verifying,
  });
  if (binding.status !== 'ready') {
    throw new Error(
      `Golden G4 V6 Plan binding failed: ${binding.issues
        .map(({ message }) => message)
        .join('; ')}`
    );
  }
  const closureResult = evaluateWorkspaceAgentVerificationClosure({
    binding: binding.value,
    verificationRun,
    closureInput,
    receiptId: `receipt.golden.g4-v6.${input.label}.closure`,
    producer: GOLDEN_G4_V6_PRODUCER,
    evaluatedAt: closureEvaluationInstant,
  });
  if (closureResult.status !== 'ready') {
    throw new Error(
      `Golden G4 V6 Agent Closure failed: ${closureResult.issues
        .map(({ message }) => message)
        .join('; ')}`
    );
  }
  return Object.freeze({
    plan: input.plan,
    evidence,
    verifiedView,
    closureInput,
    verificationRun,
    binding: binding.value,
    closure: closureResult.value.closure,
    closureReceipt: closureResult.value.receipt,
  });
};

const failedCell = GOLDEN_G4_V5_PROJECTION.verificationPlan.cells.find(
  ({ requirement, checkKind }) =>
    requirement === 'required' && checkKind === 'build'
);
if (!failedCell) {
  throw new Error('Golden G4 V6 requires one required build cell.');
}
export const GOLDEN_G4_V6_FAILED_CELL_ID = failedCell.id;

export const GOLDEN_G4_V6_FAILED_FLOW = createGoldenG4V6VerificationFlow({
  label: 'failed',
  projection: GOLDEN_G4_V5_PROJECTION,
  approval: createGoldenG4V5ApprovalContext(),
  mutationReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
  plan: GOLDEN_G4_V5_PROJECTION.verificationPlan,
  failedCellId: GOLDEN_G4_V6_FAILED_CELL_ID,
});

export const GOLDEN_G4_V6_PASSED_FLOW = createGoldenG4V6VerificationFlow({
  label: 'passed',
  projection: GOLDEN_G4_V5_PROJECTION,
  approval: createGoldenG4V5ApprovalContext(),
  mutationReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
  plan: GOLDEN_G4_V5_PROJECTION.verificationPlan,
});

const contextItem = (
  kind: 'verification-closure' | 'verification-evidence',
  id: string,
  contentDigest: string,
  revision: ReturnType<typeof createAgentWorkspaceRevisionFromSnapshot>
) =>
  Object.freeze({
    itemId: `context-item.${id}`,
    kind,
    authority: 'derived' as const,
    source: Object.freeze({ kind: 'verification' as const, id }),
    revision,
    contentDigest,
    mediaType: 'application/json',
    byteLength: 64,
    sensitivity: 'internal' as const,
    instructionBoundary: 'data-only' as const,
  });

const createFailureContextPack = (): AgentContextPack => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(
    GOLDEN_G4_V6_COMMITTED_WORKSPACE
  );
  const failedEvidence = GOLDEN_G4_V6_FAILED_FLOW.evidence.filter(
    ({ result }) => result.outcome !== 'passed'
  );
  const items = Object.freeze([
    contextItem(
      'verification-closure',
      GOLDEN_G4_V6_FAILED_FLOW.closureReceipt.receiptId,
      GOLDEN_G4_V6_FAILED_FLOW.closure.closureDigest,
      revision
    ),
    ...failedEvidence.map((evidence) =>
      contextItem(
        'verification-evidence',
        evidence.id,
        evidence.manifestDigest,
        revision
      )
    ),
  ]);
  const base = Object.freeze({
    taskId: GOLDEN_G4_V5_TASK.spec.taskId,
    runId: GOLDEN_G4_V5_RUN.run.runId,
    workspaceRevision: revision,
    semanticSnapshotRef: `semantic-snapshot:${digest('repair')}`,
    semanticProviderSetDigest: digest('semantic-provider-set'),
    contextContributorSetDigest: digest('repair-contributors'),
    providerSetDigest: GOLDEN_G4_V6_FAILED_FLOW.plan.providerSetDigest,
    policyDigest: GOLDEN_G4_V5_TASK.spec.policyDigest,
    items,
    omitted: Object.freeze([]),
    budget: Object.freeze({ maxItems: 8, maxBytes: 8_192 }),
  });
  const manifestDigest = digestAgentCanonicalValue(base);
  return Object.freeze({
    contextPackId: `context-pack:${manifestDigest.slice('sha256-'.length)}`,
    ...base,
    manifestDigest,
  });
};

export const GOLDEN_G4_V6_FAILURE_CONTEXT_PACK = createFailureContextPack();

const command = (
  suffix: string,
  occurredAt: string
): AgentControlCommandIdentity =>
  Object.freeze({
    eventId: `event.golden.g4-v6.${suffix}`,
    idempotencyKey: `idempotency.golden.g4-v6.${suffix}`,
    occurredAt,
    producer: GOLDEN_G4_V6_PRODUCER,
  });

const transition = (
  state: AgentRunSnapshot,
  phase: 'verifying' | 'repairing',
  suffix: string,
  occurredAt: string
): AgentRunSnapshot => {
  const result = transitionAgentRunPhase(GOLDEN_G4_V5_TASK, state, {
    ...command(suffix, occurredAt),
    phase,
  });
  if (!result.accepted) {
    throw new Error(
      `Golden G4 V6 Run transition failed: ${result.issues
        .map(({ message }) => message)
        .join('; ')}`
    );
  }
  return result.state;
};

export const GOLDEN_G4_V6_VERIFYING_RUN = transition(
  GOLDEN_G4_V5_RUN,
  'verifying',
  'verifying',
  GOLDEN_G4_V6_TIME.verifying
);
export const GOLDEN_G4_V6_REPAIRING_RUN = transition(
  GOLDEN_G4_V6_VERIFYING_RUN,
  'repairing',
  'repairing',
  GOLDEN_G4_V6_TIME.repairing
);

const repairPreparation = prepareWorkspaceAgentRepairRound({
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V6_REPAIRING_RUN,
  policy: GOLDEN_G4_V5_POLICY,
  failedClosureReceipt: GOLDEN_G4_V6_FAILED_FLOW.closureReceipt,
  failedClosure: GOLDEN_G4_V6_FAILED_FLOW.closure,
  failedPlan: GOLDEN_G4_V6_FAILED_FLOW.plan,
  failedEvidence: GOLDEN_G4_V6_FAILED_FLOW.evidence,
  failureContextPack: GOLDEN_G4_V6_FAILURE_CONTEXT_PACK,
  previousRepairReceipts: Object.freeze([]),
  receiptId: 'receipt.golden.g4-v6.repair.started',
  repairRoundId: 'repair-round.golden.g4-v6.1',
  producer: GOLDEN_G4_V6_PRODUCER,
  recordedAt: GOLDEN_G4_V6_TIME.repairing,
});
if (
  repairPreparation.status !== 'ready' ||
  repairPreparation.value.receipt.state !== 'started'
) {
  throw new Error('Golden G4 V6 could not start a bounded repair round.');
}
const startedRepairReceipt = repairPreparation.value.receipt as Extract<
  AgentRepairRoundReceipt,
  { state: 'started' }
>;
export const GOLDEN_G4_V6_REPAIR_PREPARATION = Object.freeze({
  ...repairPreparation.value,
  receipt: startedRepairReceipt,
});

const committedRevision = createAgentWorkspaceRevisionFromSnapshot(
  GOLDEN_G4_V6_COMMITTED_WORKSPACE
);
const graphDocument =
  GOLDEN_G4_V6_COMMITTED_WORKSPACE.docsById['graph-catalog-derived-state'];
if (!graphDocument) {
  throw new Error('Golden G4 V6 repair NodeGraph is missing.');
}
const decodedGraph = validateNodeGraphDocument(graphDocument.content);
if (!decodedGraph.ok) {
  throw new Error('Golden G4 V6 repair NodeGraph is invalid.');
}
const repairedGraph = structuredClone(decodedGraph.value);
repairedGraph.nodes = repairedGraph.nodes.map((node) =>
  node.id === 'derived-state'
    ? {
        ...node,
        editor: {
          ...node.editor,
          label: 'Derived state V6 repaired',
        },
      }
    : node
);
const repairedGraphJson = repairedGraph as AgentJsonValue;

export const GOLDEN_G4_V6_REPAIR_PROPOSAL = createAgentActionProposal(
  WORKSPACE_AGENT_ACTION_REGISTRY,
  {
    proposalId: 'proposal.golden.g4-v6.repair',
    taskId: GOLDEN_G4_V5_PROPOSAL.taskId,
    runId: GOLDEN_G4_V5_PROPOSAL.runId,
    baseRevision: committedRevision,
    contextPackDigest: GOLDEN_G4_V6_FAILURE_CONTEXT_PACK.manifestDigest,
    actions: Object.freeze([
      Object.freeze({
        ownerId: 'prodivix.nodegraph',
        actionType: 'document.update',
        inputSchemaId: 'nodegraph.document-update@current',
        target: Object.freeze({
          kind: 'document' as const,
          id: graphDocument.id,
        }),
        input: Object.freeze({ content: repairedGraphJson }),
      }),
    ]),
    explanation:
      'Repair the failed committed revision without changing its verification policy, checks, baselines, or exemptions.',
    assumptions: Object.freeze([
      'The failed build cell remains a required regression check.',
    ]),
    requestedVerification: GOLDEN_G4_V5_TASK.spec.verificationRequirement,
    modelInvocationRefs: Object.freeze([
      'invocation.golden.g4-v6.failure-grounded-repair',
    ]),
  }
);

export const GOLDEN_G4_V6_REPAIR_GRANT: AgentCapabilityGrant = Object.freeze({
  ...GOLDEN_G4_V5_GRANT,
  baseRevision: committedRevision,
});

const repairProjectionResult = createWorkspaceAgentProposalProjection({
  workspace: GOLDEN_G4_V6_COMMITTED_WORKSPACE,
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V6_REPAIRING_RUN,
  proposal: GOLDEN_G4_V6_REPAIR_PROPOSAL,
  grant: GOLDEN_G4_V6_REPAIR_GRANT,
  policy: GOLDEN_G4_V5_POLICY,
  transactionId: 'transaction.golden.g4-v6.repair',
  reverseTransactionId: 'transaction.golden.g4-v6.repair.reverse',
  issuedAt: GOLDEN_G4_V6_TIME.repairPlan,
  previewId: 'preview.golden.g4-v6.repair',
  plannedAt: GOLDEN_G4_V6_TIME.repairPlan,
  expiresAt: GOLDEN_G4_V6_TIME.expiry,
  frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
  runtimeZones: Object.freeze(['browser', 'client', 'server']),
  verificationPlanner: (impactSet) => createGoldenG3V4Plan({ impactSet }),
});
if (repairProjectionResult.status !== 'ready') {
  throw new Error(
    `Golden G4 V6 repair projection failed: ${repairProjectionResult.issues
      .map(({ message }) => message)
      .join('; ')}`
  );
}
export const GOLDEN_G4_V6_REPAIR_PROJECTION = repairProjectionResult.projection;

const repairDecision = createAgentApprovalDecision({
  decisionId: 'decision.golden.g4-v6.repair',
  decision: 'approved',
  actor,
  taskId: GOLDEN_G4_V5_TASK.spec.taskId,
  runId: GOLDEN_G4_V5_RUN.run.runId,
  previewId: GOLDEN_G4_V6_REPAIR_PROJECTION.preview.previewId,
  previewDigest: GOLDEN_G4_V6_REPAIR_PROJECTION.preview.previewDigest,
  baseRevision: committedRevision,
  transactionDigest: GOLDEN_G4_V6_REPAIR_PROJECTION.preview.transactionDigest,
  impactDigest: GOLDEN_G4_V6_REPAIR_PROJECTION.preview.impactDigest,
  verificationPlanDigest:
    GOLDEN_G4_V6_REPAIR_PROJECTION.preview.verificationPlanDigest,
  grantRef: Object.freeze({ grantId: GOLDEN_G4_V6_REPAIR_GRANT.grantId }),
  policyDigest: GOLDEN_G4_V5_TASK.spec.policyDigest,
  rollbackAuthorization: 'on-unsatisfied-closure',
  decidedAt: GOLDEN_G4_V6_TIME.repairApproval,
  expiresAt: GOLDEN_G4_V6_TIME.expiry,
});
const repairActorAuthorizationDigest = digestAgentCanonicalValue({
  actor,
  projectId: GOLDEN_G4_V5_TASK.spec.projectId,
  workspaceId: GOLDEN_G4_V6_COMMITTED_WORKSPACE.id,
});
export const GOLDEN_G4_V6_REPAIR_APPROVAL: AgentApprovalPreflightContext =
  Object.freeze({
    proposal: GOLDEN_G4_V6_REPAIR_PROPOSAL,
    preview: GOLDEN_G4_V6_REPAIR_PROJECTION.preview,
    planning: GOLDEN_G4_V6_REPAIR_PROJECTION.planning,
    decision: repairDecision,
    grant: GOLDEN_G4_V6_REPAIR_GRANT,
    policy: GOLDEN_G4_V5_POLICY,
    currentRevision: committedRevision,
    actorAuthorizationDigest: repairActorAuthorizationDigest,
    expectedActorAuthorizationDigest: repairActorAuthorizationDigest,
    actorAuthorized: true,
    grantUseCount: 0,
    at: GOLDEN_G4_V6_TIME.repairCommit,
  });

const repairPrepared = prepareWorkspaceAgentCommit({
  projection: GOLDEN_G4_V6_REPAIR_PROJECTION,
  approval: GOLDEN_G4_V6_REPAIR_APPROVAL,
  currentSnapshot: GOLDEN_G4_V6_COMMITTED_WORKSPACE,
  producer: GOLDEN_G4_V6_PRODUCER,
  receiptId: 'receipt.golden.g4-v6.repair.commit.started',
  startedAt: GOLDEN_G4_V6_TIME.repairCommit,
  now: Date.parse(GOLDEN_G4_V6_TIME.repairCommit),
});
if (repairPrepared.status !== 'ready') {
  throw new Error('Golden G4 V6 repair did not produce a new Outbox entry.');
}
export const GOLDEN_G4_V6_REPAIR_PREPARED_COMMIT = repairPrepared;

const createProjectionCommitResponse = (
  projection: WorkspaceAgentProposalProjection,
  updatedAt: string
): unknown => {
  const documentIds = [
    ...new Set(
      projection.actionPlan.transaction.commands.flatMap((candidate) =>
        candidate.target.documentId ? [candidate.target.documentId] : []
      )
    ),
  ];
  const routeChanged = projection.semanticDiff.changes.some(
    ({ target }) => target.kind === 'route-manifest'
  );
  return Object.freeze({
    workspaceId: projection.projectedTargetSnapshot.id,
    workspaceRev: projection.projectedTargetSnapshot.workspaceRev,
    routeRev: projection.projectedTargetSnapshot.routeRev,
    opSeq: projection.projectedTargetSnapshot.opSeq,
    updatedDocuments: Object.freeze(
      documentIds.map((documentId) =>
        encodeWorkspaceDocument({
          ...projection.projectedTargetSnapshot.docsById[documentId]!,
          updatedAt,
        })
      )
    ),
    ...(routeChanged
      ? { routeManifest: projection.projectedTargetSnapshot.routeManifest }
      : {}),
    acceptedMutationId: projection.actionPlan.transaction.id,
  });
};

const repairAcknowledged = reconcileWorkspaceAgentCommit({
  outboxEntry: repairPrepared.outboxEntry,
  startedReceipt: repairPrepared.receipt,
  response: createProjectionCommitResponse(
    GOLDEN_G4_V6_REPAIR_PROJECTION,
    GOLDEN_G4_V6_TIME.repairAck
  ),
  receiptId: 'receipt.golden.g4-v6.repair.commit.ack',
  completedAt: GOLDEN_G4_V6_TIME.repairAck,
});
if (repairAcknowledged.status !== 'acknowledged') {
  throw new Error('Golden G4 V6 repair ACK did not reconcile.');
}
export const GOLDEN_G4_V6_REPAIR_ACKNOWLEDGED = repairAcknowledged;

const repairBound = bindWorkspaceAgentRepairProposal({
  started: GOLDEN_G4_V6_REPAIR_PREPARATION.receipt,
  failedBinding: GOLDEN_G4_V6_FAILED_FLOW.binding,
  failedClosureReceipt: GOLDEN_G4_V6_FAILED_FLOW.closureReceipt,
  failedTransactionDigest: GOLDEN_G4_V5_PROJECTION.planning.transactionDigest,
  projection: GOLDEN_G4_V6_REPAIR_PROJECTION,
  approval: GOLDEN_G4_V6_REPAIR_APPROVAL,
  counterexamples: GOLDEN_G4_V6_REPAIR_PREPARATION.counterexamples,
  receiptId: 'receipt.golden.g4-v6.repair.proposal-bound',
  producer: GOLDEN_G4_V6_PRODUCER,
  recordedAt: GOLDEN_G4_V6_TIME.repairApproval,
});
if (repairBound.status !== 'ready') {
  throw new Error(
    `Golden G4 V6 repair proposal did not retain its counterexample: ${repairBound.issues
      .map(({ message }) => message)
      .join('; ')}`
  );
}
export const GOLDEN_G4_V6_REPAIR_BOUND_RECEIPT = repairBound.value;

export const GOLDEN_G4_V6_REPAIRED_FLOW = createGoldenG4V6VerificationFlow({
  label: 'repaired',
  projection: GOLDEN_G4_V6_REPAIR_PROJECTION,
  approval: GOLDEN_G4_V6_REPAIR_APPROVAL,
  mutationReceipt: GOLDEN_G4_V6_REPAIR_ACKNOWLEDGED.receipt,
  plan: GOLDEN_G4_V6_REPAIR_PROJECTION.verificationPlan,
  regressionRequirements:
    GOLDEN_G4_V6_REPAIR_PREPARATION.counterexamples.requirements,
});

const repairedSuccessProof = createWorkspaceAgentApplySuccessProof({
  projection: GOLDEN_G4_V6_REPAIR_PROJECTION,
  approval: GOLDEN_G4_V6_REPAIR_APPROVAL,
  mutationReceipt: GOLDEN_G4_V6_REPAIR_ACKNOWLEDGED.receipt,
  binding: GOLDEN_G4_V6_REPAIRED_FLOW.binding,
  closureReceipt: GOLDEN_G4_V6_REPAIRED_FLOW.closureReceipt,
});
if (repairedSuccessProof.status !== 'ready') {
  throw new Error(
    'Golden G4 V6 repaired Closure did not create success proof.'
  );
}
export const GOLDEN_G4_V6_REPAIRED_SUCCESS_PROOF = repairedSuccessProof.value;

const rollbackPrepared = prepareWorkspaceAgentRollback({
  projection: GOLDEN_G4_V5_PROJECTION,
  approval: createGoldenG4V5ApprovalContext(),
  commitReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
  currentSnapshot: GOLDEN_G4_V6_COMMITTED_WORKSPACE,
  rollbackPreflight: {
    trigger: 'unsatisfied-closure',
    actorAuthorized: true,
    hasInterveningAuthoring: false,
    hasExternalSideEffects: false,
    at: GOLDEN_G4_V6_TIME.rollbackStart,
  },
  producer: GOLDEN_G4_V6_PRODUCER,
  receiptId: 'receipt.golden.g4-v6.rollback.started',
  startedAt: GOLDEN_G4_V6_TIME.rollbackStart,
  now: Date.parse(GOLDEN_G4_V6_TIME.rollbackStart),
});
if (rollbackPrepared.status !== 'ready') {
  throw new Error('Golden G4 V6 failed Closure could not prepare rollback.');
}
export const GOLDEN_G4_V6_ROLLBACK_PREPARED = rollbackPrepared;

const rollbackDocumentIds = [
  ...new Set(
    GOLDEN_G4_V5_PROJECTION.actionPlan.reverseTransaction.commands.flatMap(
      (candidate) =>
        candidate.target.documentId ? [candidate.target.documentId] : []
    )
  ),
];
const rollbackResponse = Object.freeze({
  workspaceId: GOLDEN_G4_V6_COMMITTED_WORKSPACE.id,
  workspaceRev: GOLDEN_G4_V6_COMMITTED_WORKSPACE.workspaceRev + 1,
  routeRev: GOLDEN_G4_V6_COMMITTED_WORKSPACE.routeRev + 1,
  opSeq: GOLDEN_G4_V6_COMMITTED_WORKSPACE.opSeq + 1,
  updatedDocuments: Object.freeze(
    rollbackDocumentIds.map((documentId) => {
      const original = GOLDEN_G4_V5_BASE_WORKSPACE.docsById[documentId];
      const committed = GOLDEN_G4_V6_COMMITTED_WORKSPACE.docsById[documentId];
      if (!original || !committed) {
        throw new Error(
          `Golden G4 V6 rollback document ${documentId} is missing.`
        );
      }
      return encodeWorkspaceDocument({
        ...original,
        contentRev: committed.contentRev + 1,
        metaRev: committed.metaRev,
        updatedAt: GOLDEN_G4_V6_TIME.rollbackAck,
      });
    })
  ),
  routeManifest: GOLDEN_G4_V5_BASE_WORKSPACE.routeManifest,
  acceptedMutationId: GOLDEN_G4_V5_PROJECTION.actionPlan.reverseTransaction.id,
});

const rollbackAcknowledged = reconcileWorkspaceAgentCommit({
  outboxEntry: rollbackPrepared.outboxEntry,
  startedReceipt: rollbackPrepared.receipt,
  response: rollbackResponse,
  receiptId: 'receipt.golden.g4-v6.rollback.ack',
  completedAt: GOLDEN_G4_V6_TIME.rollbackAck,
});
if (rollbackAcknowledged.status !== 'acknowledged') {
  throw new Error('Golden G4 V6 rollback ACK did not reconcile.');
}
export const GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED = rollbackAcknowledged;

const rollbackImpact = createWorkspaceVerificationImpactSet({
  before: GOLDEN_G4_V6_COMMITTED_WORKSPACE,
  after: GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED.snapshot,
  operationIds: [GOLDEN_G4_V5_PROJECTION.actionPlan.reverseTransaction.id],
  frameworkTargets: ['react-vite', 'vue-vite'],
  runtimeZones: ['browser', 'client', 'server'],
});
if (rollbackImpact.status !== 'ready') {
  throw new Error(
    `Golden G4 V6 rollback Impact failed: ${rollbackImpact.message}`
  );
}
const rollbackPlanResult = createGoldenG3V4Plan({
  impactSet: rollbackImpact.impactSet,
});
if (
  rollbackPlanResult.status !== 'ready' ||
  rollbackPlanResult.plan.status !== 'ready'
) {
  throw new Error('Golden G4 V6 rollback VerificationPlan is blocked.');
}
export const GOLDEN_G4_V6_ROLLBACK_FLOW = createGoldenG4V6VerificationFlow({
  label: 'rollback',
  projection: GOLDEN_G4_V5_PROJECTION,
  approval: createGoldenG4V5ApprovalContext(),
  mutationReceipt: GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED.receipt,
  plan: rollbackPlanResult.plan,
  regressionRequirements:
    GOLDEN_G4_V6_REPAIR_PREPARATION.counterexamples.requirements,
  executionStartedAt: GOLDEN_G4_V6_TIME.rollbackExecution,
  closureEvaluationInstant: GOLDEN_G4_V6_TIME.rollbackClosure,
  boundAt: GOLDEN_G4_V6_TIME.rollbackExecution,
});
