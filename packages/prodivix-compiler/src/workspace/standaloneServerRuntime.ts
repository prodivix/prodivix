import type { ExportModule } from '#src/export';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_LIMITS,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
} from '@prodivix/runtime-core';
import {
  SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH,
  SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS,
} from '@prodivix/server-runtime';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  WorkspaceServerRuntimeBinding,
  WorkspaceServerRuntimeTarget,
} from '#src/workspace/workspaceServerRuntimeTarget';
import { createStandaloneServerRuntimeValidatorProjection } from '#src/workspace/standaloneServerRuntimeValidators';

export const WORKSPACE_SERVER_RUNTIME_MODULE_ID =
  'workspace-server-runtime' as const;

/** Emits a source-free Server Function client plus the deterministic Test adapter boundary. */
export const createWorkspaceStandaloneServerRuntimeModules = (
  target: WorkspaceServerRuntimeTarget,
  bindings: readonly WorkspaceServerRuntimeBinding[] = []
): readonly ExportModule[] => {
  const definitions = [
    ...new Map(
      bindings.map(({ definition }) => [
        `${definition.reference.artifactId}\0${definition.reference.exportName}`,
        definition,
      ])
    ).values(),
  ].sort(
    (left, right) =>
      compareUnicodeCodePoints(
        left.reference.artifactId,
        right.reference.artifactId
      ) ||
      compareUnicodeCodePoints(
        left.reference.exportName,
        right.reference.exportName
      )
  );
  const deterministicTarget = target.kind === 'deterministic-test';
  const deterministicTest = deterministicTarget && definitions.length > 0;
  const validatorProjection = createStandaloneServerRuntimeValidatorProjection(
    deterministicTarget ? definitions : []
  );
  const provisionImport = deterministicTest
    ? "import serverRuntimeTestProvision from './.prodivix/server-runtime-test-provision';"
    : deterministicTarget
      ? 'const serverRuntimeTestProvision: unknown = undefined;'
      : '';
  const testTraceWriter = deterministicTest
    ? `const serverRuntimeTestTracePath = ${JSON.stringify(SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH)};
let serverRuntimeTestTraceCount = 0;
type ServerRuntimeTestNodeProcess = Readonly<{
  versions?: Readonly<{ node?: unknown }>;
  getBuiltinModule?: (specifier: string) => unknown;
}>;
type ServerRuntimeTestNodeFs = Readonly<{
  mkdirSync: (path: string, options: Readonly<{ recursive: boolean; mode: number }>) => unknown;
  appendFileSync: (
    path: string,
    contents: string,
    options: Readonly<{ encoding: 'utf8'; flag: 'a'; mode: number }>
  ) => unknown;
}>;
const resolveServerRuntimeTestNodeFs = (): ServerRuntimeTestNodeFs | undefined => {
  const candidate = (globalThis as unknown as Readonly<{ process?: unknown }>).process;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
  const process = candidate as ServerRuntimeTestNodeProcess;
  if (typeof process.versions?.node !== 'string') return undefined;
  if (typeof process.getBuiltinModule !== 'function') {
    throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  }
  let loaded: unknown;
  try {
    loaded = process.getBuiltinModule('node:fs');
  } catch {
    throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  }
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  }
  const fs = loaded as Partial<ServerRuntimeTestNodeFs>;
  if (typeof fs.mkdirSync !== 'function' || typeof fs.appendFileSync !== 'function') {
    throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  }
  return fs as ServerRuntimeTestNodeFs;
};
const writeServerRuntimeTestTrace = (trace: Readonly<Record<string, unknown>>): void => {
  serverRuntimeTestTraceCount += 1;
  const line = JSON.stringify(trace);
  if (
    serverRuntimeTestTraceCount > ${SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumTraces} ||
    new TextEncoder().encode(line).byteLength > ${SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumLineBytes}
  ) throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  const fs = resolveServerRuntimeTestNodeFs();
  // Browser deterministic fixtures are intentionally ephemeral and do not
  // acquire a filesystem capability. The Node Test host must provide the
  // bounded builtin-module port so the Worker can collect durable evidence.
  if (!fs) return;
  try {
    fs.mkdirSync('.prodivix', { recursive: true, mode: 0o700 });
    fs.appendFileSync(serverRuntimeTestTracePath, line + '\\n', { encoding: 'utf8', flag: 'a', mode: 0o600 });
  } catch {
    throw runtimeError('SVR_TEST_TRACE_UNAVAILABLE');
  }
};`
    : deterministicTarget
      ? `const writeServerRuntimeTestTrace = (_trace: Readonly<Record<string, unknown>>): void => {
  throw runtimeError('SVR_TEST_RUNTIME_DISABLED');
};`
      : '';

  const authSessionTransport = deterministicTest
    ? `type DeterministicTestAuthSession = Readonly<{
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
const authSessionFixtureEndpointPath = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH)};
const authSessionFixtureResponseMediaType = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE)};
const authSessionFixtureResponseKeys = ${JSON.stringify(
        [
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
        ].sort()
      )} as const;
const authSessionFixtureDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value);
const authSessionFixtureIdentifier = (
  value: unknown,
  maximumBytes = ${EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumIdentifierBytes}
): value is string =>
  typeof value === 'string' && value === value.trim() && value === value.normalize('NFC') &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) &&
  new TextEncoder().encode(value).byteLength <= maximumBytes;
const normalizeBrowserAuthSessionFixture = (value: unknown): DeterministicTestAuthSession => {
  const record = exactRecord(value, authSessionFixtureResponseKeys);
  if (
    !record ||
    record.format !== ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT)} ||
    record.version !== ${EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION} ||
    !authSessionFixtureIdentifier(record.fixtureSetId) ||
    !authSessionFixtureDigest(record.fixtureSetDigest) ||
    !authSessionFixtureIdentifier(record.fixtureId) ||
    !authSessionFixtureIdentifier(record.resourceId) ||
    !authSessionFixtureDigest(record.inputDigest) ||
    !authSessionFixtureDigest(record.outcomeDigest) ||
    !authSessionFixtureDigest(record.projectionDigest) ||
    !authSessionFixtureIdentifier(record.providerId) ||
    record.resourceId !== record.providerId ||
    !authSessionFixtureIdentifier(record.principalId) ||
    !authSessionFixtureIdentifier(
      record.invocationId,
      ${EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumInvocationIdentifierBytes}
    ) ||
    !Number.isSafeInteger(record.attempt) ||
    (record.attempt as number) < 1 ||
    (record.attempt as number) > 10 ||
    !Array.isArray(record.permissionIds) ||
    record.permissionIds.length > ${EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumPermissionIds}
  ) throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
  const permissionIds = record.permissionIds.map((permissionId) => {
    if (!authSessionFixtureIdentifier(permissionId)) {
      throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
    }
    return permissionId;
  });
  if (permissionIds.some((permissionId, index) =>
    index > 0 && permissionIds[index - 1]! >= permissionId
  )) throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
  return Object.freeze({
    fixtureSetId: record.fixtureSetId,
    fixtureSetDigest: record.fixtureSetDigest,
    fixtureId: record.fixtureId,
    resourceId: record.resourceId,
    inputDigest: record.inputDigest,
    outcomeDigest: record.outcomeDigest,
    projectionDigest: record.projectionDigest,
    providerId: record.providerId,
    principalId: record.principalId,
    permissionIds: Object.freeze(permissionIds),
    invocationId: record.invocationId,
    attempt: record.attempt,
  }) as DeterministicTestAuthSession;
};
const isBrowserDeterministicTestRuntime = (): boolean =>
  (globalThis as unknown as Readonly<{ window?: unknown }>).window === globalThis &&
  typeof (globalThis as unknown as Readonly<{ document?: unknown }>).document === 'object';
const readBoundedAuthSessionFixtureText = async (
  response: Response,
  signal?: AbortSignal
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let byteLength = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > ${EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumResponseBytes}) {
        throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The original bounded-read failure remains authoritative.
    }
    if (signal?.aborted) throw runtimeError('SVR_CANCELLED');
    throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
  } finally {
    reader.releaseLock();
  }
};
let browserAuthSessionFixturePromise: Promise<DeterministicTestAuthSession> | undefined;
const resolveBrowserAuthSessionFixture = (
  signal?: AbortSignal
): Promise<DeterministicTestAuthSession | undefined> => {
  if (!isBrowserDeterministicTestRuntime()) return Promise.resolve(undefined);
  if (!browserAuthSessionFixturePromise) {
    browserAuthSessionFixturePromise = (async () => {
      let response: Response;
      try {
        response = await globalThis.fetch(authSessionFixtureEndpointPath, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          headers: Object.freeze({ Accept: authSessionFixtureResponseMediaType }),
          ...(signal ? { signal } : {}),
        });
      } catch {
        throw runtimeError('SVR_TEST_AUTH_SESSION_UNAVAILABLE');
      }
      const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
      const declaredLength = response.headers.get('content-length');
      if (
        !response.ok ||
        response.status !== 200 ||
        mediaType !== authSessionFixtureResponseMediaType ||
        (declaredLength !== null &&
          (!/^\\d+$/.test(declaredLength) ||
            Number(declaredLength) > ${EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumResponseBytes}))
      ) throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
      const text = await readBoundedAuthSessionFixtureText(response, signal);
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw runtimeError('SVR_TEST_AUTH_SESSION_INVALID');
      }
      return normalizeBrowserAuthSessionFixture(value);
    })();
  }
  return browserAuthSessionFixturePromise;
};
let browserAuthSessionInvocationSequence = 0;
const createBrowserAuthSessionInvocationId = (
  session: DeterministicTestAuthSession
): string => {
  browserAuthSessionInvocationSequence += 1;
  const invocationId = session.invocationId + ':' + String(browserAuthSessionInvocationSequence);
  if (!authSessionFixtureIdentifier(invocationId)) {
    throw runtimeError('SVR_INVOCATION_ID_UNAVAILABLE');
  }
  return invocationId;
};`
    : deterministicTarget
      ? `type DeterministicTestAuthSession = Readonly<{
  providerId: string;
  principalId: string;
  permissionIds: readonly string[];
  invocationId: string;
  attempt: number;
}>;
const resolveBrowserAuthSessionFixture = (
  _signal?: AbortSignal
): Promise<DeterministicTestAuthSession | undefined> => Promise.resolve(undefined);
const createBrowserAuthSessionInvocationId = (
  _session: DeterministicTestAuthSession
): string => {
  throw runtimeError('SVR_INVOCATION_ID_UNAVAILABLE');
};`
      : '';
  const invocationDispatch =
    target.serverGateway === 'execution-server-function-gateway-message-v1'
      ? 'return invokeRemoteServerFunction(functionRef, input, options);'
      : deterministicTarget
        ? 'return invokeDeterministicTestServerFunction(functionRef, input, options);'
        : "throw runtimeError('SVR_REMOTE_GATEWAY_UNAVAILABLE');";

  const runtimeModule: ExportModule = {
    id: WORKSPACE_SERVER_RUNTIME_MODULE_ID,
    kind: 'runtime-helper',
    suggestedName: 'prodivix-server-runtime',
    desiredPath: 'src/prodivix-server-runtime.ts',
    language: 'ts',
    imports: [...validatorProjection.imports],
    body: `${provisionImport}

type EmbeddedDefinition = Readonly<{
  reference: Readonly<{ artifactId: string; exportName: string }>;
  kind: 'function' | 'route-loader' | 'route-action' | 'route-guard';
  runtimeZone: 'server' | 'edge';
  adapterId: string;
  effect: 'read' | 'mutation';
  auth:
    | Readonly<{ kind: 'public' }>
    | Readonly<{ kind: 'authenticated' }>
    | Readonly<{ kind: 'permission'; permissionId: string }>;
  inputSchema: boolean | Readonly<Record<string, unknown>>;
  outputSchema: boolean | Readonly<Record<string, unknown>>;
  idempotency?: Readonly<{ kind: 'invocation-key' }>;
}>;

const serverFunctionDefinitions = ${JSON.stringify(definitions)} as unknown as readonly EmbeddedDefinition[];

export const prodivixServerRuntimeTarget = Object.freeze(${JSON.stringify(target)} as const);

export type WorkspaceServerFunctionReference = Readonly<{
  artifactId: string;
  exportName: string;
}>;

${validatorProjection.registrySource}

export type WorkspaceServerFunctionOutcome =
  | Readonly<{ kind: 'value'; value: unknown }>
  | Readonly<{ kind: 'allow' }>
  | Readonly<{ kind: 'deny'; code: string }>
  | Readonly<{ kind: 'redirect'; location: string; status: 302 | 303 | 307 | 308 }>;

export type WorkspaceServerFunctionInvokeOptions = Readonly<{
  invocationId?: string;
  attempt?: number;
  signal?: AbortSignal;
}>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const exactRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key)) ? record : undefined;
};

const runtimeError = (code: string, retryable = false) =>
  Object.assign(new Error(code), { code, retryable });

${testTraceWriter}

${authSessionTransport}

const cloneJsonValue = (
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: { nodes: number }
): unknown => {
  if (depth > 64 || ++budget.nodes > 65536) throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
    return value;
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((entry) => cloneJsonValue(entry, ancestors, depth + 1, budget)));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
    }
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry, ancestors, depth + 1, budget)])
    ));
  } finally {
    ancestors.delete(value);
  }
};

const cloneJson = (value: unknown): unknown => {
  const cloned = cloneJsonValue(value, new Set(), 0, { nodes: 0 });
  const encoded = JSON.stringify(cloned);
  if (new TextEncoder().encode(encoded).byteLength > 1024 * 1024) {
    throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
  }
  return cloned;
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => JSON.stringify(key) + ':' + canonicalJson(entry))
    .join(',') + '}';
};

const canonicalIdentifier = (value: unknown, exportName = false): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() &&
  (exportName ? /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) : /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value));

const assertInvocation = (
  functionRef: WorkspaceServerFunctionReference,
  options: WorkspaceServerFunctionInvokeOptions,
  hostInvocationId?: string,
  hostAttempt?: number
) => {
  if (!canonicalIdentifier(functionRef.artifactId) || !canonicalIdentifier(functionRef.exportName, true)) {
    throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
  }
  const invocationId = options.invocationId ?? hostInvocationId;
  const attempt = options.attempt ?? hostAttempt ?? 1;
  if (!canonicalIdentifier(invocationId) || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 10) {
    throw runtimeError('SVR_INVOCATION_ID_UNAVAILABLE');
  }
  if (options.signal?.aborted) throw runtimeError('SVR_CANCELLED');
  return { invocationId, attempt } as const;
};

const safeFailureCodes = new Set([
  'SVR-1001', 'SVR-2001', 'SVR-3001', 'SVR-3002', 'SVR-3003', 'SVR-4004', 'SVR-5001', 'SVR-5002',
  'SVR_CANCELLED', 'SVR_REMOTE_GATEWAY_UNAVAILABLE', 'SVR_REMOTE_GATEWAY_STALE',
]);

const invokeRemoteServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions
): Promise<WorkspaceServerFunctionOutcome> => {
  const runtimeWindow = globalThis as unknown as Window;
  const parent = runtimeWindow.parent;
  if (!parent || parent === runtimeWindow) throw runtimeError('SVR_REMOTE_GATEWAY_UNAVAILABLE');
  const { invocationId, attempt } = assertInvocation(functionRef, options);
  const requestId = invocationId + ':' + String(attempt);
  const requestInput = cloneJson(input);
  return new Promise<WorkspaceServerFunctionOutcome>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      globalThis.removeEventListener('message', onMessage);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      try {
        parent.postMessage(Object.freeze({
          type: 'prodivix.execution-server-function-gateway-cancel.v1',
          requestId,
          invocationId,
        }), '*');
      } finally {
        settle(() => reject(runtimeError('SVR_CANCELLED')));
      }
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== parent) return;
      const response = exactRecord(event.data, ['type', 'requestId', 'ok'], ['result', 'error']);
      if (
        !response || response.type !== 'prodivix.execution-server-function-gateway-response.v1' ||
        response.requestId !== requestId || typeof response.ok !== 'boolean'
      ) return;
      if (!response.ok) {
        if (hasOwn(response, 'result')) {
          settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_INVALID')));
          return;
        }
        const error = exactRecord(response.error, ['code', 'retryable']);
        if (!error || typeof error.code !== 'string' || !safeFailureCodes.has(error.code) || typeof error.retryable !== 'boolean') {
          settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_INVALID')));
          return;
        }
        settle(() => reject(runtimeError(error.code as string, error.retryable as boolean)));
        return;
      }
      if (hasOwn(response, 'error')) {
        settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_INVALID')));
        return;
      }
      try {
        const outcome = normalizeOutcome(undefined, response.result);
        settle(() => resolve(outcome));
      } catch {
        settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_INVALID')));
      }
    };
    const timeout = globalThis.setTimeout(
      () => settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_TIMEOUT'))),
      30_000
    );
    globalThis.addEventListener('message', onMessage);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    try {
      parent.postMessage(Object.freeze({
        type: 'prodivix.execution-server-function-gateway-request.v1',
        requestId,
        invocationId,
        attempt,
        functionRef: Object.freeze({ artifactId: functionRef.artifactId, exportName: functionRef.exportName }),
        input: requestInput,
      }), '*');
    } catch {
      settle(() => reject(runtimeError('SVR_REMOTE_GATEWAY_UNAVAILABLE')));
    }
  });
};

const readDefinition = (reference: WorkspaceServerFunctionReference): EmbeddedDefinition | undefined =>
  serverFunctionDefinitions.find((definition) =>
    definition.reference.artifactId === reference.artifactId &&
    definition.reference.exportName === reference.exportName
  );

const normalizeOutcome = (
  definition: EmbeddedDefinition | undefined,
  value: unknown
): WorkspaceServerFunctionOutcome => {
  const kind = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).kind
    : undefined;
  const record = kind === 'value'
    ? exactRecord(value, ['kind', 'value'])
    : kind === 'allow'
      ? exactRecord(value, ['kind'])
      : kind === 'deny'
        ? exactRecord(value, ['kind', 'code'])
        : kind === 'redirect'
          ? exactRecord(value, ['kind', 'location', 'status'])
          : undefined;
  if (
    !record ||
    (definition?.kind === 'route-guard' && kind === 'value') ||
    (kind === 'allow' && definition !== undefined && definition.kind !== 'route-guard') ||
    (kind === 'deny' && (
      (definition !== undefined && definition.kind !== 'route-guard') ||
      typeof record.code !== 'string' || !/^[A-Z][A-Z0-9_-]{0,127}$/.test(record.code)
    )) ||
    (kind === 'redirect' && (
      definition?.kind === 'function' || typeof record.location !== 'string' ||
      record.location.length > 2048 || record.location !== record.location.trim() ||
      record.location.includes('\0') || !record.location.startsWith('/') || record.location.startsWith('//') ||
      typeof record.status !== 'number' || ![302, 303, 307, 308].includes(record.status)
    ))
  ) throw runtimeError('SVR_OUTCOME_INVALID');
  return cloneJson(record) as WorkspaceServerFunctionOutcome;
};

${
  deterministicTarget
    ? `const testReplayByInvocation = new Map<string, Readonly<{ fingerprint: string; result: Promise<WorkspaceServerFunctionOutcome> }>>();

const waitForTestFixture = (delayMs: unknown, signal?: AbortSignal): Promise<void> => {
  if (delayMs === undefined || delayMs === 0) return Promise.resolve();
  if (!Number.isSafeInteger(delayMs) || (delayMs as number) < 0 || (delayMs as number) > 60_000) {
    return Promise.reject(runtimeError('SVR_TEST_PROVISION_INVALID'));
  }
  return new Promise((resolve, reject) => {
    const handle = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs as number);
    const onAbort = () => {
      globalThis.clearTimeout(handle);
      signal?.removeEventListener('abort', onAbort);
      reject(runtimeError('SVR_CANCELLED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

const executeDeterministicTestServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions,
  invocationId: string,
  browserAuthSession: DeterministicTestAuthSession | undefined
): Promise<WorkspaceServerFunctionOutcome> => {
  const envelope = exactRecord(serverRuntimeTestProvision, ['format', 'mode'], ['provision']);
  if (
    !envelope || envelope.format !== 'prodivix.executable-server-runtime-provision.v1' ||
    envelope.mode !== 'deterministic-test' || !hasOwn(envelope, 'provision')
  ) throw runtimeError('SVR_TEST_RUNTIME_DISABLED');
  const provision = exactRecord(envelope.provision, ['format', 'fixtureSetId', 'permissions', 'fixtures'], ['principal']);
  if (
    !provision || provision.format !== 'prodivix.server-runtime-test-provision.v1' ||
    !Array.isArray(provision.permissions) || !Array.isArray(provision.fixtures)
  ) throw runtimeError('SVR_TEST_PROVISION_INVALID');
  const permissions = provision.permissions;
  const fixtures = provision.fixtures;
  const definition = readDefinition(functionRef);
  if (!definition) throw runtimeError('SVR_TEST_FIXTURE_MISSING');
  const schemaValidators = readServerRuntimeSchemaValidators(functionRef);
  if (!schemaValidators) throw runtimeError('SVR_TEST_FIXTURE_MISSING');
  const normalizedInput = cloneJson(input);
  if (!schemaValidators.input(normalizedInput)) throw runtimeError('SVR_INPUT_INVALID');
  let resolvedPrincipal: Readonly<{ providerId: string; principalId: string }> | undefined;
  if (definition.auth.kind !== 'public') {
    const embeddedPrincipal = exactRecord(provision.principal, ['providerId', 'principalId']);
    const principal = browserAuthSession
      ? Object.freeze({
          providerId: browserAuthSession.providerId,
          principalId: browserAuthSession.principalId,
        })
      : embeddedPrincipal;
    if (!principal || !canonicalIdentifier(principal.providerId) || !canonicalIdentifier(principal.principalId)) {
      if (definition.kind === 'route-guard') {
        return normalizeOutcome(definition, Object.freeze({
          kind: 'deny',
          code: 'AUTH_REQUIRED',
        }));
      }
      throw runtimeError('AUTH_REQUIRED');
    }
    resolvedPrincipal = principal as Readonly<{ providerId: string; principalId: string }>;
    if (definition.auth.kind === 'permission') {
      const requiredPermissionId = definition.auth.permissionId;
      const allowed = browserAuthSession
        ? browserAuthSession.permissionIds.includes(requiredPermissionId)
        : permissions
            .map((entry) => exactRecord(entry, ['permissionId', 'allowed'], ['code']))
            .some((entry) => entry?.permissionId === requiredPermissionId && entry.allowed === true);
      if (!allowed) {
        if (definition.kind === 'route-guard') {
          return normalizeOutcome(definition, Object.freeze({
            kind: 'deny',
            code: 'AUTH_PERMISSION_DENIED',
          }));
        }
        throw runtimeError('AUTH_PERMISSION_DENIED');
      }
    }
  }
  if (
    definition.adapterId === 'core.auth.current-principal' &&
    definition.kind === 'route-loader'
  ) {
    if (!resolvedPrincipal) throw runtimeError('AUTH_REQUIRED');
    const outcome = normalizeOutcome(definition, Object.freeze({
      kind: 'value',
      value: Object.freeze({
        providerId: resolvedPrincipal.providerId,
        principalId: resolvedPrincipal.principalId,
      }),
    }));
    if (outcome.kind !== 'value' || !schemaValidators.output(outcome.value)) {
      throw runtimeError('SVR_OUTPUT_INVALID');
    }
    return outcome;
  }
  const fingerprint = functionRef.artifactId + '\0' + functionRef.exportName + '\0' + canonicalJson(normalizedInput);
  if (definition.effect === 'mutation') {
    if (definition.idempotency?.kind !== 'invocation-key') throw runtimeError('SVR_TEST_IDEMPOTENCY_REQUIRED');
    const replay = testReplayByInvocation.get(invocationId);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw runtimeError('SVR_TEST_REPLAY_CONFLICT');
      return replay.result;
    }
  }
  const execute = async (): Promise<WorkspaceServerFunctionOutcome> => {
    if (options.signal?.aborted) throw runtimeError('SVR_CANCELLED');
    const normalizedFixtures = fixtures
      .map((entry) => exactRecord(entry, ['id', 'functionRef', 'behavior'], ['input']))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    const candidates = normalizedFixtures.filter((fixture) => {
      const reference = exactRecord(fixture.functionRef, ['artifactId', 'exportName']);
      return reference?.artifactId === functionRef.artifactId && reference.exportName === functionRef.exportName;
    });
    const fixture = candidates.find((candidate) =>
      hasOwn(candidate, 'input') && canonicalJson(candidate.input) === canonicalJson(normalizedInput)
    ) ?? candidates.find((candidate) => !hasOwn(candidate, 'input'));
    if (!fixture) throw runtimeError('SVR_TEST_FIXTURE_MISSING');
    const behavior = exactRecord(fixture.behavior, ['kind'], ['outcome', 'code', 'retryable', 'delayMs']);
    if (!behavior) throw runtimeError('SVR_TEST_PROVISION_INVALID');
    await waitForTestFixture(behavior.delayMs, options.signal);
    if (options.signal?.aborted) throw runtimeError('SVR_CANCELLED');
    if (behavior.kind === 'error') {
      if (typeof behavior.code !== 'string' || typeof behavior.retryable !== 'boolean') {
        throw runtimeError('SVR_TEST_PROVISION_INVALID');
      }
      throw runtimeError(behavior.code, behavior.retryable);
    }
    if (behavior.kind !== 'outcome' || !hasOwn(behavior, 'outcome')) {
      throw runtimeError('SVR_TEST_PROVISION_INVALID');
    }
    const outcome = normalizeOutcome(definition, behavior.outcome);
    if (outcome.kind === 'value' && !schemaValidators.output(outcome.value)) {
      throw runtimeError('SVR_OUTPUT_INVALID');
    }
    return outcome;
  };
  const result = execute();
  if (definition.effect === 'mutation') {
    testReplayByInvocation.set(invocationId, Object.freeze({ fingerprint, result }));
  }
  return result;
};

const invokeDeterministicTestServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions
): Promise<WorkspaceServerFunctionOutcome> => {
  const definition = readDefinition(functionRef);
  const browserAuthSession =
    definition && definition.auth.kind !== 'public'
      ? await resolveBrowserAuthSessionFixture(options.signal)
      : undefined;
  const { invocationId, attempt } = assertInvocation(
    functionRef,
    options,
    browserAuthSession
      ? createBrowserAuthSessionInvocationId(browserAuthSession)
      : undefined,
    browserAuthSession?.attempt
  );
  const startedAt = Date.now();
  let result: WorkspaceServerFunctionOutcome;
  try {
    result = await executeDeterministicTestServerFunction(
      functionRef,
      input,
      options,
      invocationId,
      browserAuthSession
    );
  } catch (error) {
    const completedAt = Date.now();
    const candidate = error && typeof error === 'object'
      ? error as Readonly<{ code?: unknown; retryable?: unknown }>
      : undefined;
    const errorCode = typeof candidate?.code === 'string' && /^[A-Z][A-Z0-9_-]{0,127}$/.test(candidate.code)
      ? candidate.code
      : 'SVR_TEST_FIXTURE_FAILURE';
    writeServerRuntimeTestTrace(Object.freeze({
      format: 'prodivix.server-function-invocation-trace.v1',
      requestId: invocationId + ':' + String(attempt),
      invocationId,
      attempt,
      functionRef: Object.freeze({ artifactId: functionRef.artifactId, exportName: functionRef.exportName }),
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      outcome: errorCode === 'SVR_CANCELLED' ? 'cancelled' : 'failed',
      errorCode,
      retryable: candidate?.retryable === true,
      redacted: true,
    }));
    throw error;
  }
  const completedAt = Date.now();
  writeServerRuntimeTestTrace(Object.freeze({
    format: 'prodivix.server-function-invocation-trace.v1',
    requestId: invocationId + ':' + String(attempt),
    invocationId,
    attempt,
    functionRef: Object.freeze({ artifactId: functionRef.artifactId, exportName: functionRef.exportName }),
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    outcome: 'succeeded',
    resultKind: result.kind,
    redacted: true,
  }));
  return result;
};`
    : ''
}

export const invokeWorkspaceServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions = {}
): Promise<WorkspaceServerFunctionOutcome> => {
  ${invocationDispatch}
};
`,
    sourceTrace: [
      {
        sourceRef: {
          domain: 'workspace',
          id: WORKSPACE_SERVER_RUNTIME_MODULE_ID,
          path: '/',
        },
      },
    ],
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
  return Object.freeze([runtimeModule, ...validatorProjection.modules]);
};
