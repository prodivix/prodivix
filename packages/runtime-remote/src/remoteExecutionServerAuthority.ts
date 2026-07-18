export const REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT =
  'prodivix.remote-execution-server-authority.v1' as const;
export const REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT =
  'prodivix.remote-execution-server-authority-lease.v1' as const;

export const REMOTE_EXECUTION_SERVER_AUTHORITY_LIMITS = Object.freeze({
  maximumIdentifierLength: 4_096,
  maximumPermissionIdLength: 256,
  maximumPermissions: 32,
  maximumTtlMs: 5 * 60 * 1_000,
});

export type RemoteExecutionServerAuthority = Readonly<{
  format: typeof REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT;
  principal: Readonly<{
    providerId: string;
    principalId: string;
  }>;
  permissions: readonly string[];
  workspaceId: string;
  snapshotId: string;
  expiresAt: number;
}>;

/** Worker-only projection. The lease token and product session never cross this boundary. */
export type RemoteExecutionServerAuthorityLease = Readonly<{
  format: typeof REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT;
  executionId: string;
  workerId: string;
  workerAttempt: number;
  principal: RemoteExecutionServerAuthority['principal'];
  permissions: RemoteExecutionServerAuthority['permissions'];
  workspaceId: string;
  snapshotId: string;
  expiresAt: number;
}>;

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key))
    ? record
    : undefined;
};

const identifier = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <=
    REMOTE_EXECUTION_SERVER_AUTHORITY_LIMITS.maximumIdentifierLength &&
  value === value.trim() &&
  !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : undefined;

const positiveInteger = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : undefined;

const permissionId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <=
    REMOTE_EXECUTION_SERVER_AUTHORITY_LIMITS.maximumPermissionIdLength &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    ? value
    : undefined;

const readPermissions = (value: unknown): readonly string[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length > REMOTE_EXECUTION_SERVER_AUTHORITY_LIMITS.maximumPermissions
  )
    return undefined;
  const permissions = value.map(permissionId);
  if (
    permissions.some((permission) => permission === undefined) ||
    permissions.some(
      (permission, index) =>
        index > 0 &&
        (permissions[index - 1] as string).localeCompare(
          permission as string
        ) >= 0
    )
  )
    return undefined;
  return Object.freeze(permissions as string[]);
};

const readPrincipal = (
  value: unknown
): RemoteExecutionServerAuthority['principal'] | undefined => {
  const record = exactRecord(value, ['providerId', 'principalId']);
  const providerId = identifier(record?.providerId);
  const principalId = identifier(record?.principalId);
  return providerId && principalId
    ? Object.freeze({ providerId, principalId })
    : undefined;
};

/** Strictly decodes the Backend-attested, server-only authority projection. */
export const readRemoteExecutionServerAuthority = (
  value: unknown
): RemoteExecutionServerAuthority | undefined => {
  const record = exactRecord(value, [
    'format',
    'principal',
    'permissions',
    'workspaceId',
    'snapshotId',
    'expiresAt',
  ]);
  const principal = readPrincipal(record?.principal);
  const permissions = readPermissions(record?.permissions);
  const workspaceId = identifier(record?.workspaceId);
  const snapshotId = identifier(record?.snapshotId);
  const expiresAt = positiveInteger(record?.expiresAt);
  return record?.format === REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT &&
    principal &&
    permissions &&
    workspaceId &&
    snapshotId &&
    expiresAt
    ? Object.freeze({
        format: REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT,
        principal,
        permissions,
        workspaceId,
        snapshotId,
        expiresAt,
      })
    : undefined;
};

export const createRemoteExecutionServerAuthorityLease = (input: {
  authority: RemoteExecutionServerAuthority;
  executionId: string;
  workerId: string;
  workerAttempt: number;
}): RemoteExecutionServerAuthorityLease => {
  const authority = readRemoteExecutionServerAuthority(input.authority);
  const executionId = identifier(input.executionId);
  const workerId = identifier(input.workerId);
  const workerAttempt = positiveInteger(input.workerAttempt);
  if (!authority || !executionId || !workerId || !workerAttempt)
    throw new TypeError('Remote execution authority lease is invalid.');
  return Object.freeze({
    format: REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT,
    executionId,
    workerId,
    workerAttempt,
    principal: authority.principal,
    permissions: authority.permissions,
    workspaceId: authority.workspaceId,
    snapshotId: authority.snapshotId,
    expiresAt: authority.expiresAt,
  });
};

/** Strict worker-side decoder for the internal claim response. */
export const readRemoteExecutionServerAuthorityLease = (
  value: unknown
): RemoteExecutionServerAuthorityLease | undefined => {
  const record = exactRecord(value, [
    'format',
    'executionId',
    'workerId',
    'workerAttempt',
    'principal',
    'permissions',
    'workspaceId',
    'snapshotId',
    'expiresAt',
  ]);
  const principal = readPrincipal(record?.principal);
  const permissions = readPermissions(record?.permissions);
  const executionId = identifier(record?.executionId);
  const workerId = identifier(record?.workerId);
  const workerAttempt = positiveInteger(record?.workerAttempt);
  const workspaceId = identifier(record?.workspaceId);
  const snapshotId = identifier(record?.snapshotId);
  const expiresAt = positiveInteger(record?.expiresAt);
  return record?.format === REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT &&
    executionId &&
    workerId &&
    workerAttempt &&
    principal &&
    permissions &&
    workspaceId &&
    snapshotId &&
    expiresAt
    ? Object.freeze({
        format: REMOTE_EXECUTION_SERVER_AUTHORITY_LEASE_FORMAT,
        executionId,
        workerId,
        workerAttempt,
        principal,
        permissions,
        workspaceId,
        snapshotId,
        expiresAt,
      })
    : undefined;
};
