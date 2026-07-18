import {
  cloneExecutionValue,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import {
  createServerFunctionAdapterRegistry,
  executeServerFunction,
  SERVER_RUNTIME_ERROR_CODES,
  ServerRuntimeError,
} from './serverRuntimeKernel';
import { toExecutionServerFunctionBridgeSuccess } from './serverRuntimeBridge';
import type {
  AuthPrincipal,
  ServerFunctionDefinition,
  ServerFunctionOutcome,
  ServerFunctionReference,
  ServerRuntimeCancellationSignal,
} from './serverRuntime.types';

export const SERVER_RUNTIME_TEST_PROVISION_FORMAT =
  'prodivix.server-runtime-test-provision.v1' as const;

export const SERVER_RUNTIME_TEST_ERROR_CODES = Object.freeze({
  provisionInvalid: 'SVR_TEST_PROVISION_INVALID',
  fixtureMissing: 'SVR_TEST_FIXTURE_MISSING',
  fixtureFailure: 'SVR_TEST_FIXTURE_FAILURE',
  replayConflict: 'SVR_TEST_REPLAY_CONFLICT',
  idempotencyRequired: 'SVR_TEST_IDEMPOTENCY_REQUIRED',
  disposed: 'SVR_TEST_SESSION_DISPOSED',
} as const);

export type ServerRuntimeTestPermissionFixture = Readonly<{
  permissionId: string;
  allowed: boolean;
  code?: string;
}>;

export type ServerRuntimeTestFunctionFixtureBehavior =
  | Readonly<{
      kind: 'outcome';
      outcome: ServerFunctionOutcome;
      delayMs?: number;
    }>
  | Readonly<{
      kind: 'error';
      code: string;
      retryable: boolean;
      delayMs?: number;
    }>;

export type ServerRuntimeTestFunctionFixture = Readonly<{
  id: string;
  functionRef: ServerFunctionReference;
  input?: ExecutionValue;
  behavior: ServerRuntimeTestFunctionFixtureBehavior;
}>;

export type ServerRuntimeTestProvision = Readonly<{
  format: typeof SERVER_RUNTIME_TEST_PROVISION_FORMAT;
  fixtureSetId: string;
  principal?: AuthPrincipal;
  permissions: readonly ServerRuntimeTestPermissionFixture[];
  fixtures: readonly ServerRuntimeTestFunctionFixture[];
}>;

export type ServerRuntimeTestObservation = Readonly<{
  invocationId: string;
  attempt: number;
  functionRef: ServerFunctionReference;
  effect: ServerFunctionDefinition['effect'];
  status: 'executed' | 'replayed' | 'failed';
}>;

export class ServerRuntimeTestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = 'ServerRuntimeTestError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type ServerRuntimeTestSession = Readonly<{
  invoke(input: {
    functionRef: ServerFunctionReference;
    invocationId: string;
    attempt: number;
    input: ExecutionValue;
    signal?: ServerRuntimeCancellationSignal;
  }): Promise<ServerFunctionOutcome>;
  listObservations(): readonly ServerRuntimeTestObservation[];
  dispose(): void;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Readonly<Record<string, unknown>> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
    ? record
    : undefined;
};

const canonicalId = (value: unknown, exportName = false): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  (exportName
    ? /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
    : /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value));

const errorCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z][A-Z0-9_-]{0,127}$/u.test(value);

const fixtureDelay = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 60_000
    ? (value as number)
    : Number.NaN;
};

const sensitiveKey = (key: string): boolean =>
  /^(authorization|cookie|setcookie|password|secret|token|accesstoken|refreshtoken|sessionid|credential|privatekey)$/u.test(
    key.replaceAll(/[-_]/gu, '').toLowerCase()
  );

const assertProvisionBudget = (value: unknown): void => {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > 65_536 || current.depth > 64) {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
    if (!current.value || typeof current.value !== 'object') continue;
    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
      }
    }
    Object.entries(current.value).forEach(([key, entry]) => {
      if (sensitiveKey(key)) {
        throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
      }
      stack.push({ value: entry, depth: current.depth + 1 });
    });
  }
  const encoded = JSON.stringify(value);
  if (encoded.length > 4 * 1024 * 1024) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
};

const normalizeReference = (value: unknown): ServerFunctionReference => {
  const record = exactRecord(value, ['artifactId', 'exportName']);
  if (
    !record ||
    !canonicalId(record.artifactId) ||
    !canonicalId(record.exportName, true)
  ) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
  return Object.freeze({
    artifactId: record.artifactId,
    exportName: record.exportName,
  });
};

const normalizeBehavior = (
  value: unknown
): ServerRuntimeTestFunctionFixtureBehavior => {
  const candidate = exactRecord(
    value,
    ['kind'],
    ['outcome', 'code', 'retryable', 'delayMs']
  );
  const delayMs = fixtureDelay(candidate?.delayMs);
  if (!candidate || Number.isNaN(delayMs)) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
  if (candidate.kind === 'outcome') {
    const record = exactRecord(value, ['kind', 'outcome'], ['delayMs']);
    if (!record) {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
    let outcome: ServerFunctionOutcome;
    try {
      const response = toExecutionServerFunctionBridgeSuccess(
        'fixture:1',
        record.outcome as ServerFunctionOutcome
      );
      if (!response.ok) {
        throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
      }
      outcome = response.result;
    } catch {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
    return Object.freeze({
      kind: 'outcome',
      outcome,
      ...(delayMs === undefined ? {} : { delayMs }),
    });
  }
  const record = exactRecord(value, ['kind', 'code', 'retryable'], ['delayMs']);
  if (
    candidate.kind !== 'error' ||
    !record ||
    !errorCode(record.code) ||
    typeof record.retryable !== 'boolean'
  ) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
  return Object.freeze({
    kind: 'error',
    code: record.code,
    retryable: record.retryable,
    ...(delayMs === undefined ? {} : { delayMs }),
  });
};

const canonicalJson = (value: ExecutionValue): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
};

const referenceKey = (reference: ServerFunctionReference): string =>
  `${reference.artifactId}\0${reference.exportName}`;

/** Normalizes execution-only Auth fixtures and rejects authority-shaped material. */
export const normalizeServerRuntimeTestProvision = (
  value: unknown
): ServerRuntimeTestProvision => {
  assertProvisionBudget(value);
  const record = exactRecord(
    value,
    ['format', 'fixtureSetId', 'permissions', 'fixtures'],
    ['principal']
  );
  if (
    !record ||
    record.format !== SERVER_RUNTIME_TEST_PROVISION_FORMAT ||
    !canonicalId(record.fixtureSetId) ||
    !Array.isArray(record.permissions) ||
    !Array.isArray(record.fixtures) ||
    record.permissions.length > 1_024 ||
    record.fixtures.length > 10_000
  ) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
  let principal: AuthPrincipal | undefined;
  if (record.principal !== undefined) {
    const candidate = exactRecord(record.principal, [
      'providerId',
      'principalId',
    ]);
    if (
      !candidate ||
      !canonicalId(candidate.providerId) ||
      !canonicalId(candidate.principalId)
    ) {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
    principal = Object.freeze({
      providerId: candidate.providerId,
      principalId: candidate.principalId,
    });
  }
  const permissionIds = new Set<string>();
  const permissions = Object.freeze(
    record.permissions
      .map((value) => {
        const candidate = exactRecord(
          value,
          ['permissionId', 'allowed'],
          ['code']
        );
        if (
          !candidate ||
          !canonicalId(candidate.permissionId) ||
          typeof candidate.allowed !== 'boolean' ||
          (candidate.allowed && candidate.code !== undefined) ||
          (candidate.code !== undefined && !errorCode(candidate.code)) ||
          permissionIds.has(candidate.permissionId)
        ) {
          throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
        }
        permissionIds.add(candidate.permissionId);
        return Object.freeze({
          permissionId: candidate.permissionId,
          allowed: candidate.allowed,
          ...(candidate.code === undefined ? {} : { code: candidate.code }),
        });
      })
      .sort((left, right) =>
        left.permissionId.localeCompare(right.permissionId)
      )
  );
  const ids = new Set<string>();
  const matchKeys = new Set<string>();
  const fixtures = Object.freeze(
    record.fixtures
      .map((value) => {
        const candidate = exactRecord(
          value,
          ['id', 'functionRef', 'behavior'],
          ['input']
        );
        if (!candidate || !canonicalId(candidate.id) || ids.has(candidate.id)) {
          throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
        }
        ids.add(candidate.id);
        const functionRef = normalizeReference(candidate.functionRef);
        let input: ExecutionValue | undefined;
        if (candidate.input !== undefined) {
          try {
            input = cloneExecutionValue(candidate.input as ExecutionValue);
          } catch {
            throw new TypeError(
              SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid
            );
          }
        }
        const matchKey = `${referenceKey(functionRef)}\0${input === undefined ? '*' : canonicalJson(input)}`;
        if (matchKeys.has(matchKey)) {
          throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
        }
        matchKeys.add(matchKey);
        return Object.freeze({
          id: candidate.id,
          functionRef,
          ...(input === undefined ? {} : { input }),
          behavior: normalizeBehavior(candidate.behavior),
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );
  return Object.freeze({
    format: SERVER_RUNTIME_TEST_PROVISION_FORMAT,
    fixtureSetId: record.fixtureSetId,
    ...(principal ? { principal } : {}),
    permissions,
    fixtures,
  });
};

const waitForFixture = async (
  delayMs: number | undefined,
  signal: ServerRuntimeCancellationSignal | undefined,
  disposed: () => boolean
): Promise<void> => {
  if (signal?.aborted) {
    throw new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.cancelled);
  }
  if (!delayMs) return;
  await new Promise<void>((resolve, reject) => {
    const timers = globalThis as unknown as {
      setTimeout(callback: () => void, delay: number): unknown;
      clearTimeout(handle: unknown): void;
    };
    let handle: unknown;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      if (handle !== undefined) timers.clearTimeout(handle);
    };
    const onAbort = () => {
      cleanup();
      reject(new ServerRuntimeError(SERVER_RUNTIME_ERROR_CODES.cancelled));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    handle = timers.setTimeout(() => {
      cleanup();
      if (disposed()) {
        reject(
          new ServerRuntimeTestError(SERVER_RUNTIME_TEST_ERROR_CODES.disposed)
        );
        return;
      }
      resolve();
    }, delayMs);
  });
};

/** Creates an isolated deterministic Auth/permission/Server Function fixture session. */
export const createServerRuntimeTestSession = (input: {
  workspaceId: string;
  definitions: readonly ServerFunctionDefinition[];
  provision: unknown;
  now?: () => Date;
}): ServerRuntimeTestSession => {
  if (!canonicalId(input.workspaceId)) {
    throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
  }
  const provision = normalizeServerRuntimeTestProvision(input.provision);
  const definitions = new Map<string, ServerFunctionDefinition>();
  input.definitions.forEach((definition) => {
    const key = referenceKey(definition.reference);
    if (definitions.has(key)) {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
    definitions.set(key, definition);
  });
  provision.fixtures.forEach((fixture) => {
    if (!definitions.has(referenceKey(fixture.functionRef))) {
      throw new TypeError(SERVER_RUNTIME_TEST_ERROR_CODES.provisionInvalid);
    }
  });
  const permissions = new Map(
    provision.permissions.map((fixture) => [fixture.permissionId, fixture])
  );
  const fixturesByReference = new Map<
    string,
    readonly ServerRuntimeTestFunctionFixture[]
  >();
  provision.fixtures.forEach((fixture) => {
    const key = referenceKey(fixture.functionRef);
    fixturesByReference.set(key, [
      ...(fixturesByReference.get(key) ?? []),
      fixture,
    ]);
  });
  const observations: ServerRuntimeTestObservation[] = [];
  const replays = new Map<
    string,
    Readonly<{ fingerprint: string; result: Promise<ServerFunctionOutcome> }>
  >();
  let disposed = false;
  const registry = createServerFunctionAdapterRegistry();
  const definitionsByAdapter = new Map<string, ServerFunctionDefinition[]>();
  input.definitions.forEach((definition) => {
    definitionsByAdapter.set(definition.adapterId, [
      ...(definitionsByAdapter.get(definition.adapterId) ?? []),
      definition,
    ]);
  });
  definitionsByAdapter.forEach((adapterDefinitions, adapterId) => {
    registry.register({
      id: adapterId,
      kinds: [...new Set(adapterDefinitions.map(({ kind }) => kind))],
      runtimeZones: [
        ...new Set(adapterDefinitions.map(({ runtimeZone }) => runtimeZone)),
      ],
      effects: [...new Set(adapterDefinitions.map(({ effect }) => effect))],
      async execute(value, context) {
        const candidates = fixturesByReference.get(
          referenceKey(context.functionRef)
        );
        const exact = candidates?.find(
          (fixture) =>
            fixture.input !== undefined &&
            canonicalJson(fixture.input) === canonicalJson(value)
        );
        const fixture =
          exact ?? candidates?.find(({ input }) => input === undefined);
        if (!fixture) {
          throw new ServerRuntimeTestError(
            SERVER_RUNTIME_TEST_ERROR_CODES.fixtureMissing
          );
        }
        await waitForFixture(
          fixture.behavior.delayMs,
          context.signal,
          () => disposed
        );
        if (fixture.behavior.kind === 'error') {
          throw new ServerRuntimeTestError(
            fixture.behavior.code,
            fixture.behavior.retryable
          );
        }
        return fixture.behavior.outcome;
      },
    });
  });
  const now = input.now ?? (() => new Date('2100-01-01T00:00:00.000Z'));
  const session = provision.principal
    ? Object.freeze({
        providerId: provision.principal.providerId,
        principalId: provision.principal.principalId,
        sessionId: `fixture:${provision.fixtureSetId}`,
        expiresAt: '9999-12-31T23:59:59.999Z',
      })
    : undefined;

  const invokeOnce = async (
    definition: ServerFunctionDefinition,
    request: Parameters<ServerRuntimeTestSession['invoke']>[0]
  ): Promise<ServerFunctionOutcome> => {
    try {
      const result = await executeServerFunction({
        definition,
        workspaceId: input.workspaceId,
        invocationId: request.invocationId,
        attempt: request.attempt,
        input: request.input,
        registry,
        ...(provision.principal ? { principal: provision.principal } : {}),
        ...(session ? { session } : {}),
        permissionPort: {
          decide(permissionRequest) {
            const fixture = permissions.get(permissionRequest.permissionId);
            return Object.freeze({
              allowed: fixture?.allowed === true,
              ...(fixture?.code ? { code: fixture.code } : {}),
            });
          },
        },
        now,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      observations.push(
        Object.freeze({
          invocationId: request.invocationId,
          attempt: request.attempt,
          functionRef: definition.reference,
          effect: definition.effect,
          status: 'executed' as const,
        })
      );
      return result;
    } catch (error) {
      observations.push(
        Object.freeze({
          invocationId: request.invocationId,
          attempt: request.attempt,
          functionRef: definition.reference,
          effect: definition.effect,
          status: 'failed' as const,
        })
      );
      throw error;
    }
  };

  return Object.freeze({
    async invoke(request) {
      if (disposed) {
        throw new ServerRuntimeTestError(
          SERVER_RUNTIME_TEST_ERROR_CODES.disposed
        );
      }
      const definition = definitions.get(referenceKey(request.functionRef));
      if (!definition) {
        throw new ServerRuntimeTestError(
          SERVER_RUNTIME_TEST_ERROR_CODES.fixtureMissing
        );
      }
      if (
        definition.effect === 'mutation' &&
        definition.idempotency?.kind !== 'invocation-key'
      ) {
        throw new ServerRuntimeTestError(
          SERVER_RUNTIME_TEST_ERROR_CODES.idempotencyRequired
        );
      }
      const normalizedInput = cloneExecutionValue(request.input);
      const fingerprint = `${referenceKey(request.functionRef)}\0${canonicalJson(normalizedInput)}`;
      if (definition.effect !== 'mutation') {
        return invokeOnce(definition, { ...request, input: normalizedInput });
      }
      const replay = replays.get(request.invocationId);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new ServerRuntimeTestError(
            SERVER_RUNTIME_TEST_ERROR_CODES.replayConflict
          );
        }
        observations.push(
          Object.freeze({
            invocationId: request.invocationId,
            attempt: request.attempt,
            functionRef: definition.reference,
            effect: definition.effect,
            status: 'replayed' as const,
          })
        );
        return replay.result;
      }
      const result = invokeOnce(definition, {
        ...request,
        input: normalizedInput,
      });
      replays.set(request.invocationId, Object.freeze({ fingerprint, result }));
      return result;
    },
    listObservations() {
      return Object.freeze([...observations]);
    },
    dispose() {
      disposed = true;
      replays.clear();
      observations.length = 0;
    },
  });
};
