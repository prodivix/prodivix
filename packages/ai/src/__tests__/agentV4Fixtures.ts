import type {
  AgentBudget,
  AgentTaskMode,
  AgentTaskSpec,
  AgentWorkspaceRevisionVector,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type {
  AgentControlCommandIdentity,
  AgentRunSnapshot,
  AgentTaskRecord,
} from '../index';
import {
  createAgentRunControl,
  createAgentTaskRecord,
  startAgentRun,
  transitionAgentRunPhase,
} from '../index';
import { createAgentUsageVector } from '../usage/agentUsage';
import type { AgentBudgetDemand } from '../usage/agentBudgetLedger';

export const V4_TIME = Object.freeze({
  task: '2026-08-01T08:00:00.000Z',
  run: '2026-08-01T08:00:01.000Z',
  start: '2026-08-01T08:00:02.000Z',
  running: '2026-08-01T08:00:03.000Z',
  operation: '2026-08-01T08:00:04.000Z',
  settle: '2026-08-01T08:00:05.000Z',
  cancel: '2026-08-01T08:00:06.000Z',
  cleanup: '2026-08-01T08:00:07.000Z',
  terminal: '2026-08-01T08:00:08.000Z',
  export: '2026-08-01T08:00:09.000Z',
});

export const V4_REVISION: AgentWorkspaceRevisionVector = Object.freeze({
  workspaceRev: 42,
  routeRev: 8,
  opSeq: 144,
  documents: Object.freeze([
    Object.freeze({ documentId: 'page.catalog', contentRev: 21, metaRev: 3 }),
    Object.freeze({ documentId: 'policy.agent', contentRev: 2, metaRev: 1 }),
  ]),
});

export const V4_BUDGET: AgentBudget = Object.freeze({
  usageLimits: Object.freeze([
    Object.freeze({ unit: 'hosted-tool-call', maximum: '8' }),
    Object.freeze({ unit: 'text-token-input', maximum: '20000' }),
    Object.freeze({ unit: 'text-token-output', maximum: '4000' }),
  ]),
  costLimits: Object.freeze([
    Object.freeze({ currency: 'USD', maximum: '25' }),
  ]),
  maxModelInvocations: 8,
  maxToolCalls: 8,
  maxRepairRounds: 2,
  maxTransactions: 1,
  maxArtifactBytes: 1_048_576,
  maxElapsedMs: 600_000,
});

export const v4Digest = (value: unknown): string =>
  digestAgentCanonicalValue(value);

export const V4_PRODUCER = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent.coordinator.test',
});

export const createV4Task = (
  mode: AgentTaskMode = 'explain',
  suffix: string = mode
): AgentTaskRecord => {
  const intent = `Inspect the authenticated Catalog and produce a ${mode} result.`;
  const spec: AgentTaskSpec = Object.freeze({
    taskId: `task.g4-v4.${suffix}`,
    projectId: 'project.catalog',
    workspaceId: 'workspace.catalog',
    actor: Object.freeze({ kind: 'user' as const, principalId: 'user.test' }),
    mode,
    baseRevision: V4_REVISION,
    intent,
    intentDigest: v4Digest(intent),
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'document' as const, id: 'page.catalog' }),
      ]),
    }),
    policyRef: Object.freeze({ documentId: 'policy.agent' }),
    policyDigest: v4Digest('effective-policy.g4-v4'),
    initialGrantRef: Object.freeze({ grantId: 'grant.g4-v4.catalog' }),
    budget: V4_BUDGET,
    verificationRequirement: Object.freeze({
      policyRef: 'verification.policy.catalog',
      requiredCheckKinds: Object.freeze(['browser-e2e', 'unit']),
    }),
    createdAt: V4_TIME.task,
    idempotencyKey: `idempotency.task.${suffix}`,
  });
  return createAgentTaskRecord(spec);
};

export const v4Command = (
  eventId: string,
  idempotencyKey: string,
  occurredAt: string
): AgentControlCommandIdentity =>
  Object.freeze({
    eventId,
    idempotencyKey,
    occurredAt,
    producer: V4_PRODUCER,
  });

const requireAccepted = (
  result: ReturnType<typeof createAgentRunControl>
): AgentRunSnapshot => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.state;
};

export const createStartedV4Run = (
  mode: AgentTaskMode = 'explain',
  suffix: string = mode
): Readonly<{ task: AgentTaskRecord; state: AgentRunSnapshot }> => {
  const task = createV4Task(mode, suffix);
  let state = requireAccepted(
    createAgentRunControl(task, {
      runId: `run.g4-v4.${suffix}`,
      command: v4Command(
        `event.${suffix}.created`,
        `idempotency.run.${suffix}.created`,
        V4_TIME.run
      ),
    })
  );
  state = requireAccepted(
    startAgentRun(task, state, {
      ...v4Command(
        `event.${suffix}.started`,
        `idempotency.run.${suffix}.started`,
        V4_TIME.start
      ),
      attemptId: `attempt.${suffix}.1`,
    })
  );
  state = requireAccepted(
    transitionAgentRunPhase(task, state, {
      ...v4Command(
        `event.${suffix}.running`,
        `idempotency.run.${suffix}.running`,
        V4_TIME.running
      ),
      phase: 'running',
    })
  );
  return Object.freeze({ task, state });
};

export const createV4Demand = (
  input: Readonly<{
    inputTokens?: string;
    outputTokens?: string;
    toolCalls?: number;
    modelInvocations?: number;
    elapsedMs?: number;
  }> = {}
): AgentBudgetDemand => {
  const amounts = [
    ...(input.inputTokens
      ? [
          {
            unit: 'text-token-input' as const,
            logicalAmount: input.inputTokens,
            confidence: 'measured' as const,
          },
        ]
      : []),
    ...(input.outputTokens
      ? [
          {
            unit: 'text-token-output' as const,
            logicalAmount: input.outputTokens,
            confidence: 'measured' as const,
          },
        ]
      : []),
    ...((input.toolCalls ?? 0) > 0
      ? [
          {
            unit: 'hosted-tool-call' as const,
            logicalAmount: String(input.toolCalls),
            confidence: 'measured' as const,
          },
        ]
      : []),
  ];
  return Object.freeze({
    usage: createAgentUsageVector(amounts),
    cost: Object.freeze([]),
    modelInvocations: input.modelInvocations ?? 0,
    toolCalls: input.toolCalls ?? 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: input.elapsedMs ?? 1000,
  });
};
