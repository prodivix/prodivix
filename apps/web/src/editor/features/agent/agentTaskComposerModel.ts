import {
  createAgentTaskRecord,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  encodeAgentControlFact,
  type AgentTaskMode,
  type AgentTaskRecord,
} from '@prodivix/ai';

// Product entry points share this model so the UI never invents target authority.
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  selectWorkspaceAgentPolicyDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type AgentTaskEntryKind = 'component' | 'route' | 'issue' | 'workspace';

export type AgentTaskComposerTarget = Readonly<{
  kind: AgentTaskEntryKind;
  id: string;
}>;

export type CreateAgentTaskComposerFactInput = Readonly<{
  projectId: string;
  workspace: WorkspaceSnapshot;
  actorId: string;
  mode: AgentTaskMode;
  intent: string;
  target: AgentTaskComposerTarget;
  now?: string;
  identity?: string;
}>;

export const createAgentTaskComposerPath = (
  projectId: string,
  target: AgentTaskComposerTarget
): string => {
  const search = new URLSearchParams({
    targetKind: target.kind,
    targetId: target.id,
  });
  return `/editor/project/${encodeURIComponent(projectId)}/agent?${search.toString()}`;
};

const workspaceRevision = (workspace: WorkspaceSnapshot) =>
  Object.freeze({
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    documents: Object.freeze(
      Object.values(workspace.docsById)
        .map(({ id, contentRev, metaRev }) =>
          Object.freeze({ documentId: id, contentRev, metaRev })
        )
        .sort((left, right) =>
          compareUnicodeCodePoints(left.documentId, right.documentId)
        )
    ),
  });

const taskTarget = (
  workspace: WorkspaceSnapshot,
  target: AgentTaskComposerTarget
) => {
  const id = target.id.trim();
  if (!id) throw new TypeError('Agent Task target is required.');
  switch (target.kind) {
    case 'workspace':
      return Object.freeze({ kind: 'workspace' as const, id: workspace.id });
    case 'component':
      return Object.freeze({ kind: 'document' as const, id });
    case 'route':
      return Object.freeze({
        kind: 'semantic-target' as const,
        id: `route:${id}`,
      });
    case 'issue':
      return Object.freeze({
        kind: 'semantic-target' as const,
        id: `issue:${id}`,
      });
  }
};

export const createAgentTaskComposerFact = (
  input: CreateAgentTaskComposerFactInput
): Readonly<{
  task: AgentTaskRecord;
  wire: ReturnType<typeof encodeAgentControlFact>;
  policyName: string;
}> => {
  const policyResult = selectWorkspaceAgentPolicyDocument(input.workspace);
  if (policyResult?.status !== 'valid') {
    throw new TypeError(
      'Agent Task creation requires one valid canonical AgentPolicy document.'
    );
  }
  const intent = input.intent.trim();
  if (!intent || intent !== input.intent || intent.length > 16_384) {
    throw new TypeError('Agent Task intent must be trimmed and bounded.');
  }
  const identity = (input.identity ?? crypto.randomUUID()).replaceAll('-', '.');
  const createdAt = input.now ?? new Date().toISOString();
  const policy = policyResult.decodedContent;
  const task = createAgentTaskRecord({
    taskId: `task.${identity}`,
    projectId: input.projectId,
    workspaceId: input.workspace.id,
    actor: Object.freeze({ kind: 'user' as const, principalId: input.actorId }),
    mode: input.mode,
    baseRevision: workspaceRevision(input.workspace),
    intent,
    intentDigest: digestAgentCanonicalValue(intent),
    targetScope: Object.freeze({
      targets: Object.freeze([taskTarget(input.workspace, input.target)]),
    }),
    policyRef: Object.freeze({ documentId: policyResult.document.id }),
    policyDigest: digestAgentPolicy(policy),
    initialGrantRef: Object.freeze({ grantId: `grant.task.${identity}` }),
    budget: policy.budgetCeiling,
    verificationRequirement: Object.freeze({
      policyRef: `verification-policy:${policy.id}`,
      requiredCheckKinds: policy.verificationRules.requiredCheckKinds,
    }),
    createdAt,
    idempotencyKey: `idempotency.task.${identity}`,
  });
  return Object.freeze({
    task,
    wire: encodeAgentControlFact({ factType: 'task-record', value: task }),
    policyName: policy.name,
  });
};
