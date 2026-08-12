import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
  createAgentEvaluationControlledWorkspaceServiceAcknowledgement,
  digestAgentEvaluationControlledWorkspaceServiceRequest,
  type AgentEvaluationControlledWorkspaceServiceOperation,
  type AgentEvaluationControlledWorkspaceServiceRequest,
} from './controlledWorkspaceRuntimeService';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest,
  createAgentEvaluationControlledWorkspaceDirectStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import type { ProductionControlledWorkspaceStatelessOwnerAuthority } from './productionControlledWorkspaceSessionEngine';
import type { ProductionOwnerResourceRetirement } from './productionWorkspaceVerificationOwnerAuthorityPorts';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE =
  'controlled-workspace-owner' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID =
  'evaluation.controlled-workspace-owner-ledger.v1' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-owner-ledger-request' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_RESULT_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-owner-ledger-result' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-owner-ledger-health' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION =
  1 as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES = 67_108_864;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES = 33_554_432;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS = 128;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_READ_TIMEOUT_MS = 30_000;
export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS = 125_000;

const implementationOperations = Object.freeze([
  'grant.issue',
  'session.orphan.destroy',
  'session.orphans.list',
  'operation.attempt-state.load',
  'operation.claim',
  'operation.cleanup.claim',
  'operation.cleanup.dispatch',
  'operation.cleanup.reconcile',
  'operation.cleanup.seal',
  'operation.dispatch',
  'operation.reconcile-dispatched',
  'operation.seal-atomic',
  'operation.seal-rejected',
  'operation.sealed.list',
  'operation.sealed.load',
] as const);

export const PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-controlled-workspace-owner-ledger-implementation',
    version: 1,
    purpose: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
    authorityId: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID,
    durability: 'postgresql-seal-before-response',
    reconciliation: 'sealed-read-zero-effect',
    operations: implementationOperations,
  });

const operationPaths = Object.freeze({
  'grant.issue': 'grants/issue',
  'session.orphan.destroy': 'sessions/orphans/destroy',
  'session.orphans.list': 'sessions/orphans/list',
  'operation.attempt-state.load': 'operations/attempt-state/load',
  'operation.claim': 'operations/claim',
  'operation.dispatch': 'operations/dispatch',
  'operation.seal-rejected': 'operations/seal-rejected',
  'operation.seal-atomic': 'operations/seal-atomic',
  'operation.reconcile-dispatched': 'operations/reconcile-dispatched',
  'operation.sealed.load': 'operations/sealed/load',
  'operation.sealed.list': 'operations/sealed/list',
  'operation.cleanup.claim': 'operations/cleanup/claim',
  'operation.cleanup.dispatch': 'operations/cleanup/dispatch',
  'operation.cleanup.seal': 'operations/cleanup/seal',
  'operation.cleanup.reconcile': 'operations/cleanup/reconcile',
} as const satisfies Readonly<
  Partial<Record<AgentEvaluationControlledWorkspaceServiceOperation, string>>
>);

type DirectOperation = keyof typeof operationPaths;

const readOperations = new Set<DirectOperation>([
  'session.orphans.list',
  'operation.attempt-state.load',
  'operation.reconcile-dispatched',
  'operation.sealed.load',
  'operation.sealed.list',
  'operation.cleanup.reconcile',
]);

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

/**
 * Orphan retirement is the only direct-ledger mutation whose public fact is
 * produced by the Workspace session owner. `reconstruct` must read the sealed
 * 8790 owner-state transition and may not enter a sandbox or repeat cleanup.
 */
export type ProductionControlledWorkspaceOrphanRetirementAuthority = Readonly<{
  execute(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  reconstruct(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}>;

export type CreateProductionControlledWorkspaceDirectAuthorityInput = Readonly<{
  namespaceId: string;
  repositoryCommit: string;
  readToken: AgentEvaluationEnvironmentReader;
  forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  orphanRetirement: ProductionControlledWorkspaceOrphanRetirementAuthority;
  fetch?: typeof fetch;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
}>;

export type CreateEnvironmentProductionControlledWorkspaceDirectAuthorityInput =
  Readonly<{
    environment?: Environment;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    orphanRetirement: ProductionControlledWorkspaceOrphanRetirementAuthority;
    fetch?: typeof fetch;
    readTimeoutMs?: number;
    writeTimeoutMs?: number;
  }>;

type DirectEnvelope = Readonly<{
  format: typeof PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_REQUEST_FORMAT;
  version: typeof PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION;
  purpose: typeof PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE;
  mode: 'execute' | 'read' | 'reconcile';
  request: AgentEvaluationControlledWorkspaceServiceRequest;
  ownerResultFacts: readonly unknown[] | null;
  ownerImplementationDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest | null;
  dispatchAckDigest: CanonicalDigest | null;
  requestDigest: CanonicalDigest;
}>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const commitPattern = /^[a-f0-9]{40}$/u;

const invalid = (code: string): TypeError =>
  new TypeError(`G4_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_INVALID: ${code}`);

const fail = (code: string): never => {
  throw invalid(code);
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const boundedTimeout = (
  value: number | undefined,
  fallback: number,
  maximum: number
): number => {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    return fail('timeout');
  }
  return selected;
};

const environmentReader = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const decodeCanonicalJson = (bytes: Uint8Array): unknown => {
  try {
    const text = textDecoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key !== '' && isUnsafeObjectKey(key)) throw new TypeError('key');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) return fail('response-canonical');
    return value;
  } catch {
    return fail('response-json');
  }
};

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> => {
  if (!response.body) return fail('response-body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return fail('response-size');
      }
      chunks.push(next.value);
    }
    if (byteLength < 2) return fail('response-size');
    const result = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const clean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

const retireOrphanAuthorityAfterFailure = async (
  authority: ProductionControlledWorkspaceOrphanRetirementAuthority,
  caught: unknown
): Promise<never> => {
  try {
    clean(await authority.close());
  } catch (cleanup) {
    throw new AggregateError(
      [caught, cleanup],
      'Controlled Workspace configuration and orphan retirement both failed.'
    );
  }
  throw caught;
};

const requestOperation = (
  request: AgentEvaluationOwnerAuthorityRequest,
  mode: 'execute' | 'read' | 'reconcile'
): DirectOperation => {
  if (
    request.serviceKind !== 'controlled-workspace' ||
    request.mode !== mode ||
    !Object.hasOwn(operationPaths, request.operation) ||
    request.routeBinding !==
      operationPaths[request.operation as DirectOperation] ||
    request.sessionId !== undefined ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !commitPattern.test(request.repositoryCommit) ||
    !isAgentCanonicalDigest(request.requestDigest) ||
    !isPlainObject(request.payload) ||
    Object.getOwnPropertySymbols(request.payload).length !== 0 ||
    Object.keys(request.payload).some(isUnsafeObjectKey) ||
    request.ownerStateRevision !== undefined ||
    request.ownerStateBundle !== undefined ||
    request.ownerStateRootDigest !== undefined ||
    request.sealedOwnerOperation !== undefined ||
    (mode === 'read'
      ? request.claimGeneration !== 0
      : request.claimGeneration !== 1) ||
    (mode === 'read' &&
      (request.ownerImplementationDigest !== undefined ||
        request.stageDigest !== undefined ||
        request.dispatchAckDigest !== undefined)) ||
    (mode === 'execute' &&
      (!isAgentCanonicalDigest(request.ownerImplementationDigest) ||
        !isAgentCanonicalDigest(request.stageDigest) ||
        request.dispatchAckDigest !== undefined)) ||
    (mode === 'reconcile' &&
      (!isAgentCanonicalDigest(request.ownerImplementationDigest) ||
        !isAgentCanonicalDigest(request.stageDigest) ||
        !isAgentCanonicalDigest(request.dispatchAckDigest)))
  ) {
    return fail('request-binding');
  }
  const operation = request.operation as DirectOperation;
  if ((mode === 'read') !== readOperations.has(operation)) {
    return fail('request-mode');
  }
  const innerBase = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
    version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
    operation,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    payload: request.payload,
  });
  if (
    request.requestDigest !==
    digestAgentEvaluationControlledWorkspaceServiceRequest(innerBase)
  ) {
    return fail('inner-request-digest');
  }
  if (
    mode !== 'read' &&
    request.stageDigest !==
      createAgentEvaluationControlledWorkspaceDirectStageDigest(
        request,
        request.ownerImplementationDigest!
      )
  ) {
    return fail('stage-digest');
  }
  return operation;
};

const innerRequest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  operation: DirectOperation
): AgentEvaluationControlledWorkspaceServiceRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
    version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
    operation,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest!,
    repositoryCommit: request.repositoryCommit,
    payload: request.payload,
    requestDigest: request.requestDigest,
  });

const envelopeFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  operation: DirectOperation,
  ownerResultFacts: readonly unknown[] | null,
  mode: 'execute' | 'read' | 'reconcile'
): DirectEnvelope => {
  if (
    (operation === 'session.orphan.destroy') !== (ownerResultFacts !== null) ||
    (ownerResultFacts !== null && ownerResultFacts.length !== 1)
  ) {
    return fail('owner-result-facts');
  }
  const base = Object.freeze({
    format: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_REQUEST_FORMAT,
    version: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
    purpose: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
    request: innerRequest(request, operation),
    ownerResultFacts,
  });
  return Object.freeze({
    format: base.format,
    version: base.version,
    purpose: base.purpose,
    mode,
    request: base.request,
    ownerResultFacts: base.ownerResultFacts,
    ownerImplementationDigest:
      mode === 'read' ? null : request.ownerImplementationDigest!,
    stageDigest: mode === 'read' ? null : request.stageDigest!,
    dispatchAckDigest: mode === 'reconcile' ? request.dispatchAckDigest! : null,
    requestDigest: digestAgentCanonicalValue(base),
  });
};

const resultFacts = (
  value: unknown,
  envelope: DirectEnvelope,
  request: AgentEvaluationOwnerAuthorityRequest,
  operation: DirectOperation,
  mode: 'execute' | 'read' | 'reconcile'
): readonly unknown[] => {
  const keys = [
    'format',
    'version',
    'purpose',
    'mode',
    'requestDigest',
    'facts',
    'receiptDigest',
    'ownerImplementationDigest',
    'stageDigest',
    'dispatchAckDigest',
    ...(mode === 'reconcile' ? ['reconciled'] : []),
  ];
  if (
    !exactRecord(value, keys) ||
    value.format !==
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_RESULT_FORMAT ||
    value.version !==
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION ||
    value.purpose !==
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE ||
    value.mode !== mode ||
    value.requestDigest !== envelope.requestDigest ||
    !Array.isArray(value.facts) ||
    value.facts.length >
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS ||
    !isAgentCanonicalDigest(value.receiptDigest) ||
    (mode === 'reconcile' && value.reconciled !== true)
  ) {
    return fail('result');
  }
  const facts = Object.freeze([...value.facts]);
  const innerAcknowledgement =
    createAgentEvaluationControlledWorkspaceServiceAcknowledgement({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
      version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
      operation,
      requestDigest: request.requestDigest,
      facts,
    });
  if (
    value.receiptDigest !== innerAcknowledgement.receiptDigest ||
    (mode === 'read'
      ? value.ownerImplementationDigest !== null ||
        value.stageDigest !== null ||
        value.dispatchAckDigest !== null
      : value.ownerImplementationDigest !== request.ownerImplementationDigest ||
        value.stageDigest !== request.stageDigest ||
        value.dispatchAckDigest !==
          createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
            request,
            facts,
            request.ownerImplementationDigest!,
            request.stageDigest!
          )) ||
    (mode === 'reconcile' &&
      value.dispatchAckDigest !== request.dispatchAckDigest)
  ) {
    return fail('result-binding');
  }
  return facts;
};

const retired = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

export const createProductionControlledWorkspaceDirectAuthority = (
  input: CreateProductionControlledWorkspaceDirectAuthorityInput
): Readonly<{
  authority: ProductionControlledWorkspaceStatelessOwnerAuthority;
  probe(): Promise<void>;
}> => {
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !commitPattern.test(input.repositoryCommit) ||
    typeof input.readToken !== 'function' ||
    typeof input.forbiddenCanaries !== 'function' ||
    typeof input.orphanRetirement?.execute !== 'function' ||
    typeof input.orphanRetirement?.reconstruct !== 'function' ||
    typeof input.orphanRetirement?.close !== 'function'
  ) {
    return fail('factory');
  }
  const fetchImplementation = input.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') return fail('fetch');
  const readTimeoutMs = boundedTimeout(
    input.readTimeoutMs,
    PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_READ_TIMEOUT_MS,
    PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_READ_TIMEOUT_MS
  );
  const writeTimeoutMs = boundedTimeout(
    input.writeTimeoutMs,
    PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS,
    PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS
  );
  const healthRoot = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${encodeURIComponent(input.namespaceId)}/controlled-workspace-owner`;
  let closed = false;
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;

  const invoke = async (options: {
    path: string;
    method: 'GET' | 'POST';
    timeoutMs: number;
    body?: string;
    idempotencyKey?: CanonicalDigest;
    maximumResponseBytes: number;
  }): Promise<unknown> => {
    if (closed) return fail('closed');
    let token: string | undefined;
    try {
      token = input.readToken(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
    } catch {
      return fail('credential-unavailable');
    }
    if (!isAgentEvaluationServiceToken(token)) {
      return fail('credential-unavailable');
    }
    const credential = token;
    const canaries = () =>
      Object.freeze([...input.forbiddenCanaries(), credential]);
    if (options.body !== undefined) {
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        options.body,
        canaries
      );
    }
    const headers = new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${credential}`,
      'X-Prodivix-Controlled-Workspace-Owner-Purpose':
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...(options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : {}),
    });
    token = undefined;
    let response: Response;
    try {
      response = await fetchImplementation(options.path, {
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: options.body }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      headers.delete('Authorization');
      return fail('transport');
    }
    headers.delete('Authorization');
    const declaredLength = response.headers.get('content-length');
    if (
      response.status !== 200 ||
      response.headers.get('cache-control') !== 'no-store' ||
      response.headers.get('content-type') !==
        'application/json; charset=utf-8' ||
      response.headers.get('content-encoding') !== null ||
      (declaredLength !== null &&
        (!/^\d+$/u.test(declaredLength) ||
          Number(declaredLength) > options.maximumResponseBytes))
    ) {
      return fail('http-response');
    }
    const bytes = await readBoundedResponse(
      response,
      options.maximumResponseBytes
    );
    try {
      assertProductionAgentEvaluationG3SandboxCanaryClean(bytes, canaries);
      return decodeCanonicalJson(bytes);
    } finally {
      bytes.fill(0);
    }
  };

  const dispatch = async (
    request: AgentEvaluationOwnerAuthorityRequest,
    mode: 'execute' | 'read' | 'reconcile'
  ): Promise<readonly unknown[]> => {
    const operation = requestOperation(request, mode);
    if (
      request.namespaceId !== input.namespaceId ||
      request.repositoryCommit !== input.repositoryCommit
    ) {
      return fail('partition');
    }
    let ownerResultFacts: readonly unknown[] | null = null;
    if (operation === 'session.orphan.destroy') {
      ownerResultFacts =
        mode === 'reconcile'
          ? await input.orphanRetirement.reconstruct(request)
          : await input.orphanRetirement.execute(request);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        ownerResultFacts,
        input.forbiddenCanaries
      );
    }
    const envelope = envelopeFor(request, operation, ownerResultFacts, mode);
    const body = canonicalJsonText(envelope);
    if (
      textEncoder.encode(body).byteLength >
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES
    ) {
      return fail('request-size');
    }
    const root = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${encodeURIComponent(request.namespaceId)}/${encodeURIComponent(request.planDigest!)}/${encodeURIComponent(request.repositoryCommit)}/controlled-workspace-owner`;
    const value = await invoke({
      path: `${root}/${operationPaths[operation]}`,
      method: 'POST',
      timeoutMs: mode === 'execute' ? writeTimeoutMs : readTimeoutMs,
      body,
      idempotencyKey: envelope.requestDigest,
      maximumResponseBytes:
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES,
    });
    const facts = resultFacts(value, envelope, request, operation, mode);
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      facts,
      input.forbiddenCanaries
    );
    return facts;
  };

  const authority: ProductionControlledWorkspaceStatelessOwnerAuthority =
    Object.freeze({
      read: (request: AgentEvaluationOwnerAuthorityRequest) =>
        dispatch(request, 'read'),
      execute: (request: AgentEvaluationOwnerAuthorityRequest) =>
        dispatch(request, 'execute'),
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        const facts = await dispatch(request, 'reconcile');
        return Object.freeze({ facts, reconciled: true });
      },
      close() {
        closePromise ??= (async () => {
          const result = await input.orphanRetirement.close();
          clean(result);
          closed = true;
          return retired;
        })();
        return closePromise;
      },
    });

  const probe = async (): Promise<void> => {
    const value = await invoke({
      path: `${healthRoot}/health`,
      method: 'GET',
      timeoutMs: readTimeoutMs,
      maximumResponseBytes: 4_096,
    });
    if (
      !exactRecord(value, [
        'format',
        'version',
        'purpose',
        'status',
        'authorityId',
        'implementationDigest',
        'maximumRequestBytes',
        'maximumResponseBytes',
        'maximumFacts',
      ]) ||
      value.format !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT ||
      value.version !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION ||
      value.purpose !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE ||
      value.status !== 'ready' ||
      value.authorityId !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID ||
      value.implementationDigest !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST ||
      value.maximumRequestBytes !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES ||
      value.maximumResponseBytes !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES ||
      value.maximumFacts !==
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS
    ) {
      return fail('health');
    }
  };

  return Object.freeze({ authority, probe });
};

export const createEnvironmentProductionControlledWorkspaceDirectAuthority =
  async (
    input: CreateEnvironmentProductionControlledWorkspaceDirectAuthorityInput
  ): Promise<ProductionControlledWorkspaceStatelessOwnerAuthority> => {
    const environment = input.environment ?? process.env;
    const read = environmentReader(environment);
    let baseUrl: string | undefined;
    let namespaceId: string | undefined;
    let repositoryCommit: string | undefined;
    try {
      baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
      namespaceId = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace);
      repositoryCommit = read(
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
      );
    } catch {
      return retireOrphanAuthorityAfterFailure(
        input.orphanRetirement,
        invalid('environment')
      );
    }
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      !isAgentControlIdentity(namespaceId) ||
      typeof repositoryCommit !== 'string' ||
      !commitPattern.test(repositoryCommit)
    ) {
      return retireOrphanAuthorityAfterFailure(
        input.orphanRetirement,
        invalid('environment')
      );
    }
    let created: ReturnType<
      typeof createProductionControlledWorkspaceDirectAuthority
    >;
    try {
      created = createProductionControlledWorkspaceDirectAuthority({
        namespaceId,
        repositoryCommit,
        readToken: read,
        forbiddenCanaries: input.forbiddenCanaries,
        orphanRetirement: input.orphanRetirement,
        ...(input.fetch ? { fetch: input.fetch } : {}),
        ...(input.readTimeoutMs ? { readTimeoutMs: input.readTimeoutMs } : {}),
        ...(input.writeTimeoutMs
          ? { writeTimeoutMs: input.writeTimeoutMs }
          : {}),
      });
    } catch (caught) {
      return retireOrphanAuthorityAfterFailure(input.orphanRetirement, caught);
    }
    try {
      await created.probe();
    } catch (caught) {
      try {
        await created.authority.close();
      } catch (cleanup) {
        throw new AggregateError(
          [caught, cleanup],
          'Controlled Workspace authority probe and retirement both failed.'
        );
      }
      throw caught;
    }
    return created.authority;
  };
