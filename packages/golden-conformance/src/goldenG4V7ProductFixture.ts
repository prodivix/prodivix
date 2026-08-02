import {
  createAgentAuditExport,
  createAgentRunControl,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  startAgentRun,
  transitionAgentRunPhase,
  type AgentContextPack,
  type AgentControlEvent,
  type AgentRunSnapshot,
} from '@prodivix/ai';
import { createWorkspaceAgentProductSupplement } from '@prodivix/workspace-sync';
import {
  createGoldenG4V5ApprovalContext,
  GOLDEN_G4_V5_BASE_WORKSPACE,
  GOLDEN_G4_V5_IDS,
  GOLDEN_G4_V5_PROJECTION,
  GOLDEN_G4_V5_PROPOSAL,
  GOLDEN_G4_V5_RUN,
  GOLDEN_G4_V5_TASK,
  GOLDEN_G4_V5_TIME,
} from './goldenG4V5ProposalApprovalFixture';

export const GOLDEN_G4_V7_TIME = Object.freeze({
  awaitingApproval: '2026-08-01T12:00:04.500Z',
  projected: '2026-08-01T12:00:04.600Z',
  audit: '2026-08-01T12:00:04.700Z',
});

const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'service.golden.g4-v5',
});
const command = (eventId: string, occurredAt: string) =>
  Object.freeze({
    eventId,
    idempotencyKey: `idempotency.${eventId}`,
    occurredAt,
    producer,
  });
const accept = (
  result: ReturnType<typeof createAgentRunControl>
): Readonly<{ state: AgentRunSnapshot; event: AgentControlEvent }> => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result;
};

const createAwaitingApprovalRun = () => {
  const created = accept(
    createAgentRunControl(GOLDEN_G4_V5_TASK, {
      runId: GOLDEN_G4_V5_IDS.run,
      command: command('event.golden.g4-v5.created', GOLDEN_G4_V5_TIME.run),
    })
  );
  const started = accept(
    startAgentRun(GOLDEN_G4_V5_TASK, created.state, {
      ...command('event.golden.g4-v5.started', GOLDEN_G4_V5_TIME.start),
      attemptId: 'attempt.golden.g4-v5.1',
    })
  );
  const running = accept(
    transitionAgentRunPhase(GOLDEN_G4_V5_TASK, started.state, {
      ...command('event.golden.g4-v5.running', GOLDEN_G4_V5_TIME.running),
      phase: 'running',
    })
  );
  if (
    running.state.run.latestEventDigest !==
    GOLDEN_G4_V5_RUN.run.latestEventDigest
  ) {
    throw new Error(
      'Golden G4 V7 event head drifted from the V5 proposal Run.'
    );
  }
  const awaiting = accept(
    transitionAgentRunPhase(GOLDEN_G4_V5_TASK, GOLDEN_G4_V5_RUN, {
      ...command(
        'event.golden.g4-v7.awaiting-approval',
        GOLDEN_G4_V7_TIME.awaitingApproval
      ),
      phase: 'awaiting-approval',
    })
  );
  return Object.freeze({
    run: awaiting.state,
    events: Object.freeze([
      created.event,
      started.event,
      running.event,
      awaiting.event,
    ]),
  });
};

const awaiting = createAwaitingApprovalRun();
export const GOLDEN_G4_V7_RUN = awaiting.run;
export const GOLDEN_G4_V7_EVENTS = awaiting.events;

const contextManifestDigest = GOLDEN_G4_V5_PROPOSAL.contextPackDigest;
export const GOLDEN_G4_V7_CONTEXT: AgentContextPack = Object.freeze({
  contextPackId: `context-pack:${contextManifestDigest.slice('sha256-'.length)}`,
  taskId: GOLDEN_G4_V5_TASK.spec.taskId,
  runId: GOLDEN_G4_V5_IDS.run,
  workspaceRevision: GOLDEN_G4_V5_TASK.spec.baseRevision,
  semanticSnapshotRef: 'semantic-snapshot.golden.g4-v7.catalog',
  semanticProviderSetDigest: digestAgentCanonicalValue(
    'semantic-provider-set.golden.g4-v7'
  ),
  contextContributorSetDigest: digestAgentCanonicalValue(
    'context-contributor-set.golden.g4-v7'
  ),
  providerSetDigest: digestAgentCanonicalValue('provider-set.golden.g4-v7'),
  policyDigest: GOLDEN_G4_V5_TASK.spec.policyDigest,
  items: Object.freeze([
    Object.freeze({
      itemId: 'context-item.golden.g4-v7.catalog-page',
      kind: 'workspace-document' as const,
      authority: 'canonical' as const,
      source: Object.freeze({
        kind: 'workspace-document' as const,
        id: 'page.catalog',
      }),
      revision: GOLDEN_G4_V5_TASK.spec.baseRevision,
      contentDigest: digestAgentCanonicalValue('catalog-page-metadata-only'),
      mediaType: 'application/json',
      byteLength: 4_096,
      sensitivity: 'internal' as const,
      instructionBoundary: 'data-only' as const,
      sourceTraceRef: 'trace.golden.g4-v7.catalog-page',
    }),
  ]),
  omitted: Object.freeze([
    Object.freeze({
      source: Object.freeze({
        kind: 'external' as const,
        id: 'secret.catalog',
      }),
      reason: 'secret' as const,
      diagnosticCode: 'AI-7003',
    }),
  ]),
  budget: Object.freeze({ maxItems: 2_048, maxBytes: 1_048_576 }),
  manifestDigest: contextManifestDigest,
});

const usage = createAgentUsageVector([
  Object.freeze({
    unit: 'text-token-input' as const,
    logicalAmount: '4200',
    billableAmount: '3900',
    cachedAmount: '300',
    confidence: 'reported' as const,
  }),
  Object.freeze({
    unit: 'text-token-output' as const,
    logicalAmount: '900',
    billableAmount: '900',
    confidence: 'reported' as const,
  }),
]);

export const GOLDEN_G4_V7_SUPPLEMENT = createWorkspaceAgentProductSupplement({
  supplementId: 'supplement.golden.g4-v7.catalog',
  task: GOLDEN_G4_V5_TASK,
  run: GOLDEN_G4_V7_RUN,
  context: GOLDEN_G4_V7_CONTEXT,
  proposalProjection: GOLDEN_G4_V5_PROJECTION,
  rollbackAuthorization: 'on-unsatisfied-closure',
  runtime: Object.freeze({
    models: Object.freeze([
      Object.freeze({
        invocationId: 'invocation.golden.g4-v5.catalog',
        providerConfigurationId: 'provider-configuration.golden.g4-v7',
        protocolFamily: 'openai-responses' as const,
        providerOperatorId: 'provider-operator.golden.g4-v7',
        modelId: 'model.golden.g4-v7',
        modelVersion: 'model-version.golden.g4-v7',
        capabilityProfileId: 'capability-profile.golden.g4-v7',
        outcome: 'completed' as const,
      }),
    ]),
    tools: Object.freeze([
      Object.freeze({
        callId: 'tool-call.golden.g4-v7.workspace-read',
        toolId: 'tool.golden.g4-v7.workspace-read',
        executionLocus: 'client-hosted' as const,
        state: 'completed' as const,
      }),
    ]),
    usage: usage.amounts,
    costs: Object.freeze([
      Object.freeze({
        currency: 'USD',
        amount: '0.04',
        confidence: 'reported' as const,
      }),
    ]),
    usageVectorDigest: usage.vectorDigest,
    budgetLedgerDigest: GOLDEN_G4_V7_RUN.budgetLedger.ledgerDigest,
  }),
  diagnostics: Object.freeze([]),
  producerId: 'service.golden.g4-v7.product-projector',
  projectedAt: GOLDEN_G4_V7_TIME.projected,
});

export const GOLDEN_G4_V7_AUDIT = createAgentAuditExport(
  GOLDEN_G4_V7_EVENTS,
  GOLDEN_G4_V7_TIME.audit
);
export const GOLDEN_G4_V7_APPROVAL = createGoldenG4V5ApprovalContext().decision;
export const GOLDEN_G4_V7_CURRENT_REVISION =
  GOLDEN_G4_V5_TASK.spec.baseRevision;
export { GOLDEN_G4_V5_BASE_WORKSPACE, GOLDEN_G4_V5_PROJECTION };
