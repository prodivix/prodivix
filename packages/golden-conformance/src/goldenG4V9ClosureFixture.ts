import {
  AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS,
  AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS,
  cancelAgentRun,
  createAgentAuditExport,
  createAgentG4GoldenClosureManifest,
  createAgentProductView,
  createAgentRunControl,
  createAgentRunSnapshot,
  decodeAgentProductView,
  digestAgentCanonicalValue,
  encodeAgentProductView,
  finalizeAgentRun,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  recordFencedAgentCallback,
  recoverAgentRun,
  reduceAgentRun,
  startAgentRun,
  transitionAgentRunPhase,
  type AgentControlEvent,
  type AgentG4GoldenClosureManifest,
  type AgentG4NegativeCaseId,
  type AgentG4RecoveryCaseId,
  type AgentRecoveryPosition,
  type AgentRunSnapshot,
  type AgentRunSuccessProof,
  type AgentRunTransitionResult,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceAgentApplySuccessProof,
  createWorkspaceAgentProductSupplement,
  createWorkspaceAgentProposalProjection,
  prepareWorkspaceAgentCommit,
  prepareWorkspaceAgentRepairRound,
  prepareWorkspaceAgentRollback,
  reconcileWorkspaceAgentCommit,
} from '@prodivix/workspace-sync';
import {
  createGoldenG3V8ClosureInput,
  executeGoldenG3V8Closure,
  type GoldenG3V8ClosureHarness,
  type GoldenG3V8ExecutionClock,
} from './goldenG3V8ClosureFixture';
import { createGoldenG3V8Plan } from './goldenG3V8PlanFixture';
import type { VerificationPlanResult } from '@prodivix/verification';
import {
  GOLDEN_G3_V6_MATRIX_GROUPS,
  GOLDEN_G3_V6_SCENARIOS,
} from './goldenG3V6AdapterMatrixFixture';
import {
  bindGoldenG4VerificationFlow,
  GOLDEN_G4_V6_FAILED_FLOW,
  GOLDEN_G4_V6_FAILURE_CONTEXT_PACK,
  GOLDEN_G4_V6_PRODUCER,
  GOLDEN_G4_V6_REPAIR_APPROVAL,
  GOLDEN_G4_V6_REPAIR_PREPARATION,
  GOLDEN_G4_V6_REPAIRING_RUN,
  type GoldenG4V6VerificationFlow,
} from './goldenG4V6VerificationRepairFixture';
import {
  cloneWorkspaceWithRevisionDrift,
  createGoldenG4V5ApprovalContext,
  createGoldenG4V5CommitResponse,
  GOLDEN_G4_V5_BASE_WORKSPACE,
  GOLDEN_G4_V5_GRANT,
  GOLDEN_G4_V5_POLICY,
  GOLDEN_G4_V5_PROPOSAL,
  GOLDEN_G4_V5_RUN,
  GOLDEN_G4_V5_TASK,
  GOLDEN_G4_V5_TIME,
} from './goldenG4V5ProposalApprovalFixture';
import {
  GOLDEN_G4_V7_CONTEXT,
  GOLDEN_G4_V7_SUPPLEMENT,
} from './goldenG4V7ProductFixture';
import {
  GOLDEN_G4_V8_EVALUATION_MATRIX,
  createGoldenG4V8NativeNormalization,
  createGoldenG4V8SecurityMatrix,
} from './goldenG4V8SecurityModelEvalFixture';
import {
  GOLDEN_G4_V4_TIME,
  createGoldenG4V4RecoveryState,
  goldenG4V4Command,
} from './goldenG4V4ControlPlaneFixture';

export const GOLDEN_G4_V9_TIME = Object.freeze({
  committing: '2026-08-01T12:00:06.500Z',
  verifying: '2026-08-01T12:00:08.000Z',
  verificationStart: '2026-08-01T12:10:00.000Z',
  promotion: '2026-08-01T12:13:00.000Z',
  closure: '2026-08-01T12:14:00.000Z',
  terminal: '2026-08-01T12:14:01.000Z',
  audit: '2026-08-01T12:14:02.000Z',
  projected: '2026-08-01T12:14:03.000Z',
  gate: '2026-08-01T12:14:30.000Z',
  completed: '2026-08-01T12:15:00.000Z',
});

export const GOLDEN_G4_V9_CLOCK: GoldenG3V8ExecutionClock = Object.freeze({
  attemptBase: GOLDEN_G4_V9_TIME.verificationStart,
  promotionInstant: GOLDEN_G4_V9_TIME.promotion,
  closureInstant: GOLDEN_G4_V9_TIME.closure,
  promotionDeadline: '2026-08-01T12:19:00.000Z',
  evidenceExpiry: '2026-08-02T12:00:00.000Z',
});

const digest = (value: unknown): string =>
  digestAgentCanonicalValue({ golden: 'g4-v9', value });

const withDigest = <T extends object, K extends string>(
  value: T,
  key: K
): T & Readonly<Record<K, string>> =>
  Object.freeze({ ...value, [key]: digestAgentCanonicalValue(value) }) as T &
    Readonly<Record<K, string>>;

const matrixRiskFlags = Object.freeze(
  GOLDEN_G3_V6_MATRIX_GROUPS.map(({ riskFlag }) => riskFlag).sort(
    compareUnicodeCodePoints
  )
);

const matrixImpactContribution = Object.freeze({
  contributorId: 'golden:g4-v9:authenticated-catalog-matrix',
  completeness: 'complete' as const,
  impactedScenarioIds: Object.freeze(
    GOLDEN_G3_V6_SCENARIOS.map(({ id }) => id).sort(compareUnicodeCodePoints)
  ),
  frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
  riskFlags: matrixRiskFlags,
});

const projectionResult = createWorkspaceAgentProposalProjection({
  workspace: GOLDEN_G4_V5_BASE_WORKSPACE,
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V5_RUN,
  proposal: GOLDEN_G4_V5_PROPOSAL,
  grant: GOLDEN_G4_V5_GRANT,
  policy: GOLDEN_G4_V5_POLICY,
  transactionId: 'transaction.golden.g4-v9.catalog',
  reverseTransactionId: 'transaction.golden.g4-v9.catalog.reverse',
  issuedAt: GOLDEN_G4_V5_TIME.plan,
  previewId: 'preview.golden.g4-v9.catalog',
  plannedAt: GOLDEN_G4_V5_TIME.plan,
  expiresAt: GOLDEN_G4_V5_TIME.expiry,
  frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
  runtimeZones: Object.freeze(['browser', 'client', 'server']),
  verificationImpactContributions: Object.freeze([matrixImpactContribution]),
  verificationPlanner: (impactSet): VerificationPlanResult =>
    createGoldenG3V8Plan({ impactSet }),
});
if (projectionResult.status !== 'ready') {
  throw new Error(
    `Golden G4 V9 projection failed: ${projectionResult.issues
      .map(({ message }) => message)
      .join('; ')}`
  );
}
export const GOLDEN_G4_V9_PROJECTION = projectionResult.projection;
if (GOLDEN_G4_V9_PROJECTION.verificationPlan.cells.length !== 66) {
  throw new Error('Golden G4 V9 exact proposal plan must contain 66 cells.');
}

export const GOLDEN_G4_V9_APPROVAL = createGoldenG4V5ApprovalContext(
  GOLDEN_G4_V9_PROJECTION
);

const preparedCommit = prepareWorkspaceAgentCommit({
  projection: GOLDEN_G4_V9_PROJECTION,
  approval: GOLDEN_G4_V9_APPROVAL,
  currentSnapshot: GOLDEN_G4_V5_BASE_WORKSPACE,
  producer: GOLDEN_G4_V6_PRODUCER,
  receiptId: 'receipt.golden.g4-v9.commit.started',
  startedAt: GOLDEN_G4_V5_TIME.commit,
  now: Date.parse(GOLDEN_G4_V5_TIME.commit),
});
if (preparedCommit.status !== 'ready') {
  throw new Error('Golden G4 V9 exact approval could not prepare Commit.');
}
const acknowledgedCommit = reconcileWorkspaceAgentCommit({
  outboxEntry: preparedCommit.outboxEntry,
  startedReceipt: preparedCommit.receipt,
  response: createGoldenG4V5CommitResponse(GOLDEN_G4_V9_PROJECTION),
  receiptId: 'receipt.golden.g4-v9.commit.ack',
  completedAt: GOLDEN_G4_V5_TIME.ack,
});
if (acknowledgedCommit.status !== 'acknowledged') {
  throw new Error('Golden G4 V9 Commit ACK did not reconcile.');
}
export const GOLDEN_G4_V9_COMMIT = acknowledgedCommit;

const recoveryCommand = (caseId: string, suffix: string) =>
  goldenG4V4Command(
    `event.golden.g4-v9.${caseId}.${suffix}`,
    `idempotency.golden.g4-v9.${caseId}.${suffix}`,
    GOLDEN_G4_V4_TIME.recovery
  );

const recoverPosition = (
  caseId: AgentG4RecoveryCaseId,
  position: AgentRecoveryPosition
) => {
  const fixture = createGoldenG4V4RecoveryState(position);
  const previousGeneration = fixture.state.run.generation;
  const recovered = recoverAgentRun(fixture.task, fixture.state, {
    position,
    attemptId: `attempt.golden.g4-v9.${caseId}.2`,
    eventIdPrefix: `event.golden.g4-v9.${caseId}.recovery`,
    idempotencyKeyPrefix: `idempotency.golden.g4-v9.${caseId}.recovery`,
    occurredAt: GOLDEN_G4_V4_TIME.recovery,
    producer: recoveryCommand(caseId, 'producer').producer,
  });
  if (!recovered.recovered) {
    throw new Error(`Golden G4 V9 recovery ${caseId} was rejected.`);
  }
  const late = recordFencedAgentCallback(fixture.task, recovered.state, {
    ...recoveryCommand(caseId, 'late'),
    occurredAt: GOLDEN_G4_V4_TIME.callback,
    callbackGeneration: previousGeneration,
    reason: 'golden-g4-v9-generation-fenced',
  });
  if (
    !late.accepted ||
    recovered.state.run.generation !== previousGeneration + 1
  ) {
    throw new Error(
      `Golden G4 V9 recovery ${caseId} did not fence generation.`
    );
  }
  return withDigest(
    {
      caseId,
      evidenceDigest: digest({
        receipt: recovered.receipt,
        recoveredSnapshotDigest: recovered.state.snapshotDigest,
        lateEventDigest: late.event.eventDigest,
      }),
      outcome: 'reconciled' as const,
      sideEffectCount: 1 as const,
      generationFenced: true as const,
      workspaceUnchanged: true as const,
      auditRecorded: true as const,
    },
    'verdictDigest'
  );
};

const createRecoveryVerdicts = () => {
  const positional = [
    ['awaiting-approval-restart', 'awaiting-approval'],
    ['commit-ack-restart', 'commit-ack'],
    ['model-stream-restart', 'model-stream'],
    ['tool-execute-restart', 'tool-execute'],
    ['verification-restart', 'verification'],
  ] as const;
  const verdicts = positional.map(([caseId, position]) =>
    recoverPosition(caseId, position)
  );

  const cancellation = createGoldenG4V4RecoveryState('tool-execute');
  const cancelled = cancelAgentRun(cancellation.task, cancellation.state, {
    ...recoveryCommand('cancel-late-callback', 'cancel'),
    reason: 'operator-requested',
  });
  if (!cancelled.accepted) {
    throw new Error('Golden G4 V9 cancellation was rejected.');
  }
  const cancelledLate = recordFencedAgentCallback(
    cancellation.task,
    cancelled.state,
    {
      ...recoveryCommand('cancel-late-callback', 'late'),
      occurredAt: GOLDEN_G4_V4_TIME.callback,
      callbackGeneration: cancellation.state.run.generation,
      reason: 'cancel-fenced',
    }
  );
  if (!cancelledLate.accepted) {
    throw new Error('Golden G4 V9 cancelled callback was not audited.');
  }
  verdicts.push(
    withDigest(
      {
        caseId: 'cancel-late-callback' as const,
        evidenceDigest: digest({
          cancelled: cancelled.event.eventDigest,
          fenced: cancelledLate.event.eventDigest,
        }),
        outcome: 'reconciled' as const,
        sideEffectCount: 1 as const,
        generationFenced: true as const,
        workspaceUnchanged: true as const,
        auditRecorded: true as const,
      },
      'verdictDigest'
    )
  );

  const duplicateFixture = createGoldenG4V4RecoveryState('commit-ack');
  const duplicateRecovery = recoverAgentRun(
    duplicateFixture.task,
    duplicateFixture.state,
    {
      position: 'commit-ack',
      attemptId: 'attempt.golden.g4-v9.duplicate.2',
      eventIdPrefix: 'event.golden.g4-v9.duplicate.recovery',
      idempotencyKeyPrefix: 'idempotency.golden.g4-v9.duplicate.recovery',
      occurredAt: GOLDEN_G4_V4_TIME.recovery,
      producer: recoveryCommand('duplicate-request', 'producer').producer,
    }
  );
  if (!duplicateRecovery.recovered) {
    throw new Error('Golden G4 V9 duplicate recovery setup failed.');
  }
  let replayState = duplicateRecovery.state;
  for (const event of duplicateRecovery.events) {
    const replayed = reduceAgentRun(duplicateFixture.task, replayState, event);
    if (!replayed.accepted || !replayed.replayed) {
      throw new Error('Golden G4 V9 duplicate delivery was not idempotent.');
    }
    replayState = replayed.state;
  }
  verdicts.push(
    withDigest(
      {
        caseId: 'duplicate-request' as const,
        evidenceDigest: digest({
          eventDigests: duplicateRecovery.events.map(
            ({ eventDigest }) => eventDigest
          ),
          replaySnapshotDigest: replayState.snapshotDigest,
        }),
        outcome: 'reconciled' as const,
        sideEffectCount: 1 as const,
        generationFenced: true as const,
        workspaceUnchanged: true as const,
        auditRecorded: true as const,
      },
      'verdictDigest'
    )
  );

  verdicts.push(recoverPosition('late-background-callback', 'tool-execute'));
  return Object.freeze(verdicts);
};

const acceptControl = (
  result: AgentRunTransitionResult
): Extract<AgentRunTransitionResult, { accepted: true }> => {
  if (!result.accepted) throw new Error('Golden G4 V9 Run event was rejected.');
  return result;
};

export const createGoldenG4V9TerminalRun = (
  successProof: AgentRunSuccessProof
): Readonly<{
  run: AgentRunSnapshot;
  events: readonly AgentControlEvent[];
}> => {
  const events: AgentControlEvent[] = [];
  const apply = (result: AgentRunTransitionResult) => {
    const accepted = acceptControl(result);
    events.push(accepted.event);
    return accepted.state;
  };
  let run = apply(
    createAgentRunControl(GOLDEN_G4_V5_TASK, {
      runId: GOLDEN_G4_V5_RUN.run.runId,
      command: goldenG4V4Command(
        'event.golden.g4-v9.created',
        'idempotency.golden.g4-v9.created',
        GOLDEN_G4_V5_TIME.run
      ),
    })
  );
  run = apply(
    startAgentRun(GOLDEN_G4_V5_TASK, run, {
      ...goldenG4V4Command(
        'event.golden.g4-v9.started',
        'idempotency.golden.g4-v9.started',
        GOLDEN_G4_V5_TIME.start
      ),
      attemptId: 'attempt.golden.g4-v9.1',
    })
  );
  for (const [phase, occurredAt] of [
    ['running', GOLDEN_G4_V5_TIME.running],
    ['awaiting-approval', '2026-08-01T12:00:04.500Z'],
    ['committing', GOLDEN_G4_V9_TIME.committing],
    ['verifying', GOLDEN_G4_V9_TIME.verifying],
  ] as const) {
    run = apply(
      transitionAgentRunPhase(GOLDEN_G4_V5_TASK, run, {
        ...goldenG4V4Command(
          `event.golden.g4-v9.${phase}`,
          `idempotency.golden.g4-v9.${phase}`,
          occurredAt
        ),
        phase,
      })
    );
    if (phase === 'running') {
      const { snapshotDigest: _snapshotDigest, ...runWithoutDigest } = run;
      run = createAgentRunSnapshot({
        ...runWithoutDigest,
        run: Object.freeze({
          ...run.run,
          contextPackDigest: GOLDEN_G4_V7_CONTEXT.manifestDigest,
        }),
      });
    }
  }
  run = apply(
    finalizeAgentRun(GOLDEN_G4_V5_TASK, run, {
      ...goldenG4V4Command(
        'event.golden.g4-v9.terminal',
        'idempotency.golden.g4-v9.terminal',
        GOLDEN_G4_V9_TIME.terminal
      ),
      outcome: 'succeeded',
      successProof,
    })
  );
  return Object.freeze({ run, events: Object.freeze(events) });
};

const corpusFamilyEvidence = (familyId: string): string => {
  const cases = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.filter(
    (candidate) => candidate.familyId === familyId
  );
  if (cases.length < 1) {
    throw new Error(`Golden G4 V9 corpus family ${familyId} is missing.`);
  }
  return digest(cases);
};

const byteLength = (value: unknown): number =>
  new TextEncoder().encode(canonicalJsonText(value)).byteLength;

export type GoldenG4V9ClosureHarness = Readonly<{
  manifest: AgentG4GoldenClosureManifest;
  g3: GoldenG3V8ClosureHarness;
  verificationFlow: GoldenG4V6VerificationFlow;
  committedWorkspace: WorkspaceSnapshot;
  webView: ReturnType<typeof createAgentProductView>;
  cliView: ReturnType<typeof createAgentProductView>;
}>;

export const executeGoldenG4V9Closure = async (
  options: Readonly<{
    repositoryCommit?: string;
    worktreeState?: 'clean' | 'dirty';
  }> = {}
): Promise<GoldenG4V9ClosureHarness> => {
  const environmentCommit = process.env.PRODIVIX_G4_REPOSITORY_COMMIT?.trim();
  const repositoryCommit =
    options.repositoryCommit ??
    (environmentCommit && /^[a-f0-9]{40}$/u.test(environmentCommit)
      ? environmentCommit
      : '9'.repeat(40));
  const environmentWorktreeState =
    process.env.PRODIVIX_G4_WORKTREE_STATE?.trim();
  const worktreeState =
    options.worktreeState ??
    (environmentWorktreeState === 'clean' ? 'clean' : 'dirty');
  const plan = GOLDEN_G4_V9_PROJECTION.verificationPlan;
  const g3 = await executeGoldenG3V8Closure({
    plan,
    lockedPlanDigest: plan.planDigest,
    clock: GOLDEN_G4_V9_CLOCK,
  });
  const closureInput = createGoldenG3V8ClosureInput(
    g3.evidence,
    Object.freeze({
      view: g3.verifiedView,
      revokedEvidenceIds: Object.freeze([]),
    }),
    plan
  );
  const verificationFlow = bindGoldenG4VerificationFlow({
    label: 'g4-v9.authenticated-catalog',
    projection: GOLDEN_G4_V9_PROJECTION,
    approval: GOLDEN_G4_V9_APPROVAL,
    mutationReceipt: GOLDEN_G4_V9_COMMIT.receipt,
    plan,
    evidence: g3.evidence,
    verifiedView: g3.verifiedView,
    closureInput,
    executionStartedAt: GOLDEN_G4_V9_TIME.verificationStart,
    closureEvaluationInstant: GOLDEN_G4_V9_TIME.closure,
  });
  if (verificationFlow.closure.closureDigest !== g3.closure.closureDigest) {
    throw new Error('Golden G4 V9 Agent and G3 Closure identities drifted.');
  }
  const success = createWorkspaceAgentApplySuccessProof({
    projection: GOLDEN_G4_V9_PROJECTION,
    approval: GOLDEN_G4_V9_APPROVAL,
    mutationReceipt: GOLDEN_G4_V9_COMMIT.receipt,
    binding: verificationFlow.binding,
    closureReceipt: verificationFlow.closureReceipt,
  });
  if (success.status !== 'ready') {
    throw new Error('Golden G4 V9 satisfied Closure has no success proof.');
  }
  const terminal = createGoldenG4V9TerminalRun(success.value);
  const audit = createAgentAuditExport(
    terminal.events,
    GOLDEN_G4_V9_TIME.audit
  );
  const supplement = createWorkspaceAgentProductSupplement({
    supplementId: 'supplement.golden.g4-v9.catalog',
    task: GOLDEN_G4_V5_TASK,
    run: terminal.run,
    context: GOLDEN_G4_V7_CONTEXT,
    proposalProjection: GOLDEN_G4_V9_PROJECTION,
    rollbackAuthorization: 'on-unsatisfied-closure',
    runtime: Object.freeze({
      ...GOLDEN_G4_V7_SUPPLEMENT.runtime,
      budgetLedgerDigest: terminal.run.budgetLedger.ledgerDigest,
    }),
    diagnostics: Object.freeze([]),
    producerId: 'service.golden.g4-v9.product-projector',
    projectedAt: GOLDEN_G4_V9_TIME.projected,
  });
  const ledger = Object.freeze({
    task: GOLDEN_G4_V5_TASK,
    run: terminal.run,
    events: terminal.events,
    proposal: GOLDEN_G4_V5_PROPOSAL,
    planning: GOLDEN_G4_V9_PROJECTION.planning,
    preview: GOLDEN_G4_V9_PROJECTION.preview,
    approval: GOLDEN_G4_V9_APPROVAL.decision,
    mutations: Object.freeze([GOLDEN_G4_V9_COMMIT.receipt]),
    verificationBindings: Object.freeze([verificationFlow.binding]),
    verificationClosures: Object.freeze([verificationFlow.closureReceipt]),
    repairRounds: Object.freeze([]),
    supplement,
    commands: Object.freeze([]),
    audit,
    currentRevision: createAgentWorkspaceRevisionFromSnapshot(
      GOLDEN_G4_V9_COMMIT.snapshot
    ),
    actorAuthorized: true,
  });
  const webView = createAgentProductView(ledger);
  const cliDecoded = decodeAgentProductView(encodeAgentProductView(webView));
  if (!cliDecoded.ok) {
    throw new Error(
      'Golden G4 V9 CLI could not decode the strict product view.'
    );
  }
  const cliView = cliDecoded.value;

  const staleApproval = prepareWorkspaceAgentCommit({
    projection: GOLDEN_G4_V9_PROJECTION,
    approval: GOLDEN_G4_V9_APPROVAL,
    currentSnapshot: cloneWorkspaceWithRevisionDrift(
      GOLDEN_G4_V5_BASE_WORKSPACE
    ),
    producer: GOLDEN_G4_V6_PRODUCER,
    receiptId: 'receipt.golden.g4-v9.stale',
    startedAt: GOLDEN_G4_V5_TIME.commit,
    now: Date.parse(GOLDEN_G4_V5_TIME.commit),
  });
  const permissionEscalation = prepareWorkspaceAgentCommit({
    projection: GOLDEN_G4_V9_PROJECTION,
    approval: Object.freeze({
      ...GOLDEN_G4_V9_APPROVAL,
      actorAuthorized: false,
    }),
    currentSnapshot: GOLDEN_G4_V5_BASE_WORKSPACE,
    producer: GOLDEN_G4_V6_PRODUCER,
    receiptId: 'receipt.golden.g4-v9.permission',
    startedAt: GOLDEN_G4_V5_TIME.commit,
    now: Date.parse(GOLDEN_G4_V5_TIME.commit),
  });
  const rollbackConflict = prepareWorkspaceAgentRollback({
    projection: GOLDEN_G4_V9_PROJECTION,
    approval: GOLDEN_G4_V9_APPROVAL,
    commitReceipt: GOLDEN_G4_V9_COMMIT.receipt,
    currentSnapshot: GOLDEN_G4_V9_COMMIT.snapshot,
    rollbackPreflight: Object.freeze({
      trigger: 'unsatisfied-closure' as const,
      actorAuthorized: true,
      hasInterveningAuthoring: true,
      hasExternalSideEffects: false,
      at: GOLDEN_G4_V9_TIME.closure,
    }),
    producer: GOLDEN_G4_V6_PRODUCER,
    receiptId: 'receipt.golden.g4-v9.rollback-conflict',
    startedAt: GOLDEN_G4_V9_TIME.closure,
    now: Date.parse(GOLDEN_G4_V9_TIME.closure),
  });
  const failedRepair = prepareWorkspaceAgentRepairRound({
    task: GOLDEN_G4_V5_TASK,
    run: GOLDEN_G4_V6_REPAIRING_RUN,
    policy: GOLDEN_G4_V6_REPAIR_APPROVAL.policy,
    failedClosureReceipt: GOLDEN_G4_V6_FAILED_FLOW.closureReceipt,
    failedClosure: GOLDEN_G4_V6_FAILED_FLOW.closure,
    failedPlan: GOLDEN_G4_V6_FAILED_FLOW.plan,
    failedEvidence: GOLDEN_G4_V6_FAILED_FLOW.evidence,
    failureContextPack: GOLDEN_G4_V6_FAILURE_CONTEXT_PACK,
    previousRepairReceipts: Object.freeze([
      GOLDEN_G4_V6_REPAIR_PREPARATION.receipt,
    ]),
    receiptId: 'receipt.golden.g4-v9.repair-exhausted',
    repairRoundId: 'repair-round.golden.g4-v9.2',
    producer: GOLDEN_G4_V6_PRODUCER,
    recordedAt: GOLDEN_G4_V9_TIME.closure,
  });
  const security = createGoldenG4V8SecurityMatrix();
  if (
    staleApproval.status !== 'stale' ||
    permissionEscalation.status !== 'rejected' ||
    rollbackConflict.status !== 'blocked' ||
    failedRepair.status !== 'ready' ||
    failedRepair.value.receipt.state !== 'blocked' ||
    security.privateTargetEgress.allowed ||
    security.leakedArtifactFindings.length !== 2
  ) {
    throw new Error('Golden G4 V9 negative preconditions did not fail closed.');
  }

  const negativeSources: Readonly<Record<AgentG4NegativeCaseId, unknown>> =
    Object.freeze({
      'budget-exhaustion': failedRepair.value.receipt,
      'cherry-picked-evaluation': Object.freeze({
        publicCorpusDigest: GOLDEN_G4_V8_EVALUATION_MATRIX.publicCorpusDigest,
        protectedHoldoutManifestDigest:
          GOLDEN_G4_V8_EVALUATION_MATRIX.protectedHoldoutManifestDigest,
      }),
      'computer-use-authoring': corpusFamilyEvidence(
        'adversarial.computer-authoring'
      ),
      'cross-modal-injection': corpusFamilyEvidence(
        'adversarial.cross-modal-injection'
      ),
      'failed-closure': GOLDEN_G4_V6_FAILED_FLOW.closure,
      'failed-repair': failedRepair.value.receipt,
      'fake-evidence': Object.freeze({
        corpus: corpusFamilyEvidence('adversarial.fake-evidence'),
        failed: g3.negativeEvidence.failed.manifestDigest,
        blocked: g3.negativeEvidence.blocked.manifestDigest,
      }),
      'hidden-tool-effect': corpusFamilyEvidence(
        'adversarial.hidden-tool-state'
      ),
      'holdout-leak': security.leakedArtifactFindings.filter(
        ({ category }) => category === 'holdout-leak'
      ),
      'permission-escalation': permissionEscalation,
      'provider-state-memory': corpusFamilyEvidence(
        'adversarial.provider-state-pollution'
      ),
      'rollback-conflict': rollbackConflict,
      'secret-leak': security.leakedArtifactFindings.filter(
        ({ category }) => category === 'secret-canary'
      ),
      'stale-approval': staleApproval,
      'text-injection': Object.freeze({
        corpus: corpusFamilyEvidence('adversarial.text-injection'),
        signals: security.injectionSignals,
      }),
    });
  const diagnosticByCase: Readonly<Record<AgentG4NegativeCaseId, string>> =
    Object.freeze({
      'budget-exhaustion': 'AI-6002',
      'cherry-picked-evaluation': 'AI-8010',
      'computer-use-authoring': 'AI-7014',
      'cross-modal-injection': 'AI-7010',
      'failed-closure': 'AI-6011',
      'failed-repair': 'AI-6002',
      'fake-evidence': 'AI-8011',
      'hidden-tool-effect': 'AI-7012',
      'holdout-leak': 'AI-8011',
      'permission-escalation': 'AI-7001',
      'provider-state-memory': 'AI-6013',
      'rollback-conflict': 'AI-7005',
      'secret-leak': 'AI-7003',
      'stale-approval': 'AI-7005',
      'text-injection': 'AI-7002',
    });
  const negativeVerdicts = AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS.map((caseId) =>
    withDigest(
      {
        caseId,
        evidenceDigest: digest(negativeSources[caseId]),
        outcome:
          caseId === 'provider-state-memory' || caseId === 'hidden-tool-effect'
            ? ('fenced' as const)
            : ('blocked' as const),
        diagnosticCode: diagnosticByCase[caseId],
        workspaceUnchanged: true as const,
        authorityUnexpanded: true as const,
        auditRecorded: true as const,
        sensitiveDataAbsent: true as const,
        failurePreserved: true as const,
      },
      'verdictDigest'
    )
  );
  const recoveryVerdicts = createRecoveryVerdicts();
  const journey = withDigest(
    {
      projectId: GOLDEN_G4_V5_TASK.spec.projectId,
      workspaceId: GOLDEN_G4_V5_TASK.spec.workspaceId,
      baseRevisionDigest: digestAgentCanonicalValue(
        GOLDEN_G4_V5_TASK.spec.baseRevision
      ),
      targetRevisionDigest: digestAgentCanonicalValue(
        createAgentWorkspaceRevisionFromSnapshot(GOLDEN_G4_V9_COMMIT.snapshot)
      ),
      taskDigest: GOLDEN_G4_V5_TASK.taskDigest,
      runDigest: terminal.run.snapshotDigest,
      contextPackDigest: GOLDEN_G4_V7_CONTEXT.manifestDigest,
      proposalDigest: GOLDEN_G4_V5_PROPOSAL.proposalDigest,
      previewDigest: GOLDEN_G4_V9_PROJECTION.preview.previewDigest,
      approvalDigest: digestAgentCanonicalValue(GOLDEN_G4_V9_APPROVAL.decision),
      transactionDigest: GOLDEN_G4_V9_PROJECTION.planning.transactionDigest,
      reverseTransactionDigest:
        GOLDEN_G4_V9_PROJECTION.planning.reverseTransactionDigest,
      commitReceiptDigest: GOLDEN_G4_V9_COMMIT.receipt.receiptDigest,
      verificationPlanDigest: plan.planDigest,
      verificationEvidenceSetDigest: g3.closure.evidenceSetDigest,
      verificationClosureDigest: verificationFlow.closureReceipt.closureDigest,
      auditDigest: audit.exportDigest,
      productViewDigest: webView.viewDigest,
    },
    'journeyDigest'
  );
  const verification = withDigest(
    {
      planDigest: plan.planDigest,
      g3ClosureManifestDigest: g3.manifest.manifestDigest,
      matrixEvidenceDigest: g3.manifest.matrixEvidenceDigest,
      evidenceSetDigest: g3.closure.evidenceSetDigest,
      closureDigest: g3.closure.closureDigest,
      requiredCellCount: 66 as const,
      totalAttemptCount: g3.matrix.totalAttemptCount,
      evidenceCount: 66 as const,
      frameworkTargets: Object.freeze(['react-vite', 'vue-vite'] as const),
      surfaces: Object.freeze(['ci', 'export', 'preview'] as const),
      closureVerdict: 'satisfied' as const,
    },
    'summaryDigest'
  );
  const productParity = withDigest(
    {
      webViewDigest: webView.viewDigest,
      cliViewDigest: cliView.viewDigest,
      auditEventCount: audit.eventCount,
      auditHeadDigest: audit.chainHeadDigest,
      sanitizedAuditDigest: audit.exportDigest,
      parity: 'exact' as const,
    },
    'summaryDigest'
  );
  const normalizedProviders = createGoldenG4V8NativeNormalization();
  const gateSource: Readonly<Record<string, unknown>> = Object.freeze({
    'verify:g4:boundaries': matrixImpactContribution,
    'verify:g4:context-policy': GOLDEN_G4_V7_CONTEXT,
    'verify:g4:provider-capabilities': normalizedProviders,
    'verify:g4:multimodal': Object.freeze({
      mediaSentinelCaseIds: GOLDEN_G4_V8_EVALUATION_MATRIX.mediaSentinelCaseIds,
    }),
    'verify:g4:hosted-capabilities': security.authorizedEgress,
    'verify:g4:control-plane': recoveryVerdicts,
    'verify:g4:proposal-approval': GOLDEN_G4_V9_PROJECTION.preview,
    'verify:g4:verification': g3.manifest,
    'verify:g4:product': productParity,
    'verify:g4:security': security,
    'verify:g4:model-eval:contract': GOLDEN_G4_V8_EVALUATION_MATRIX,
  });
  const durableGithubEvidence =
    process.env.PRODIVIX_G4_DETERMINISTIC_GATE_EVIDENCE === 'github-actions';
  const githubRunId = process.env.GITHUB_RUN_ID?.trim();
  const githubJobId = process.env.GITHUB_JOB?.trim();
  if (
    durableGithubEvidence &&
    (!githubRunId || !/^[1-9][0-9]*$/u.test(githubRunId) || !githubJobId)
  ) {
    throw new TypeError(
      'Durable G4 Gate evidence requires exact GitHub run and job identities.'
    );
  }
  const deterministicGateEvidence =
    AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS.map((gateId) =>
      withDigest(
        {
          gateId,
          command: `pnpm run ${gateId}`,
          repositoryCommit,
          executionMode: durableGithubEvidence
            ? ('github-actions' as const)
            : ('local' as const),
          ...(durableGithubEvidence
            ? { runId: githubRunId!, jobId: githubJobId! }
            : {}),
          status: 'passed' as const,
          remoteModelUnits: 0 as const,
          evidenceDigest: digest(gateSource[gateId]),
          completedAt: GOLDEN_G4_V9_TIME.gate,
        },
        'refDigest'
      )
    );
  const evaluationPlanDigest = digestAgentCanonicalValue(
    GOLDEN_G4_V8_EVALUATION_MATRIX
  );
  const modelEvaluation = withDigest(
    {
      status: 'pending' as const,
      planDigest: evaluationPlanDigest,
      requiredAttemptCount: 11_640 as const,
      actualAttemptCount: 0 as const,
      requiredProtocolFamilies: AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
      requiredCapabilityProfileIds: AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
    },
    'summaryDigest'
  );
  const artifactValues = Object.freeze([
    Object.freeze({ id: 'artifact.g4-v9.audit', value: audit }),
    Object.freeze({ id: 'artifact.g4-v9.g3-closure', value: g3.manifest }),
    Object.freeze({ id: 'artifact.g4-v9.product-view', value: webView }),
  ]);
  const artifacts = artifactValues.map(({ id, value }) =>
    withDigest(
      {
        artifactId: id,
        digest: digestAgentCanonicalValue(value),
        size: byteLength(value),
        mediaType: 'application/json',
        availability: 'available' as const,
      },
      'artifactDigest'
    )
  );
  const manifest = createAgentG4GoldenClosureManifest({
    manifestId: 'manifest.golden.g4-v9.authenticated-catalog',
    targetId: 'authenticated-catalog',
    repositoryCommit,
    worktreeState,
    journey,
    verification,
    recoveryVerdicts,
    negativeVerdicts,
    productParity,
    deterministicGateEvidence,
    modelEvaluation,
    artifacts,
    completedAt: GOLDEN_G4_V9_TIME.completed,
  });
  return Object.freeze({
    manifest,
    g3,
    verificationFlow,
    committedWorkspace: GOLDEN_G4_V9_COMMIT.snapshot,
    webView,
    cliView,
  });
};
