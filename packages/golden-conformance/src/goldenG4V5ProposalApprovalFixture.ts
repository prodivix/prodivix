import {
  createAgentActionProposal,
  createAgentApprovalDecision,
  createAgentRunControl,
  createAgentRunSnapshot,
  createAgentTaskRecord,
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  startAgentRun,
  transitionAgentRunPhase,
  type AgentApprovalPreflightContext,
  type AgentCapabilityGrant,
  type AgentControlCommandIdentity,
  type AgentJsonValue,
  type AgentPolicy,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';
import { validateAnimationDefinition } from '@prodivix/animation';
import { validateNodeGraphDocument } from '@prodivix/nodegraph';
import {
  decodeWorkspaceSnapshot,
  encodeWorkspaceDocument,
  encodeWorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  WORKSPACE_AGENT_ACTION_REGISTRY,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceAgentProposalProjection,
  prepareWorkspaceAgentCommit,
  type WorkspaceAgentProposalProjection,
} from '@prodivix/workspace-sync';
import { GOLDEN_G2_VUE_CATALOG_IDS } from './goldenG2VueCatalogFixture';
import { GOLDEN_G3_COMPOSITION_IDS } from './goldenG3BehaviorCompositionFixture';
import {
  createGoldenG3V4AfterWorkspace,
  createGoldenG3V4Plan,
  GOLDEN_G3_V4_BEFORE_WORKSPACE,
  GOLDEN_G3_V4_IDS,
} from './goldenG3VerificationPlanFixture';

export const GOLDEN_G4_V5_TIME = Object.freeze({
  task: '2026-08-01T12:00:00.000Z',
  run: '2026-08-01T12:00:01.000Z',
  start: '2026-08-01T12:00:02.000Z',
  running: '2026-08-01T12:00:03.000Z',
  plan: '2026-08-01T12:00:04.000Z',
  approval: '2026-08-01T12:00:05.000Z',
  commit: '2026-08-01T12:00:06.000Z',
  ack: '2026-08-01T12:00:07.000Z',
  expiry: '2026-08-01T13:00:00.000Z',
});

export const GOLDEN_G4_V5_IDS = Object.freeze({
  task: 'task.golden.g4-v5.catalog',
  run: 'run.golden.g4-v5.catalog',
  grant: 'grant.golden.g4-v5.catalog',
  policy: 'policy.golden.g4-v5.catalog',
  proposal: 'proposal.golden.g4-v5.catalog',
  preview: 'preview.golden.g4-v5.catalog',
  decision: 'decision.golden.g4-v5.catalog',
  transaction: 'transaction.golden.g4-v5.catalog',
  reverseTransaction: 'transaction.golden.g4-v5.catalog.reverse',
  commitReceipt: 'receipt.golden.g4-v5.commit.started',
});

const actor = Object.freeze({
  kind: 'user' as const,
  principalId: 'user.golden.g4-v5',
});
const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'service.golden.g4-v5',
});
const contextPackDigest = digestAgentCanonicalValue(
  'golden-g4-v5-catalog-context'
);
export const GOLDEN_G4_V5_BASE_WORKSPACE = decodeWorkspaceSnapshot(
  encodeWorkspaceSnapshot(GOLDEN_G3_V4_BEFORE_WORKSPACE, {})
).workspace;
const baseRevision = createAgentWorkspaceRevisionFromSnapshot(
  GOLDEN_G4_V5_BASE_WORKSPACE
);
const budget = Object.freeze({
  usageLimits: Object.freeze([]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 4,
  maxToolCalls: 8,
  maxRepairRounds: 1,
  maxTransactions: 2,
  maxArtifactBytes: 16_777_216,
  maxElapsedMs: 600_000,
});

const defaultPolicy = createDefaultAgentPolicy(
  GOLDEN_G4_V5_IDS.policy,
  'Golden G4 V5 proposal policy'
);
export const GOLDEN_G4_V5_POLICY: AgentPolicy = Object.freeze({
  ...defaultPolicy,
  capabilityRules: Object.freeze([
    Object.freeze({
      id: 'capability.golden.g4-v5.workspace',
      effect: 'allow' as const,
      capabilities: Object.freeze([
        'approve',
        'commit',
        'propose',
        'read',
        'rollback',
      ] as const),
      targetScope: Object.freeze({
        targets: Object.freeze([
          Object.freeze({
            kind: 'workspace' as const,
            id: GOLDEN_G4_V5_BASE_WORKSPACE.id,
          }),
        ]),
      }),
      toolIds: Object.freeze([]),
      runtimeZones: Object.freeze(['server'] as const),
      maximumRisk: 'critical' as const,
    }),
  ]),
  approvalRules: Object.freeze([
    Object.freeze({
      id: 'approval.golden.g4-v5.explicit-human',
      riskLevels: Object.freeze(['critical', 'high', 'low', 'medium'] as const),
      capabilities: Object.freeze(['commit', 'rollback'] as const),
      decisionAuthority: 'explicit-human' as const,
      rollbackAuthorization: 'on-unsatisfied-closure' as const,
    }),
  ]),
  budgetCeiling: budget,
  verificationRules: Object.freeze({
    requiredModes: Object.freeze(['apply'] as const),
    requiredClosure: 'satisfied' as const,
    requiredCheckKinds: Object.freeze(['build', 'e2e', 'security', 'visual']),
    repair: 'approval-bound' as const,
    rollback: 'approval-bound' as const,
  }),
});
const policyDigest = digestAgentPolicy(GOLDEN_G4_V5_POLICY);

export const GOLDEN_G4_V5_GRANT: AgentCapabilityGrant = Object.freeze({
  grantId: GOLDEN_G4_V5_IDS.grant,
  subject: actor,
  taskId: GOLDEN_G4_V5_IDS.task,
  runId: GOLDEN_G4_V5_IDS.run,
  workspaceId: GOLDEN_G4_V5_BASE_WORKSPACE.id,
  baseRevision,
  targetScope: Object.freeze({
    targets: Object.freeze([
      Object.freeze({
        kind: 'workspace' as const,
        id: GOLDEN_G4_V5_BASE_WORKSPACE.id,
      }),
    ]),
  }),
  capabilities: Object.freeze([
    'read',
    'propose',
    'approve',
    'commit',
    'rollback',
  ] as const),
  toolIds: Object.freeze([]),
  runtimeZones: Object.freeze(['server'] as const),
  secretRefs: Object.freeze([]),
  limits: Object.freeze({ budget, maxUses: 2 }),
  policyRef: Object.freeze({ documentId: GOLDEN_G4_V5_IDS.policy }),
  policyDigest,
  issuedAt: GOLDEN_G4_V5_TIME.task,
  expiresAt: GOLDEN_G4_V5_TIME.expiry,
  maxUses: 2,
});

export const GOLDEN_G4_V5_TASK: AgentTaskRecord = createAgentTaskRecord({
  taskId: GOLDEN_G4_V5_IDS.task,
  projectId: 'project.golden.catalog',
  workspaceId: GOLDEN_G4_V5_BASE_WORKSPACE.id,
  actor,
  mode: 'apply',
  baseRevision,
  intent: 'Update all six Catalog authoring domains through one proposal.',
  intentDigest: digestAgentCanonicalValue(
    'Update all six Catalog authoring domains through one proposal.'
  ),
  targetScope: GOLDEN_G4_V5_GRANT.targetScope,
  policyRef: Object.freeze({ documentId: GOLDEN_G4_V5_IDS.policy }),
  policyDigest,
  initialGrantRef: Object.freeze({ grantId: GOLDEN_G4_V5_IDS.grant }),
  budget,
  verificationRequirement: Object.freeze({
    policyRef: 'verification.policy.golden.g3-v4',
    requiredCheckKinds: Object.freeze(['build', 'e2e', 'security', 'visual']),
  }),
  createdAt: GOLDEN_G4_V5_TIME.task,
  idempotencyKey: 'idempotency.golden.g4-v5.task',
});

const command = (
  eventId: string,
  occurredAt: string
): AgentControlCommandIdentity =>
  Object.freeze({
    eventId,
    idempotencyKey: `idempotency.${eventId}`,
    occurredAt,
    producer,
  });

const accepted = (
  result: ReturnType<typeof createAgentRunControl>
): AgentRunSnapshot => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.state;
};

const createRun = (): AgentRunSnapshot => {
  let state = accepted(
    createAgentRunControl(GOLDEN_G4_V5_TASK, {
      runId: GOLDEN_G4_V5_IDS.run,
      command: command('event.golden.g4-v5.created', GOLDEN_G4_V5_TIME.run),
    })
  );
  state = accepted(
    startAgentRun(GOLDEN_G4_V5_TASK, state, {
      ...command('event.golden.g4-v5.started', GOLDEN_G4_V5_TIME.start),
      attemptId: 'attempt.golden.g4-v5.1',
    })
  );
  state = accepted(
    transitionAgentRunPhase(GOLDEN_G4_V5_TASK, state, {
      ...command('event.golden.g4-v5.running', GOLDEN_G4_V5_TIME.running),
      phase: 'running',
    })
  );
  const { snapshotDigest: _snapshotDigest, ...stateWithoutDigest } = state;
  return createAgentRunSnapshot({
    ...stateWithoutDigest,
    run: Object.freeze({ ...state.run, contextPackDigest }),
  });
};

export const GOLDEN_G4_V5_RUN = createRun();

const changed = createGoldenG3V4AfterWorkspace([
  'pir',
  'data',
  'nodegraph',
  'animation',
]);
const changedContent = (documentId: string): AgentJsonValue =>
  changed.docsById[documentId]!.content as AgentJsonValue;
const createNodeGraphV5Content = (): AgentJsonValue => {
  const decoded = validateNodeGraphDocument(
    GOLDEN_G4_V5_BASE_WORKSPACE.docsById[GOLDEN_G3_COMPOSITION_IDS.graph]!
      .content
  );
  if (!decoded.ok) throw new Error('Golden G4 V5 NodeGraph is invalid.');
  const graph = structuredClone(decoded.value);
  graph.nodes = graph.nodes.map((node) =>
    node.id === 'derived-state'
      ? { ...node, editor: { ...node.editor, label: 'Derived state V5' } }
      : node
  );
  return graph as AgentJsonValue;
};
const createAnimationV5Content = (): AgentJsonValue => {
  const decoded = validateAnimationDefinition(
    GOLDEN_G4_V5_BASE_WORKSPACE.docsById[GOLDEN_G3_COMPOSITION_IDS.animation]!
      .content
  );
  if (!decoded.valid) throw new Error('Golden G4 V5 Animation is invalid.');
  const definition = structuredClone(decoded.definition);
  definition.timelines = definition.timelines.map((timeline) =>
    timeline.id === GOLDEN_G3_COMPOSITION_IDS.timeline
      ? { ...timeline, name: 'Catalog detail enter V5' }
      : timeline
  );
  return definition as AgentJsonValue;
};

export const GOLDEN_G4_V5_PROPOSAL = createAgentActionProposal(
  WORKSPACE_AGENT_ACTION_REGISTRY,
  {
    proposalId: GOLDEN_G4_V5_IDS.proposal,
    taskId: GOLDEN_G4_V5_IDS.task,
    runId: GOLDEN_G4_V5_IDS.run,
    baseRevision,
    contextPackDigest,
    actions: Object.freeze([
      Object.freeze({
        ownerId: 'prodivix.pir',
        actionType: 'document.update',
        inputSchemaId: 'pir.document-update@current',
        target: Object.freeze({
          kind: 'document' as const,
          id: GOLDEN_G2_VUE_CATALOG_IDS.page,
        }),
        input: Object.freeze({
          content: changedContent(GOLDEN_G2_VUE_CATALOG_IDS.page),
        }),
      }),
      Object.freeze({
        ownerId: 'prodivix.route',
        actionType: 'child.create',
        inputSchemaId: 'route.child-create@current',
        target: Object.freeze({
          kind: 'semantic-target' as const,
          id: GOLDEN_G2_VUE_CATALOG_IDS.shellRoute,
        }),
        input: Object.freeze({
          segment: 'catalog-v5',
          routeNodeId: 'route-catalog-v5',
          pageDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.page,
        }),
      }),
      Object.freeze({
        ownerId: 'prodivix.data',
        actionType: 'document.update',
        inputSchemaId: 'data.document-update@current',
        target: Object.freeze({
          kind: 'document' as const,
          id: GOLDEN_G2_VUE_CATALOG_IDS.data,
        }),
        input: Object.freeze({
          content: changedContent(GOLDEN_G2_VUE_CATALOG_IDS.data),
        }),
      }),
      Object.freeze({
        ownerId: 'prodivix.nodegraph',
        actionType: 'document.update',
        inputSchemaId: 'nodegraph.document-update@current',
        target: Object.freeze({
          kind: 'document' as const,
          id: GOLDEN_G3_COMPOSITION_IDS.graph,
        }),
        input: Object.freeze({
          content: createNodeGraphV5Content(),
        }),
      }),
      Object.freeze({
        ownerId: 'prodivix.animation',
        actionType: 'document.update',
        inputSchemaId: 'animation.document-update@current',
        target: Object.freeze({
          kind: 'document' as const,
          id: GOLDEN_G3_COMPOSITION_IDS.animation,
        }),
        input: Object.freeze({
          content: createAnimationV5Content(),
        }),
      }),
      Object.freeze({
        ownerId: 'prodivix.code',
        actionType: 'slot.edit',
        inputSchemaId: 'code.slot-edit@current',
        target: Object.freeze({
          kind: 'semantic-target' as const,
          id: `route.${GOLDEN_G2_VUE_CATALOG_IDS.route}.guard`,
        }),
        input: Object.freeze({
          artifactId: GOLDEN_G3_V4_IDS.sharedCode,
          expectedRevision: String(
            GOLDEN_G4_V5_BASE_WORKSPACE.docsById[GOLDEN_G3_V4_IDS.sharedCode]!
              .contentRev
          ),
          sourceSpan: Object.freeze({
            artifactId: GOLDEN_G3_V4_IDS.sharedCode,
            startLine: 3,
            startColumn: 52,
            endLine: 3,
            endColumn: 57,
          }),
          newText: 'deny',
        }),
      }),
    ]),
    explanation:
      'Update PIR, Route, Data, NodeGraph, Animation, and one typed CodeSlot.',
    assumptions: Object.freeze([
      'The authenticated Catalog is still bound to the approved base revision.',
    ]),
    requestedVerification: GOLDEN_G4_V5_TASK.spec.verificationRequirement,
    modelInvocationRefs: Object.freeze(['invocation.golden.g4-v5.catalog']),
  }
);

const projectionResult = createWorkspaceAgentProposalProjection({
  workspace: GOLDEN_G4_V5_BASE_WORKSPACE,
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V5_RUN,
  proposal: GOLDEN_G4_V5_PROPOSAL,
  grant: GOLDEN_G4_V5_GRANT,
  policy: GOLDEN_G4_V5_POLICY,
  transactionId: GOLDEN_G4_V5_IDS.transaction,
  reverseTransactionId: GOLDEN_G4_V5_IDS.reverseTransaction,
  issuedAt: GOLDEN_G4_V5_TIME.plan,
  previewId: GOLDEN_G4_V5_IDS.preview,
  plannedAt: GOLDEN_G4_V5_TIME.plan,
  expiresAt: GOLDEN_G4_V5_TIME.expiry,
  frameworkTargets: Object.freeze(['react-vite', 'vue-vite']),
  runtimeZones: Object.freeze(['browser', 'client', 'server']),
  verificationPlanner: (impactSet) => createGoldenG3V4Plan({ impactSet }),
});
if (projectionResult.status !== 'ready') {
  throw new Error(
    projectionResult.issues.map(({ message }) => message).join('; ')
  );
}
export const GOLDEN_G4_V5_PROJECTION = projectionResult.projection;

export const createGoldenG4V5ApprovalContext = (
  projection: WorkspaceAgentProposalProjection = GOLDEN_G4_V5_PROJECTION
): AgentApprovalPreflightContext => {
  const decision = createAgentApprovalDecision({
    decisionId: GOLDEN_G4_V5_IDS.decision,
    decision: 'approved',
    actor,
    taskId: GOLDEN_G4_V5_IDS.task,
    runId: GOLDEN_G4_V5_IDS.run,
    previewId: projection.preview.previewId,
    previewDigest: projection.preview.previewDigest,
    baseRevision,
    transactionDigest: projection.preview.transactionDigest,
    impactDigest: projection.preview.impactDigest,
    verificationPlanDigest: projection.preview.verificationPlanDigest,
    grantRef: Object.freeze({ grantId: GOLDEN_G4_V5_IDS.grant }),
    policyDigest,
    rollbackAuthorization: 'on-unsatisfied-closure',
    decidedAt: GOLDEN_G4_V5_TIME.approval,
    expiresAt: GOLDEN_G4_V5_TIME.expiry,
  });
  const actorAuthorizationDigest = digestAgentCanonicalValue({
    actor,
    projectId: GOLDEN_G4_V5_TASK.spec.projectId,
    workspaceId: GOLDEN_G4_V5_BASE_WORKSPACE.id,
  });
  return Object.freeze({
    proposal: GOLDEN_G4_V5_PROPOSAL,
    preview: projection.preview,
    planning: projection.planning,
    decision,
    grant: GOLDEN_G4_V5_GRANT,
    policy: GOLDEN_G4_V5_POLICY,
    currentRevision: baseRevision,
    actorAuthorizationDigest,
    expectedActorAuthorizationDigest: actorAuthorizationDigest,
    actorAuthorized: true,
    grantUseCount: 0,
    at: GOLDEN_G4_V5_TIME.commit,
  });
};

export const prepareGoldenG4V5Commit = () =>
  prepareWorkspaceAgentCommit({
    projection: GOLDEN_G4_V5_PROJECTION,
    approval: createGoldenG4V5ApprovalContext(),
    currentSnapshot: GOLDEN_G4_V5_BASE_WORKSPACE,
    producer,
    receiptId: GOLDEN_G4_V5_IDS.commitReceipt,
    startedAt: GOLDEN_G4_V5_TIME.commit,
    now: Date.parse(GOLDEN_G4_V5_TIME.commit),
  });

export const createGoldenG4V5CommitResponse = (
  projection: WorkspaceAgentProposalProjection = GOLDEN_G4_V5_PROJECTION
): unknown => {
  const documentIds = [
    ...new Set(
      projection.actionPlan.transaction.commands.flatMap((command) =>
        command.target.documentId ? [command.target.documentId] : []
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
          updatedAt: GOLDEN_G4_V5_TIME.ack,
        })
      )
    ),
    ...(routeChanged
      ? { routeManifest: projection.projectedTargetSnapshot.routeManifest }
      : {}),
    acceptedMutationId: projection.actionPlan.transaction.id,
  });
};

export const cloneWorkspaceWithRevisionDrift = (
  workspace: WorkspaceSnapshot
): WorkspaceSnapshot =>
  Object.freeze({
    ...workspace,
    opSeq: workspace.opSeq + 1,
  });
