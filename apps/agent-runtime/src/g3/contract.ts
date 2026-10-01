import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
} from '@prodivix/ai';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  decodeVerificationPlan,
  decodeVerificationRunSnapshot,
  type VerificationPlan,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import {
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type DriverAuthority = Readonly<{
  leaseId: string;
  holderId: string;
  generation: number;
  observedAt: string;
}>;
export type DriverCoordinates = Readonly<{
  taskId: string;
  agentRunId: string;
  verificationRunId: string;
  planDigest: string;
  requestDigest: string;
  authority?: DriverAuthority;
  cancellationCommandId?: string;
}>;
export type DriverExecution = Readonly<{
  contract: 'prodivix.agent-runtime-g3-execution';
  taskId: string;
  agentRunId: string;
  authority: DriverAuthority;
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
  run: VerificationRunSnapshot;
  wire: Record<string, unknown>;
}>;
export type DriverCancellation = Readonly<{
  contract: 'prodivix.agent-runtime-g3-cancellation';
  taskId: string;
  agentRunId: string;
  workspaceId: string;
  verificationRunId: string;
  planDigest: string;
  authority?: DriverAuthority;
  cancellationCommandId?: string;
  wire: Record<string, unknown>;
}>;

export const exactDriverRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) =>
        isUnsafeObjectKey(key) || ![...required, ...optional].includes(key)
    )
  ) {
    throw new TypeError('G3 driver contract is invalid.');
  }
  return value;
};
export const driverIdentity = (value: unknown): string => {
  if (typeof value !== 'string' || !isAgentControlIdentity(value))
    throw new TypeError('G3 driver identity is invalid.');
  return value;
};
export const driverDigest = (value: unknown): string => {
  if (typeof value !== 'string' || !isAgentCanonicalDigest(value))
    throw new TypeError('G3 driver digest is invalid.');
  return value;
};
export const decodeDriverAuthority = (value: unknown): DriverAuthority => {
  const record = exactDriverRecord(value, [
    'leaseId',
    'holderId',
    'generation',
    'observedAt',
  ]);
  if (
    !Number.isSafeInteger(record.generation) ||
    (record.generation as number) < 1 ||
    typeof record.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.observedAt)) ||
    new Date(record.observedAt).toISOString() !== record.observedAt
  )
    throw new TypeError('G3 driver lease is invalid.');
  return {
    leaseId: driverIdentity(record.leaseId),
    holderId: driverIdentity(record.holderId),
    generation: record.generation as number,
    observedAt: record.observedAt,
  };
};

/** HTTP inputs only select an already committed owner fact; Backend re-reads it. */
export const decodeDriverExecution = (value: unknown): DriverExecution => {
  const record = exactDriverRecord(value, [
    'contract',
    'taskId',
    'agentRunId',
    'authority',
    'workspace',
    'plan',
    'run',
  ]);
  const plan = decodeVerificationPlan(record.plan);
  const run = decodeVerificationRunSnapshot(record.run);
  if (
    record.contract !== 'prodivix.agent-runtime-g3-execution' ||
    !plan.ok ||
    !run.ok ||
    !isPlainObject(record.workspace) ||
    !validateWorkspaceSnapshot(record.workspace as unknown as WorkspaceSnapshot)
      .valid
  )
    throw new TypeError('G3 execution facts are invalid.');
  const workspace = record.workspace as WorkspaceSnapshot;
  if (
    plan.value.status !== 'ready' ||
    workspace.id !== plan.value.workspaceId ||
    workspace.id !== run.value.workspaceId ||
    workspace.workspaceRev !== run.value.workspaceRevision ||
    run.value.planDigest !== plan.value.planDigest ||
    run.value.scope !== 'required' ||
    run.value.selectedCellIds.length === 0 ||
    !['queued', 'running'].includes(run.value.status) ||
    run.value.selectedCellIds.some(
      (id) =>
        !plan.value.cells.some(
          (cell) =>
            cell.id === id &&
            cell.requirement === 'required' &&
            cell.surface === run.value.surface
        )
    )
  )
    throw new TypeError('G3 execution coordinates drifted.');
  return {
    contract: record.contract,
    taskId: driverIdentity(record.taskId),
    agentRunId: driverIdentity(record.agentRunId),
    authority: decodeDriverAuthority(record.authority),
    workspace,
    plan: plan.value,
    run: run.value,
    wire: record,
  };
};

/** Heartbeat observation time renews authorization without changing the immutable dispatch commitment. */
export const digestDriverExecutionRequest = (
  request: DriverExecution
): string => {
  const { observedAt: _observedAt, ...lease } = request.authority;
  return digestAgentCanonicalValue({ ...request.wire, authority: lease });
};

export const decodeDriverCancellation = (
  value: unknown
): DriverCancellation => {
  const record = exactDriverRecord(
    value,
    [
      'contract',
      'taskId',
      'agentRunId',
      'workspaceId',
      'verificationRunId',
      'planDigest',
    ],
    ['authority', 'cancellationCommandId']
  );
  if (
    record.contract !== 'prodivix.agent-runtime-g3-cancellation' ||
    (record.authority === undefined &&
      record.cancellationCommandId === undefined)
  )
    throw new TypeError('G3 cancellation authority is absent.');
  return {
    contract: record.contract,
    taskId: driverIdentity(record.taskId),
    agentRunId: driverIdentity(record.agentRunId),
    workspaceId: driverIdentity(record.workspaceId),
    verificationRunId: driverIdentity(record.verificationRunId),
    planDigest: driverDigest(record.planDigest),
    ...(record.authority === undefined
      ? {}
      : { authority: decodeDriverAuthority(record.authority) }),
    ...(record.cancellationCommandId === undefined
      ? {}
      : {
          cancellationCommandId: driverIdentity(record.cancellationCommandId),
        }),
    wire: record,
  };
};
