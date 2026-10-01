import {
  createAgentBudgetLedger,
  createAgentTaskRecord,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
  evaluateAgentCapabilityAdmission,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  preflightAgentInvocation,
  reserveAgentBudget,
  validateAgentEffectivePolicy,
  type AgentBudget,
  type AgentCapabilityGrant,
  type AgentTaskRecord,
  type AgentTaskAdmissionResult,
  digestAgentTaskAdmission,
  isAgentCapabilityGrant,
} from '@prodivix/ai';
import {
  selectWorkspaceAgentPolicyDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type {
  AgentRuntimeBinding,
  AgentRuntimeConfiguration,
} from '#src/config.js';
import { prepareAgentRuntimeContext } from '#src/composition.js';

export type AgentRuntimeAdmissionChallenge = Readonly<{
  admissionId: string;
  challengeDigest: string;
  task: AgentTaskRecord;
  workspace: WorkspaceSnapshot;
  actorAuthorizationDigest: string;
  observedAt: string;
  expiresAt: string;
}>;
export type AgentRuntimeAdmissionResult = AgentTaskAdmissionResult;

export const digestAgentRuntimeAdmission = digestAgentTaskAdmission;

const demandForBudget = (budget: AgentBudget) => ({
  usage: createAgentUsageVector(
    budget.usageLimits.map(({ unit, maximum }) => ({
      unit,
      logicalAmount: maximum,
      billableAmount: maximum,
      confidence: 'estimated' as const,
    }))
  ),
  cost: budget.costLimits.map(({ currency, maximum }) => ({
    currency,
    amount: maximum,
    confidence: 'estimated' as const,
  })),
  modelInvocations: budget.maxModelInvocations,
  toolCalls: budget.maxToolCalls,
  repairRounds: budget.maxRepairRounds,
  transactions: budget.maxTransactions,
  artifactBytes: budget.maxArtifactBytes,
  elapsedMs: budget.maxElapsedMs,
});

const budgetIsBounded = (
  requested: AgentBudget,
  ceiling: AgentBudget,
  at: string
): boolean =>
  reserveAgentBudget(createAgentBudgetLedger(ceiling), {
    reservationId: 'runtime.admission',
    expectedRevision: 0,
    demand: demandForBudget(requested),
    reservedAt: at,
  }).ok;

/** Reuses configured qualification identities while evaluating current authenticated challenge facts. */
export const evaluateAgentRuntimeAdmission = async (
  challenge: AgentRuntimeAdmissionChallenge,
  configuration: AgentRuntimeConfiguration
): Promise<AgentRuntimeAdmissionResult> => {
  const blocked = (code: string): AgentRuntimeAdmissionResult => {
    const result = {
      admissionId: challenge.admissionId,
      challengeDigest: challenge.challengeDigest,
      task: challenge.task,
      status: 'blocked' as const,
      diagnosticCodes: [code],
    };
    return { ...result, admissionDigest: digestAgentRuntimeAdmission(result) };
  };
  try {
    if (
      !isAgentControlIdentity(challenge.admissionId) ||
      !isAgentCanonicalDigest(challenge.challengeDigest) ||
      !isAgentCanonicalDigest(challenge.actorAuthorizationDigest) ||
      !isAgentControlInstant(challenge.observedAt) ||
      !isAgentControlInstant(challenge.expiresAt) ||
      Date.parse(challenge.expiresAt) <= Date.parse(challenge.observedAt)
    )
      return blocked('AI-7001');
    const project = selectWorkspaceAgentPolicyDocument(challenge.workspace);
    if (
      project?.status !== 'valid' ||
      project.document.id !== challenge.task.spec.policyRef.documentId ||
      digestAgentPolicy(project.decodedContent) !==
        challenge.task.spec.policyDigest
    )
      return blocked('AI-6011');
    const templates = configuration.bindings.filter(
      (binding) =>
        binding.grant.workspaceId === challenge.workspace.id &&
        binding.grant.subject.kind === challenge.task.spec.actor.kind &&
        binding.grant.subject.principalId ===
          challenge.task.spec.actor.principalId &&
        binding.policy.evaluation.actorAuthorizationDigest ===
          challenge.actorAuthorizationDigest &&
        binding.policy.evaluation.projectPolicyDigest ===
          challenge.task.spec.policyDigest
    );
    if (templates.length !== 1) return blocked('AI-6010');
    const template = templates[0]!;
    if (
      validateAgentEffectivePolicy(template.policy).length > 0 ||
      !isAgentCapabilityGrant(template.grant)
    )
      return blocked('AI-9001');
    if (
      challenge.task.spec.targetScope.targets.some(
        (target) =>
          !template.grant.targetScope.targets.some(
            (allowed) =>
              (allowed.kind === 'workspace' &&
                allowed.id === challenge.workspace.id) ||
              digestAgentCanonicalValue(allowed) ===
                digestAgentCanonicalValue(target)
          )
      )
    )
      return blocked('AI-7001');
    const effective = evaluateEffectiveAgentPolicy({
      projectPolicyRef: challenge.task.spec.policyRef,
      actorAuthorizationDigest: challenge.actorAuthorizationDigest,
      evaluatedAt: template.policy.evaluation.evaluatedAt,
      layers: template.policy.layers.map((layer) =>
        layer.kind === 'project'
          ? {
              ...layer,
              policy: project.decodedContent,
              policyDigest: challenge.task.spec.policyDigest,
            }
          : layer
      ),
    });
    if (
      !effective.ok ||
      effective.value.evaluation.effectivePolicyDigest !==
        template.policy.evaluation.effectivePolicyDigest
    )
      return blocked('AI-6010');
    const capabilities = template.grant.capabilities;
    if (
      !capabilities.includes('read') ||
      !capabilities.includes('execute') ||
      (['propose', 'apply'].includes(challenge.task.spec.mode) &&
        !capabilities.includes('propose')) ||
      (challenge.task.spec.mode === 'apply' &&
        (!capabilities.includes('approve') ||
          !capabilities.includes('commit'))) ||
      !evaluateAgentCapabilityAdmission(effective.value, {
        workspaceId: challenge.workspace.id,
        targetScope: challenge.task.spec.targetScope,
        capabilities,
        runtimeZone: 'server',
        maximumRisk: 'low',
      }).allowed
    )
      return blocked('AI-7001');
    if (
      !budgetIsBounded(
        challenge.task.spec.budget,
        effective.value.budgetCeiling,
        challenge.observedAt
      ) ||
      !budgetIsBounded(
        challenge.task.spec.budget,
        template.grant.limits.budget,
        challenge.observedAt
      )
    )
      return blocked('AI-6002');
    if (
      ![
        template.grant.issuedAt,
        template.grant.expiresAt,
        template.qualification.expiresAt,
      ].every(isAgentControlInstant) ||
      Date.parse(challenge.observedAt) < Date.parse(template.grant.issuedAt)
    )
      return blocked('AI-7001');
    const expiresAt = new Date(
      Math.min(
        Date.parse(challenge.expiresAt),
        Date.parse(template.grant.expiresAt),
        Date.parse(template.qualification.expiresAt)
      )
    ).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(challenge.observedAt))
      return blocked('AI-7001');
    const task = createAgentTaskRecord(
      {
        ...challenge.task.spec,
        initialGrantRef: {
          grantId: `grant.runtime.${challenge.challengeDigest.slice(7)}`,
        },
      },
      { lineage: challenge.task.lineage }
    );
    const { runId: _runId, ...grantTemplate } = template.grant;
    const grant: AgentCapabilityGrant = {
      ...grantTemplate,
      grantId: task.spec.initialGrantRef.grantId,
      subject: task.spec.actor,
      taskId: task.spec.taskId,
      workspaceId: task.spec.workspaceId,
      baseRevision: task.spec.baseRevision,
      targetScope: task.spec.targetScope,
      policyRef: task.spec.policyRef,
      policyDigest: task.spec.policyDigest,
      issuedAt: challenge.observedAt,
      expiresAt,
      limits: { budget: task.spec.budget, maxUses: 1 },
      maxUses: 1,
    };
    const binding = {
      ...template,
      taskId: task.spec.taskId,
      policy: effective.value,
      grant,
    };
    const runId = `run.runtime.${task.taskDigest.slice(7)}`;
    const prepared = await prepareAgentRuntimeContext({
      task,
      runId,
      workspace: challenge.workspace,
      binding,
      at: challenge.observedAt,
    });
    const preflight = preflightAgentInvocation(
      {
        invocationId: `${runId}.admission`,
        taskId: task.spec.taskId,
        runId,
        taskMode: task.spec.mode,
        generation: 1,
        attempt: 1,
        provider: binding.catalog.provider,
        providerDataPolicy: binding.catalog.dataPolicy,
        model: binding.catalog.model,
        capabilityProfile: binding.catalog.capabilityProfile,
        qualification: binding.qualification,
        inferenceConfiguration: binding.inference,
        contextPack: prepared.pack,
        policyDigest: prepared.pack.policyDigest,
        grantCapabilities: grant.capabilities,
        startedAt: challenge.observedAt,
      },
      {
        at: challenge.observedAt,
        minimumSupportTier: ['explain', 'plan'].includes(task.spec.mode)
          ? 'admission-only'
          : 'release-evaluated',
      }
    );
    if (!preflight.ok) return blocked(preflight.issues[0]?.code ?? 'AI-6010');
    const result = {
      admissionId: challenge.admissionId,
      challengeDigest: challenge.challengeDigest,
      task,
      effectivePolicy: effective.value,
      grant,
      status: 'admitted' as const,
      diagnosticCodes: [],
    };
    return { ...result, admissionDigest: digestAgentRuntimeAdmission(result) };
  } catch (error) {
    return blocked(
      error instanceof Error && /^AI-[0-9]{4}$/u.test(error.message)
        ? error.message
        : 'AI-9001'
    );
  }
};

/** A persisted admission can select transport configuration but cannot expand a configured profile. */
export const bindAdmittedAgentRuntimeProfile = (
  task: AgentTaskRecord,
  admission: AgentRuntimeAdmissionResult,
  config: AgentRuntimeConfiguration
): AgentRuntimeBinding | undefined => {
  try {
    if (
      admission.status !== 'admitted' ||
      admission.task.taskDigest !== task.taskDigest ||
      !admission.effectivePolicy ||
      !admission.grant ||
      digestAgentRuntimeAdmission(admission) !== admission.admissionDigest ||
      !isAgentCapabilityGrant(admission.grant) ||
      validateAgentEffectivePolicy(admission.effectivePolicy).length > 0
    )
      return undefined;
    const candidates = config.bindings.filter(
      (entry) =>
        entry.policy.evaluation.effectivePolicyDigest ===
          admission.effectivePolicy!.evaluation.effectivePolicyDigest &&
        entry.grant.workspaceId === task.spec.workspaceId &&
        entry.grant.subject.kind === task.spec.actor.kind &&
        entry.grant.subject.principalId === task.spec.actor.principalId &&
        digestAgentCanonicalValue(entry.grant.secretRefs) ===
          digestAgentCanonicalValue(admission.grant!.secretRefs) &&
        entry.grant.networkPolicyRef === admission.grant!.networkPolicyRef &&
        digestAgentCanonicalValue(entry.grant.capabilities) ===
          digestAgentCanonicalValue(admission.grant!.capabilities) &&
        budgetIsBounded(
          admission.grant!.limits.budget,
          entry.grant.limits.budget,
          admission.grant!.issuedAt
        )
    );
    return candidates.length === 1
      ? {
          ...candidates[0]!,
          taskId: task.spec.taskId,
          policy: admission.effectivePolicy,
          grant: admission.grant,
        }
      : undefined;
  } catch {
    return undefined;
  }
};
