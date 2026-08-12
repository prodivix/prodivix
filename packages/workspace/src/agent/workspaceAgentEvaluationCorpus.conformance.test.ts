import {
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentActionProposal,
  createAgentRunControl,
  createAgentRunSnapshot,
  createAgentTaskRecord,
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  isAgentActionProposal,
  isAgentRunSnapshot,
  isAgentTaskRecord,
  sameAgentWorkspaceRevision,
  startAgentRun,
  transitionAgentRunPhase,
  type AgentBudget,
  type AgentCapabilityGrant,
  type AgentPolicy,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';
import {
  createVerificationImpactSet,
  createVerificationPlan,
  type VerificationAdapterRegistration,
  type VerificationCheckDefinition,
  type VerificationImpactContribution,
  type VerificationPartitionRevisions,
  type VerificationPolicy,
  type VerificationScenarioDescriptor,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import { applyWorkspaceTransaction } from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';
import { validateWorkspaceSnapshot } from '../validateWorkspaceVfs';
import {
  WORKSPACE_AGENT_ACTION_REGISTRY,
  createWorkspaceAgentActionTransactionPlan,
} from './workspaceAgentActionRegistry';
import { createAgentWorkspaceRevisionFromSnapshot } from './workspaceAgentContextContributors';

const taskTime = '2026-08-01T08:00:00.000Z';
const runTime = '2026-08-01T08:00:01.000Z';
const startTime = '2026-08-01T08:00:02.000Z';
const runningTime = '2026-08-01T08:00:03.000Z';
const planningTime = '2026-08-01T08:00:04.000Z';
const expiryTime = '2026-08-01T09:00:00.000Z';
const actor = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent-evaluation-controlled-runtime',
});
const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent-evaluation-control-plane',
});
const budget: AgentBudget = Object.freeze({
  usageLimits: Object.freeze([]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 1,
  maxToolCalls: 4,
  maxRepairRounds: 2,
  maxTransactions: 1,
  maxArtifactBytes: 8_388_608,
  maxElapsedMs: 600_000,
});

const acceptedState = (
  result: ReturnType<typeof createAgentRunControl>
): AgentRunSnapshot => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.state;
};

const partitionRevisionsFor = (
  workspace: WorkspaceSnapshot
): VerificationPartitionRevisions =>
  Object.freeze({
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    documentRevisions: Object.freeze(
      Object.fromEntries(
        Object.values(workspace.docsById).map((document) => [
          document.id,
          Object.freeze({
            contentRev: document.contentRev,
            metaRev: document.metaRev,
          }),
        ])
      )
    ),
  });

const assertReadyVerificationPlan = (
  caseId: string,
  baseWorkspace: WorkspaceSnapshot,
  targetWorkspace: WorkspaceSnapshot,
  fixture: (typeof G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures)[number]['workspaceFixture']['verificationFixture'],
  requiredCheckIds: readonly string[]
): void => {
  const impactResult = createVerificationImpactSet({
    workspaceId: baseWorkspace.id,
    baseRevision: baseWorkspace.workspaceRev,
    basePartitionRevisions: partitionRevisionsFor(baseWorkspace),
    targetRevision: targetWorkspace.workspaceRev,
    targetPartitionRevisions: partitionRevisionsFor(targetWorkspace),
    semanticSchemaDigest: fixture.semanticSchemaDigest,
    providerSetDigest: fixture.providerSetDigest,
    operationIds: fixture.operationIds,
    contributions: Object.freeze([
      fixture.impactContributor as unknown as VerificationImpactContribution,
    ]),
  });
  expect(
    impactResult.status === 'ready' ? 'ready' : impactResult.message,
    `${caseId}:impact`
  ).toBe('ready');
  if (impactResult.status !== 'ready') return;

  const planResult = createVerificationPlan({
    impactSet: impactResult.impactSet,
    policy: fixture.policy as unknown as VerificationPolicy,
    policyRevision: fixture.policyRevision,
    policyDigest: fixture.policyDigest,
    policyEvaluationInstant: fixture.policyEvaluationInstant,
    scenarioRegistryDigest: fixture.scenarioRegistryDigest,
    scenarios:
      fixture.scenarios as unknown as readonly VerificationScenarioDescriptor[],
    checks: fixture.checks as unknown as readonly VerificationCheckDefinition[],
    adapters:
      fixture.adapters as unknown as readonly VerificationAdapterRegistration[],
    adapterRegistryDigest: fixture.adapterRegistryDigest,
    compilerDigest: fixture.compilerDigest,
    plannerDigest: fixture.plannerDigest,
  });
  expect(
    planResult.status === 'ready'
      ? 'ready'
      : planResult.plan.issues
          .map(({ code, message }) => `${code}: ${message}`)
          .join('; '),
    `${caseId}:plan`
  ).toBe('ready');
  expect(
    planResult.plan.issues.some(({ code }) => code === 'VER-3002'),
    `${caseId}:adapter-capability`
  ).toBe(false);
  expect(
    planResult.plan.cells.map(({ checkId }) => checkId),
    `${caseId}:required-checks`
  ).toEqual(requiredCheckIds);
  expect(
    planResult.plan.cells.every(
      ({ preflight }) => preflight.status === 'supported'
    ),
    `${caseId}:preflight`
  ).toBe(true);
};

const planningAuthority = (
  caseId: string,
  workspace: WorkspaceSnapshot,
  action: (typeof G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures)[number]['workspaceFixture']['actionRegistry'][number]['action']
): Readonly<{
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  proposal: ReturnType<typeof createAgentActionProposal>;
  grant: AgentCapabilityGrant;
  policy: AgentPolicy;
}> => {
  const revision = createAgentWorkspaceRevisionFromSnapshot(workspace);
  const basePolicy = createDefaultAgentPolicy(
    `agent.policy.${caseId}`,
    `Evaluation policy ${caseId}`
  );
  const policy: AgentPolicy = Object.freeze({
    ...basePolicy,
    capabilityRules: Object.freeze([
      Object.freeze({
        id: `capability-rule.${caseId}`,
        effect: 'allow' as const,
        capabilities: Object.freeze(['propose', 'read'] as const),
        targetScope: Object.freeze({
          targets: Object.freeze([
            Object.freeze({ kind: 'workspace' as const, id: workspace.id }),
          ]),
        }),
        toolIds: Object.freeze([]),
        runtimeZones: Object.freeze(['sandbox'] as const),
        maximumRisk: 'critical' as const,
      }),
    ]),
    budgetCeiling: budget,
  });
  const policyDigest = digestAgentPolicy(policy);
  const contextPackDigest = digestAgentCanonicalValue({
    caseId,
    kind: 'workspace-evaluation-context',
  });
  const task = createAgentTaskRecord({
    taskId: `task.${caseId}`,
    projectId: 'project.g4-real-evaluation',
    workspaceId: workspace.id,
    actor,
    mode: 'propose',
    baseRevision: revision,
    intent: `Plan the exact frozen action for ${caseId}.`,
    intentDigest: digestAgentCanonicalValue(
      `Plan the exact frozen action for ${caseId}.`
    ),
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'workspace' as const, id: workspace.id }),
      ]),
    }),
    policyRef: Object.freeze({ documentId: policy.id }),
    policyDigest,
    initialGrantRef: Object.freeze({ grantId: `grant.${caseId}` }),
    budget,
    verificationRequirement: Object.freeze({
      policyRef: 'verification.policy.g4-real-evaluation',
      requiredCheckKinds: Object.freeze(['unit']),
    }),
    createdAt: taskTime,
    idempotencyKey: `idempotency.task.${caseId}`,
  });
  const runId = `run.${caseId}`;
  let run = acceptedState(
    createAgentRunControl(task, {
      runId,
      command: Object.freeze({
        eventId: `event.${caseId}.created`,
        idempotencyKey: `idempotency.run.${caseId}.created`,
        occurredAt: runTime,
        producer,
      }),
    })
  );
  run = acceptedState(
    startAgentRun(task, run, {
      eventId: `event.${caseId}.started`,
      idempotencyKey: `idempotency.run.${caseId}.started`,
      occurredAt: startTime,
      producer,
      attemptId: `attempt.${caseId}.1`,
    })
  );
  run = acceptedState(
    transitionAgentRunPhase(task, run, {
      eventId: `event.${caseId}.running`,
      idempotencyKey: `idempotency.run.${caseId}.running`,
      occurredAt: runningTime,
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
    proposalId: `proposal.${caseId}`,
    taskId: task.spec.taskId,
    runId,
    baseRevision: revision,
    contextPackDigest,
    actions: Object.freeze([action]),
    explanation: 'Apply the frozen typed Workspace action.',
    assumptions: Object.freeze([]),
    requestedVerification: Object.freeze({
      policyRef: 'verification.policy.g4-real-evaluation',
      requiredCheckKinds: Object.freeze(['unit']),
    }),
    modelInvocationRefs: Object.freeze([`invocation.${caseId}`]),
  });
  const grant: AgentCapabilityGrant = Object.freeze({
    grantId: task.spec.initialGrantRef.grantId,
    subject: actor,
    taskId: task.spec.taskId,
    runId,
    workspaceId: workspace.id,
    baseRevision: revision,
    targetScope: task.spec.targetScope,
    capabilities: Object.freeze(['propose', 'read'] as const),
    toolIds: Object.freeze([]),
    runtimeZones: Object.freeze(['sandbox'] as const),
    secretRefs: Object.freeze([]),
    limits: Object.freeze({ budget, maxUses: 1 }),
    policyRef: task.spec.policyRef,
    policyDigest,
    issuedAt: runTime,
    expiresAt: expiryTime,
    maxUses: 1,
  });
  return Object.freeze({ task, run, proposal, grant, policy });
};

describe('G4 real-evaluation Workspace fixture conformance', () => {
  it('binds every ready public fixture to a reversible owner transaction and executable G3 plan', () => {
    const readyFixtures = G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures.filter(
      ({ workspaceFixture }) =>
        workspaceFixture.expectedOutcome.proposal.status === 'ready'
    );
    expect(readyFixtures.length).toBeGreaterThan(0);

    for (const fixture of readyFixtures) {
      const material = fixture.workspaceFixture;
      const proposalInput = material.expectedOutcome.proposal;
      if (proposalInput.status !== 'ready') continue;
      const registered = material.actionRegistry.find(
        ({ actionId }) => actionId === proposalInput.actionId
      );
      expect(registered, fixture.caseId).toBeDefined();
      const ownerDescriptor = WORKSPACE_AGENT_ACTION_REGISTRY.descriptors.find(
        ({ descriptorId }) => descriptorId === proposalInput.actionId
      );
      expect(registered?.descriptor, fixture.caseId).toEqual(ownerDescriptor);
      expect(registered?.descriptorDigest, fixture.caseId).toBe(
        ownerDescriptor?.descriptorDigest
      );

      const workspace = material.workspaceSnapshot as WorkspaceSnapshot;
      expect(validateWorkspaceSnapshot(workspace).valid, fixture.caseId).toBe(
        true
      );
      const authority = planningAuthority(
        fixture.caseId,
        workspace,
        registered!.action
      );
      const actualRevision =
        createAgentWorkspaceRevisionFromSnapshot(workspace);
      expect(isAgentTaskRecord(authority.task), `${fixture.caseId}:task`).toBe(
        true
      );
      expect(isAgentRunSnapshot(authority.run), `${fixture.caseId}:run`).toBe(
        true
      );
      expect(
        isAgentActionProposal(
          WORKSPACE_AGENT_ACTION_REGISTRY,
          authority.proposal
        ),
        `${fixture.caseId}:proposal`
      ).toBe(true);
      expect(
        sameAgentWorkspaceRevision(
          authority.task.spec.baseRevision,
          actualRevision
        ),
        `${fixture.caseId}:task-revision`
      ).toBe(true);
      expect(
        authority.run.run.contextPackDigest,
        `${fixture.caseId}:context`
      ).toBe(authority.proposal.contextPackDigest);
      const result = createWorkspaceAgentActionTransactionPlan({
        workspace,
        ...authority,
        transactionId: `transaction.${fixture.caseId}`,
        reverseTransactionId: `transaction.${fixture.caseId}.reverse`,
        issuedAt: planningTime,
      });
      expect(
        result.status === 'ready'
          ? 'ready'
          : result.issues
              .map(({ code, message }) => `${code}: ${message}`)
              .join('; '),
        fixture.caseId
      ).toBe('ready');
      if (result.status !== 'ready') continue;
      expect(
        result.plan.transaction.commands.length,
        fixture.caseId
      ).toBeGreaterThan(0);
      if (material.expectedOutcome.transaction.expectedCommandCount > 0) {
        expect(result.plan.transaction.commands.length, fixture.caseId).toBe(
          material.expectedOutcome.transaction.expectedCommandCount
        );
        expect(
          material.expectedOutcome.transaction.expectedTransactionCount,
          fixture.caseId
        ).toBe(1);
      }
      expect(
        validateWorkspaceSnapshot(result.plan.candidateSnapshot).valid,
        fixture.caseId
      ).toBe(true);
      const reversed = applyWorkspaceTransaction(
        result.plan.candidateSnapshot,
        result.plan.reverseTransaction
      );
      expect(reversed.ok, fixture.caseId).toBe(true);
      assertReadyVerificationPlan(
        fixture.caseId,
        workspace,
        result.plan.candidateSnapshot,
        material.verificationFixture,
        material.expectedOutcome.verification.requiredCheckIds
      );
    }
  }, 15_000);

  it('keeps Behavior fixtures explicitly blocked outside the six-owner registry', () => {
    const blocked = G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures.filter(
      ({ workspaceFixture }) =>
        workspaceFixture.expectedOutcome.proposal.status === 'blocked'
    );
    expect(blocked.length).toBeGreaterThan(0);
    for (const fixture of blocked) {
      const material = fixture.workspaceFixture;
      const expected = material.expectedOutcome.proposal;
      expect(expected.status, fixture.caseId).toBe('blocked');
      if (expected.status !== 'blocked') continue;
      expect(expected.unavailableCapabilityId, fixture.caseId).toBe(
        'workspace.action.behavior-scenario-update'
      );
      expect(material.actionRegistry, fixture.caseId).toEqual([]);
      expect(
        material.expectedOutcome.transaction.expectedCommandCount,
        fixture.caseId
      ).toBe(0);
      expect(
        material.expectedOutcome.transaction.expectedTransactionCount,
        fixture.caseId
      ).toBe(0);
    }
  });
});
