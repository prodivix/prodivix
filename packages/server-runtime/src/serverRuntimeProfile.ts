import Ajv2020 from 'ajv/dist/2020.js';
import type { CodeArtifactLanguage } from '@prodivix/authoring';
import { cloneExecutionValue, createSecretRef } from '@prodivix/runtime-core';
import {
  SERVER_FUNCTION_EFFECTS,
  SERVER_FUNCTION_KINDS,
  type ServerFunctionAuthPolicy,
  type ServerFunctionDefinition,
  type ServerFunctionEnvironmentPolicy,
  type ServerFunctionProfileEntry,
  type ServerRuntimeJsonSchema,
  type ServerRuntimeProfile,
} from './serverRuntime.types';

export const SERVER_RUNTIME_PROFILE_METADATA_KEY =
  'prodivix.serverRuntime' as const;
export const SERVER_RUNTIME_PROFILE_SCHEMA_VERSION = '1.0' as const;
export const SERVER_RUNTIME_SCHEMA_LIMITS = Object.freeze({
  maximumBytes: 256 * 1024,
  maximumDepth: 64,
  maximumNodes: 8_192,
} as const);
export const SERVER_RUNTIME_PROFILE_ISSUE_CODES = Object.freeze({
  invalid: 'SERVER_RUNTIME_PROFILE_INVALID',
  languageMismatch: 'SERVER_RUNTIME_PROFILE_LANGUAGE_MISMATCH',
} as const);

export type ServerRuntimeProfileIssue = Readonly<{
  code: (typeof SERVER_RUNTIME_PROFILE_ISSUE_CODES)[keyof typeof SERVER_RUNTIME_PROFILE_ISSUE_CODES];
  path: string;
  message: string;
}>;

export type ServerRuntimeProfileResult =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'valid'; profile: ServerRuntimeProfile }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ServerRuntimeProfileIssue[];
    }>;

const MAX_SERVER_FUNCTIONS = 128;
const MAX_IDENTIFIER_LENGTH = 256;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isExactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const isExportName = (value: string): boolean =>
  value.length <= MAX_IDENTIFIER_LENGTH &&
  /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);

const isCanonicalId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_IDENTIFIER_LENGTH &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (point > 0xffff) index += 1;
  }
  return bytes;
};

const invalid = (
  path: string,
  message: string,
  code: ServerRuntimeProfileIssue['code'] = SERVER_RUNTIME_PROFILE_ISSUE_CODES.invalid
): ServerRuntimeProfileResult =>
  Object.freeze({
    status: 'invalid' as const,
    issues: Object.freeze([Object.freeze({ code, path, message })]),
  });

const readAuthPolicy = (
  value: unknown
): ServerFunctionAuthPolicy | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'public' || value.kind === 'authenticated') {
    return isExactRecord(value, ['kind'])
      ? Object.freeze({ kind: value.kind })
      : undefined;
  }
  if (
    value.kind === 'permission' &&
    isExactRecord(value, ['kind', 'permissionId']) &&
    isCanonicalId(value.permissionId)
  ) {
    return Object.freeze({
      kind: 'permission' as const,
      permissionId: value.permissionId,
    });
  }
  return undefined;
};

const schemaTreeWithinBudget = (
  value: unknown,
  depth: number,
  budget: { nodes: number }
): boolean => {
  if (depth > SERVER_RUNTIME_SCHEMA_LIMITS.maximumDepth) return false;
  budget.nodes += 1;
  if (budget.nodes > SERVER_RUNTIME_SCHEMA_LIMITS.maximumNodes) return false;
  if (Array.isArray(value)) {
    return value.every((entry) =>
      schemaTreeWithinBudget(entry, depth + 1, budget)
    );
  }
  if (!isRecord(value)) return true;
  return Object.entries(value).every(([key, entry]) => {
    if (
      (key === '$ref' || key === '$dynamicRef' || key === '$recursiveRef') &&
      (typeof entry !== 'string' || !entry.startsWith('#'))
    ) {
      return false;
    }
    return schemaTreeWithinBudget(entry, depth + 1, budget);
  });
};

const readSchema = (value: unknown): ServerRuntimeJsonSchema | undefined => {
  if (typeof value !== 'boolean' && !isRecord(value)) return undefined;
  try {
    const cloned = cloneExecutionValue(value as never);
    if (typeof cloned !== 'boolean' && !isRecord(cloned)) return undefined;
    const encoded = JSON.stringify(cloned);
    if (
      utf8ByteLength(encoded) > SERVER_RUNTIME_SCHEMA_LIMITS.maximumBytes ||
      !schemaTreeWithinBudget(cloned, 0, { nodes: 0 })
    ) {
      return undefined;
    }
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    ajv.compile(cloned);
    return cloned as ServerRuntimeJsonSchema;
  } catch {
    return undefined;
  }
};

const readEnvironmentPolicy = (
  value: unknown
): ServerFunctionEnvironmentPolicy | undefined => {
  if (!isExactRecord(value, ['secretsByField'])) return undefined;
  if (!isRecord(value.secretsByField)) return undefined;
  const entries = Object.entries(value.secretsByField).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (entries.length === 0 || entries.length > 32) return undefined;
  try {
    const secretsByField = Object.fromEntries(
      entries.map(([field, reference]) => {
        if (!isCanonicalId(field) || !isExactRecord(reference, ['bindingId'])) {
          throw new TypeError('Server Function Secret binding is invalid.');
        }
        return [
          field,
          createSecretRef({ bindingId: reference.bindingId as string }),
        ];
      })
    );
    return Object.freeze({
      secretsByField: Object.freeze(secretsByField),
    });
  } catch {
    return undefined;
  }
};

const readEntry = (value: unknown): ServerFunctionProfileEntry | undefined => {
  if (
    !isExactRecord(
      value,
      [
        'kind',
        'runtimeZone',
        'adapterId',
        'effect',
        'auth',
        'inputSchema',
        'outputSchema',
      ],
      ['idempotency', 'environment']
    ) ||
    !SERVER_FUNCTION_KINDS.some((kind) => kind === value.kind) ||
    (value.runtimeZone !== 'server' && value.runtimeZone !== 'edge') ||
    !isCanonicalId(value.adapterId) ||
    !SERVER_FUNCTION_EFFECTS.some((effect) => effect === value.effect)
  ) {
    return undefined;
  }
  const auth = readAuthPolicy(value.auth);
  const inputSchema = readSchema(value.inputSchema);
  const outputSchema = readSchema(value.outputSchema);
  const idempotency =
    value.idempotency === undefined
      ? undefined
      : isExactRecord(value.idempotency, ['kind']) &&
          value.idempotency.kind === 'invocation-key'
        ? Object.freeze({ kind: 'invocation-key' as const })
        : null;
  const environment =
    value.environment === undefined
      ? undefined
      : readEnvironmentPolicy(value.environment);
  if (
    !auth ||
    inputSchema === undefined ||
    outputSchema === undefined ||
    (value.environment !== undefined && !environment)
  ) {
    return undefined;
  }
  if (idempotency === null || (idempotency && value.effect !== 'mutation')) {
    return undefined;
  }
  return Object.freeze({
    kind: value.kind as ServerFunctionProfileEntry['kind'],
    runtimeZone: value.runtimeZone,
    adapterId: value.adapterId,
    effect: value.effect as ServerFunctionProfileEntry['effect'],
    auth,
    inputSchema,
    outputSchema,
    ...(idempotency ? { idempotency } : {}),
    ...(environment ? { environment } : {}),
  });
};

/** Strictly decodes the only canonical Server Function metadata profile. */
export const decodeServerRuntimeProfile = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  language: CodeArtifactLanguage
): ServerRuntimeProfileResult => {
  const value = metadata?.[SERVER_RUNTIME_PROFILE_METADATA_KEY];
  if (value === undefined) return Object.freeze({ status: 'absent' as const });
  const basePath = `/${SERVER_RUNTIME_PROFILE_METADATA_KEY}`;
  if (language !== 'ts' && language !== 'js') {
    return invalid(
      basePath,
      'Server runtime profiles require a TypeScript or JavaScript artifact.',
      SERVER_RUNTIME_PROFILE_ISSUE_CODES.languageMismatch
    );
  }
  if (
    !isExactRecord(value, ['schemaVersion', 'functionsByExport']) ||
    value.schemaVersion !== SERVER_RUNTIME_PROFILE_SCHEMA_VERSION ||
    !isRecord(value.functionsByExport)
  ) {
    return invalid(basePath, 'Server runtime profile shape is invalid.');
  }
  const entries = Object.entries(value.functionsByExport);
  if (entries.length === 0 || entries.length > MAX_SERVER_FUNCTIONS) {
    return invalid(
      `${basePath}/functionsByExport`,
      `Server runtime profile must contain 1-${MAX_SERVER_FUNCTIONS} functions.`
    );
  }
  const functionsByExport: Record<string, ServerFunctionProfileEntry> = {};
  for (const [exportName, candidate] of entries.sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const entry = readEntry(candidate);
    if (!isExportName(exportName) || !entry) {
      return invalid(
        `${basePath}/functionsByExport/${exportName}`,
        'Server function export or definition is invalid.'
      );
    }
    functionsByExport[exportName] = entry;
  }
  return Object.freeze({
    status: 'valid' as const,
    profile: Object.freeze({
      schemaVersion: SERVER_RUNTIME_PROFILE_SCHEMA_VERSION,
      functionsByExport: Object.freeze(functionsByExport),
    }),
  });
};

/** Writes one normalized canonical profile without discarding sibling Code metadata. */
export const writeServerRuntimeProfile = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  profile: ServerRuntimeProfile,
  language: CodeArtifactLanguage
): Readonly<Record<string, unknown>> => {
  const decoded = decodeServerRuntimeProfile(
    { [SERVER_RUNTIME_PROFILE_METADATA_KEY]: profile },
    language
  );
  if (decoded.status !== 'valid') {
    throw new TypeError(
      decoded.status === 'invalid'
        ? decoded.issues[0]?.message
        : 'Server runtime profile is required.'
    );
  }
  return Object.freeze({
    ...(metadata ?? {}),
    [SERVER_RUNTIME_PROFILE_METADATA_KEY]: decoded.profile,
  });
};

export const resolveServerFunctionDefinition = (
  profile: ServerRuntimeProfile,
  artifactId: string,
  exportName: string
): ServerFunctionDefinition | undefined => {
  if (!isCanonicalId(artifactId) || !isExportName(exportName)) return undefined;
  const entry = profile.functionsByExport[exportName];
  return entry
    ? Object.freeze({
        ...entry,
        reference: Object.freeze({ artifactId, exportName }),
      })
    : undefined;
};
