import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { cloneExecutionValue } from '@prodivix/runtime-core';
import type {
  AuthPrincipal,
  AuthSessionReference,
  ExecuteServerFunctionInput,
  ServerFunctionAdapter,
  ServerFunctionAdapterRegistry,
  ServerFunctionDefinition,
  ServerFunctionOutcome,
  ServerRuntimeJsonSchema,
} from './serverRuntime.types';
import { SERVER_FUNCTION_MAX_ATTEMPTS } from './serverRuntime.types';

export const SERVER_RUNTIME_ERROR_CODES = Object.freeze({
  requestInvalid: 'SVR_REQUEST_INVALID',
  adapterDuplicate: 'SVR_ADAPTER_DUPLICATE',
  adapterMissing: 'SVR_ADAPTER_MISSING',
  adapterIncompatible: 'SVR_ADAPTER_INCOMPATIBLE',
  authRequired: 'AUTH_REQUIRED',
  authSessionMismatch: 'AUTH_SESSION_MISMATCH',
  authSessionExpired: 'AUTH_SESSION_EXPIRED',
  permissionPortMissing: 'AUTH_PERMISSION_PORT_MISSING',
  permissionDenied: 'AUTH_PERMISSION_DENIED',
  inputInvalid: 'SVR_INPUT_INVALID',
  outputInvalid: 'SVR_OUTPUT_INVALID',
  outcomeInvalid: 'SVR_OUTCOME_INVALID',
  environmentLeaseMissing: 'SVR_ENVIRONMENT_LEASE_MISSING',
  secretBindingMissing: 'SVR_SECRET_BINDING_MISSING',
  secretOutputLeak: 'SVR_SECRET_OUTPUT_LEAK',
  cancelled: 'SVR_CANCELLED',
} as const);

export type ServerRuntimeErrorCode =
  (typeof SERVER_RUNTIME_ERROR_CODES)[keyof typeof SERVER_RUNTIME_ERROR_CODES];

export class ServerRuntimeError extends Error {
  readonly code: ServerRuntimeErrorCode;
  readonly retryable: boolean;

  constructor(code: ServerRuntimeErrorCode, retryable = false) {
    super(code);
    this.name = 'ServerRuntimeError';
    this.code = code;
    this.retryable = retryable;
  }
}

const canonicalId = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);

const assertNotCancelled = (
  signal: ExecuteServerFunctionInput['signal']
): void => {
  if (signal?.aborted) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.cancelled);
  }
};

/** Creates an instance-owned adapter registry; adapters never own canonical definitions. */
export const createServerFunctionAdapterRegistry =
  (): ServerFunctionAdapterRegistry => {
    const adapters = new Map<string, ServerFunctionAdapter>();
    return Object.freeze({
      register(adapter) {
        if (!canonicalId(adapter.id) || adapters.has(adapter.id)) {
          throw new ServerRuntimeError(
            SERVER_RUNTIME_ERROR_CODES.adapterDuplicate
          );
        }
        adapters.set(
          adapter.id,
          Object.freeze({
            ...adapter,
            kinds: Object.freeze([...adapter.kinds]),
            runtimeZones: Object.freeze([...adapter.runtimeZones]),
            effects: Object.freeze([...adapter.effects]),
          })
        );
      },
      get(adapterId) {
        return adapters.get(adapterId);
      },
      list() {
        return Object.freeze(
          [...adapters.values()].sort((left, right) =>
            left.id.localeCompare(right.id)
          )
        );
      },
    });
  };

const compileSchema = (schema: ServerRuntimeJsonSchema): ValidateFunction =>
  new Ajv2020({
    allErrors: true,
    messages: false,
    strict: false,
    validateFormats: false,
  }).compile(schema);

const validateSchema = (
  schema: ServerRuntimeJsonSchema,
  value: unknown,
  code: ServerRuntimeErrorCode
): void => {
  if (!compileSchema(schema)(value)) throw new ServerRuntimeError(code);
};

const readAuth = (
  principal: AuthPrincipal | undefined,
  session: AuthSessionReference | undefined,
  now: Date
): Readonly<{ principal: AuthPrincipal; session: AuthSessionReference }> => {
  if (!principal || !session) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.authRequired);
  }
  if (
    !canonicalId(principal.providerId) ||
    !canonicalId(principal.principalId) ||
    !canonicalId(session.providerId) ||
    !canonicalId(session.principalId) ||
    !canonicalId(session.sessionId) ||
    principal.providerId !== session.providerId ||
    principal.principalId !== session.principalId
  ) {
    throw new ServerRuntimeError(
      SERVER_RUNTIME_ERROR_CODES.authSessionMismatch
    );
  }
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.authSessionExpired);
  }
  return Object.freeze({
    principal: Object.freeze({
      providerId: principal.providerId,
      principalId: principal.principalId,
    }),
    session: Object.freeze({
      providerId: session.providerId,
      sessionId: session.sessionId,
      principalId: session.principalId,
      expiresAt: session.expiresAt,
    }),
  });
};

const assertAdapterCompatibility = (
  adapter: ServerFunctionAdapter,
  definition: ServerFunctionDefinition
): void => {
  if (
    !adapter.kinds.includes(definition.kind) ||
    !adapter.runtimeZones.includes(definition.runtimeZone) ||
    !adapter.effects.includes(definition.effect)
  ) {
    throw new ServerRuntimeError(
      SERVER_RUNTIME_ERROR_CODES.adapterIncompatible
    );
  }
};

const containsSecretMaterial = (
  value: unknown,
  materials: readonly string[]
): boolean => {
  if (typeof value === 'string') {
    return materials.some(
      (material) => material.length > 0 && value.includes(material)
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsSecretMaterial(entry, materials));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, entry]) =>
        containsSecretMaterial(key, materials) ||
        containsSecretMaterial(entry, materials)
    );
  }
  return false;
};

export const validateServerFunctionOutcome = (
  definition: ServerFunctionDefinition,
  outcome: ServerFunctionOutcome
): ServerFunctionOutcome => {
  if (outcome.kind === 'value') {
    if (definition.kind === 'route-guard') {
      throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.outcomeInvalid);
    }
    const value = cloneExecutionValue(outcome.value);
    validateSchema(
      definition.outputSchema,
      value,
      SERVER_RUNTIME_ERROR_CODES.outputInvalid
    );
    return Object.freeze({ kind: 'value' as const, value });
  }
  if (outcome.kind === 'allow') {
    if (definition.kind !== 'route-guard') {
      throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.outcomeInvalid);
    }
    return Object.freeze({ kind: 'allow' as const });
  }
  if (outcome.kind === 'deny') {
    if (
      definition.kind !== 'route-guard' ||
      !/^[A-Z][A-Z0-9_-]{0,127}$/u.test(outcome.code)
    ) {
      throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.outcomeInvalid);
    }
    return Object.freeze({ kind: 'deny' as const, code: outcome.code });
  }
  if (
    outcome.kind === 'redirect' &&
    definition.kind !== 'function' &&
    outcome.location.length > 0 &&
    outcome.location.length <= 2_048 &&
    outcome.location === outcome.location.trim() &&
    !outcome.location.includes('\0') &&
    outcome.location.startsWith('/') &&
    !outcome.location.startsWith('//') &&
    [302, 303, 307, 308].includes(outcome.status)
  ) {
    return Object.freeze({
      kind: 'redirect' as const,
      location: outcome.location,
      status: outcome.status,
    });
  }
  throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.outcomeInvalid);
};

/** Runs authorization and schemas before and after the injected adapter effect. */
export const executeServerFunction = async (
  request: ExecuteServerFunctionInput
): Promise<ServerFunctionOutcome> => {
  if (
    !canonicalId(request.workspaceId) ||
    !canonicalId(request.invocationId) ||
    !Number.isSafeInteger(request.attempt) ||
    request.attempt < 1 ||
    request.attempt > SERVER_FUNCTION_MAX_ATTEMPTS
  ) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.requestInvalid);
  }
  assertNotCancelled(request.signal);
  const adapter = request.registry.get(request.definition.adapterId);
  if (!adapter) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.adapterMissing);
  }
  assertAdapterCompatibility(adapter, request.definition);
  const input = cloneExecutionValue(request.input);
  validateSchema(
    request.definition.inputSchema,
    input,
    SERVER_RUNTIME_ERROR_CODES.inputInvalid
  );

  let principal = request.principal
    ? Object.freeze({
        providerId: request.principal.providerId,
        principalId: request.principal.principalId,
      })
    : undefined;
  if (
    principal &&
    (!canonicalId(principal.providerId) || !canonicalId(principal.principalId))
  ) {
    throw new ServerRuntimeError(
      SERVER_RUNTIME_ERROR_CODES.authSessionMismatch
    );
  }
  if (request.definition.auth.kind !== 'public') {
    const auth = readAuth(
      request.principal,
      request.session,
      (request.now ?? (() => new Date()))()
    );
    principal = auth.principal;
    if (request.definition.auth.kind === 'permission') {
      if (!request.permissionPort) {
        throw new ServerRuntimeError(
          SERVER_RUNTIME_ERROR_CODES.permissionPortMissing
        );
      }
      const decision = await request.permissionPort.decide({
        workspaceId: request.workspaceId,
        principal: auth.principal,
        session: auth.session,
        permissionId: request.definition.auth.permissionId,
        functionRef: request.definition.reference,
      });
      if (!decision.allowed) {
        throw new ServerRuntimeError(
          SERVER_RUNTIME_ERROR_CODES.permissionDenied
        );
      }
    }
  }

  assertNotCancelled(request.signal);

  const secretPolicy = request.definition.environment;
  const environment = request.environment;
  if (
    Boolean(secretPolicy) !== Boolean(environment) ||
    (environment && !environment.isActive())
  ) {
    environment?.revoke();
    throw new ServerRuntimeError(
      SERVER_RUNTIME_ERROR_CODES.environmentLeaseMissing
    );
  }
  const secretMaterials: string[] = [];
  const useSecret = secretPolicy
    ? async (
        field: string,
        consumer: (material: string) => void | Promise<void>
      ): Promise<void> => {
        if (!canonicalId(field) || typeof consumer !== 'function') {
          throw new ServerRuntimeError(
            SERVER_RUNTIME_ERROR_CODES.secretBindingMissing
          );
        }
        const reference = secretPolicy.secretsByField[field];
        if (!reference) {
          throw new ServerRuntimeError(
            SERVER_RUNTIME_ERROR_CODES.secretBindingMissing
          );
        }
        await environment!.useSecret(reference, field, async (material) => {
          secretMaterials.push(material);
          try {
            await consumer(material);
          } catch {
            throw new ServerRuntimeError(
              SERVER_RUNTIME_ERROR_CODES.secretOutputLeak
            );
          }
        });
      }
    : undefined;

  try {
    const outcome = await adapter.execute(
      input,
      Object.freeze({
        workspaceId: request.workspaceId,
        invocationId: request.invocationId,
        attempt: request.attempt,
        functionRef: request.definition.reference,
        ...(principal ? { principal } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
        ...(useSecret ? { useSecret } : {}),
      })
    );
    assertNotCancelled(request.signal);
    const validatedOutcome = validateServerFunctionOutcome(
      request.definition,
      outcome
    );
    if (containsSecretMaterial(validatedOutcome, secretMaterials)) {
      throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.secretOutputLeak);
    }
    return validatedOutcome;
  } finally {
    environment?.revoke();
    secretMaterials.fill('');
  }
};
