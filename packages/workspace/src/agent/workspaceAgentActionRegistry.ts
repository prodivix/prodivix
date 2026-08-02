import {
  createAgentActionDescriptor,
  createAgentActionRegistrySnapshot,
  digestAgentPolicy,
  isAgentActionProposal,
  isAgentControlInstant,
  isAgentRunSnapshot,
  isAgentTaskRecord,
  proposalIssue,
  sameAgentWorkspaceRevision,
  type AgentActionDescriptor,
  type AgentActionProposal,
  type AgentCapability,
  type AgentCapabilityGrant,
  type AgentPolicy,
  type AgentProposalIssue,
  type AgentRiskLevel,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';
import {
  tryNormalizePirDocument,
  validatePirDocument,
  type PIRDocument,
} from '@prodivix/pir';
import {
  normalizeDataSourceDocument,
  type DataSourceDocument,
} from '@prodivix/data';
import {
  validateNodeGraphDocument,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
import {
  validateAnimationDefinition,
  type AnimationDefinition,
} from '@prodivix/animation';
import type { CodeLanguageTextEdit } from '@prodivix/authoring';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  applyWorkspaceTransaction,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import { createWorkspacePirDocumentUpdateCommand } from '../workspacePirDocument';
import { createWorkspaceDataSourceDocumentUpdateCommand } from '../workspaceDataSourceDocument';
import { createWorkspaceNodeGraphDocumentUpdateCommand } from '../workspaceNodeGraphDocument';
import { createWorkspaceAnimationDocumentUpdateCommand } from '../workspaceAnimationDocument';
import {
  createWorkspaceRouteIntentPlan,
  type WorkspaceRouteIntent,
} from '../workspaceRouteIntent';
import { createWorkspaceCodeLanguageEditTransactionPlan } from '../workspaceCodeLanguageEditTransaction';
import { createWorkspaceCodeSlotRegistryFromSnapshot } from '../authoring/createWorkspaceCodeSlotRegistryFromSnapshot';
import type { WorkspaceSnapshot } from '../types';
import { createAgentWorkspaceRevisionFromSnapshot } from './workspaceAgentContextContributors';

export const WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS = Object.freeze({
  pir: 'action.pir.document-update',
  route: 'action.route.child-create',
  data: 'action.data.document-update',
  nodeGraph: 'action.nodegraph.document-update',
  animation: 'action.animation.document-update',
  code: 'action.code.slot-edit',
} as const);

const descriptors = Object.freeze([
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.pir,
    ownerId: 'prodivix.pir',
    actionType: 'document.update',
    inputSchemaId: 'pir.document-update@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['document'],
    maximumInputBytes: 512 * 1024,
    risk: {
      id: 'risk.pir-authoring-change',
      level: 'medium',
      message: 'Changes canonical PIR authoring state.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.route,
    ownerId: 'prodivix.route',
    actionType: 'child.create',
    inputSchemaId: 'route.child-create@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['semantic-target'],
    maximumInputBytes: 4 * 1024,
    risk: {
      id: 'risk.route-reachability-change',
      level: 'high',
      message: 'Changes canonical route reachability.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.data,
    ownerId: 'prodivix.data',
    actionType: 'document.update',
    inputSchemaId: 'data.document-update@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['document'],
    maximumInputBytes: 512 * 1024,
    risk: {
      id: 'risk.data-contract-change',
      level: 'high',
      message: 'Changes Data source and operation contracts.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.nodeGraph,
    ownerId: 'prodivix.nodegraph',
    actionType: 'document.update',
    inputSchemaId: 'nodegraph.document-update@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['document'],
    maximumInputBytes: 512 * 1024,
    risk: {
      id: 'risk.nodegraph-execution-change',
      level: 'high',
      message: 'Changes NodeGraph execution semantics.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.animation,
    ownerId: 'prodivix.animation',
    actionType: 'document.update',
    inputSchemaId: 'animation.document-update@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['document'],
    maximumInputBytes: 512 * 1024,
    risk: {
      id: 'risk.animation-runtime-change',
      level: 'medium',
      message: 'Changes Animation runtime authoring state.',
    },
  }),
  createAgentActionDescriptor({
    descriptorId: WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.code,
    ownerId: 'prodivix.code',
    actionType: 'slot.edit',
    inputSchemaId: 'code.slot-edit@current',
    requiredCapabilities: ['read', 'propose'],
    allowedTargetKinds: ['semantic-target'],
    maximumInputBytes: 128 * 1024,
    risk: {
      id: 'risk.code-artifact-change',
      level: 'critical',
      message:
        'Changes a revision-bound CodeArtifact through a typed CodeSlot.',
    },
  }),
]);

export const WORKSPACE_AGENT_ACTION_REGISTRY =
  createAgentActionRegistrySnapshot('registry.workspace.g4-v5', descriptors);

export type WorkspaceAgentSourceTraceEntry = Readonly<{
  actionIndex: number;
  descriptorId: string;
  descriptorDigest: string;
  targetKind: string;
  targetId: string;
  commandIds: readonly string[];
}>;

export type WorkspaceAgentActionTransactionPlan = Readonly<{
  baseSnapshot: WorkspaceSnapshot;
  candidateSnapshot: WorkspaceSnapshot;
  transaction: WorkspaceTransactionEnvelope;
  reverseTransaction: WorkspaceTransactionEnvelope;
  requiredCapabilities: readonly AgentCapability[];
  risks: readonly AgentActionDescriptor['risk'][];
  sourceTrace: readonly WorkspaceAgentSourceTraceEntry[];
}>;

export type WorkspaceAgentActionTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceAgentActionTransactionPlan;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentProposalIssue[];
    }>;

export type CreateWorkspaceAgentActionTransactionPlanInput = Readonly<{
  workspace: WorkspaceSnapshot;
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  proposal: AgentActionProposal;
  grant: AgentCapabilityGrant;
  policy: AgentPolicy;
  transactionId: string;
  reverseTransactionId: string;
  issuedAt: string;
}>;

type ActionPlanResult =
  | Readonly<{ ok: true; commands: readonly WorkspaceCommandEnvelope[] }>
  | Readonly<{ ok: false; message: string; code?: AgentProposalIssue['code'] }>;

const riskRank: Readonly<Record<AgentRiskLevel, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

const exactKeys = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key));

const documentContent = (value: unknown): unknown | undefined =>
  exactKeys(value, ['content']) ? value.content : undefined;

const commandFailure = (
  message: string,
  code: AgentProposalIssue['code'] = 'AI-5001'
): ActionPlanResult => Object.freeze({ ok: false, message, code });

const flattenRoutePlan = (
  plan: ReturnType<typeof createWorkspaceRouteIntentPlan>
): readonly WorkspaceCommandEnvelope[] | undefined =>
  plan?.kind === 'command'
    ? Object.freeze([plan.command])
    : plan?.kind === 'transaction'
      ? plan.transaction.commands
      : undefined;

const planPirAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  const document = workspace.docsById[action.target.id];
  const content = documentContent(action.input);
  if (
    !document ||
    !['pir-page', 'pir-layout', 'pir-component'].includes(document.type) ||
    content === undefined
  ) {
    return commandFailure('PIR action target or typed content is invalid.');
  }
  const normalized = tryNormalizePirDocument(content as PIRDocument);
  if (!normalized.ok || !validatePirDocument(normalized.value).valid) {
    return commandFailure('PIR action content failed its domain decoder.');
  }
  const before = tryNormalizePirDocument(document.content as PIRDocument);
  if (!before.ok) return commandFailure('Canonical PIR target is invalid.');
  const command = createWorkspacePirDocumentUpdateCommand({
    workspace,
    documentId: document.id,
    before: before.value,
    after: normalized.value,
    commandId,
    issuedAt,
    label: 'Apply approved Agent PIR action',
  });
  return command
    ? Object.freeze({ ok: true, commands: Object.freeze([command]) })
    : commandFailure('PIR action produced no valid authoring change.');
};

const planRouteAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  if (
    action.target.kind !== 'semantic-target' ||
    !exactKeys(action.input, ['segment', 'routeNodeId', 'pageDocumentId']) ||
    typeof action.input.segment !== 'string' ||
    typeof action.input.routeNodeId !== 'string' ||
    typeof action.input.pageDocumentId !== 'string' ||
    !action.input.segment.trim()
  ) {
    return commandFailure('Route action input is invalid.');
  }
  const intent: WorkspaceRouteIntent = {
    type: 'create-child-route',
    parentRouteNodeId: action.target.id,
    segment: action.input.segment,
    routeNodeId: action.input.routeNodeId,
    pageDocId: action.input.pageDocumentId,
  };
  const commands = flattenRoutePlan(
    createWorkspaceRouteIntentPlan(workspace, intent, {
      id: commandId,
      issuedAt,
      idFactory: (prefix) => `${commandId}:${prefix}`,
    })
  );
  return commands?.length
    ? Object.freeze({ ok: true, commands: Object.freeze([...commands]) })
    : commandFailure('Route action failed domain planning.');
};

const planDataAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  const content = documentContent(action.input);
  if (content === undefined)
    return commandFailure('Data action input is invalid.');
  let decoded: DataSourceDocument;
  try {
    decoded = normalizeDataSourceDocument(content as DataSourceDocument, {
      documentId: action.target.id,
    });
  } catch {
    return commandFailure('Data action failed its domain decoder.');
  }
  const command = createWorkspaceDataSourceDocumentUpdateCommand({
    workspace,
    documentId: action.target.id,
    after: decoded,
    commandId,
    issuedAt,
    label: 'Apply approved Agent Data action',
  });
  return command
    ? Object.freeze({ ok: true, commands: Object.freeze([command]) })
    : commandFailure('Data action failed domain decoding or planning.');
};

const planNodeGraphAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  const content = documentContent(action.input);
  if (content === undefined)
    return commandFailure('NodeGraph action input is invalid.');
  const decoded = validateNodeGraphDocument(content as NodeGraphDocument);
  if (!decoded.ok)
    return commandFailure('NodeGraph action failed its domain decoder.');
  const command = createWorkspaceNodeGraphDocumentUpdateCommand({
    workspace,
    documentId: action.target.id,
    after: decoded.value,
    commandId,
    issuedAt,
    label: 'Apply approved Agent NodeGraph action',
  });
  return command
    ? Object.freeze({ ok: true, commands: Object.freeze([command]) })
    : commandFailure('NodeGraph action failed domain decoding or planning.');
};

const planAnimationAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  const content = documentContent(action.input);
  if (content === undefined)
    return commandFailure('Animation action input is invalid.');
  const decoded = validateAnimationDefinition(content as AnimationDefinition);
  if (!decoded.valid)
    return commandFailure('Animation action failed its domain decoder.');
  const command = createWorkspaceAnimationDocumentUpdateCommand({
    workspace,
    documentId: action.target.id,
    after: decoded.definition,
    commandId,
    issuedAt,
    label: 'Apply approved Agent Animation action',
  });
  return command
    ? Object.freeze({ ok: true, commands: Object.freeze([command]) })
    : commandFailure('Animation action failed domain decoding or planning.');
};

const planCodeAction = (
  workspace: WorkspaceSnapshot,
  action: AgentActionProposal['actions'][number],
  commandId: string,
  issuedAt: string
): ActionPlanResult => {
  if (
    action.target.kind !== 'semantic-target' ||
    !exactKeys(action.input, [
      'artifactId',
      'expectedRevision',
      'sourceSpan',
      'newText',
    ]) ||
    typeof action.input.artifactId !== 'string' ||
    typeof action.input.expectedRevision !== 'string' ||
    typeof action.input.newText !== 'string' ||
    !exactKeys(action.input.sourceSpan, [
      'artifactId',
      'startLine',
      'startColumn',
      'endLine',
      'endColumn',
    ])
  ) {
    return commandFailure(
      'Code action requires one typed CodeSlot language edit.',
      'AI-5004'
    );
  }
  const composition = createWorkspaceCodeSlotRegistryFromSnapshot(workspace);
  if (composition.status !== 'ready') {
    return commandFailure('CodeSlot registry is unavailable.', 'AI-5004');
  }
  const binding = composition.registry.getBindingProjection(action.target.id);
  if (
    !binding ||
    binding.binding.slotId !== action.target.id ||
    binding.binding.reference.artifactId !== action.input.artifactId ||
    action.input.sourceSpan.artifactId !== action.input.artifactId
  ) {
    return commandFailure(
      'Code action target does not resolve to the claimed CodeArtifact binding.',
      'AI-5004'
    );
  }
  const edit: CodeLanguageTextEdit = {
    artifactId: action.input.artifactId,
    expectedRevision: action.input.expectedRevision,
    sourceSpan: {
      artifactId: action.input.sourceSpan.artifactId as string,
      startLine: action.input.sourceSpan.startLine as number,
      startColumn: action.input.sourceSpan.startColumn as number,
      endLine: action.input.sourceSpan.endLine as number,
      endColumn: action.input.sourceSpan.endColumn as number,
    },
    newText: action.input.newText,
  };
  const result = createWorkspaceCodeLanguageEditTransactionPlan({
    workspace,
    transactionId: commandId,
    issuedAt,
    edits: Object.freeze([edit]),
    label: 'Apply approved Agent CodeSlot action',
  });
  return result.status === 'ready'
    ? Object.freeze({
        ok: true,
        commands: Object.freeze([...result.plan.transaction.commands]),
      })
    : commandFailure(
        result.issues.map(({ message }) => message).join(' '),
        'AI-5004'
      );
};

const plannerByDescriptorId: Readonly<
  Record<
    (typeof WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS)[keyof typeof WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS],
    typeof planPirAction
  >
> = Object.freeze({
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.pir]: planPirAction,
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.route]: planRouteAction,
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.data]: planDataAction,
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.nodeGraph]: planNodeGraphAction,
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.animation]: planAnimationAction,
  [WORKSPACE_AGENT_ACTION_DESCRIPTOR_IDS.code]: planCodeAction,
});

const targetAllowed = (
  workspaceId: string,
  grant: AgentCapabilityGrant,
  target: AgentActionProposal['actions'][number]['target']
): boolean =>
  grant.targetScope.targets.some(
    (allowed) =>
      (allowed.kind === target.kind && allowed.id === target.id) ||
      (allowed.kind === 'workspace' && allowed.id === workspaceId)
  );

const policyAllowsDescriptor = (
  input: CreateWorkspaceAgentActionTransactionPlanInput,
  descriptor: AgentActionDescriptor,
  target: AgentActionProposal['actions'][number]['target']
): boolean =>
  descriptor.requiredCapabilities.every((capability) => {
    const matching = input.policy.capabilityRules.filter(
      (rule) =>
        rule.capabilities.includes(capability) &&
        riskRank[rule.maximumRisk] >= riskRank[descriptor.risk.level] &&
        rule.targetScope.targets.some(
          (allowed) =>
            (allowed.kind === target.kind && allowed.id === target.id) ||
            (allowed.kind === 'workspace' && allowed.id === input.workspace.id)
        )
    );
    return (
      matching.some(({ effect }) => effect === 'allow') &&
      !matching.some(({ effect }) => effect === 'deny')
    );
  });

const authorizePlanning = (
  input: CreateWorkspaceAgentActionTransactionPlanInput
): readonly AgentProposalIssue[] => {
  const issues: AgentProposalIssue[] = [];
  let policyDigestMatches = false;
  try {
    policyDigestMatches =
      digestAgentPolicy(input.policy) === input.task.spec.policyDigest;
  } catch {
    policyDigestMatches = false;
  }
  const repairPlanning = input.run.run.phase === 'repairing';
  const revision = repairPlanning
    ? input.proposal.baseRevision
    : input.task.spec.baseRevision;
  const actualRevision = createAgentWorkspaceRevisionFromSnapshot(
    input.workspace
  );
  if (
    !isAgentTaskRecord(input.task) ||
    !isAgentRunSnapshot(input.run) ||
    !isAgentActionProposal(WORKSPACE_AGENT_ACTION_REGISTRY, input.proposal) ||
    !sameAgentWorkspaceRevision(revision, actualRevision) ||
    !sameAgentWorkspaceRevision(revision, input.proposal.baseRevision) ||
    !sameAgentWorkspaceRevision(revision, input.grant.baseRevision) ||
    input.task.spec.workspaceId !== input.workspace.id ||
    input.task.spec.taskId !== input.proposal.taskId ||
    input.run.run.taskId !== input.proposal.taskId ||
    input.run.run.runId !== input.proposal.runId ||
    (!repairPlanning &&
      input.run.run.contextPackDigest !== input.proposal.contextPackDigest) ||
    (input.task.spec.mode !== 'propose' && input.task.spec.mode !== 'apply') ||
    (input.run.run.phase !== 'running' && input.run.run.phase !== 'repairing')
  ) {
    issues.push(
      proposalIssue(
        'AI-5001',
        '/identity',
        'Proposal does not bind the exact active Task, Run, Context, and base revision.'
      )
    );
  }
  if (
    input.grant.taskId !== input.proposal.taskId ||
    (input.grant.runId !== undefined &&
      input.grant.runId !== input.proposal.runId) ||
    input.grant.workspaceId !== input.workspace.id ||
    input.grant.subject.kind !== input.task.spec.actor.kind ||
    input.grant.subject.principalId !== input.task.spec.actor.principalId ||
    input.grant.grantId !== input.task.spec.initialGrantRef.grantId ||
    input.grant.policyDigest !== input.task.spec.policyDigest ||
    !policyDigestMatches ||
    input.grant.grantId !== input.run.run.grantRef.grantId ||
    !isAgentControlInstant(input.issuedAt) ||
    Date.parse(input.issuedAt) < Date.parse(input.grant.issuedAt) ||
    Date.parse(input.issuedAt) >= Date.parse(input.grant.expiresAt)
  ) {
    issues.push(
      proposalIssue(
        'AI-7001',
        '/grant',
        'Proposal capability grant is stale or bound to another Task, Run, policy, or Workspace.'
      )
    );
  }
  input.proposal.actions.forEach((action, index) => {
    const descriptor = WORKSPACE_AGENT_ACTION_REGISTRY.descriptors.find(
      (candidate) =>
        candidate.ownerId === action.ownerId &&
        candidate.actionType === action.actionType &&
        candidate.inputSchemaId === action.inputSchemaId
    );
    if (
      !descriptor ||
      !targetAllowed(input.workspace.id, input.grant, action.target) ||
      !descriptor.requiredCapabilities.every((capability) =>
        input.grant.capabilities.includes(capability)
      ) ||
      !policyAllowsDescriptor(input, descriptor, action.target)
    ) {
      issues.push(
        proposalIssue(
          descriptor ? 'AI-5002' : 'AI-5005',
          `/actions/${index}`,
          'Proposal action is outside its registered target, capability, or policy scope.'
        )
      );
    }
  });
  return Object.freeze(issues);
};

const reverseCommand = (
  command: WorkspaceCommandEnvelope,
  id: string,
  issuedAt: string
): WorkspaceCommandEnvelope => ({
  ...command,
  id,
  issuedAt,
  forwardOps: [...command.reverseOps],
  reverseOps: [...command.forwardOps],
  label: `Reverse ${command.label ?? command.type}`,
});

/**
 * Strictly decodes every first-party action against its domain owner, applies
 * all actions to an ephemeral snapshot, and returns one reversible atomic
 * Transaction. No proposal value is itself a Command or WorkspaceOperation.
 */
export const createWorkspaceAgentActionTransactionPlan = (
  input: CreateWorkspaceAgentActionTransactionPlanInput
): WorkspaceAgentActionTransactionPlanResult => {
  const authorizationIssues = authorizePlanning(input);
  if (authorizationIssues.length > 0) {
    return Object.freeze({ status: 'blocked', issues: authorizationIssues });
  }
  let candidate = input.workspace;
  const commands: WorkspaceCommandEnvelope[] = [];
  const requiredCapabilities = new Set<AgentCapability>();
  const risks: AgentActionDescriptor['risk'][] = [];
  const sourceTrace: WorkspaceAgentSourceTraceEntry[] = [];

  for (const [index, action] of input.proposal.actions.entries()) {
    const descriptor = WORKSPACE_AGENT_ACTION_REGISTRY.descriptors.find(
      (candidateDescriptor) =>
        candidateDescriptor.ownerId === action.ownerId &&
        candidateDescriptor.actionType === action.actionType &&
        candidateDescriptor.inputSchemaId === action.inputSchemaId
    )!;
    const commandId = `${input.transactionId}:action:${index}`;
    const planner =
      plannerByDescriptorId[
        descriptor.descriptorId as keyof typeof plannerByDescriptorId
      ];
    if (!planner) {
      return Object.freeze({
        status: 'blocked',
        issues: Object.freeze([
          proposalIssue(
            'AI-5005',
            `/actions/${index}`,
            'Registered Agent action has no domain planner.'
          ),
        ]),
      });
    }
    const planned = planner(candidate, action, commandId, input.issuedAt);
    if (!planned.ok) {
      return Object.freeze({
        status: 'blocked',
        issues: Object.freeze([
          proposalIssue(
            planned.code ?? 'AI-5001',
            `/actions/${index}`,
            planned.message
          ),
        ]),
      });
    }
    const part: WorkspaceTransactionEnvelope = {
      id: `${input.transactionId}:dry-run:${index}`,
      workspaceId: input.workspace.id,
      issuedAt: input.issuedAt,
      commands: [...planned.commands],
    };
    const applied = applyWorkspaceTransaction(candidate, part);
    if (!applied.ok) {
      return Object.freeze({
        status: 'blocked',
        issues: Object.freeze([
          proposalIssue(
            'AI-5001',
            `/actions/${index}`,
            'Agent domain dry-run failed Workspace validation.'
          ),
        ]),
      });
    }
    candidate = applied.snapshot;
    commands.push(...planned.commands);
    descriptor.requiredCapabilities.forEach((capability) =>
      requiredCapabilities.add(capability)
    );
    risks.push(descriptor.risk);
    sourceTrace.push(
      Object.freeze({
        actionIndex: index,
        descriptorId: descriptor.descriptorId,
        descriptorDigest: descriptor.descriptorDigest,
        targetKind: action.target.kind,
        targetId: action.target.id,
        commandIds: Object.freeze(planned.commands.map(({ id }) => id)),
      })
    );
  }

  const transaction: WorkspaceTransactionEnvelope = {
    id: input.transactionId,
    workspaceId: input.workspace.id,
    issuedAt: input.issuedAt,
    label: 'Apply approved Agent proposal',
    commands: [...commands],
  };
  Object.freeze(transaction.commands);
  Object.freeze(transaction);
  const atomicDryRun = applyWorkspaceTransaction(input.workspace, transaction);
  if (!atomicDryRun.ok) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        proposalIssue(
          'AI-5001',
          '/transaction',
          'Combined Agent actions do not form one valid atomic Transaction.'
        ),
      ]),
    });
  }
  const reverseTransaction: WorkspaceTransactionEnvelope = {
    id: input.reverseTransactionId,
    workspaceId: input.workspace.id,
    issuedAt: input.issuedAt,
    label: 'Reverse approved Agent proposal',
    commands: [...commands]
      .reverse()
      .map((command, index) =>
        reverseCommand(
          command,
          `${input.reverseTransactionId}:action:${index}`,
          input.issuedAt
        )
      ),
  };
  Object.freeze(reverseTransaction.commands);
  Object.freeze(reverseTransaction);
  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      baseSnapshot: input.workspace,
      candidateSnapshot: atomicDryRun.snapshot,
      transaction,
      reverseTransaction,
      requiredCapabilities: Object.freeze([...requiredCapabilities]),
      risks: Object.freeze(risks),
      sourceTrace: Object.freeze(sourceTrace),
    }),
  });
};
