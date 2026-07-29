import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { utf8ToBytes } from '@noble/hashes/utils.js';

export const EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH =
  '/__prodivix/runtime-fixture/auth-session' as const;
export const EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT =
  'prodivix.execution-auth-session-fixture-response.v1' as const;
export const EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION = 1 as const;
export const EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE =
  'application/vnd.prodivix.execution-auth-session-fixture-response+json' as const;

export const EXECUTION_AUTH_SESSION_FIXTURE_LIMITS = Object.freeze({
  maximumResponseBytes: 64 * 1024,
  maximumIdentifierBytes: 256,
  maximumInvocationIdentifierBytes: 200,
  maximumPermissionIds: 256,
} as const);

export type ExecutionAuthSessionFixtureResponse = Readonly<{
  format: typeof EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT;
  version: typeof EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION;
  fixtureSetId: string;
  fixtureSetDigest: string;
  fixtureId: string;
  resourceId: string;
  inputDigest: string;
  outcomeDigest: string;
  projectionDigest: string;
  providerId: string;
  principalId: string;
  permissionIds: readonly string[];
  invocationId: string;
  attempt: number;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const REQUIRED_KEYS = Object.freeze([
  'attempt',
  'fixtureId',
  'fixtureSetDigest',
  'fixtureSetId',
  'format',
  'inputDigest',
  'invocationId',
  'outcomeDigest',
  'permissionIds',
  'principalId',
  'projectionDigest',
  'providerId',
  'resourceId',
  'version',
]);

const utf8Length = (value: string): number => utf8ToBytes(value).byteLength;

const identifier = (
  value: unknown,
  label: string,
  maximumBytes: number = EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumIdentifierBytes
): string => {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    !IDENTIFIER_PATTERN.test(value) ||
    utf8Length(value) > maximumBytes
  ) {
    throw new TypeError(`${label} must be a bounded canonical identifier.`);
  }
  return value;
};

const digest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

/**
 * Strictly normalizes the single same-origin response consumed by generated
 * deterministic-test auth loaders and guards.
 */
export const normalizeExecutionAuthSessionFixtureResponse = (
  value: unknown
): ExecutionAuthSessionFixtureResponse => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).sort(compareUnicodeCodePoints).join('\u0000') !==
      [...REQUIRED_KEYS].sort(compareUnicodeCodePoints).join('\u0000')
  ) {
    throw new TypeError(
      'Execution Auth Session fixture response has unknown or missing fields.'
    );
  }
  if (
    value.format !== EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT ||
    value.version !== EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION
  ) {
    throw new TypeError(
      'Execution Auth Session fixture response format is unsupported.'
    );
  }
  if (
    !Number.isSafeInteger(value.attempt) ||
    (value.attempt as number) < 1 ||
    (value.attempt as number) > 10
  ) {
    throw new TypeError('Execution Auth Session fixture attempt is invalid.');
  }
  if (
    !Array.isArray(value.permissionIds) ||
    value.permissionIds.length >
      EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumPermissionIds
  ) {
    throw new TypeError(
      'Execution Auth Session fixture permissionIds are invalid.'
    );
  }
  let previousPermissionId: string | undefined;
  const permissionIds = value.permissionIds.map((entry, index) => {
    const permissionId = identifier(
      entry,
      `Execution Auth Session fixture permissionIds[${index}]`
    );
    if (
      previousPermissionId !== undefined &&
      compareUnicodeCodePoints(previousPermissionId, permissionId) >= 0
    ) {
      throw new TypeError(
        'Execution Auth Session fixture permissionIds must be uniquely sorted.'
      );
    }
    previousPermissionId = permissionId;
    return permissionId;
  });
  const resourceId = identifier(
    value.resourceId,
    'Execution Auth Session fixture resourceId'
  );
  const providerId = identifier(
    value.providerId,
    'Execution Auth Session fixture providerId'
  );
  if (resourceId !== providerId) {
    throw new TypeError(
      'Execution Auth Session fixture resourceId must equal providerId.'
    );
  }
  const normalized = Object.freeze({
    format: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
    version: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
    fixtureSetId: identifier(
      value.fixtureSetId,
      'Execution Auth Session fixture fixtureSetId'
    ),
    fixtureSetDigest: digest(
      value.fixtureSetDigest,
      'Execution Auth Session fixture fixtureSetDigest'
    ),
    fixtureId: identifier(
      value.fixtureId,
      'Execution Auth Session fixture fixtureId'
    ),
    resourceId,
    inputDigest: digest(
      value.inputDigest,
      'Execution Auth Session fixture inputDigest'
    ),
    outcomeDigest: digest(
      value.outcomeDigest,
      'Execution Auth Session fixture outcomeDigest'
    ),
    projectionDigest: digest(
      value.projectionDigest,
      'Execution Auth Session fixture projectionDigest'
    ),
    providerId,
    principalId: identifier(
      value.principalId,
      'Execution Auth Session fixture principalId'
    ),
    permissionIds: Object.freeze(permissionIds),
    invocationId: identifier(
      value.invocationId,
      'Execution Auth Session fixture invocationId',
      EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumInvocationIdentifierBytes
    ),
    attempt: value.attempt as number,
  });
  if (
    utf8Length(JSON.stringify(normalized)) >
    EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumResponseBytes
  ) {
    throw new TypeError(
      'Execution Auth Session fixture response exceeds its transport budget.'
    );
  }
  return normalized;
};
