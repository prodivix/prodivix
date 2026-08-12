import { isAgentCanonicalDigest, isAgentControlIdentity } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_LEDGER_BASE_URL =
  'http://127.0.0.1:8790' as const;
export const AGENT_EVALUATION_LEDGER_DEFAULT_REQUEST_BYTES = 2_097_152;
export const AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES = 25_296_896;
export const AGENT_EVALUATION_LEDGER_MAXIMUM_RESPONSE_BYTES = 33_554_432;
export const AGENT_EVALUATION_LEDGER_MAXIMUM_AGGREGATE_RESPONSE_BYTES = 536_870_912;
export const AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS = 30_000;
export const AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS = 175_000;

export const AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES = Object.freeze({
  baseUrl: 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL',
  namespace: 'PRODIVIX_G4_MODEL_EVAL_NAMESPACE',
  repositoryCommit: 'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT',
  token: 'PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN',
} as const);

export type AgentEvaluationLedgerScope = Readonly<{
  namespace: string;
  planDigest: string;
  repositoryCommit: string;
}>;

export type AgentEvaluationLedgerClientConfiguration = Readonly<{
  baseUrl: typeof AGENT_EVALUATION_LEDGER_BASE_URL;
  scope: AgentEvaluationLedgerScope;
  maximumRequestBytes?: number;
  maximumResponseBytes?: number;
  maximumAggregateResponseBytes?: number;
  timeoutMs?: number;
}>;

export type AgentEvaluationLedgerClientDependencies = Readonly<{
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  fetch?: typeof fetch;
}>;

export type AgentEvaluationLedgerRequestOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export type CreateEnvironmentAgentEvaluationLedgerClientInput = Readonly<{
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  fetch?: typeof fetch;
  maximumRequestBytes?: number;
  maximumResponseBytes?: number;
  maximumAggregateResponseBytes?: number;
  planDigest: string;
  timeoutMs?: number;
}>;

type HttpMethod = 'GET' | 'POST' | 'PUT';
type QueryValue = number | string;
export type AgentEvaluationLedgerReconciliationReason =
  'ack-loss' | 'provider-disconnect' | 'timeout' | 'worker-loss';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const pathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

const runnerError = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES],
  httpStatus?: number
): AgentEvaluationRunnerError =>
  new AgentEvaluationRunnerError(code, httpStatus);

const invalid = (): never => {
  throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
};

const assertSegment = (value: string): string => {
  if (!pathSegmentPattern.test(value)) return invalid();
  return value;
};

const canonicalSegment = (value: string): string =>
  encodeURIComponent(assertSegment(value));

const boundedPositiveInteger = (
  value: number | undefined,
  fallback: number,
  maximum: number
): number => {
  const candidate = value ?? fallback;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate < 1 ||
    candidate > maximum
  ) {
    return invalid();
  }
  return candidate;
};

const canonicalRevision = (value: number, allowInitial: boolean): string => {
  if (!Number.isSafeInteger(value) || value < (allowInitial ? -1 : 0)) {
    return invalid();
  }
  return String(value);
};

const canonicalInstant = (value: string): string => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    return invalid();
  }
  return value;
};

const canonicalDigest = (value: string): string =>
  isAgentCanonicalDigest(value) ? value : invalid();

const canonicalOpaqueCursor = (value: string): string => {
  if (
    value.length < 3 ||
    value.length > 8_192 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return invalid();
  }
  return value;
};

const serializeBody = (value: unknown, maximumBytes: number): string => {
  let body: string;
  try {
    body = canonicalJsonText(value);
  } catch {
    return invalid();
  }
  if (textEncoder.encode(body).byteLength > maximumBytes) {
    throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
  }
  return body;
};

const awaitWithAbort = async <T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> => {
  if (signal.aborted) {
    throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
  }
  let rejectAbort: ((reason: AgentEvaluationRunnerError) => void) | undefined;
  const aborted = new Promise<T>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = (): void =>
    rejectAbort?.(runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
    rejectAbort = undefined;
  }
};

const readBoundedBody = async (
  response: Response,
  maximumBytes: number,
  signal: AbortSignal
): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
      }
      const next = await awaitWithAbort(reader.read(), signal);
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
      }
      chunks.push(next.value);
    }
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    throw runnerError(
      signal.aborted
        ? AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
        : AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    );
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const exactJsonMediaType = (value: string | null): boolean => {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  return (
    mediaType === 'application/json' ||
    (mediaType?.startsWith('application/') === true &&
      mediaType.endsWith('+json'))
  );
};

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) {
        throw new Error('unsafe-key');
      }
      return value;
    }) as unknown;
  } catch {
    throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
  }
};

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

/** Creates a client from public scope env without resolving the service token. */
export const createEnvironmentAgentEvaluationLedgerClient = (
  input: CreateEnvironmentAgentEvaluationLedgerClientInput
): AgentEvaluationLedgerClient => {
  try {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const namespace = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace);
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      typeof namespace !== 'string' ||
      !pathSegmentPattern.test(namespace) ||
      typeof repositoryCommit !== 'string' ||
      !repositoryCommitPattern.test(repositoryCommit) ||
      !isAgentCanonicalDigest(input.planDigest)
    ) {
      return invalid();
    }
    return new AgentEvaluationLedgerClient(
      {
        baseUrl,
        scope: Object.freeze({
          namespace,
          planDigest: input.planDigest,
          repositoryCommit,
        }),
        maximumRequestBytes: input.maximumRequestBytes,
        maximumResponseBytes: input.maximumResponseBytes,
        maximumAggregateResponseBytes: input.maximumAggregateResponseBytes,
        timeoutMs: input.timeoutMs,
      },
      { environment, fetch: input.fetch }
    );
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  }
};

/**
 * Narrow transport adapter for the Backend-owned evaluation ledger. Domain
 * decoding remains with the coordinator and canonical @prodivix/ai codecs.
 */
export class AgentEvaluationLedgerClient {
  readonly scope: AgentEvaluationLedgerScope;
  readonly #basePath: string;
  readonly #fetch: typeof fetch;
  readonly #maximumRequestBytes: number;
  readonly #maximumResponseBytes: number;
  readonly #maximumAggregateResponseBytes: number;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;
  readonly #timeoutMs: number;

  constructor(
    configuration: AgentEvaluationLedgerClientConfiguration,
    dependencies: AgentEvaluationLedgerClientDependencies = {}
  ) {
    if (
      configuration.baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      !pathSegmentPattern.test(configuration.scope.namespace) ||
      !isAgentCanonicalDigest(configuration.scope.planDigest) ||
      !repositoryCommitPattern.test(configuration.scope.repositoryCommit)
    ) {
      invalid();
    }
    this.#maximumRequestBytes = boundedPositiveInteger(
      configuration.maximumRequestBytes,
      AGENT_EVALUATION_LEDGER_DEFAULT_REQUEST_BYTES,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
    this.#maximumResponseBytes = boundedPositiveInteger(
      configuration.maximumResponseBytes,
      AGENT_EVALUATION_LEDGER_MAXIMUM_RESPONSE_BYTES,
      AGENT_EVALUATION_LEDGER_MAXIMUM_RESPONSE_BYTES
    );
    this.#maximumAggregateResponseBytes = boundedPositiveInteger(
      configuration.maximumAggregateResponseBytes,
      AGENT_EVALUATION_LEDGER_MAXIMUM_AGGREGATE_RESPONSE_BYTES,
      AGENT_EVALUATION_LEDGER_MAXIMUM_AGGREGATE_RESPONSE_BYTES
    );
    this.#timeoutMs = boundedPositiveInteger(
      configuration.timeoutMs,
      AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS,
      AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS
    );
    this.#fetch = dependencies.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') invalid();
    this.#readEnvironment = readEnvironment(
      dependencies.environment ?? process.env
    );
    this.scope = Object.freeze({ ...configuration.scope });
    this.#basePath = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${canonicalSegment(this.scope.namespace)}/${canonicalSegment(this.scope.planDigest)}/${canonicalSegment(this.scope.repositoryCommit)}`;
  }

  async #request(
    method: HttpMethod,
    path: string,
    bodyValue?: unknown,
    query: Readonly<Record<string, QueryValue>> = {},
    options: AgentEvaluationLedgerRequestOptions = {},
    aggregateResponse = false,
    maximumRequestBytes = this.#maximumRequestBytes,
    idempotencyKey?: string
  ): Promise<unknown> {
    if (options.signal?.aborted) {
      throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
    }
    const body =
      bodyValue === undefined
        ? undefined
        : serializeBody(
            bodyValue,
            boundedPositiveInteger(
              maximumRequestBytes,
              this.#maximumRequestBytes,
              AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
            )
          );
    if (
      idempotencyKey !== undefined &&
      !isAgentCanonicalDigest(idempotencyKey)
    ) {
      return invalid();
    }
    const queryText = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)])
    ).toString();
    const url = `${this.#basePath}${path}${queryText ? `?${queryText}` : ''}`;
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timeoutMs = boundedPositiveInteger(
      options.timeoutMs,
      this.#timeoutMs,
      AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS
    );
    const timeout = setTimeout(abort, timeoutMs);

    let tokenSource: string | undefined;
    let tokenBytes: Uint8Array | undefined;
    let authorization: string | undefined;
    let headers: Headers | undefined;
    try {
      if (controller.signal.aborted) {
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
      }
      try {
        tokenSource = this.#readEnvironment(
          AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
        );
      } catch {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      if (!isAgentEvaluationServiceToken(tokenSource)) {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      tokenBytes = textEncoder.encode(tokenSource);
      tokenSource = undefined;
      const signatures = createCredentialCanarySignatures(tokenBytes);
      if (
        (body && textContainsCredentialCanary(body, signatures)) ||
        textContainsCredentialCanary(url, signatures)
      ) {
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied);
      }
      authorization = `Bearer ${textDecoder.decode(tokenBytes)}`;
      headers = new Headers({
        Accept: 'application/json',
        Authorization: authorization,
        ...(body === undefined
          ? {}
          : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      });
      let response: Response;
      try {
        response = await awaitWithAbort(
          this.#fetch(url, {
            body,
            cache: 'no-store',
            credentials: 'omit',
            headers,
            method,
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          }),
          controller.signal
        );
      } catch {
        throw runnerError(
          controller.signal.aborted
            ? AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
            : AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
        );
      } finally {
        headers.delete('Authorization');
        authorization = undefined;
      }
      const responseBytes = await readBoundedBody(
        response,
        aggregateResponse
          ? this.#maximumAggregateResponseBytes
          : this.#maximumResponseBytes,
        controller.signal
      );
      let responseText: string;
      try {
        responseText = textDecoder.decode(responseBytes);
      } catch {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
          response.status
        );
      } finally {
        responseBytes.fill(0);
      }
      if (textContainsCredentialCanary(responseText, signatures)) {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
          response.status
        );
      }
      if (response.status < 200 || response.status >= 300) {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
          response.status
        );
      }
      if (response.status === 204 && responseText.length === 0) return null;
      if (!exactJsonMediaType(response.headers.get('content-type'))) {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
          response.status
        );
      }
      const value = parseSafeJson(responseText);
      if (valueContainsCredentialCanary(value, tokenBytes, signatures)) {
        throw runnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
          response.status
        );
      }
      return value;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      throw runnerError(
        controller.signal.aborted
          ? AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
          : AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      headers?.delete('Authorization');
      authorization = undefined;
      tokenSource = undefined;
      tokenBytes?.fill(0);
    }
  }

  putPlan(fact: unknown, options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('PUT', '/plan', fact, {}, options);
  }

  postAttemptAuthority(
    input: Readonly<{
      serviceKind: 'capability-runtime' | 'attempt-grading';
      operation: 'execute-tool' | 'assess-capability' | 'grade-and-persist';
      requestDigest: string;
      request: unknown;
    }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    const validOperation =
      (input.serviceKind === 'capability-runtime' &&
        (input.operation === 'execute-tool' ||
          input.operation === 'assess-capability')) ||
      (input.serviceKind === 'attempt-grading' &&
        input.operation === 'grade-and-persist');
    if (!validOperation || !isAgentCanonicalDigest(input.requestDigest)) {
      return invalid();
    }
    return this.#request(
      'POST',
      `/${input.serviceKind}/${input.operation}`,
      input.request,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES,
      input.requestDigest
    );
  }

  getPlan(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/plan', undefined, {}, options);
  }

  listOwnerStates(
    input: Readonly<{
      serviceKind: 'controlled-workspace' | 'verification-evidence';
      operation: 'session.orphans.list' | 'verified-view.resolve';
      limit: number;
      cursor?: string;
    }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    const validBinding =
      (input.serviceKind === 'controlled-workspace' &&
        input.operation === 'session.orphans.list') ||
      (input.serviceKind === 'verification-evidence' &&
        input.operation === 'verified-view.resolve');
    if (
      !validBinding ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 128 ||
      (input.cursor !== undefined && !isAgentCanonicalDigest(input.cursor))
    ) {
      return invalid();
    }
    return this.#request(
      'GET',
      '/owner-states',
      undefined,
      {
        serviceKind: input.serviceKind,
        operation: input.operation,
        limit: input.limit,
        ...(input.cursor ? { cursor: input.cursor } : {}),
      },
      options
    );
  }

  getOwnerState(
    ownerStateId: string,
    input: Readonly<{
      serviceKind: 'controlled-workspace' | 'verification-evidence';
      operation: 'session.orphans.list' | 'verified-view.resolve';
    }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    const validBinding =
      (input.serviceKind === 'controlled-workspace' &&
        input.operation === 'session.orphans.list') ||
      (input.serviceKind === 'verification-evidence' &&
        input.operation === 'verified-view.resolve');
    if (!validBinding || !isAgentCanonicalDigest(ownerStateId)) {
      return invalid();
    }
    return this.#request(
      'GET',
      `/owner-states/${canonicalSegment(ownerStateId)}`,
      undefined,
      {
        serviceKind: input.serviceKind,
        operation: input.operation,
      },
      options
    );
  }

  getOwnerStateCASArtifact(
    ownerStateId: string,
    input: Readonly<{
      serviceKind: 'controlled-workspace' | 'verification-evidence';
      operation: 'session.orphans.list' | 'verified-view.resolve';
      artifactRef: string;
      descriptorDigest: string;
    }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    const validBinding =
      (input.serviceKind === 'controlled-workspace' &&
        input.operation === 'session.orphans.list') ||
      (input.serviceKind === 'verification-evidence' &&
        input.operation === 'verified-view.resolve');
    if (
      !validBinding ||
      !isAgentCanonicalDigest(ownerStateId) ||
      !isAgentControlIdentity(input.artifactRef) ||
      !isAgentCanonicalDigest(input.descriptorDigest)
    ) {
      return invalid();
    }
    return this.#request(
      'GET',
      `/owner-state-cas/${canonicalSegment(ownerStateId)}`,
      undefined,
      {
        serviceKind: input.serviceKind,
        operation: input.operation,
        artifactRef: input.artifactRef,
        descriptorDigest: input.descriptorDigest,
      },
      options
    );
  }

  putAttempt(
    attemptId: string,
    fact: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/attempts/${canonicalSegment(attemptId)}`,
      fact,
      {},
      options
    );
  }

  putAttemptCommit(
    attemptId: string,
    commit: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/attempt-commits/${canonicalSegment(attemptId)}`,
      commit,
      {},
      options
    );
  }

  listPreDispatchFailureReceipts(
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      '/receipts/pre-dispatch-failure',
      undefined,
      {},
      options
    );
  }

  putPreDispatchFailureReceipt(
    attemptId: string,
    turnIndex: number,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/receipts/pre-dispatch-failure/${canonicalSegment(attemptId)}/${canonicalRevision(turnIndex, false)}`,
      receipt,
      {},
      options
    );
  }

  getPreDispatchFailureReceipt(
    attemptId: string,
    turnIndex: number,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/receipts/pre-dispatch-failure/${canonicalSegment(attemptId)}/${canonicalRevision(turnIndex, false)}`,
      undefined,
      {},
      options
    );
  }

  listAttemptTurns(
    attemptId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/attempt-turns/${canonicalSegment(attemptId)}`,
      undefined,
      {},
      options
    );
  }

  putTurnDispatchIntent(
    attemptId: string,
    turnIndex: number,
    intent: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/attempt-turns/${canonicalSegment(attemptId)}/${canonicalRevision(turnIndex, false)}/dispatch`,
      intent,
      {},
      options
    );
  }

  closeTurnTransport(
    attemptId: string,
    turnIndex: number,
    closure: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/attempt-turns/${canonicalSegment(attemptId)}/${canonicalRevision(turnIndex, false)}/close`,
      closure,
      {},
      options
    );
  }

  getTurnResultSpool(
    attemptId: string,
    turnIndex: number,
    input: Readonly<{
      shardId: string;
      ownerId: string;
      leaseGeneration: number;
      expectedTurnDigest: string;
    }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/attempt-turns/${canonicalSegment(attemptId)}/${canonicalRevision(turnIndex, false)}/result-spool`,
      undefined,
      {
        shardId: assertSegment(input.shardId),
        ownerId: assertSegment(input.ownerId),
        leaseGeneration: canonicalRevision(input.leaseGeneration, false),
        expectedTurnDigest: assertSegment(input.expectedTurnDigest),
      },
      options
    );
  }

  getAttempt(attemptId: string, options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request(
      'GET',
      `/attempts/${canonicalSegment(attemptId)}`,
      undefined,
      {},
      options
    );
  }

  listAttempts(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/attempts', undefined, {}, options);
  }

  putCheckpoint(
    shardId: string,
    revision: number,
    expectedPreviousRevision: number,
    fact: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/checkpoints/${canonicalSegment(shardId)}/${canonicalRevision(revision, false)}`,
      fact,
      {
        expectedPreviousRevision: canonicalRevision(
          expectedPreviousRevision,
          true
        ),
      },
      options
    );
  }

  listCheckpoints(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/checkpoints', undefined, {}, options);
  }

  getLatestCheckpoint(
    shardId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/checkpoints/${canonicalSegment(shardId)}`,
      undefined,
      {},
      options
    );
  }

  putArtifact(
    factType: string,
    factId: string,
    fact: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/artifacts/${canonicalSegment(factType)}/${canonicalSegment(factId)}`,
      fact,
      {},
      options
    );
  }

  getArtifact(
    factType: string,
    factId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/artifacts/${canonicalSegment(factType)}/${canonicalSegment(factId)}`,
      undefined,
      {},
      options
    );
  }

  listArtifacts(
    factType?: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      '/artifacts',
      undefined,
      factType === undefined ? {} : { factType: canonicalSegment(factType) },
      options
    );
  }

  putReviewCandidate(
    attemptId: string,
    fact: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/review-candidates/${canonicalSegment(attemptId)}`,
      fact,
      {},
      options
    );
  }

  getReviewCandidate(
    attemptId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/review-candidates/${canonicalSegment(attemptId)}`,
      undefined,
      {},
      options
    );
  }

  listReviewCandidates(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/review-candidates', undefined, {}, options);
  }

  createBlindReviewMapping(
    candidateId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/blind-review-mappings/candidates/${canonicalSegment(candidateId)}`,
      undefined,
      {},
      options
    );
  }

  getBlindReviewMappingByCandidate(
    candidateId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/blind-review-mappings/candidates/${canonicalSegment(candidateId)}`,
      undefined,
      {},
      options
    );
  }

  getBlindReviewMappingByPresentation(
    presentationId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/blind-review-mappings/presentations/${canonicalSegment(presentationId)}`,
      undefined,
      {},
      options
    );
  }

  putValidatedHumanReviewArtifact(
    artifact: unknown,
    humanReviewReportFact: unknown,
    validatedHumanMetricObservations: unknown,
    validatedHumanMetricObservationSetDigest: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/validated-human-review-artifact',
      Object.freeze({
        validatedHumanReviewArtifact: artifact,
        humanReviewReportFact,
        validatedHumanMetricObservations,
        validatedHumanMetricObservationSetDigest,
      }),
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  getValidatedHumanReviewArtifact(
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      '/validated-human-review-artifact',
      undefined,
      {},
      options
    );
  }

  claimLease(
    shardId: string,
    claim: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'POST',
      `/leases/${canonicalSegment(shardId)}/claim`,
      claim,
      {},
      options
    );
  }

  renewLease(
    shardId: string,
    renewal: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'POST',
      `/leases/${canonicalSegment(shardId)}/renew`,
      renewal,
      {},
      options
    );
  }

  reserveBudget(
    reservationId: string,
    expectedRevision: number,
    reservedAt: string,
    demand: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/budget/reservations/${canonicalSegment(reservationId)}`,
      demand,
      {
        expectedRevision: canonicalRevision(expectedRevision, false),
        reservedAt: canonicalInstant(reservedAt),
      },
      options
    );
  }

  settleBudget(
    reservationId: string,
    expectedRevision: number,
    settlement: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/budget/settlements/${canonicalSegment(reservationId)}`,
      settlement,
      { expectedRevision: canonicalRevision(expectedRevision, false) },
      options
    );
  }

  reconcileBudget(
    reservationId: string,
    expectedRevision: number,
    reason: AgentEvaluationLedgerReconciliationReason,
    settledAt: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    if (
      reason !== 'ack-loss' &&
      reason !== 'provider-disconnect' &&
      reason !== 'timeout' &&
      reason !== 'worker-loss'
    ) {
      return invalid();
    }
    return this.#request(
      'PUT',
      `/budget/reconciliations/${canonicalSegment(reservationId)}`,
      undefined,
      {
        expectedRevision: canonicalRevision(expectedRevision, false),
        reason,
        settledAt: canonicalInstant(settledAt),
      },
      options
    );
  }

  getBudget(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/budget', undefined, {}, options);
  }

  getStatus(
    input: Readonly<{ observedAt: string; shardId?: string }>,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      '/status',
      undefined,
      {
        observedAt: canonicalInstant(input.observedAt),
        ...(input.shardId === undefined
          ? {}
          : { shardId: assertSegment(input.shardId) }),
      },
      options
    );
  }

  openEvidenceExportLease(
    sourceConfigAuthority: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'POST',
      '/export-leases',
      sourceConfigAuthority,
      {},
      options
    );
  }

  getEvidenceExportLease(
    leaseId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/export-leases/${canonicalSegment(leaseId)}`,
      undefined,
      {},
      options
    );
  }

  getEvidenceExportFamilyPage(
    leaseId: string,
    family: string,
    cursor?: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/export-leases/${canonicalSegment(leaseId)}/families/${canonicalSegment(family)}`,
      undefined,
      cursor === undefined ? {} : { cursor: canonicalOpaqueCursor(cursor) },
      options
    );
  }

  openReviewLease(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('POST', '/review-leases', undefined, {}, options);
  }

  getReviewLease(
    leaseId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/review-leases/${canonicalSegment(leaseId)}`,
      undefined,
      {},
      options
    );
  }

  getReviewLeaseFamilyPage(
    leaseId: string,
    family: string,
    cursor?: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/review-leases/${canonicalSegment(leaseId)}/families/${canonicalSegment(family)}`,
      undefined,
      cursor === undefined ? {} : { cursor: canonicalOpaqueCursor(cursor) },
      options
    );
  }

  putArchiveClosure(
    closure: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/archive-closure',
      closure,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  getArchiveClosure(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/archive-closure', undefined, {}, options);
  }

  sealHoldoutClosure(
    input: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/holdout-closure',
      input,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  inspectFinalization(
    input: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'POST',
      '/finalization-inspection',
      input,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  putFinalizationIntent(
    input: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/finalization-intent',
      input,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  getFinalizationIntent(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/finalization-intent', undefined, {}, options);
  }

  putFinalization(
    input: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/finalization',
      input,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  getEndpointSmokeCommit(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request(
      'GET',
      '/endpoint-smoke/commit',
      undefined,
      {},
      options
    );
  }

  putEndpointSmokeCommit(
    commit: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/endpoint-smoke/commit',
      commit,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  reserveEndpointSmokeBudget(
    reservationId: string,
    reservation: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/endpoint-smoke/budget-reservations/${canonicalSegment(reservationId)}`,
      reservation,
      {},
      options
    );
  }

  listEndpointSmokeTurns(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request(
      'GET',
      '/endpoint-smoke/turns',
      undefined,
      {},
      options
    );
  }

  putEndpointSmokeDispatch(
    smokeTargetId: string,
    intent: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/endpoint-smoke/targets/${canonicalSegment(smokeTargetId)}/dispatch`,
      intent,
      {},
      options
    );
  }

  closeEndpointSmokeTransport(
    smokeTargetId: string,
    closure: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/endpoint-smoke/targets/${canonicalSegment(smokeTargetId)}/close`,
      closure,
      {},
      options,
      false,
      AGENT_EVALUATION_LEDGER_MAXIMUM_REQUEST_BYTES
    );
  }

  getEndpointSmokeResultSpool(
    smokeTargetId: string,
    expectedSpoolReceiptDigest: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/endpoint-smoke/targets/${canonicalSegment(smokeTargetId)}/result-spool`,
      undefined,
      {
        expectedSpoolReceiptDigest: canonicalDigest(expectedSpoolReceiptDigest),
      },
      options
    );
  }

  putEndpointSmokeReceipt(
    smokeTargetId: string,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#putAuthenticityReceipt(
      'endpoint-smoke',
      smokeTargetId,
      receipt,
      options
    );
  }

  getEndpointSmokeReceipt(
    smokeTargetId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#getAuthenticityReceipt(
      'endpoint-smoke',
      smokeTargetId,
      options
    );
  }

  putInvocationReceipt(
    attemptId: string,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#putAuthenticityReceipt(
      'invocation',
      attemptId,
      receipt,
      options
    );
  }

  getInvocationReceipt(
    attemptId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#getAuthenticityReceipt('invocation', attemptId, options);
  }

  putSourceReceipt(
    sourceReceiptId: string,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#putAuthenticityReceipt(
      'source',
      sourceReceiptId,
      receipt,
      options
    );
  }

  getSourceReceipt(
    sourceReceiptId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#getAuthenticityReceipt('source', sourceReceiptId, options);
  }

  putExecutionReceipt(
    attemptId: string,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#putAuthenticityReceipt(
      'execution',
      attemptId,
      receipt,
      options
    );
  }

  getExecutionReceipt(
    attemptId: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#getAuthenticityReceipt('execution', attemptId, options);
  }

  #putAuthenticityReceipt(
    kind: 'endpoint-smoke' | 'execution' | 'invocation' | 'source',
    id: string,
    receipt: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      `/receipts/${kind}/${canonicalSegment(id)}`,
      receipt,
      {},
      options
    );
  }

  #getAuthenticityReceipt(
    kind: 'endpoint-smoke' | 'execution' | 'invocation' | 'source',
    id: string,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'GET',
      `/receipts/${kind}/${canonicalSegment(id)}`,
      undefined,
      {},
      options
    );
  }

  putAuthorityAttestation(
    attestation: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request(
      'PUT',
      '/authority-attestation',
      attestation,
      {},
      options
    );
  }

  getAuthorityAttestation(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request(
      'GET',
      '/authority-attestation',
      undefined,
      {},
      options
    );
  }

  putEvidenceRoot(
    evidenceRoot: unknown,
    options?: AgentEvaluationLedgerRequestOptions
  ) {
    return this.#request('PUT', '/evidence-root', evidenceRoot, {}, options);
  }

  getEvidenceRoot(options?: AgentEvaluationLedgerRequestOptions) {
    return this.#request('GET', '/evidence-root', undefined, {}, options);
  }
}
