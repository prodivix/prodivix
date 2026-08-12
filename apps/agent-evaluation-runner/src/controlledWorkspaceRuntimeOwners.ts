import {
  createAgentActionProposal,
  createAgentRunControl,
  createAgentRunSnapshot,
  createAgentTaskRecord,
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  digestAgentPolicy,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  sameAgentWorkspaceRevision,
  startAgentRun,
  transitionAgentRunPhase,
  type AgentBudget,
  type AgentCapabilityGrant,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentJsonValue,
  type AgentPolicy,
  type AgentRunSnapshot,
  type AgentTaskRecord,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationImpactSet,
  createVerificationPlan,
  digestVerificationValue,
  evaluateVerificationClosure,
  uniqueVerificationText,
  type EvaluateVerificationClosureInput,
  type VerificationAdapterRegistration,
  type VerificationCheckDefinition,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationEvidenceVerifiedView,
  type VerificationImpactContribution,
  type VerificationImpactSet,
  type VerificationPartitionRevisions,
  type VerificationPlan,
  type VerificationPolicy,
  type VerificationScenarioDescriptor,
} from '@prodivix/verification';
import {
  WORKSPACE_AGENT_ACTION_REGISTRY,
  applyWorkspaceTransaction,
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceAgentActionTransactionPlan,
  validateWorkspaceSnapshot,
  type WorkspaceAgentActionTransactionPlan,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';

const ownerReceiptFormat =
  'prodivix.agent-evaluation-controlled-workspace-owner-receipt' as const;
const maximumOwnerReceiptDigests = 128;

export class AgentEvaluationControlledWorkspaceOwnerError extends Error {
  readonly code:
    | 'G4_CONTROLLED_WORKSPACE_G3_AUTHORITY_INVALID'
    | 'G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID';

  constructor(
    code:
      | 'G4_CONTROLLED_WORKSPACE_G3_AUTHORITY_INVALID'
      | 'G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID'
  ) {
    super(code);
    this.name = 'AgentEvaluationControlledWorkspaceOwnerError';
    this.code = code;
  }
}

const ownerFail = (
  code:
    | 'G4_CONTROLLED_WORKSPACE_G3_AUTHORITY_INVALID'
    | 'G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID'
): never => {
  throw new AgentEvaluationControlledWorkspaceOwnerError(code);
};

const canonicalDigests = (
  values: readonly CanonicalDigest[]
): readonly CanonicalDigest[] => {
  if (
    values.length > maximumOwnerReceiptDigests ||
    values.some((value) => !isAgentCanonicalDigest(value)) ||
    new Set(values).size !== values.length
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const instantAt = (issuedAt: string, offsetMs: number): string => {
  const instant = Date.parse(issuedAt);
  if (!Number.isFinite(instant)) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  return new Date(instant + offsetMs).toISOString();
};

const planningBudget: AgentBudget = Object.freeze({
  usageLimits: Object.freeze([]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 1,
  maxToolCalls: 4,
  maxRepairRounds: 2,
  maxTransactions: 1,
  maxArtifactBytes: 8_388_608,
  maxElapsedMs: 600_000,
});

const acceptedRun = (
  result: ReturnType<typeof createAgentRunControl>
): AgentRunSnapshot => {
  if (!result.accepted) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  return result.state;
};

const createPlanningAuthority = (input: {
  caseId: string;
  attemptId: string;
  workspace: WorkspaceSnapshot;
  action: AgentEvaluationWorkspaceFixtureMaterial['actionRegistry'][number]['action'];
  issuedAt: string;
  expiresAt: string;
}): Readonly<{
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  proposal: ReturnType<typeof createAgentActionProposal>;
  grant: AgentCapabilityGrant;
  policy: AgentPolicy;
}> => {
  const actor = Object.freeze({
    kind: 'service' as const,
    principalId: 'agent-evaluation-controlled-runtime',
  });
  const producer = Object.freeze({
    kind: 'service' as const,
    principalId: 'agent-evaluation-control-plane',
  });
  const revision = createAgentWorkspaceRevisionFromSnapshot(input.workspace);
  const basePolicy = createDefaultAgentPolicy(
    `agent.policy.${input.caseId}`,
    `Controlled evaluation policy ${input.caseId}`
  );
  const policy: AgentPolicy = Object.freeze({
    ...basePolicy,
    capabilityRules: Object.freeze([
      Object.freeze({
        id: `capability-rule.${input.caseId}`,
        effect: 'allow' as const,
        capabilities: Object.freeze(['propose', 'read'] as const),
        targetScope: Object.freeze({
          targets: Object.freeze([
            Object.freeze({
              kind: 'workspace' as const,
              id: input.workspace.id,
            }),
          ]),
        }),
        toolIds: Object.freeze([]),
        runtimeZones: Object.freeze(['sandbox'] as const),
        maximumRisk: 'critical' as const,
      }),
    ]),
    budgetCeiling: planningBudget,
  });
  const policyDigest = digestAgentPolicy(policy);
  const contextPackDigest = digestAgentCanonicalValue({
    caseId: input.caseId,
    attemptId: input.attemptId,
    kind: 'controlled-workspace-evaluation-context',
  });
  const task = createAgentTaskRecord({
    taskId: `task.${input.caseId}`,
    projectId: 'project.g4-real-evaluation',
    workspaceId: input.workspace.id,
    actor,
    mode: 'propose',
    baseRevision: revision,
    intent: `Plan the exact frozen action for ${input.caseId}.`,
    intentDigest: digestAgentCanonicalValue(
      `Plan the exact frozen action for ${input.caseId}.`
    ),
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'workspace' as const, id: input.workspace.id }),
      ]),
    }),
    policyRef: Object.freeze({ documentId: policy.id }),
    policyDigest,
    initialGrantRef: Object.freeze({ grantId: `grant.${input.caseId}` }),
    budget: planningBudget,
    verificationRequirement: Object.freeze({
      policyRef: 'verification.policy.g4-real-evaluation',
      requiredCheckKinds: Object.freeze(['integration'] as const),
    }),
    createdAt: instantAt(input.issuedAt, -4),
    idempotencyKey: `idempotency.task.${input.caseId}`,
  });
  const runId = `run.${input.caseId}`;
  let run = acceptedRun(
    createAgentRunControl(task, {
      runId,
      command: Object.freeze({
        eventId: `event.${input.caseId}.created`,
        idempotencyKey: `idempotency.run.${input.caseId}.created`,
        occurredAt: instantAt(input.issuedAt, -3),
        producer,
      }),
    })
  );
  run = acceptedRun(
    startAgentRun(task, run, {
      eventId: `event.${input.caseId}.started`,
      idempotencyKey: `idempotency.run.${input.caseId}.started`,
      occurredAt: instantAt(input.issuedAt, -2),
      producer,
      attemptId: input.attemptId,
    })
  );
  run = acceptedRun(
    transitionAgentRunPhase(task, run, {
      eventId: `event.${input.caseId}.running`,
      idempotencyKey: `idempotency.run.${input.caseId}.running`,
      occurredAt: instantAt(input.issuedAt, -1),
      producer,
      phase: 'running',
    })
  );
  const { snapshotDigest: _snapshotDigest, ...runBase } = run;
  run = createAgentRunSnapshot({
    ...runBase,
    run: Object.freeze({ ...run.run, contextPackDigest }),
  });
  const proposal = createAgentActionProposal(WORKSPACE_AGENT_ACTION_REGISTRY, {
    proposalId: `proposal.${input.caseId}`,
    taskId: task.spec.taskId,
    runId,
    baseRevision: revision,
    contextPackDigest,
    actions: Object.freeze([input.action]),
    explanation: 'Apply the exact frozen Workspace owner action.',
    assumptions: Object.freeze([]),
    requestedVerification: Object.freeze({
      policyRef: 'verification.policy.g4-real-evaluation',
      requiredCheckKinds: Object.freeze(['integration'] as const),
    }),
    modelInvocationRefs: Object.freeze([
      `invocation.${input.caseId}.${input.attemptId}`,
    ]),
  });
  const grant: AgentCapabilityGrant = Object.freeze({
    grantId: task.spec.initialGrantRef.grantId,
    subject: actor,
    taskId: task.spec.taskId,
    runId,
    workspaceId: input.workspace.id,
    baseRevision: revision,
    targetScope: task.spec.targetScope,
    capabilities: Object.freeze(['propose', 'read'] as const),
    toolIds: Object.freeze([]),
    runtimeZones: Object.freeze(['sandbox'] as const),
    secretRefs: Object.freeze([]),
    limits: Object.freeze({ budget: planningBudget, maxUses: 1 }),
    policyRef: task.spec.policyRef,
    policyDigest,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    maxUses: 1,
  });
  return Object.freeze({ task, run, proposal, grant, policy });
};

export type AgentEvaluationControlledWorkspaceDomainPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceAgentActionTransactionPlan;
      typedProposalValidationReceiptDigest: CanonicalDigest;
      transactionPlanDigest: CanonicalDigest;
      reverseTransactionDigest: CanonicalDigest;
      ownerAuthorityReceiptDigests: readonly CanonicalDigest[];
    }>
  | Readonly<{
      status: 'expected-blocked';
      diagnosticCode: 'AI-5005';
      typedProposalValidationReceiptDigest: CanonicalDigest;
      ownerAuthorityReceiptDigests: readonly CanonicalDigest[];
    }>;

/**
 * Runs the frozen action through the current Workspace registry and its
 * reversible Transaction owner. The returned candidate is derived only by the
 * owner planner; callers may install it in a disposable sandbox.
 */
export const createAgentEvaluationControlledWorkspaceDomainPlan = (input: {
  caseId: string;
  attemptId: string;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  issuedAt: string;
  expiresAt: string;
}): AgentEvaluationControlledWorkspaceDomainPlanResult => {
  const workspace = input.fixture.workspaceSnapshot as WorkspaceSnapshot;
  if (
    !isAgentControlIdentity(input.caseId) ||
    !isAgentControlIdentity(input.attemptId) ||
    !validateWorkspaceSnapshot(workspace).valid ||
    input.fixture.workspaceSnapshotDigest !==
      digestAgentCanonicalValue(input.fixture.workspaceSnapshot) ||
    input.fixture.actionRegistryId !==
      WORKSPACE_AGENT_ACTION_REGISTRY.registryId ||
    input.fixture.actionRegistryDigest !==
      WORKSPACE_AGENT_ACTION_REGISTRY.registryDigest
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const expected = input.fixture.expectedOutcome.proposal;
  if (expected.status === 'blocked') {
    if (
      input.fixture.actionRegistry.length !== 0 ||
      input.fixture.expectedOutcome.transaction.expectedCommandCount !== 0 ||
      input.fixture.expectedOutcome.transaction.expectedTransactionCount !== 0
    ) {
      return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
    }
    const typedProposalValidationReceiptDigest = digestAgentCanonicalValue({
      kind: 'controlled-workspace-expected-capability-block',
      caseId: input.caseId,
      fixtureDigest: input.fixture.fixtureDigest,
      diagnosticCode: expected.diagnosticCode,
      unavailableCapabilityId: expected.unavailableCapabilityId,
      baseSnapshotDigest: input.fixture.workspaceSnapshotDigest,
    });
    return Object.freeze({
      status: 'expected-blocked',
      diagnosticCode: expected.diagnosticCode,
      typedProposalValidationReceiptDigest,
      ownerAuthorityReceiptDigests: Object.freeze([
        typedProposalValidationReceiptDigest,
      ]),
    });
  }
  const registered = input.fixture.actionRegistry.find(
    ({ actionId }) => actionId === expected.actionId
  );
  const ownerDescriptor = WORKSPACE_AGENT_ACTION_REGISTRY.descriptors.find(
    ({ descriptorId }) => descriptorId === expected.actionId
  );
  if (
    !registered ||
    !ownerDescriptor ||
    !sameCanonicalJson(registered.descriptor, ownerDescriptor) ||
    registered.actionDigest !== digestAgentCanonicalValue(registered.action) ||
    registered.targetRef !== expected.targetRef ||
    !sameCanonicalJson(registered.action.input, expected.arguments)
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const authority = createPlanningAuthority({
    caseId: input.caseId,
    attemptId: input.attemptId,
    workspace,
    action: registered.action,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
  if (
    !sameAgentWorkspaceRevision(
      authority.task.spec.baseRevision,
      createAgentWorkspaceRevisionFromSnapshot(workspace)
    )
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const planned = createWorkspaceAgentActionTransactionPlan({
    workspace,
    ...authority,
    transactionId: `transaction.${input.caseId}.${input.attemptId}`,
    reverseTransactionId: `transaction.${input.caseId}.${input.attemptId}.reverse`,
    issuedAt: input.issuedAt,
  });
  if (planned.status !== 'ready') {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const reversed = applyWorkspaceTransaction(
    planned.plan.candidateSnapshot,
    planned.plan.reverseTransaction
  );
  if (
    !validateWorkspaceSnapshot(planned.plan.candidateSnapshot).valid ||
    !reversed.ok ||
    !validateWorkspaceSnapshot(reversed.snapshot).valid ||
    (input.fixture.expectedOutcome.transaction.expectedCommandCount > 0 &&
      planned.plan.transaction.commands.length !==
        input.fixture.expectedOutcome.transaction.expectedCommandCount) ||
    (input.fixture.expectedOutcome.transaction.expectedTransactionCount > 0 &&
      input.fixture.expectedOutcome.transaction.expectedTransactionCount !== 1)
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const typedProposalValidationReceiptDigest = digestAgentCanonicalValue({
    kind: 'controlled-workspace-typed-proposal-validation',
    proposalDigest: authority.proposal.proposalDigest,
    registryDigest: WORKSPACE_AGENT_ACTION_REGISTRY.registryDigest,
    fixtureDigest: input.fixture.fixtureDigest,
  });
  const transactionPlanDigest = digestAgentCanonicalValue({
    transaction: planned.plan.transaction,
    candidateSnapshot: planned.plan.candidateSnapshot,
  });
  const reverseTransactionDigest = digestAgentCanonicalValue(
    planned.plan.reverseTransaction
  );
  return Object.freeze({
    status: 'ready',
    plan: planned.plan,
    typedProposalValidationReceiptDigest,
    transactionPlanDigest,
    reverseTransactionDigest,
    ownerAuthorityReceiptDigests: canonicalDigests([
      typedProposalValidationReceiptDigest,
      transactionPlanDigest,
      reverseTransactionDigest,
    ]),
  });
};

const partitionRevisions = (
  workspace: WorkspaceSnapshot
): VerificationPartitionRevisions =>
  Object.freeze({
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    documentRevisions: Object.freeze(
      Object.fromEntries(
        Object.values(workspace.docsById)
          .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
          .map(({ id, contentRev, metaRev }) => [
            id,
            Object.freeze({ contentRev, metaRev }),
          ])
      )
    ),
  });

export type AgentEvaluationG3ExecutionEvidenceAuthorityInput = Readonly<{
  authorityInputDigest: CanonicalDigest;
  evaluationNamespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  caseId: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  controlledWorkspaceGrantDigest: CanonicalDigest;
  grantGeneration: number;
  fixtureDigest: CanonicalDigest;
  verificationFixtureDigest: CanonicalDigest;
  impactSet: VerificationImpactSet;
  plan: VerificationPlan;
  sandbox: Readonly<{
    workspaceId: string;
    baseSnapshotRef: string;
    baseSnapshotDigest: CanonicalDigest;
    finalSnapshotRef: string;
    finalSnapshotDigest: CanonicalDigest;
    baseRevision: number;
    basePartitionRevisions: VerificationPartitionRevisions;
    finalRevision: number;
    finalPartitionRevisions: VerificationPartitionRevisions;
  }>;
  operationReceiptDigests: readonly CanonicalDigest[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
  policyDigest: CanonicalDigest;
  scenarioRegistryDigest: CanonicalDigest;
  semanticSchemaDigest: CanonicalDigest;
  providerSetDigest: CanonicalDigest;
  adapterRegistryDigest: CanonicalDigest;
  compilerDigest: CanonicalDigest;
  plannerDigest: CanonicalDigest;
}>;

export type AgentEvaluationG3ExecutionEvidenceAuthorityResult = Readonly<{
  authorityId: string;
  authorityImplementationDigest: CanonicalDigest;
  authorityInputDigest: CanonicalDigest;
  evidence: readonly VerificationEvidence[];
  verifiedEvidenceView: VerificationEvidenceVerifiedView;
  closureEvaluationInstant: string;
  revocationRecordDigest: CanonicalDigest;
  revokedEvidenceIds: readonly string[];
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  authorityLeafReceiptDigests: readonly CanonicalDigest[];
  authorityReceiptDigest: CanonicalDigest;
}>;

/**
 * Required production authority. Its implementation executes the selected G3
 * adapter cells, promotes content-addressed Evidence, and returns the Backend
 * verified trust/retention/revocation/artifact-availability view.
 */
export interface AgentEvaluationG3ExecutionEvidenceAuthority {
  collect(
    input: AgentEvaluationG3ExecutionEvidenceAuthorityInput
  ): Promise<AgentEvaluationG3ExecutionEvidenceAuthorityResult>;
}

export type AgentEvaluationControlledWorkspaceG3PlanProjection =
  | Readonly<{
      status: 'ready';
      impactSet: VerificationImpactSet;
      plan: VerificationPlan;
      basePartitionRevisions: VerificationPartitionRevisions;
      finalPartitionRevisions: VerificationPartitionRevisions;
    }>
  | Readonly<{ status: 'impact-blocked' }>
  | Readonly<{
      status: 'plan-blocked';
      impactDigest: CanonicalDigest;
      planDigest: CanonicalDigest;
    }>;

/**
 * Canonical admission projection shared by pre-dispatch AttemptGrant planning
 * and final G3 Evidence collection. It is pure over the frozen fixture and the
 * exact candidate Workspace revision; no adapter, Provider, or artifact owner
 * is entered here.
 */
export const createAgentEvaluationControlledWorkspaceG3PlanProjection = (
  input: Readonly<{
    fixture: AgentEvaluationWorkspaceFixtureMaterial;
    baseWorkspace: WorkspaceSnapshot;
    finalWorkspace: WorkspaceSnapshot;
    baseSnapshotDigest: CanonicalDigest;
    finalSnapshotDigest: CanonicalDigest;
  }>
): AgentEvaluationControlledWorkspaceG3PlanProjection => {
  const verification = input.fixture.verificationFixture;
  if (
    !validateWorkspaceSnapshot(input.baseWorkspace).valid ||
    !validateWorkspaceSnapshot(input.finalWorkspace).valid ||
    input.baseWorkspace.id !== input.finalWorkspace.id ||
    input.baseSnapshotDigest !==
      digestAgentCanonicalValue(input.baseWorkspace) ||
    input.finalSnapshotDigest !==
      digestAgentCanonicalValue(input.finalWorkspace) ||
    verification.verificationFixtureDigest !==
      digestAgentCanonicalValue(
        (({ verificationFixtureDigest: _, ...base }) => base)(verification)
      ) ||
    verification.policyDigest !== digestVerificationValue(verification.policy)
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const basePartitionRevisions = partitionRevisions(input.baseWorkspace);
  const finalPartitionRevisions = partitionRevisions(input.finalWorkspace);
  const impact = createVerificationImpactSet({
    workspaceId: input.finalWorkspace.id,
    baseRevision: input.baseWorkspace.workspaceRev,
    basePartitionRevisions,
    targetRevision: input.finalWorkspace.workspaceRev,
    targetPartitionRevisions: finalPartitionRevisions,
    semanticSchemaDigest: verification.semanticSchemaDigest,
    providerSetDigest: verification.providerSetDigest,
    operationIds: verification.operationIds,
    contributions: Object.freeze([
      verification.impactContributor as unknown as VerificationImpactContribution,
    ]),
  });
  if (impact.status !== 'ready') {
    return Object.freeze({ status: 'impact-blocked' as const });
  }
  const planResult = createVerificationPlan({
    impactSet: impact.impactSet,
    policy: verification.policy as unknown as VerificationPolicy,
    policyRevision: verification.policyRevision,
    policyDigest: verification.policyDigest,
    policyEvaluationInstant: verification.policyEvaluationInstant,
    scenarioRegistryDigest: verification.scenarioRegistryDigest,
    scenarios:
      verification.scenarios as unknown as readonly VerificationScenarioDescriptor[],
    checks:
      verification.checks as unknown as readonly VerificationCheckDefinition[],
    adapters:
      verification.adapters as unknown as readonly VerificationAdapterRegistration[],
    adapterRegistryDigest: verification.adapterRegistryDigest,
    compilerDigest: verification.compilerDigest,
    plannerDigest: verification.plannerDigest,
  });
  const plan = planResult.plan;
  if (
    planResult.status !== 'ready' ||
    plan.status !== 'ready' ||
    !input.fixture.expectedOutcome.verification.requiredCheckIds.every(
      (checkId) => plan.cells.some((cell) => cell.checkId === checkId)
    )
  ) {
    return Object.freeze({
      status: 'plan-blocked' as const,
      impactDigest: impact.impactSet.impactDigest,
      planDigest: plan.planDigest,
    });
  }
  return Object.freeze({
    status: 'ready' as const,
    impactSet: impact.impactSet,
    plan,
    basePartitionRevisions,
    finalPartitionRevisions,
  });
};

export type AgentEvaluationControlledWorkspaceG3Result =
  | Readonly<{
      status: 'ready';
      impactSet: VerificationImpactSet;
      plan: VerificationPlan;
      closure: VerificationClosure;
      verificationPlanReceiptDigest: CanonicalDigest;
      evidenceAuthorityReceiptDigest: CanonicalDigest;
      verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
      ownerAuthorityReceiptDigests: readonly CanonicalDigest[];
    }>
  | Readonly<{
      status: 'incomplete';
      reason:
        | 'evidence-authority-unavailable'
        | 'impact-blocked'
        | 'plan-blocked'
        | 'owner-authority-invalid';
      impactDigest?: CanonicalDigest;
      planDigest?: CanonicalDigest;
      incompleteAuthorityReceiptDigest: CanonicalDigest;
      verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
      ownerAuthorityReceiptDigests: readonly CanonicalDigest[];
    }>;

const incompleteG3 = (input: {
  reason: Extract<
    AgentEvaluationControlledWorkspaceG3Result,
    { status: 'incomplete' }
  >['reason'];
  caseId: string;
  attemptId: string;
  fixtureDigest: CanonicalDigest;
  impactDigest?: CanonicalDigest;
  planDigest?: CanonicalDigest;
}): Extract<
  AgentEvaluationControlledWorkspaceG3Result,
  { status: 'incomplete' }
> => {
  const base = Object.freeze({
    format: ownerReceiptFormat,
    version: 1 as const,
    kind: 'g3-incomplete-authority' as const,
    reason: input.reason,
    caseId: input.caseId,
    attemptId: input.attemptId,
    fixtureDigest: input.fixtureDigest,
    ...(input.impactDigest ? { impactDigest: input.impactDigest } : {}),
    ...(input.planDigest ? { planDigest: input.planDigest } : {}),
  });
  const incompleteAuthorityReceiptDigest = digestAgentCanonicalValue(base);
  return Object.freeze({
    status: 'incomplete',
    reason: input.reason,
    ...(input.impactDigest ? { impactDigest: input.impactDigest } : {}),
    ...(input.planDigest ? { planDigest: input.planDigest } : {}),
    incompleteAuthorityReceiptDigest,
    verificationAttemptGrantReceiptDigests: Object.freeze([]),
    ownerAuthorityReceiptDigests: Object.freeze([
      incompleteAuthorityReceiptDigest,
    ]),
  });
};

const evidenceAuthorityBase = (
  result: Omit<
    AgentEvaluationG3ExecutionEvidenceAuthorityResult,
    'authorityReceiptDigest'
  >
): Readonly<Record<string, AgentJsonValue>> => {
  const verificationAttemptGrantReceiptDigests =
    canonicalAgentEvaluationVerificationAttemptGrantReceipts(
      result.verificationAttemptGrantReceipts
    ).map(({ receiptDigest }) => receiptDigest);
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet(
      verificationAttemptGrantReceiptDigests
    );
  const authorityLeafReceiptDigests = canonicalDigests(
    result.authorityLeafReceiptDigests
  );
  return Object.freeze({
    authorityId: result.authorityId,
    authorityImplementationDigest: result.authorityImplementationDigest,
    authorityInputDigest: result.authorityInputDigest,
    evidenceManifestDigests: Object.freeze(
      result.evidence
        .map(({ manifestDigest }) => manifestDigest)
        .sort(compareUnicodeCodePoints)
    ),
    verifiedEvidenceViewDigest: result.verifiedEvidenceView.viewDigest,
    closureEvaluationInstant: result.closureEvaluationInstant,
    revocationRecordDigest: result.revocationRecordDigest,
    revokedEvidenceIds: Object.freeze(
      [...result.revokedEvidenceIds].sort(compareUnicodeCodePoints)
    ),
    verificationAttemptGrantReceiptDigests: Object.freeze(
      verificationAttemptGrantReceiptDigests
    ),
    ...(verificationAttemptGrantReceiptSetDigest
      ? { verificationAttemptGrantReceiptSetDigest }
      : {}),
    authorityLeafReceiptDigests,
  });
};

export const createAgentEvaluationG3ExecutionEvidenceAuthorityResult = (
  input: Omit<
    AgentEvaluationG3ExecutionEvidenceAuthorityResult,
    'authorityReceiptDigest'
  >
): AgentEvaluationG3ExecutionEvidenceAuthorityResult => {
  const candidate = Object.freeze({
    ...input,
    evidence: Object.freeze([...input.evidence]),
    revokedEvidenceIds: Object.freeze([...input.revokedEvidenceIds]),
    verificationAttemptGrantReceipts:
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        input.verificationAttemptGrantReceipts
      ),
    authorityLeafReceiptDigests: canonicalDigests(
      input.authorityLeafReceiptDigests
    ),
  });
  return Object.freeze({
    ...candidate,
    authorityReceiptDigest: digestAgentCanonicalValue(
      evidenceAuthorityBase(candidate)
    ),
  });
};

const isEvidenceAuthorityBound = (
  result: AgentEvaluationG3ExecutionEvidenceAuthorityResult,
  input: AgentEvaluationG3ExecutionEvidenceAuthorityInput
): boolean => {
  let verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  try {
    verificationAttemptGrantReceipts =
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        result.verificationAttemptGrantReceipts
      );
  } catch {
    return false;
  }
  const plannedCellIds = [...input.plan.cells]
    .map(({ id }) => id)
    .sort(compareUnicodeCodePoints);
  const grantedCellIds = verificationAttemptGrantReceipts
    .map(({ cellId }) => cellId)
    .sort(compareUnicodeCodePoints);
  return (
    isAgentControlIdentity(result.authorityId) &&
    isAgentCanonicalDigest(result.authorityImplementationDigest) &&
    result.authorityInputDigest === input.authorityInputDigest &&
    Array.isArray(result.evidence) &&
    result.evidence.length <= maximumOwnerReceiptDigests &&
    result.evidence.every(
      (evidence) =>
        evidence.workspaceId === input.sandbox.workspaceId &&
        evidence.workspaceRevision === input.sandbox.finalRevision &&
        sameCanonicalJson(
          evidence.partitionRevisions,
          input.sandbox.finalPartitionRevisions
        ) &&
        evidence.impactDigest === input.impactSet.impactDigest &&
        evidence.planDigest === input.plan.planDigest &&
        evidence.policyDigest === input.policyDigest
    ) &&
    isAgentCanonicalDigest(result.verifiedEvidenceView.viewDigest) &&
    isAgentCanonicalDigest(result.revocationRecordDigest) &&
    result.authorityLeafReceiptDigests.length > 0 &&
    sameCanonicalJson(
      result.authorityLeafReceiptDigests,
      canonicalDigests(result.authorityLeafReceiptDigests)
    ) &&
    result.revokedEvidenceIds.every(isAgentControlIdentity) &&
    new Set(result.revokedEvidenceIds).size ===
      result.revokedEvidenceIds.length &&
    sameCanonicalJson(plannedCellIds, grantedCellIds) &&
    verificationAttemptGrantReceipts.every(
      (receipt) =>
        isAgentEvaluationVerificationAttemptGrantReceipt(receipt) &&
        receipt.namespaceId === input.evaluationNamespaceId &&
        receipt.evaluationPlanDigest === input.evaluationPlanDigest &&
        receipt.repositoryCommit === input.repositoryCommit &&
        receipt.evaluationAttemptId === input.attemptId &&
        receipt.descriptorDigest === input.descriptorDigest &&
        receipt.capabilityDescriptorDigest ===
          input.capabilityDescriptorDigest &&
        receipt.caseId === input.caseId &&
        receipt.generation === input.grantGeneration &&
        receipt.verificationPlanDigest === input.plan.planDigest &&
        receipt.grant.projectId === input.projectId &&
        receipt.grant.workspaceId === input.sandbox.workspaceId &&
        receipt.grant.workspaceRevision === input.sandbox.finalRevision
    ) &&
    isAgentCanonicalDigest(result.authorityReceiptDigest) &&
    result.authorityReceiptDigest ===
      digestAgentCanonicalValue(evidenceAuthorityBase(result))
  );
};

/**
 * Builds a real G3 ImpactSet/Plan, delegates adapter execution + Evidence
 * promotion to the required production authority, then evaluates Closure with
 * the public @prodivix/verification owner.
 */
export const evaluateAgentEvaluationControlledWorkspaceG3 = async (input: {
  evaluationNamespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  caseId: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  controlledWorkspaceGrantDigest: CanonicalDigest;
  grantGeneration: number;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  baseWorkspace: WorkspaceSnapshot;
  finalWorkspace: WorkspaceSnapshot;
  baseSnapshotRef: string;
  baseSnapshotDigest: CanonicalDigest;
  finalSnapshotRef: string;
  finalSnapshotDigest: CanonicalDigest;
  operationReceiptDigests: readonly CanonicalDigest[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
  evidenceAuthority?: AgentEvaluationG3ExecutionEvidenceAuthority;
}): Promise<AgentEvaluationControlledWorkspaceG3Result> => {
  const verification = input.fixture.verificationFixture;
  if (
    !isAgentControlIdentity(input.evaluationNamespaceId) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest) ||
    !/^[a-f0-9]{40}$/u.test(input.repositoryCommit) ||
    !isAgentControlIdentity(input.projectId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentCanonicalDigest(input.capabilityDescriptorDigest) ||
    !isAgentCanonicalDigest(input.controlledWorkspaceGrantDigest) ||
    !Number.isSafeInteger(input.grantGeneration) ||
    input.grantGeneration < 1
  ) {
    return ownerFail('G4_CONTROLLED_WORKSPACE_OWNER_INPUT_INVALID');
  }
  const projection = createAgentEvaluationControlledWorkspaceG3PlanProjection({
    fixture: input.fixture,
    baseWorkspace: input.baseWorkspace,
    finalWorkspace: input.finalWorkspace,
    baseSnapshotDigest: input.baseSnapshotDigest,
    finalSnapshotDigest: input.finalSnapshotDigest,
  });
  if (projection.status === 'impact-blocked') {
    return incompleteG3({
      reason: 'impact-blocked',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
    });
  }
  if (projection.status === 'plan-blocked') {
    return incompleteG3({
      reason: 'plan-blocked',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
      ...(projection.impactDigest
        ? { impactDigest: projection.impactDigest }
        : {}),
      ...(projection.planDigest ? { planDigest: projection.planDigest } : {}),
    });
  }
  const { impactSet, plan, basePartitionRevisions, finalPartitionRevisions } =
    projection;
  const operationReceiptDigests = canonicalDigests(
    input.operationReceiptDigests
  );
  const commandReceiptDigests = canonicalDigests(input.commandReceiptDigests);
  const transactionReceiptDigests = canonicalDigests(
    input.transactionReceiptDigests
  );
  const authorityInputBase = Object.freeze({
    evaluationNamespaceId: input.evaluationNamespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    projectId: input.projectId,
    caseId: input.caseId,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    capabilityDescriptorDigest: input.capabilityDescriptorDigest,
    controlledWorkspaceGrantDigest: input.controlledWorkspaceGrantDigest,
    grantGeneration: input.grantGeneration,
    fixtureDigest: input.fixture.fixtureDigest,
    verificationFixtureDigest: verification.verificationFixtureDigest,
    impactDigest: impactSet.impactDigest,
    planDigest: plan.planDigest,
    sandbox: Object.freeze({
      workspaceId: input.finalWorkspace.id,
      baseSnapshotRef: input.baseSnapshotRef,
      baseSnapshotDigest: input.baseSnapshotDigest,
      finalSnapshotRef: input.finalSnapshotRef,
      finalSnapshotDigest: input.finalSnapshotDigest,
      baseRevision: input.baseWorkspace.workspaceRev,
      basePartitionRevisions,
      finalRevision: input.finalWorkspace.workspaceRev,
      finalPartitionRevisions,
    }),
    operationReceiptDigests,
    commandReceiptDigests,
    transactionReceiptDigests,
    policyDigest: verification.policyDigest,
    scenarioRegistryDigest: verification.scenarioRegistryDigest,
    semanticSchemaDigest: verification.semanticSchemaDigest,
    providerSetDigest: verification.providerSetDigest,
    adapterRegistryDigest: verification.adapterRegistryDigest,
    compilerDigest: verification.compilerDigest,
    plannerDigest: verification.plannerDigest,
  });
  const authorityInput: AgentEvaluationG3ExecutionEvidenceAuthorityInput =
    Object.freeze({
      authorityInputDigest: digestAgentCanonicalValue(authorityInputBase),
      ...authorityInputBase,
      impactSet,
      plan,
    });
  if (!input.evidenceAuthority) {
    return incompleteG3({
      reason: 'evidence-authority-unavailable',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
      impactDigest: impactSet.impactDigest,
      planDigest: plan.planDigest,
    });
  }
  let evidenceAuthority: AgentEvaluationG3ExecutionEvidenceAuthorityResult;
  try {
    evidenceAuthority = await input.evidenceAuthority.collect(authorityInput);
  } catch {
    return incompleteG3({
      reason: 'evidence-authority-unavailable',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
      impactDigest: impactSet.impactDigest,
      planDigest: plan.planDigest,
    });
  }
  if (!isEvidenceAuthorityBound(evidenceAuthority, authorityInput)) {
    return incompleteG3({
      reason: 'owner-authority-invalid',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
      impactDigest: impactSet.impactDigest,
      planDigest: plan.planDigest,
    });
  }
  const verificationAttemptGrantReceiptDigests =
    canonicalAgentEvaluationVerificationAttemptGrantReceipts(
      evidenceAuthority.verificationAttemptGrantReceipts
    ).map(({ receiptDigest }) => receiptDigest);
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet(
      verificationAttemptGrantReceiptDigests
    );
  const baselineSetDigests = uniqueVerificationText(
    plan.cells.flatMap((cell) =>
      cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
    )
  );
  const toolchainSetDigest = digestVerificationValue(
    uniqueVerificationText(
      plan.cells.map(({ adapter }) => adapter.toolchainDigest)
    )
  );
  const closureInput: EvaluateVerificationClosureInput = Object.freeze({
    plan,
    evidence: evidenceAuthority.evidence,
    verifiedEvidenceView: evidenceAuthority.verifiedEvidenceView,
    closureEvaluationInstant: evidenceAuthority.closureEvaluationInstant,
    targetRevision: input.finalWorkspace.workspaceRev,
    targetPartitionRevisions: finalPartitionRevisions,
    scenarioRegistryDigest: verification.scenarioRegistryDigest,
    semanticSchemaDigest: verification.semanticSchemaDigest,
    providerSetDigest: verification.providerSetDigest,
    adapterRegistryDigest: verification.adapterRegistryDigest,
    impactDigest: impactSet.impactDigest,
    policyRevision: verification.policyRevision,
    policyDigest: verification.policyDigest,
    compilerDigest: verification.compilerDigest,
    plannerDigest: verification.plannerDigest,
    baselineSetDigests,
    toolchainSetDigest,
    revocationRecordDigest: evidenceAuthority.revocationRecordDigest,
    revokedEvidenceIds: evidenceAuthority.revokedEvidenceIds,
  });
  const closureResult = evaluateVerificationClosure(closureInput);
  if (closureResult.status !== 'ready') {
    return incompleteG3({
      reason: 'owner-authority-invalid',
      caseId: input.caseId,
      attemptId: input.attemptId,
      fixtureDigest: input.fixture.fixtureDigest,
      impactDigest: impactSet.impactDigest,
      planDigest: plan.planDigest,
    });
  }
  const verificationPlanReceiptDigest = digestAgentCanonicalValue({
    format: ownerReceiptFormat,
    version: 1,
    kind: 'g3-verification-plan',
    caseId: input.caseId,
    attemptId: input.attemptId,
    impactDigest: impactSet.impactDigest,
    planDigest: plan.planDigest,
    evidenceAuthorityReceiptDigest: evidenceAuthority.authorityReceiptDigest,
    verificationAttemptGrantReceiptDigests,
    ...(verificationAttemptGrantReceiptSetDigest
      ? { verificationAttemptGrantReceiptSetDigest }
      : {}),
  });
  return Object.freeze({
    status: 'ready',
    impactSet,
    plan,
    closure: closureResult.closure,
    verificationPlanReceiptDigest,
    evidenceAuthorityReceiptDigest: evidenceAuthority.authorityReceiptDigest,
    verificationAttemptGrantReceiptDigests: Object.freeze(
      verificationAttemptGrantReceiptDigests
    ),
    ownerAuthorityReceiptDigests: canonicalDigests([
      verificationPlanReceiptDigest,
      evidenceAuthority.authorityReceiptDigest,
      closureResult.closure.closureDigest,
      ...verificationAttemptGrantReceiptDigests,
      ...evidenceAuthority.authorityLeafReceiptDigests,
    ]),
  });
};
