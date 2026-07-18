import type {
  ExecutableProjectServerFunctionPlan,
  ExecutionRequest,
} from '@prodivix/runtime-core';
import {
  readExecutionServerFunctionBridgeRequest,
  readExecutionServerFunctionBridgeResponse,
  type ExecutionServerFunctionBridgeRequest,
  type ExecutionServerFunctionBridgeResponse,
} from './serverRuntimeBridge';
import { validateServerFunctionOutcome } from './serverRuntimeKernel';
import {
  decodeServerRuntimeProfile,
  resolveServerFunctionDefinition,
  SERVER_RUNTIME_PROFILE_METADATA_KEY,
} from './serverRuntimeProfile';
import type { ServerFunctionDefinition } from './serverRuntime.types';
import type { AuthPrincipal } from './serverRuntime.types';

export const ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE =
  'application/vnd.prodivix.server-function-result+json' as const;
export const ISOLATED_SERVER_FUNCTION_ADAPTER_ID =
  'prodivix.code-export' as const;
export const ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT =
  'prodivix.isolated-server-function-authority.v1' as const;
export const ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH =
  '.prodivix/server-function-authority.json' as const;
export const ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT =
  'prodivix.isolated-server-function-secret-material.v1' as const;
export const ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH =
  '.prodivix/server-function-secrets.json' as const;
export const ISOLATED_SERVER_FUNCTION_SECRET_MAX_FIELDS = 32;
export const ISOLATED_SERVER_FUNCTION_SECRET_MAX_MATERIAL_BYTES = 64 * 1024;
export const ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_TTL_MS = 5 * 60 * 1_000;
export const ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_PERMISSIONS = 32;
export const ISOLATED_SERVER_FUNCTION_WORKSPACE_OWNER_PERMISSION_ID =
  'workspace.owner' as const;

const isolatedServerFunctionFailureCodes = new Set([
  'SVR_REQUEST_INVALID',
  'SVR_INPUT_INVALID',
  'SVR_OUTPUT_INVALID',
  'SVR_OUTCOME_INVALID',
  'SVR_ADAPTER_MISSING',
  'SVR_AUTHORITY_INVALID',
  'SVR_ENVIRONMENT_LEASE_MISSING',
  'SVR_SECRET_BINDING_MISSING',
  'SVR_SECRET_OUTPUT_LEAK',
  'SVR_ISOLATED_EXECUTION_FAILED',
]);

export type IsolatedServerFunctionPlan = Readonly<{
  plan: ExecutableProjectServerFunctionPlan;
  definition: ServerFunctionDefinition;
}>;

export type IsolatedServerFunctionAuthority = Readonly<{
  format: typeof ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT;
  workspaceId: string;
  snapshotId: string;
  principal: AuthPrincipal;
  permissions: readonly string[];
  expiresAt: number;
}>;

export type IsolatedServerFunctionExecutionContext = Readonly<{
  invocation: ExecutionServerFunctionBridgeRequest;
  authority?: IsolatedServerFunctionAuthority;
}>;

export type IsolatedServerFunctionSecretMaterial = Readonly<{
  format: typeof ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT;
  fields: Readonly<Record<string, string>>;
}>;

const utf8ByteLength = (value: string): number => {
  let length = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
};

export const readIsolatedServerFunctionSecretMaterial = (
  value: unknown
): IsolatedServerFunctionSecretMaterial | undefined => {
  const record = exactRecord(value, ['format', 'fields']);
  if (
    record?.format !== ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT ||
    !record.fields ||
    typeof record.fields !== 'object' ||
    Array.isArray(record.fields)
  )
    return undefined;
  const entries = Object.entries(record.fields as Record<string, unknown>);
  if (
    !entries.length ||
    entries.length > ISOLATED_SERVER_FUNCTION_SECRET_MAX_FIELDS ||
    entries.some(
      ([field, material], index) =>
        !authorityPermissionId(field) ||
        (index > 0 && entries[index - 1]![0].localeCompare(field) >= 0) ||
        typeof material !== 'string' ||
        material.length < 1 ||
        utf8ByteLength(material) >
          ISOLATED_SERVER_FUNCTION_SECRET_MAX_MATERIAL_BYTES
    )
  )
    return undefined;
  return Object.freeze({
    format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
    // The Worker clears this one-shot material in place after output inspection.
    fields: Object.fromEntries(entries) as Record<string, string>,
  });
};

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

const authorityIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 4_096 &&
  value === value.trim() &&
  !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : undefined;

const authorityPermissionId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    ? value
    : undefined;

const readAuthorityPermissions = (
  value: unknown
): readonly string[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length > ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_PERMISSIONS
  )
    return undefined;
  const permissions = value.map(authorityPermissionId);
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

export const readIsolatedServerFunctionAuthority = (
  value: unknown
): IsolatedServerFunctionAuthority | undefined => {
  const record = exactRecord(value, [
    'format',
    'workspaceId',
    'snapshotId',
    'principal',
    'permissions',
    'expiresAt',
  ]);
  const principalRecord = exactRecord(record?.principal, [
    'providerId',
    'principalId',
  ]);
  const providerId = authorityIdentifier(principalRecord?.providerId);
  const principalId = authorityIdentifier(principalRecord?.principalId);
  const permissions = readAuthorityPermissions(record?.permissions);
  const workspaceId = authorityIdentifier(record?.workspaceId);
  const snapshotId = authorityIdentifier(record?.snapshotId);
  const expiresAt =
    Number.isSafeInteger(record?.expiresAt) && (record?.expiresAt as number) > 0
      ? (record?.expiresAt as number)
      : undefined;
  return record?.format === ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT &&
    providerId &&
    principalId &&
    permissions &&
    workspaceId &&
    snapshotId &&
    expiresAt
    ? Object.freeze({
        format: ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
        workspaceId,
        snapshotId,
        principal: Object.freeze({ providerId, principalId }),
        permissions,
        expiresAt,
      })
    : undefined;
};

export const createIsolatedServerFunctionAuthority = (input: {
  workspaceId: string;
  snapshotId: string;
  principal: AuthPrincipal;
  permissions: readonly string[];
  expiresAt: number;
}): IsolatedServerFunctionAuthority => {
  const authority = readIsolatedServerFunctionAuthority({
    format: ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
    ...input,
  });
  if (!authority)
    throw new TypeError('Isolated Server Function authority is invalid.');
  return authority;
};

const sameFunction = (
  left: Readonly<{ artifactId: string; exportName: string }>,
  right: Readonly<{ artifactId: string; exportName: string }>
): boolean =>
  left.artifactId === right.artifactId && left.exportName === right.exportName;

/** Decodes the Server-owned part of a provider-neutral executable plan. */
export const readIsolatedServerFunctionPlan = (
  plan: ExecutableProjectServerFunctionPlan | undefined
): IsolatedServerFunctionPlan | undefined => {
  if (!plan) return undefined;
  const decoded = decodeServerRuntimeProfile(
    {
      [SERVER_RUNTIME_PROFILE_METADATA_KEY]: plan.runtimeManifest,
    },
    'js'
  );
  if (decoded.status !== 'valid') return undefined;
  const definition = resolveServerFunctionDefinition(
    decoded.profile,
    plan.functionRef.artifactId,
    plan.functionRef.exportName
  );
  return definition &&
    definition.adapterId === ISOLATED_SERVER_FUNCTION_ADAPTER_ID &&
    (definition.auth.kind === 'public' ||
      definition.auth.kind === 'authenticated' ||
      (definition.auth.kind === 'permission' &&
        definition.auth.permissionId ===
          ISOLATED_SERVER_FUNCTION_WORKSPACE_OWNER_PERMISSION_ID)) &&
    definition.effect === 'read' &&
    definition.runtimeZone === 'server'
    ? Object.freeze({ plan, definition })
    : undefined;
};

/** Resolves the value-only invocation and the independently fenced server identity. */
export const readIsolatedServerFunctionExecutionContext = (
  request: ExecutionRequest,
  plan: ExecutableProjectServerFunctionPlan | undefined,
  authority: unknown,
  now = Date.now()
): IsolatedServerFunctionExecutionContext | undefined => {
  const decodedPlan = readIsolatedServerFunctionPlan(plan);
  if (!decodedPlan) return undefined;
  const invocation = readIsolatedServerFunctionExecutionRequestFromPlan(
    request,
    decodedPlan
  );
  if (!invocation) return undefined;
  if (decodedPlan.definition.auth.kind === 'public')
    return Object.freeze({ invocation });
  const decodedAuthority = readIsolatedServerFunctionAuthority(authority);
  return decodedAuthority &&
    decodedAuthority.workspaceId === request.workspace.workspaceId &&
    decodedAuthority.snapshotId === request.workspace.snapshotId &&
    decodedAuthority.expiresAt > now &&
    decodedAuthority.expiresAt <=
      now + ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_TTL_MS &&
    (decodedPlan.definition.auth.kind !== 'permission' ||
      decodedAuthority.permissions.includes(
        decodedPlan.definition.auth.permissionId
      ))
    ? Object.freeze({ invocation, authority: decodedAuthority })
    : undefined;
};

const readIsolatedServerFunctionExecutionRequestFromPlan = (
  request: ExecutionRequest,
  decodedPlan: IsolatedServerFunctionPlan
): ExecutionServerFunctionBridgeRequest | undefined => {
  if (
    request.profile !== 'production' ||
    request.runtimeZone !== decodedPlan.definition.runtimeZone ||
    request.invocation.kind !== 'code' ||
    request.invocation.targetRef.kind !== 'code-artifact' ||
    !request.invocation.entrypoint ||
    !request.requiredCapabilities.includes('server-function')
  )
    return undefined;
  const invocation = readExecutionServerFunctionBridgeRequest(
    request.invocation.input
  );
  return invocation &&
    request.invocation.targetRef.artifactId ===
      decodedPlan.definition.reference.artifactId &&
    request.invocation.entrypoint ===
      decodedPlan.definition.reference.exportName &&
    sameFunction(invocation.functionRef, decodedPlan.definition.reference)
    ? invocation
    : undefined;
};

/** Requires one exact value-only request for the isolated production profile. */
export const readIsolatedServerFunctionExecutionRequest = (
  request: ExecutionRequest,
  plan: ExecutableProjectServerFunctionPlan | undefined
): ExecutionServerFunctionBridgeRequest | undefined => {
  const decodedPlan = readIsolatedServerFunctionPlan(plan);
  return decodedPlan
    ? readIsolatedServerFunctionExecutionRequestFromPlan(request, decodedPlan)
    : undefined;
};

/** Revalidates an untrusted sandbox response against the original snapshot definition. */
export const readIsolatedServerFunctionExecutionResponse = (
  value: unknown,
  request: ExecutionRequest,
  plan: ExecutableProjectServerFunctionPlan | undefined
): ExecutionServerFunctionBridgeResponse | undefined => {
  const decodedPlan = readIsolatedServerFunctionPlan(plan);
  if (!decodedPlan) return undefined;
  const invocation = readIsolatedServerFunctionExecutionRequestFromPlan(
    request,
    decodedPlan
  );
  if (!invocation) return undefined;
  const response = readExecutionServerFunctionBridgeResponse(value, invocation);
  if (!response) return undefined;
  if (!response.ok)
    return response.error.retryable ||
      !isolatedServerFunctionFailureCodes.has(response.error.code)
      ? undefined
      : response;
  try {
    return Object.freeze({
      ...response,
      result: validateServerFunctionOutcome(
        decodedPlan.definition,
        response.result
      ),
    });
  } catch {
    return undefined;
  }
};
