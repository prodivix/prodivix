import type { ExportModule } from '#src/export';
import type {
  WorkspaceServerRuntimeBinding,
  WorkspaceServerRuntimeTarget,
} from '#src/react/workspaceServerRuntimeTarget';

export const WORKSPACE_SERVER_RUNTIME_MODULE_ID =
  'workspace-server-runtime' as const;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/** Emits a source-free Server Function client plus the deterministic Test adapter boundary. */
export const createWorkspaceStandaloneServerRuntimeModule = (
  target: WorkspaceServerRuntimeTarget,
  bindings: readonly WorkspaceServerRuntimeBinding[] = []
): ExportModule => {
  const definitions = [
    ...new Map(
      bindings.map(({ definition }) => [
        `${definition.reference.artifactId}\0${definition.reference.exportName}`,
        definition,
      ])
    ).values(),
  ].sort(
    (left, right) =>
      compareText(left.reference.artifactId, right.reference.artifactId) ||
      compareText(left.reference.exportName, right.reference.exportName)
  );
  const deterministicTest =
    target.kind === 'deterministic-test' && definitions.length > 0;
  const provisionImport = deterministicTest
    ? "import serverRuntimeTestProvision from './.prodivix/server-runtime-test-provision';"
    : 'const serverRuntimeTestProvision: unknown = undefined;';

  return {
    id: WORKSPACE_SERVER_RUNTIME_MODULE_ID,
    kind: 'runtime-helper',
    suggestedName: 'prodivix-server-runtime',
    desiredPath: 'src/prodivix-server-runtime.ts',
    language: 'ts',
    imports: [
      {
        kind: 'default',
        source: 'ajv/dist/2020.js',
        imported: 'Ajv2020',
        local: 'Ajv2020',
      },
    ],
    body: `${provisionImport}

const serverRuntimeTarget = ${JSON.stringify(target)} as const;

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

export type WorkspaceServerFunctionReference = Readonly<{
  artifactId: string;
  exportName: string;
}>;

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

const exactRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key)) ? record : undefined;
};

const runtimeError = (code: string, retryable = false) =>
  Object.assign(new Error(code), { code, retryable });

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
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => JSON.stringify(key) + ':' + canonicalJson(entry))
    .join(',') + '}';
};

const canonicalIdentifier = (value: unknown, exportName = false): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() &&
  (exportName ? /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) : /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value));

const assertInvocation = (functionRef: WorkspaceServerFunctionReference, options: WorkspaceServerFunctionInvokeOptions) => {
  if (!canonicalIdentifier(functionRef.artifactId) || !canonicalIdentifier(functionRef.exportName, true)) {
    throw runtimeError('SVR_REMOTE_GATEWAY_INVALID');
  }
  const invocationId = options.invocationId ?? globalThis.crypto?.randomUUID?.();
  const attempt = options.attempt ?? 1;
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
        if (Object.hasOwn(response, 'result')) {
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
      if (Object.hasOwn(response, 'error')) {
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

const testReplayByInvocation = new Map<string, Readonly<{ fingerprint: string; result: Promise<WorkspaceServerFunctionOutcome> }>>();

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

const invokeDeterministicTestServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions
): Promise<WorkspaceServerFunctionOutcome> => {
  const { invocationId } = assertInvocation(functionRef, options);
  const envelope = exactRecord(serverRuntimeTestProvision, ['format', 'mode'], ['provision']);
  if (
    !envelope || envelope.format !== 'prodivix.executable-server-runtime-provision.v1' ||
    envelope.mode !== 'deterministic-test' || !Object.hasOwn(envelope, 'provision')
  ) throw runtimeError('SVR_TEST_RUNTIME_DISABLED');
  const provision = exactRecord(envelope.provision, ['format', 'fixtureSetId', 'permissions', 'fixtures'], ['principal']);
  if (
    !provision || provision.format !== 'prodivix.server-runtime-test-provision.v1' ||
    !Array.isArray(provision.permissions) || !Array.isArray(provision.fixtures)
  ) throw runtimeError('SVR_TEST_PROVISION_INVALID');
  const definition = readDefinition(functionRef);
  if (!definition) throw runtimeError('SVR_TEST_FIXTURE_MISSING');
  const normalizedInput = cloneJson(input);
  const ajv = new Ajv2020({ allErrors: true, messages: false, strict: false, validateFormats: false });
  if (!ajv.compile(definition.inputSchema)(normalizedInput)) throw runtimeError('SVR_INPUT_INVALID');
  if (definition.auth.kind !== 'public') {
    const principal = exactRecord(provision.principal, ['providerId', 'principalId']);
    if (!principal || !canonicalIdentifier(principal.providerId) || !canonicalIdentifier(principal.principalId)) {
      throw runtimeError('AUTH_REQUIRED');
    }
    if (definition.auth.kind === 'permission') {
      const permission = provision.permissions
        .map((entry) => exactRecord(entry, ['permissionId', 'allowed'], ['code']))
        .find((entry) => entry?.permissionId === definition.auth.permissionId);
      if (!permission || permission.allowed !== true) throw runtimeError('AUTH_PERMISSION_DENIED');
    }
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
    const fixtures = provision.fixtures
      .map((entry) => exactRecord(entry, ['id', 'functionRef', 'behavior'], ['input']))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    const candidates = fixtures.filter((fixture) => {
      const reference = exactRecord(fixture.functionRef, ['artifactId', 'exportName']);
      return reference?.artifactId === functionRef.artifactId && reference.exportName === functionRef.exportName;
    });
    const fixture = candidates.find((candidate) =>
      Object.hasOwn(candidate, 'input') && canonicalJson(candidate.input) === canonicalJson(normalizedInput)
    ) ?? candidates.find((candidate) => !Object.hasOwn(candidate, 'input'));
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
    if (behavior.kind !== 'outcome' || !Object.hasOwn(behavior, 'outcome')) {
      throw runtimeError('SVR_TEST_PROVISION_INVALID');
    }
    const outcome = normalizeOutcome(definition, behavior.outcome);
    if (outcome.kind === 'value' && !ajv.compile(definition.outputSchema)(outcome.value)) {
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

export const invokeWorkspaceServerFunction = async (
  functionRef: WorkspaceServerFunctionReference,
  input: unknown,
  options: WorkspaceServerFunctionInvokeOptions = {}
): Promise<WorkspaceServerFunctionOutcome> => {
  if (serverRuntimeTarget.serverGateway === 'execution-server-function-gateway-message-v1') {
    return invokeRemoteServerFunction(functionRef, input, options);
  }
  if (serverRuntimeTarget.serverGateway === 'deterministic-test-fixture-v1') {
    return invokeDeterministicTestServerFunction(functionRef, input, options);
  }
  throw runtimeError('SVR_REMOTE_GATEWAY_UNAVAILABLE');
};
`,
    sourceTrace: [],
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
};
