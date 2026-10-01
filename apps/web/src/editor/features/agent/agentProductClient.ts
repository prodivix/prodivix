import {
  createAgentApprovalDecision,
  createAgentRunUserCommand,
  decodeAgentControlFact,
  decodeAgentProductLedgerBundle,
  decodeAgentTaskOutput,
  createAgentRepairTaskAdmissionInput,
  decodeAgentRepairTaskAdmission,
  encodeAgentControlFact,
  encodeAgentProductFact,
  encodeAgentProposalFact,
  resolveAgentTaskAdmission,
  type AgentApprovalDecision,
  type AgentProductView,
  type AgentRunUserCommandKind,
  type AgentTaskRecord,
  type AgentTaskOutput,
  type AgentTaskAdmissionResult,
} from '@prodivix/ai';
import { WORKSPACE_AGENT_ACTION_REGISTRY } from '@prodivix/workspace';
import { apiBinaryRequest, apiRequest } from '@/infra/api';
import { isPlainObject } from '@prodivix/shared/safety';
import { sameCanonicalJson } from '@prodivix/shared/canonical';

const basePath = (projectId: string, workspaceId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/agent`;

export const loadAgentTaskOutputs = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    view: AgentProductView;
    signal?: AbortSignal;
  }>
): Promise<readonly AgentTaskOutput[]> => {
  if (
    input.view.identity.projectId !== input.projectId ||
    input.view.identity.workspaceId !== input.workspaceId
  )
    throw new TypeError(
      'Agent Task output scope does not bind this project and Workspace.'
    );
  const response = await apiRequest<unknown>(
    `${basePath(input.projectId, input.workspaceId)}/runs/${encodeURIComponent(input.view.identity.runId)}/task-outputs`,
    {
      token: input.token,
      signal: input.signal,
      maxResponseBytes: 8_388_608,
    }
  );
  if (
    !isPlainObject(response) ||
    Object.keys(response).length !== 1 ||
    !Array.isArray(response.items) ||
    response.items.length > 32
  )
    throw new TypeError('Agent Task output response is malformed.');
  const ids = new Set<string>();
  const invocations = new Set<string>();
  return Object.freeze(
    response.items.map((wire) => {
      const decoded = decodeAgentTaskOutput(wire);
      if (!decoded.ok) throw new TypeError(decoded.message);
      const output = decoded.value;
      if (
        output.runId !== input.view.identity.runId ||
        output.taskId !== input.view.identity.taskId ||
        output.projectPolicyDigest !== input.view.task.policyDigest ||
        output.generation > input.view.identity.generation ||
        (output.kind === 'answer'
          ? input.view.task.mode !== 'explain'
          : input.view.task.mode !== 'plan') ||
        ids.has(output.outputId) ||
        invocations.has(output.modelInvocationId)
      )
        throw new TypeError(
          'Agent Task output does not bind this durable Run.'
        );
      ids.add(output.outputId);
      invocations.add(output.modelInvocationId);
      return output;
    })
  );
};

export const findAgentTaskRun = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    taskId: string;
    signal?: AbortSignal;
  }>
): Promise<string | null> => {
  const response = await apiRequest<unknown>(
    `${basePath(input.projectId, input.workspaceId)}/tasks/${encodeURIComponent(input.taskId)}/run`,
    { token: input.token, signal: input.signal }
  );
  if (
    !isPlainObject(response) ||
    typeof response.runId !== 'string' ||
    response.runId.length > 256 ||
    response.runId.trim() !== response.runId
  )
    throw new TypeError('Agent Task Run discovery response is malformed.');
  return response.runId || null;
};

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
    signal?: AbortSignal;
  }>
): Promise<AgentTaskRecord> => {
  const requested = decodeAgentControlFact(input.wire);
  if (
    !requested.ok ||
    requested.value.factType !== 'task-record' ||
    requested.value.value.spec.projectId !== input.projectId ||
    requested.value.value.spec.workspaceId !== input.workspaceId
  )
    throw new TypeError(
      'Expected one strict Task for the current project and Workspace.'
    );
  const base = basePath(input.projectId, input.workspaceId);
  const admission = await resolveAgentTaskAdmission({
    requestedTask: requested.value.value,
    signal: input.signal,
    transport: {
      create: (signal) =>
        apiRequest<unknown>(`${base}/task-admissions`, {
          method: 'POST',
          token: input.token,
          signal,
          maxResponseBytes: 2_097_152,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: input.wire }),
        }),
      load: (admissionId, signal) =>
        apiRequest<unknown>(
          `${base}/task-admissions/${encodeURIComponent(admissionId)}`,
          { token: input.token, signal, maxResponseBytes: 2_097_152 }
        ),
    },
  });
  return submitAdmittedAgentTask(input, admission);
};

const submitAdmittedAgentTask = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    signal?: AbortSignal;
  }>,
  admission: AgentTaskAdmissionResult
): Promise<AgentTaskRecord> => {
  const base = basePath(input.projectId, input.workspaceId);
  input.signal?.throwIfAborted();
  const response = await apiRequest<unknown>(`${base}/tasks`, {
    method: 'POST',
    token: input.token,
    signal: input.signal,
    maxResponseBytes: 2_097_152,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: encodeAgentControlFact({
        factType: 'task-record',
        value: admission.task,
      }),
      admissionId: admission.admissionId,
      admissionDigest: admission.admissionDigest,
    }),
  });
  if (
    !isPlainObject(response) ||
    !Object.hasOwn(response, 'task') ||
    Object.keys(response).some((key) => key !== 'task' && key !== 'replayed') ||
    (Object.hasOwn(response, 'replayed') &&
      typeof response.replayed !== 'boolean')
  ) {
    throw new TypeError('Agent Task response is malformed.');
  }
  const decoded = decodeAgentControlFact(
    (response as Record<string, unknown>).task
  );
  if (
    !decoded.ok ||
    decoded.value.factType !== 'task-record' ||
    !sameCanonicalJson(decoded.value.value, admission.task)
  ) {
    throw new TypeError('Agent Task response failed strict validation.');
  }
  input.signal?.throwIfAborted();
  return decoded.value.value;
};

/** The server binds the original failure and reserves its remaining budget; the child still needs fresh human approval. */
export const submitAgentRepairTask = async (
  input: Readonly<{
    token: string;
    projectId: string;
    workspaceId: string;
    view: AgentProductView;
    actorId: string;
    requestId?: string;
    signal?: AbortSignal;
  }>
): Promise<AgentTaskRecord> => {
  const body = createAgentRepairTaskAdmissionInput(input);
  const base = basePath(input.projectId, input.workspaceId);
  const response = await apiRequest<unknown>(
    `${base}/runs/${encodeURIComponent(input.view.identity.runId)}/repair-task-requests`,
    {
      method: 'POST',
      token: input.token,
      signal: input.signal,
      maxResponseBytes: 8_388_608,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const decoded = decodeAgentRepairTaskAdmission(response, input);
  const admission = await resolveAgentTaskAdmission({
    requestedTask: decoded.request.requestedTask,
    signal: input.signal,
    transport: {
      create: async () => decoded.challenge,
      load: (admissionId, signal) =>
        apiRequest<unknown>(
          `${base}/task-admissions/${encodeURIComponent(admissionId)}`,
          {
            token: input.token,
            signal,
            maxResponseBytes: 2_097_152,
          }
        ),
    },
  });
  return submitAdmittedAgentTask(input, admission);
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
