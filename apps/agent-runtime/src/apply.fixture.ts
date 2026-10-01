import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentTaskRecord,
  createAgentRunControl,
  startAgentRun,
  transitionAgentRunPhase,
  createAgentActionProposal,
  createAgentApprovalDecision,
  createAgentProductView,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
  type AgentPolicy,
  type AgentRunSnapshot,
} from '@prodivix/ai';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  WORKSPACE_AGENT_ACTION_REGISTRY,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  digestVerificationValue,
  normalizeVerificationPolicy,
  type CreateVerificationPlanInput,
} from '@prodivix/verification';
import { prepareAgentRuntimePreview } from '#src/composition.js';
import { runtimeFixture, time, expiry } from '#src/runtime.fixture.js';

/** Public corpus data exercises domain contracts only; no evaluation authority or real-model claim. */
export const runtimeApplyFixture = (
  options: Readonly<{
    rollback?: boolean;
    maxArtifactBytes?: number;
    maxTransactions?: number;
    maxElapsedMs?: number;
  }> = {}
) => {
  const common = runtimeFixture('apply');
  const material = G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures.find(
    ({ workspaceFixture }) =>
      workspaceFixture.expectedOutcome.proposal.status === 'ready' &&
      workspaceFixture.actionRegistry.some(
        ({ actionId }) => actionId === 'action.pir.document-update'
      )
  )!.workspaceFixture;
  const source = material.workspaceSnapshot as WorkspaceSnapshot;
  const capabilities = [
    'approve',
    'commit',
    'execute',
    'propose',
    'read',
    'rollback',
  ] as const;
  let project: AgentPolicy = {
    ...common.binding.policy.layers.find(({ kind }) => kind === 'project')!
      .policy,
    contextRules: {
      ...common.binding.policy.contextRules,
      allowedItemKinds: [
        ...new Set([
          ...common.binding.policy.contextRules.allowedItemKinds,
          'behavior-scenario',
          'verification-plan',
          'verification-evidence',
          'verification-closure',
        ]),
      ].sort(compareUnicodeCodePoints),
    },
    budgetCeiling: {
      ...common.task.spec.budget,
      maxModelInvocations: 3,
      maxRepairRounds: 2,
      maxTransactions: options.maxTransactions ?? 3,
      maxArtifactBytes: options.maxArtifactBytes ?? 67_108_864,
      maxElapsedMs: options.maxElapsedMs ?? 180_000,
    },
    capabilityRules: [
      {
        id: 'allow.execute',
        effect: 'allow',
        capabilities,
        targetScope: { targets: [{ kind: 'workspace', id: source.id }] },
        toolIds: [],
        runtimeZones: ['server'],
        maximumRisk: 'critical',
      },
    ],
  };
  if (options.rollback) {
    project = {
      ...project,
      approvalRules: project.approvalRules.map((rule) => ({
        ...rule,
        capabilities: [...new Set([...rule.capabilities, 'rollback' as const])],
        rollbackAuthorization: 'on-unsatisfied-closure',
      })),
      verificationRules: {
        ...project.verificationRules,
        rollback: 'approval-bound',
      },
    };
  }
  const root = source.treeById[source.treeRootId]!;
  if (root.kind !== 'dir') throw new Error('Fixture root must be a directory');
  const workspace: WorkspaceSnapshot = {
    ...source,
    treeById: {
      ...source.treeById,
      [root.id]: {
        ...root,
        children: [...(root.children ?? []), 'runtime.policy.node'],
      },
      'runtime.policy.node': {
        id: 'runtime.policy.node',
        kind: 'doc',
        name: 'runtime-policy.json',
        parentId: root.id,
        docId: project.id,
      },
    },
    docsById: {
      ...source.docsById,
      [project.id]: {
        id: project.id,
        type: 'agent-policy',
        path: '/runtime-policy.json',
        content: project,
        contentRev: 1,
        metaRev: 1,
      },
    },
  };
  const verification = material.verificationFixture as unknown as Omit<
    CreateVerificationPlanInput,
    'impactSet'
  >;
  const verificationPolicy = {
    ...verification.policy,
    retryPolicies: verification.policy.retryPolicies.map((retry) => ({
      ...retry,
      maximumAttempts: 1,
      stabilitySamples: 1,
    })),
    rules: verification.policy.rules.map((rule) => ({
      ...rule,
      checkKinds: ['integration' as const],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
    })),
  };
  const task = createAgentTaskRecord({
    ...common.task.spec,
    workspaceId: workspace.id,
    baseRevision: createAgentWorkspaceRevisionFromSnapshot(workspace),
    targetScope: { targets: [{ kind: 'workspace', id: workspace.id }] },
    policyDigest: digestAgentPolicy(project),
    budget: project.budgetCeiling,
    verificationRequirement: {
      policyRef: verification.policy.id,
      requiredCheckKinds: ['integration'],
    },
  });
  const effective = evaluateEffectiveAgentPolicy({
    projectPolicyRef: task.spec.policyRef,
    actorAuthorizationDigest:
      common.binding.policy.evaluation.actorAuthorizationDigest,
    evaluatedAt: time,
    layers: common.binding.policy.layers.map((entry) => ({
      ...entry,
      policy: project,
      policyDigest: task.spec.policyDigest,
    })),
  });
  if (!effective.ok) throw new Error('Fixture policy failed');
  const binding = {
    ...common.binding,
    taskId: task.spec.taskId,
    policy: effective.value,
    grant: {
      ...common.binding.grant,
      workspaceId: workspace.id,
      baseRevision: task.spec.baseRevision,
      targetScope: task.spec.targetScope,
      capabilities,
      policyDigest: task.spec.policyDigest,
    },
    verification: {
      policy: verificationPolicy,
      policyRevision: verification.policyRevision,
      policyDigest: digestVerificationValue(
        normalizeVerificationPolicy(verificationPolicy)
      ),
      policyEvaluationInstant: verification.policyEvaluationInstant,
      scenarioRegistryDigest: verification.scenarioRegistryDigest,
      scenarios: verification.scenarios,
      checks: verification.checks
        .filter(({ kind }) => kind === 'integration')
        .map((check) => ({
          ...check,
          scenarioIds: [],
          scenarioTags: [],
          impactedDomains: [],
          capabilityIds: [],
          riskFlags: [],
        })),
      adapters: verification.adapters,
      adapterRegistryDigest: verification.adapterRegistryDigest,
      compilerDigest: verification.compilerDigest,
      plannerDigest: verification.plannerDigest,
    },
    verificationDriver: {
      endpoint: 'https://verification.invalid/execute',
      providerId: 'driver.fixture',
      credentialEnvironmentVariable: 'DRIVER_FIXTURE_KEY',
      adapterRegistryDigest: verification.adapterRegistryDigest,
      maximumRuntimeMs: 60_000,
    },
  };
  const runId = `run.runtime.${task.taskDigest.slice(7)}`;
  const producer = { kind: 'service' as const, principalId: 'agent.runtime' };
  const command = (label: string) => ({
    eventId: label,
    idempotencyKey: label,
    occurredAt: time,
    producer,
  });
  const events: import('@prodivix/ai').AgentControlEvent[] = [];
  const accepted = (result: ReturnType<typeof createAgentRunControl>) => {
    if (!result.accepted)
      throw new Error(result.issues.map(({ message }) => message).join(';'));
    events.push(result.event);
    return result.state;
  };
  let run = accepted(
    createAgentRunControl(task, {
      runId,
      contextPackDigest: digestAgentCanonicalValue('fixture.context'),
      command: command('created'),
    })
  );
  run = accepted(
    startAgentRun(task, run, {
      ...command('started'),
      attemptId: 'attempt.fixture',
    })
  );
  const historicalRun = accepted(
    transitionAgentRunPhase(task, run, {
      ...command('running'),
      phase: 'running',
    })
  );
  const action = material.actionRegistry.find(
    ({ actionId }) => actionId === 'action.pir.document-update'
  )!.action;
  const proposal = createAgentActionProposal(WORKSPACE_AGENT_ACTION_REGISTRY, {
    proposalId: 'proposal.fixture',
    taskId: task.spec.taskId,
    runId,
    baseRevision: task.spec.baseRevision,
    contextPackDigest: historicalRun.run.contextPackDigest!,
    actions: [action],
    explanation: 'Typed PIR owner change.',
    assumptions: [],
    requestedVerification: task.spec.verificationRequirement,
    modelInvocationRefs: ['invocation.fixture'],
  });
  const projection = prepareAgentRuntimePreview({
    task,
    run: historicalRun,
    workspace,
    binding,
    proposal,
    at: time,
  });
  run = accepted(
    transitionAgentRunPhase(task, historicalRun, {
      ...command('waiting'),
      phase: 'awaiting-approval',
    })
  );
  const approval = createAgentApprovalDecision({
    decisionId: 'approval.fixture',
    decision: 'approved',
    actor: task.spec.actor as typeof common.task.spec.actor & { kind: 'user' },
    taskId: task.spec.taskId,
    runId,
    previewId: projection.preview.previewId,
    previewDigest: projection.preview.previewDigest,
    baseRevision: task.spec.baseRevision,
    transactionDigest: projection.planning.transactionDigest,
    impactDigest: projection.planning.impactDigest,
    verificationPlanDigest: projection.planning.verificationPlanDigest,
    grantRef: task.spec.initialGrantRef,
    policyDigest: task.spec.policyDigest,
    rollbackAuthorization: options.rollback ? 'on-unsatisfied-closure' : 'none',
    decidedAt: time,
    expiresAt: expiry,
  });
  const product = (state: AgentRunSnapshot) => ({
    view: createAgentProductView({
      task,
      run: state,
      events,
      proposal,
      planning: projection.planning,
      preview: projection.preview,
      approval,
      mutations: [],
      verificationBindings: [],
      verificationClosures: [],
      repairRounds: [],
      commands: [],
      currentRevision: task.spec.baseRevision,
      actorAuthorized: true,
    }),
    currentRevision: task.spec.baseRevision,
    actorAuthorized: true,
  });
  return {
    task,
    workspace,
    binding,
    historicalRun,
    run,
    proposal,
    projection,
    product,
    command,
    events,
  };
};
