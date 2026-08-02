import {
  createAgentApprovalDecision,
  createAgentRunUserCommand,
  decodeAgentControlFact,
  decodeAgentProductLedgerBundle,
  encodeAgentProductFact,
  encodeAgentProposalFact,
  type AgentApprovalDecision,
  type AgentProductView,
  type AgentRunUserCommandKind,
  type AgentTaskRecord,
} from '@prodivix/ai';
import { WORKSPACE_AGENT_ACTION_REGISTRY } from '@prodivix/workspace';
import { apiBinaryRequest, apiRequest } from '@/infra/api';

const basePath = (projectId: string, workspaceId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/agent`;

export const loadAgentProduct = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    runId: string;
    signal?: AbortSignal;
  }>
): Promise<AgentProductView> => {
  const response = await apiRequest<unknown>(
    `${basePath(input.projectId, input.workspaceId)}/runs/${encodeURIComponent(input.runId)}/product`,
    { token: input.token, signal: input.signal }
  );
  const decoded = decodeAgentProductLedgerBundle(
    WORKSPACE_AGENT_ACTION_REGISTRY,
    response
  );
  if (!decoded.ok) throw new TypeError(decoded.message);
  return decoded.value;
};

export const createAgentTask = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    wire: unknown;
  }>
): Promise<AgentTaskRecord> => {
  const response = await apiRequest<unknown>(
    `${basePath(input.projectId, input.workspaceId)}/tasks`,
    {
      method: 'POST',
      token: input.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.wire),
    }
  );
  if (
    typeof response !== 'object' ||
    response === null ||
    Array.isArray(response) ||
    !Object.hasOwn(response, 'task')
  ) {
    throw new TypeError('Agent Task response is malformed.');
  }
  const decoded = decodeAgentControlFact(
    (response as Record<string, unknown>).task
  );
  if (!decoded.ok || decoded.value.factType !== 'task-record') {
    throw new TypeError('Agent Task response failed strict validation.');
  }
  return decoded.value.value;
};

export const submitAgentRunCommand = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    view: AgentProductView;
    actorId: string;
    kind: AgentRunUserCommandKind;
    reason?: string;
  }>
): Promise<void> => {
  const identity = crypto.randomUUID().replaceAll('-', '.');
  const command = createAgentRunUserCommand({
    commandId: `command.${identity}`,
    taskId: input.view.identity.taskId,
    runId: input.view.identity.runId,
    kind: input.kind,
    actor: Object.freeze({ kind: 'user' as const, principalId: input.actorId }),
    expectedGeneration: input.view.identity.generation,
    expectedSnapshotDigest: input.view.identity.runSnapshotDigest,
    idempotencyKey: `idempotency.command.${identity}`,
    ...(input.reason ? { reason: input.reason.trim() } : {}),
    requestedAt: new Date().toISOString(),
  });
  await apiRequest(
    `${basePath(input.projectId, input.workspaceId)}/runs/${encodeURIComponent(input.view.identity.runId)}/commands`,
    {
      method: 'POST',
      token: input.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        encodeAgentProductFact({ factType: 'run-user-command', value: command })
      ),
    }
  );
};

export const submitAgentApproval = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    view: AgentProductView;
    actorId: string;
    decision: AgentApprovalDecision['decision'];
    rollbackAuthorization: AgentApprovalDecision['rollbackAuthorization'];
    reason?: string;
  }>
): Promise<void> => {
  const { preview, planning } = input.view;
  if (!preview || !planning) {
    throw new TypeError('Exact proposal preview and planning are required.');
  }
  const now = new Date().toISOString();
  const decision = createAgentApprovalDecision({
    decisionId: `decision.${crypto.randomUUID().replaceAll('-', '.')}`,
    decision: input.decision,
    actor: Object.freeze({ kind: 'user' as const, principalId: input.actorId }),
    taskId: input.view.identity.taskId,
    runId: input.view.identity.runId,
    previewId: preview.previewId,
    previewDigest: preview.previewDigest,
    baseRevision: preview.baseRevision,
    transactionDigest: planning.transactionDigest,
    impactDigest: planning.impactDigest,
    verificationPlanDigest: planning.verificationPlanDigest,
    grantRef: input.view.run.grantRef,
    policyDigest: input.view.run.policyDigest,
    rollbackAuthorization: input.rollbackAuthorization,
    ...(input.reason ? { reason: input.reason.trim() } : {}),
    decidedAt: now,
    expiresAt: preview.expiresAt,
  });
  await apiRequest(
    `${basePath(input.projectId, input.workspaceId)}/approvals`,
    {
      method: 'POST',
      token: input.token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
          factType: 'approval',
          value: decision,
        })
      ),
    }
  );
};

export const downloadAgentAudit = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    runId: string;
  }>
): Promise<Uint8Array> => {
  const result = await apiBinaryRequest(
    `${basePath(input.projectId, input.workspaceId)}/runs/${encodeURIComponent(input.runId)}/audit`,
    { token: input.token }
  );
  if (result.mediaType !== 'application/json') {
    throw new TypeError('Agent audit export did not return JSON.');
  }
  return result.contents;
};
