import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createAgentActionDescriptor,
  createAgentActionProposal,
  createAgentActionRegistrySnapshot,
  createAgentApprovalDecision,
  createAgentProposalPlanningReceipt,
  createAgentProposalPreview,
  createAgentRunControl,
  createAgentTaskRecord,
  createAgentWorkspaceMutationReceipt,
  digestAgentCanonicalValue,
  encodeAgentControlFact,
  encodeAgentProposalFact,
  startAgentRun,
  transitionAgentRunPhase,
} from '../packages/ai/src/index.ts';

const time = Object.freeze({
  task: '2026-08-01T08:30:00.000Z',
  created: '2026-08-01T08:30:01.000Z',
  started: '2026-08-01T08:30:02.000Z',
  running: '2026-08-01T08:30:03.000Z',
  planned: '2026-08-01T08:30:04.000Z',
  awaitingApproval: '2026-08-01T08:30:05.000Z',
  approved: '2026-08-01T08:30:06.000Z',
  committing: '2026-08-01T08:30:07.000Z',
  commitStarted: '2026-08-01T08:30:08.000Z',
  commitAcknowledged: '2026-08-01T08:30:09.000Z',
  verifying: '2026-08-01T08:30:10.000Z',
  rollbackStarted: '2026-08-01T08:30:11.000Z',
  rollbackAcknowledged: '2026-08-01T08:30:12.000Z',
  expires: '2026-08-01T09:30:00.000Z',
});

const ids = Object.freeze({
  task: 'task.g4-v5.proposal-vector',
  run: 'run.g4-v5.proposal-vector',
  grant: 'grant.g4-v5.proposal-vector',
  policy: 'policy.g4-v5.proposal-vector',
  proposal: 'proposal.g4-v5.proposal-vector',
  preview: 'preview.g4-v5.proposal-vector',
  decision: 'decision.g4-v5.proposal-vector',
  transaction: 'transaction.g4-v5.proposal-vector',
  reverseTransaction: 'transaction.g4-v5.proposal-vector.reverse',
});

const revision = Object.freeze({
  workspaceRev: 42,
  routeRev: 8,
  opSeq: 144,
  documents: Object.freeze([
    Object.freeze({ documentId: 'page.catalog', contentRev: 21, metaRev: 3 }),
  ]),
});
const commitRevision = Object.freeze({
  workspaceRev: 43,
  routeRev: 9,
  opSeq: 145,
  documents: revision.documents,
});
const rollbackRevision = Object.freeze({
  workspaceRev: 44,
  routeRev: 10,
  opSeq: 146,
  documents: revision.documents,
});
const actor = Object.freeze({ kind: 'user', principalId: 'user.test' });
const producer = Object.freeze({
  kind: 'service',
  principalId: 'agent.coordinator.g4-v5',
});
const contextPackDigest = digestAgentCanonicalValue(
  'g4-v5-proposal-vector-context'
);
const policyDigest = digestAgentCanonicalValue(
  'g4-v5-proposal-vector-effective-policy'
);
const budget = Object.freeze({
  usageLimits: Object.freeze([]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 2,
  maxToolCalls: 4,
  maxRepairRounds: 1,
  maxTransactions: 2,
  maxArtifactBytes: 1_048_576,
  maxElapsedMs: 600_000,
});

const registry = createAgentActionRegistrySnapshot(
  'registry.g4-v5.proposal-vector',
  [
    createAgentActionDescriptor({
      descriptorId: 'action.route.child-create',
      ownerId: 'prodivix.route',
      actionType: 'child.create',
      inputSchemaId: 'route.child-create@current',
      requiredCapabilities: ['read', 'propose'],
      allowedTargetKinds: ['semantic-target'],
      maximumInputBytes: 4_096,
      risk: Object.freeze({
        id: 'risk.route-reachability-change',
        level: 'high',
        message: 'Changes canonical route reachability.',
      }),
    }),
  ]
);

const task = createAgentTaskRecord({
  taskId: ids.task,
  projectId: 'project.catalog',
  workspaceId: 'workspace.catalog',
  actor,
  mode: 'apply',
  baseRevision: revision,
  intent: 'Add one approved Catalog route through the V5 proposal flow.',
  intentDigest: digestAgentCanonicalValue(
    'Add one approved Catalog route through the V5 proposal flow.'
  ),
  targetScope: Object.freeze({
    targets: Object.freeze([
      Object.freeze({ kind: 'workspace', id: 'workspace.catalog' }),
    ]),
  }),
  policyRef: Object.freeze({ documentId: ids.policy }),
  policyDigest,
  initialGrantRef: Object.freeze({ grantId: ids.grant }),
  budget,
  verificationRequirement: Object.freeze({
    policyRef: 'verification.policy.catalog',
    requiredCheckKinds: Object.freeze(['browser-e2e', 'unit']),
  }),
  createdAt: time.task,
  idempotencyKey: 'idempotency.g4-v5.proposal-vector.task',
});

const command = (eventId, occurredAt) =>
  Object.freeze({
    eventId,
    idempotencyKey: `idempotency.${eventId}`,
    occurredAt,
    producer,
  });
const accepted = (result) => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result;
};

const created = accepted(
  createAgentRunControl(task, {
    runId: ids.run,
    command: command('event.g4-v5.vector.created', time.created),
  })
);
const started = accepted(
  startAgentRun(task, created.state, {
    ...command('event.g4-v5.vector.started', time.started),
    attemptId: 'attempt.g4-v5.vector.1',
  })
);
const running = accepted(
  transitionAgentRunPhase(task, started.state, {
    ...command('event.g4-v5.vector.running', time.running),
    phase: 'running',
  })
);
const awaitingApproval = accepted(
  transitionAgentRunPhase(task, running.state, {
    ...command(
      'event.g4-v5.vector.awaiting-approval',
      time.awaitingApproval
    ),
    phase: 'awaiting-approval',
  })
);
const committing = accepted(
  transitionAgentRunPhase(task, awaitingApproval.state, {
    ...command('event.g4-v5.vector.committing', time.committing),
    phase: 'committing',
  })
);
const verifying = accepted(
  transitionAgentRunPhase(task, committing.state, {
    ...command('event.g4-v5.vector.verifying', time.verifying),
    phase: 'verifying',
  })
);

const beforeRouteManifest = Object.freeze({
  version: '1',
  root: Object.freeze({ id: 'root' }),
});
const afterRouteManifest = Object.freeze({
  version: '1',
  root: Object.freeze({
    id: 'root',
    children: Object.freeze([
      Object.freeze({ id: 'route.catalog-v5', segment: 'catalog-v5' }),
    ]),
  }),
});
const forwardCommand = Object.freeze({
  id: 'command.g4-v5.proposal-vector.route',
  namespace: 'core.route',
  type: 'manifest.update',
  version: '1.0',
  issuedAt: time.commitStarted,
  forwardOps: Object.freeze([
    Object.freeze({
      op: 'replace',
      path: '/routeManifest',
      value: afterRouteManifest,
    }),
  ]),
  reverseOps: Object.freeze([
    Object.freeze({
      op: 'replace',
      path: '/routeManifest',
      value: beforeRouteManifest,
    }),
  ]),
  target: Object.freeze({ workspaceId: 'workspace.catalog' }),
  domainHint: 'route',
});
const transaction = Object.freeze({
  id: ids.transaction,
  workspaceId: 'workspace.catalog',
  issuedAt: time.commitStarted,
  commands: Object.freeze([forwardCommand]),
  label: 'Apply proposal.g4-v5.proposal-vector',
});
const reverseCommand = Object.freeze({
  ...forwardCommand,
  id: 'command.g4-v5.proposal-vector.route.reverse',
  issuedAt: time.rollbackStarted,
  forwardOps: forwardCommand.reverseOps,
  reverseOps: forwardCommand.forwardOps,
});
const reverseTransaction = Object.freeze({
  id: ids.reverseTransaction,
  workspaceId: 'workspace.catalog',
  issuedAt: time.rollbackStarted,
  commands: Object.freeze([reverseCommand]),
  label: 'Rollback proposal.g4-v5.proposal-vector',
});
const forwardRequest = Object.freeze({
  expected: Object.freeze({
    workspaceRev: 42,
    routeRev: 8,
    documents: Object.freeze([]),
  }),
  operation: Object.freeze({ kind: 'transaction', transaction }),
});
const reverseRequest = Object.freeze({
  expected: Object.freeze({
    workspaceRev: 43,
    routeRev: 9,
    documents: Object.freeze([]),
  }),
  operation: Object.freeze({
    kind: 'transaction',
    transaction: reverseTransaction,
  }),
});
const forwardMutation = Object.freeze({
  workspaceId: 'workspace.catalog',
  workspaceRev: 43,
  routeRev: 9,
  opSeq: 145,
  routeManifest: afterRouteManifest,
});
const reverseMutation = Object.freeze({
  workspaceId: 'workspace.catalog',
  workspaceRev: 44,
  routeRev: 10,
  opSeq: 146,
  routeManifest: beforeRouteManifest,
});

const proposal = createAgentActionProposal(registry, {
  proposalId: ids.proposal,
  taskId: ids.task,
  runId: ids.run,
  baseRevision: revision,
  contextPackDigest,
  actions: Object.freeze([
    Object.freeze({
      ownerId: 'prodivix.route',
      actionType: 'child.create',
      inputSchemaId: 'route.child-create@current',
      target: Object.freeze({
        kind: 'semantic-target',
        id: 'route.root',
      }),
      input: Object.freeze({
        segment: 'catalog-v5',
        routeNodeId: 'route.catalog-v5',
        pageDocumentId: 'page.catalog',
      }),
    }),
  ]),
  explanation: 'Add an approved route using the first-party Route planner.',
  assumptions: Object.freeze([
    'The Catalog route revision still matches the planning base.',
  ]),
  requestedVerification: task.spec.verificationRequirement,
  modelInvocationRefs: Object.freeze(['invocation.g4-v5.proposal-vector']),
});
const planning = createAgentProposalPlanningReceipt({
  proposalId: proposal.proposalId,
  baseRevision: revision,
  proposedSnapshotDigest: digestAgentCanonicalValue({
    revision: commitRevision,
    routeManifest: afterRouteManifest,
  }),
  transactionDigest: digestAgentCanonicalValue(transaction),
  reverseTransactionDigest: digestAgentCanonicalValue(reverseTransaction),
  semanticDiffDigest: digestAgentCanonicalValue({
    route: ['/', '/catalog-v5'],
  }),
  impactSetRef: 'impact.g4-v5.proposal-vector',
  impactDigest: digestAgentCanonicalValue({ domains: ['route'] }),
  verificationPlanRef: 'plan.g4-v5.proposal-vector',
  verificationPlanDigest: digestAgentCanonicalValue({
    checks: ['browser-e2e', 'unit'],
  }),
  sourceTraceDigest: digestAgentCanonicalValue({
    sources: ['page.catalog', 'route.root'],
  }),
  requiredCapabilities: Object.freeze(['read', 'propose', 'commit']),
  risks: Object.freeze([
    Object.freeze({
      id: 'risk.route-reachability-change',
      level: 'high',
      message: 'Changes canonical route reachability.',
    }),
  ]),
  diagnosticRefs: Object.freeze([]),
  plannedAt: time.planned,
  expiresAt: time.expires,
});
const preview = createAgentProposalPreview({
  previewId: ids.preview,
  proposal,
  planning,
});
const approval = createAgentApprovalDecision({
  decisionId: ids.decision,
  decision: 'approved',
  actor,
  taskId: ids.task,
  runId: ids.run,
  previewId: ids.preview,
  previewDigest: preview.previewDigest,
  baseRevision: revision,
  transactionDigest: planning.transactionDigest,
  impactDigest: planning.impactDigest,
  verificationPlanDigest: planning.verificationPlanDigest,
  grantRef: Object.freeze({ grantId: ids.grant }),
  policyDigest,
  rollbackAuthorization: 'on-unsatisfied-closure',
  decidedAt: time.approved,
  expiresAt: time.expires,
});
const commitStarted = createAgentWorkspaceMutationReceipt({
  receiptId: 'receipt.g4-v5.proposal-vector.commit.started',
  kind: 'commit',
  state: 'started',
  taskId: ids.task,
  runId: ids.run,
  proposalId: ids.proposal,
  previewId: ids.preview,
  decisionId: ids.decision,
  operationId: ids.transaction,
  baseRevision: revision,
  transactionDigest: planning.transactionDigest,
  reverseTransactionDigest: planning.reverseTransactionDigest,
  requestDigest: digestAgentCanonicalValue(forwardRequest),
  producer,
  startedAt: time.commitStarted,
});
const commitAcknowledged = createAgentWorkspaceMutationReceipt({
  ...commitStarted,
  receiptId: 'receipt.g4-v5.proposal-vector.commit.acknowledged',
  state: 'acknowledged',
  completedAt: time.commitAcknowledged,
  targetRevision: commitRevision,
  mutationDigest: digestAgentCanonicalValue(forwardMutation),
});
const rollbackStarted = createAgentWorkspaceMutationReceipt({
  receiptId: 'receipt.g4-v5.proposal-vector.rollback.started',
  kind: 'rollback',
  state: 'started',
  taskId: ids.task,
  runId: ids.run,
  proposalId: ids.proposal,
  previewId: ids.preview,
  decisionId: ids.decision,
  operationId: ids.reverseTransaction,
  baseRevision: commitRevision,
  transactionDigest: planning.transactionDigest,
  reverseTransactionDigest: planning.reverseTransactionDigest,
  requestDigest: digestAgentCanonicalValue(reverseRequest),
  producer,
  startedAt: time.rollbackStarted,
});
const rollbackAcknowledged = createAgentWorkspaceMutationReceipt({
  ...rollbackStarted,
  receiptId: 'receipt.g4-v5.proposal-vector.rollback.acknowledged',
  state: 'acknowledged',
  completedAt: time.rollbackAcknowledged,
  targetRevision: rollbackRevision,
  mutationDigest: digestAgentCanonicalValue(reverseMutation),
});

const controlSequence = Object.freeze(
  [
    ['created', created],
    ['started', started],
    ['running', running],
    ['awaiting-approval', awaitingApproval],
    ['committing', committing],
    ['verifying', verifying],
  ].map(([name, transition]) =>
    Object.freeze({
      name,
      run: encodeAgentControlFact({
        factType: 'run-snapshot',
        value: transition.state,
      }),
      event: encodeAgentControlFact({
        factType: 'run-event',
        value: transition.event,
      }),
    })
  )
);
const proposalValues = Object.freeze({
  proposal,
  planning,
  preview,
  approval,
  commitStarted,
  commitAcknowledged,
  rollbackStarted,
  rollbackAcknowledged,
});
const factTypes = Object.freeze({
  proposal: 'proposal',
  planning: 'planning',
  preview: 'preview',
  approval: 'approval',
  commitStarted: 'workspace-mutation-receipt',
  commitAcknowledged: 'workspace-mutation-receipt',
  rollbackStarted: 'workspace-mutation-receipt',
  rollbackAcknowledged: 'workspace-mutation-receipt',
});

/** Shared TypeScript/Go/PostgreSQL V5 proposal and exact commit vector. */
export const createG4AgentProposalCanonicalVector = () => {
  const facts = Object.freeze(
    Object.fromEntries(
      Object.entries(proposalValues).map(([name, value]) => [
        name,
        encodeAgentProposalFact(registry, {
          factType: factTypes[name],
          value,
        }),
      ])
    )
  );
  return Object.freeze({
    format: 'prodivix.agent-proposal-canonical-vector',
    version: 1,
    registry,
    controlFacts: Object.freeze({
      task: encodeAgentControlFact({ factType: 'task-record', value: task }),
      sequence: controlSequence,
    }),
    facts,
    canonicalJson: Object.freeze(
      Object.fromEntries(
        Object.entries(facts).map(([name, fact]) => [
          name,
          canonicalJsonText(fact),
        ])
      )
    ),
    expectedDigests: Object.freeze({
      proposal: proposal.proposalDigest,
      planning: planning.planningDigest,
      preview: preview.previewDigest,
      approval: digestAgentCanonicalValue(approval),
      commitStarted: commitStarted.receiptDigest,
      commitAcknowledged: commitAcknowledged.receiptDigest,
      rollbackStarted: rollbackStarted.receiptDigest,
      rollbackAcknowledged: rollbackAcknowledged.receiptDigest,
    }),
    workspaceCommits: Object.freeze({
      forward: Object.freeze({
        request: forwardRequest,
        mutation: forwardMutation,
      }),
      reverse: Object.freeze({
        request: reverseRequest,
        mutation: reverseMutation,
      }),
    }),
  });
};
