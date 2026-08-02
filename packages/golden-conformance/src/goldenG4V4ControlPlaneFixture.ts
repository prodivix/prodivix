import {
  createAgentRunControl,
  createAgentTaskRecord,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  reserveAgentRunBudget,
  startAgentRun,
  startAgentRunOperation,
  transitionAgentRunPhase,
  type AgentControlCommandIdentity,
  type AgentRecoveryPosition,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';

export const GOLDEN_G4_V4_TIME = Object.freeze({
  task: '2026-08-01T10:00:00.000Z',
  created: '2026-08-01T10:00:01.000Z',
  started: '2026-08-01T10:00:02.000Z',
  running: '2026-08-01T10:00:03.000Z',
  prepared: '2026-08-01T10:00:04.000Z',
  recovery: '2026-08-01T10:00:05.000Z',
  callback: '2026-08-01T10:00:06.000Z',
  cleanup: '2026-08-01T10:00:07.000Z',
  terminal: '2026-08-01T10:00:08.000Z',
});

const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent.golden.control-plane',
});

export const goldenG4V4Command = (
  eventId: string,
  idempotencyKey: string,
  occurredAt: string
): AgentControlCommandIdentity =>
  Object.freeze({ eventId, idempotencyKey, occurredAt, producer });

const accepted = <T extends { accepted: boolean }>(
  result: T
): Extract<T, { accepted: true }> => {
  if (!result.accepted) {
    throw new Error('Golden G4 V4 fixture transition was rejected.');
  }
  return result as Extract<T, { accepted: true }>;
};

export const createGoldenG4V4Task = (suffix: string): AgentTaskRecord => {
  const intent = `Recover the authenticated Catalog ${suffix} control point.`;
  return createAgentTaskRecord({
    taskId: `task.golden.g4-v4.${suffix}`,
    projectId: 'project.golden.catalog',
    workspaceId: 'workspace.golden.catalog',
    actor: Object.freeze({ kind: 'user', principalId: 'user.golden' }),
    mode: 'apply',
    baseRevision: Object.freeze({
      workspaceRev: 71,
      routeRev: 12,
      opSeq: 301,
      documents: Object.freeze([
        Object.freeze({
          documentId: 'page.catalog',
          contentRev: 18,
          metaRev: 4,
        }),
        Object.freeze({
          documentId: 'policy.agent',
          contentRev: 3,
          metaRev: 1,
        }),
      ]),
    }),
    intent,
    intentDigest: digestAgentCanonicalValue(intent),
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'document', id: 'page.catalog' }),
      ]),
    }),
    policyRef: Object.freeze({ documentId: 'policy.agent' }),
    policyDigest: digestAgentCanonicalValue('golden-g4-v4-effective-policy'),
    initialGrantRef: Object.freeze({ grantId: 'grant.golden.g4-v4' }),
    budget: Object.freeze({
      usageLimits: Object.freeze([
        Object.freeze({ unit: 'text-token-input', maximum: '10000' }),
      ]),
      costLimits: Object.freeze([]),
      maxModelInvocations: 4,
      maxToolCalls: 4,
      maxRepairRounds: 2,
      maxTransactions: 1,
      maxArtifactBytes: 1_048_576,
      maxElapsedMs: 120_000,
    }),
    verificationRequirement: Object.freeze({
      policyRef: 'verification.policy.golden',
      requiredCheckKinds: Object.freeze(['browser-e2e', 'unit']),
    }),
    createdAt: GOLDEN_G4_V4_TIME.task,
    idempotencyKey: `idempotency.golden.g4-v4.task.${suffix}`,
  });
};

const budgetDemand = Object.freeze({
  usage: createAgentUsageVector([
    Object.freeze({
      unit: 'text-token-input',
      logicalAmount: '800',
      confidence: 'measured',
    }),
  ]),
  cost: Object.freeze([]),
  modelInvocations: 1,
  toolCalls: 0,
  repairRounds: 0,
  transactions: 0,
  artifactBytes: 0,
  elapsedMs: 10_000,
});

export const createGoldenG4V4RecoveryState = (
  position: AgentRecoveryPosition
): Readonly<{
  task: AgentTaskRecord;
  state: AgentRunSnapshot;
  effectIdentity: string;
}> => {
  const suffix = position.replaceAll('-', '.');
  const task = createGoldenG4V4Task(suffix);
  const created = accepted(
    createAgentRunControl(task, {
      runId: `run.golden.g4-v4.${suffix}`,
      command: goldenG4V4Command(
        `event.${suffix}.created`,
        `idempotency.${suffix}.created`,
        GOLDEN_G4_V4_TIME.created
      ),
    })
  );
  const started = accepted(
    startAgentRun(task, created.state, {
      ...goldenG4V4Command(
        `event.${suffix}.started`,
        `idempotency.${suffix}.started`,
        GOLDEN_G4_V4_TIME.started
      ),
      attemptId: `attempt.${suffix}.1`,
    })
  );
  const running = accepted(
    transitionAgentRunPhase(task, started.state, {
      ...goldenG4V4Command(
        `event.${suffix}.running`,
        `idempotency.${suffix}.running`,
        GOLDEN_G4_V4_TIME.running
      ),
      phase: 'running',
    })
  );
  const reserved = accepted(
    reserveAgentRunBudget(task, running.state, {
      ...goldenG4V4Command(
        `event.${suffix}.budget`,
        `idempotency.${suffix}.budget`,
        GOLDEN_G4_V4_TIME.prepared
      ),
      reservationId: `reservation.${suffix}.1`,
      demand: budgetDemand,
    })
  );
  let state = reserved.state;
  let effectIdentity = `wait.${position}.${suffix}`;
  if (position === 'model-stream' || position === 'tool-execute') {
    effectIdentity = `operation.${suffix}.1`;
    state = accepted(
      startAgentRunOperation(task, state, {
        ...goldenG4V4Command(
          `event.${suffix}.operation`,
          `idempotency.${suffix}.operation`,
          GOLDEN_G4_V4_TIME.prepared
        ),
        operationId: effectIdentity,
        kind: position === 'model-stream' ? 'model-stream' : 'tool-execution',
        request: Object.freeze({
          contextPackDigest: digestAgentCanonicalValue(`context.${suffix}`),
        }),
      })
    ).state;
  } else {
    const phase =
      position === 'awaiting-approval'
        ? 'awaiting-approval'
        : position === 'commit-ack'
          ? 'committing'
          : 'verifying';
    state = accepted(
      transitionAgentRunPhase(task, state, {
        ...goldenG4V4Command(
          `event.${suffix}.phase`,
          `idempotency.${suffix}.phase`,
          GOLDEN_G4_V4_TIME.prepared
        ),
        phase,
      })
    ).state;
  }
  return Object.freeze({ task, state, effectIdentity });
};
