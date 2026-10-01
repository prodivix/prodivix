import {
  buildAgentContextPack,
  decodeAgentProviderFact,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateAgentProviderAdmission,
  hasExactAgentControlKeys,
  sameAgentWorkspaceRevision,
  evaluateAgentCapabilityAdmission,
  isAgentControlInstant,
  validateAgentEffectivePolicy,
  type AgentContextBuildResult,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceAgentContextContributors,
  createWorkspaceSemanticIndexFromSnapshot,
  selectWorkspaceAgentPolicyDocument,
  validateWorkspaceSnapshot,
  WORKSPACE_AGENT_ACTION_REGISTRY,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceAgentProposalProjection,
  createWorkspaceAgentRepairContext,
  retainsWorkspaceAgentRegressionRequirements,
  type WorkspaceAgentRepairFailure,
} from '@prodivix/workspace-sync';
import { createVerificationPlan } from '@prodivix/verification';
import type { AgentRuntimeBinding } from '#src/config.js';
import { canonicalJsonText } from '@prodivix/shared/canonical';

export const AGENT_RUNTIME_OUTPUT_SCHEMA = Object.freeze({
  contract: 'prodivix.agent-task-output',
  explain: ['answer'],
  plan: ['plan'],
  propose: ['actions', 'explanation', 'assumptions'],
  actionRegistryDigest: WORKSPACE_AGENT_ACTION_REGISTRY.registryDigest,
});
export const AGENT_RUNTIME_PROMPT_POLICY = Object.freeze({
  contract: 'prodivix.agent-task-prompt',
  revision: 1,
  authoring: 'proposal-only',
  context: 'untrusted-data-only',
  tools: 'none',
  approval: 'explicit-human',
});

/** Combines public Workspace contributors and exact upstream admission facts. */
export const prepareAgentRuntimeContext = async (input: {
  task: AgentTaskRecord;
  runId: string;
  workspace: WorkspaceSnapshot;
  binding: AgentRuntimeBinding;
  at: string;
  repair?: WorkspaceAgentRepairFailure;
}): Promise<Extract<AgentContextBuildResult, { status: 'ready' }>> => {
  const { task, workspace, binding, at } = input;
  const project = selectWorkspaceAgentPolicyDocument(workspace);
  if (
    !validateWorkspaceSnapshot(workspace).valid ||
    workspace.id !== task.spec.workspaceId ||
    !sameAgentWorkspaceRevision(
      createAgentWorkspaceRevisionFromSnapshot(workspace),
      task.spec.baseRevision
    ) ||
    project?.status !== 'valid' ||
    project.document.id !== task.spec.policyRef.documentId ||
    digestAgentPolicy(project.decodedContent) !== task.spec.policyDigest ||
    binding.taskId !== task.spec.taskId ||
    validateAgentEffectivePolicy(binding.policy).length > 0 ||
    binding.policy.evaluation.projectPolicyDigest !== task.spec.policyDigest ||
    binding.policy.evaluation.projectPolicyRef.documentId !==
      task.spec.policyRef.documentId
  )
    throw new Error('AI-6011');
  const grant = binding.grant;
  if (
    grant.grantId !== task.spec.initialGrantRef.grantId ||
    grant.taskId !== task.spec.taskId ||
    grant.workspaceId !== workspace.id ||
    (grant.runId !== undefined && grant.runId !== input.runId) ||
    grant.subject.kind !== task.spec.actor.kind ||
    grant.subject.principalId !== task.spec.actor.principalId ||
    grant.policyDigest !== task.spec.policyDigest ||
    grant.policyRef.documentId !== task.spec.policyRef.documentId ||
    !sameAgentWorkspaceRevision(grant.baseRevision, task.spec.baseRevision) ||
    digestAgentCanonicalValue(grant.targetScope) !==
      digestAgentCanonicalValue(task.spec.targetScope) ||
    !grant.runtimeZones.includes('server') ||
    !grant.capabilities.includes('read') ||
    !grant.capabilities.includes('execute') ||
    ![at, grant.issuedAt, grant.expiresAt].every(isAgentControlInstant) ||
    Date.parse(at) < Date.parse(grant.issuedAt) ||
    Date.parse(at) >= Date.parse(grant.expiresAt) ||
    !evaluateAgentCapabilityAdmission(binding.policy, {
      workspaceId: workspace.id,
      targetScope: task.spec.targetScope,
      capabilities: ['read', 'execute'],
      runtimeZone: 'server',
      maximumRisk: 'low',
    }).allowed
  )
    throw new Error('AI-7001');
  if (
    (task.spec.budget.costLimits.length > 0 ||
      binding.reservation.cost.length > 0) &&
    !binding.pricing
  )
    throw new Error('AI-6013');
  const catalogFact = decodeAgentProviderFact({
    wireVersion: 1,
    factType: 'provider-catalog-entry',
    value: binding.catalog,
  });
  if (!catalogFact.ok) throw new Error('AI-6010');
  const admission = evaluateAgentProviderAdmission(binding.policy, {
    ...binding.catalog,
    supportTier: binding.qualification.supportTier,
    sensitivity: 'internal',
  });
  if (!admission.allowed) throw new Error('AI-6010');
  if (
    binding.inference.outputSchemaDigest !==
      digestAgentCanonicalValue(AGENT_RUNTIME_OUTPUT_SCHEMA) ||
    binding.inference.promptPolicyDigest !==
      digestAgentCanonicalValue(AGENT_RUNTIME_PROMPT_POLICY) ||
    binding.inference.toolChoicePolicy !== 'none' ||
    binding.inference.parallelToolPolicy !== 'forbidden' ||
    binding.inference.providerStateMode !== 'stateless' ||
    binding.inference.cacheMode !== 'disabled' ||
    binding.inference.contextMutationMode !== 'none' ||
    binding.inference.reasoningMode !== 'none' ||
    binding.inference.deliveryMode !== 'stream' ||
    binding.inference.maxOutputUnits.unit !== 'text-token-output' ||
    !/^[1-9][0-9]{0,6}$/u.test(binding.inference.maxOutputUnits.maximum)
  )
    throw new Error('AI-6010');
  const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
  if (semantic.status !== 'ready') throw new Error('AI-6011');
  const contributors = createWorkspaceAgentContextContributors({
    snapshot: workspace,
    semanticIndex: semantic.index,
    ...(input.repair
      ? { verification: createWorkspaceAgentRepairContext(input.repair) }
      : {}),
  });
  const descriptor = contributors.find(
    ({ descriptor: entry }) => entry.kind === 'semantic-index'
  )!.descriptor;
  const context = await buildAgentContextPack({
    taskId: task.spec.taskId,
    runId: input.runId,
    workspaceRevision: task.spec.baseRevision,
    semanticSnapshotRef: descriptor.semanticSnapshotRef!,
    semanticProviderSetDigest: descriptor.semanticProviderSetDigest!,
    targetScope: task.spec.targetScope,
    policy: binding.policy,
    providerSet: [
      {
        provider: binding.catalog.provider,
        dataPolicy: binding.catalog.dataPolicy,
      },
    ],
    contributors,
  });
  if (context.status !== 'ready')
    throw new Error(context.issues[0]?.code ?? 'AI-6011', {
      cause: context.issues,
    });
  if (
    input.repair &&
    (task.lineage.parentTaskId !== input.repair.parentTask.spec.taskId ||
      createWorkspaceAgentRepairContext(input.repair).some(
        (entry) =>
          !context.materials.some(
            ({ item, content }) =>
              item.source.kind === 'verification' &&
              item.source.id === entry.ref &&
              item.kind === entry.kind &&
              content ===
                canonicalJsonText({
                  digest: entry.digest,
                  ref: entry.ref,
                  summary: entry.summary,
                }) &&
              item.contentDigest === digestAgentCanonicalValue(content)
          )
      ))
  )
    throw new Error('AI-6010');
  return context;
};

export const prepareAgentRuntimePreview = (input: {
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  workspace: WorkspaceSnapshot;
  binding: AgentRuntimeBinding;
  proposal: Parameters<
    typeof createWorkspaceAgentProposalProjection
  >[0]['proposal'];
  at: string;
  frozenPlanning?: Readonly<{ plannedAt: string; expiresAt: string }>;
  repair?: WorkspaceAgentRepairFailure;
}) => {
  if (
    !input.binding.verification ||
    input.binding.verification.policy.id !==
      input.task.spec.verificationRequirement.policyRef
  )
    throw new Error('AI-6001');
  const policy = input.binding.policy.layers.find(
    ({ kind }) => kind === 'project'
  )!.policy;
  const result = createWorkspaceAgentProposalProjection({
    workspace: input.workspace,
    task: input.task,
    run: input.run,
    proposal: input.proposal,
    grant: input.binding.grant,
    policy,
    transactionId: `${input.proposal.proposalId}.transaction`,
    reverseTransactionId: `${input.proposal.proposalId}.reverse`,
    previewId: `${input.proposal.proposalId}.preview`,
    issuedAt: input.frozenPlanning?.plannedAt ?? input.at,
    plannedAt: input.frozenPlanning?.plannedAt ?? input.at,
    expiresAt:
      input.frozenPlanning?.expiresAt ??
      new Date(
        Math.min(
          Date.parse(input.binding.grant.expiresAt),
          Date.parse(input.at) + 300_000
        )
      ).toISOString(),
    frameworkTargets: [
      ...new Set(
        input.binding.verification.checks.flatMap(
          ({ frameworkTargets }) => frameworkTargets
        )
      ),
    ],
    runtimeZones: ['browser', 'server'],
    verificationPlanner: (impactSet) =>
      createVerificationPlan({ ...input.binding.verification!, impactSet }),
  });
  if (result.status !== 'ready')
    throw new Error(result.issues[0]?.code ?? 'AI-5001');
  if (
    input.repair &&
    (input.task.lineage.parentTaskId !== input.repair.parentTask.spec.taskId ||
      !retainsWorkspaceAgentRegressionRequirements(
        result.projection.verificationPlan,
        input.repair.counterexamples.requirements
      ))
  )
    throw new Error('AI-6010');
  if (
    input.task.spec.verificationRequirement.requiredCheckKinds.some(
      (kind) =>
        !result.projection.verificationPlan.cells.some(
          (cell) => cell.requirement === 'required' && cell.checkKind === kind
        )
    )
  )
    throw new Error('AI-6001');
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const maximumRisk = result.projection.actionPlan.risks.reduce<
    keyof typeof rank
  >(
    (highest, risk) =>
      rank[risk.level] > rank[highest] ? risk.level : highest,
    'low'
  );
  if (
    !evaluateAgentCapabilityAdmission(input.binding.policy, {
      workspaceId: input.workspace.id,
      targetScope: input.task.spec.targetScope,
      capabilities: result.projection.actionPlan.requiredCapabilities,
      runtimeZone: 'server',
      maximumRisk,
    }).allowed
  )
    throw new Error('AI-7001');
  return result.projection;
};

export const parseAgentRuntimeOutput = (
  text: string,
  fields: readonly string[]
): Record<string, unknown> => {
  if (Buffer.byteLength(text) > 262_144) throw new Error('AI-5001');
  const value: unknown = JSON.parse(text);
  if (!hasExactAgentControlKeys(value, fields)) throw new Error('AI-5001');
  return value;
};
