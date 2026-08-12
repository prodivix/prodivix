import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
  AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS,
} from './ledgerClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export type AgentEvaluationHostedRetrievalRuntimeResourceHttpTransport =
  Readonly<{
    get(input: {
      route: string;
      purpose: string;
      maximumResponseBytes: number;
    }): Promise<unknown | undefined>;
    post(input: {
      route: string;
      purpose: string;
      request: unknown;
      idempotencyKey: CanonicalDigest;
      maximumRequestBytes: number;
      maximumResponseBytes: number;
      acceptedStatuses: readonly number[];
    }): Promise<unknown | undefined>;
  }>;

export type CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransportInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit?: string;
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    forbiddenCanaries?: () => readonly string[];
    timeoutMs?: number;
  }>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array | undefined> => {
  if (!response.body) return undefined;
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
        return undefined;
      }
      chunks.push(next.value);
    }
    if (byteLength === 0) return undefined;
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const decodeCanonicalJson = (bytes: Uint8Array): unknown | undefined => {
  try {
    const text = textDecoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as unknown;
    return text === canonicalJsonText(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/** Purpose-bound canonical JSON transport shared by every hosted lifecycle role. */
export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport =
  (
    input: CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransportInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceHttpTransport => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const timeoutMs =
      input.timeoutMs ?? AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS;
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      (input.repositoryCommit !== undefined &&
        !repositoryCommitPattern.test(input.repositoryCommit)) ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace) !==
        input.namespaceId ||
      (input.repositoryCommit !== undefined &&
        read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit) !==
          input.repositoryCommit) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS
    ) {
      return invalid();
    }
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return invalid();
    const routeRoot = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${encodeURIComponent(input.namespaceId)}`;

    const invoke = async (request: {
      method: 'GET' | 'POST';
      route: string;
      purpose: string;
      body?: string;
      idempotencyKey?: CanonicalDigest;
      maximumResponseBytes: number;
      acceptedStatuses: readonly number[];
    }): Promise<unknown | undefined> => {
      let token: string | undefined;
      try {
        token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
      } catch {
        return undefined;
      }
      if (!isAgentEvaluationServiceToken(token)) return undefined;
      const credential = token;
      const canaries = Object.freeze([
        ...(input.forbiddenCanaries?.() ?? Object.freeze([])),
        credential,
      ]);
      if (request.body !== undefined) {
        try {
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            request.body,
            () => canaries
          );
        } catch {
          return undefined;
        }
      }
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: `Bearer ${credential}`,
        [AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER]:
          request.purpose,
      });
      if (request.body !== undefined) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.set('Idempotency-Key', request.idempotencyKey!);
      }
      token = undefined;
      let response: Response;
      try {
        response = await fetchImplementation(`${routeRoot}/${request.route}`, {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: request.body }),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        headers.delete('Authorization');
        return undefined;
      }
      headers.delete('Authorization');
      const declaredLength = response.headers.get('content-length');
      if (
        !request.acceptedStatuses.includes(response.status) ||
        response.headers.get('cache-control') !== 'no-store' ||
        response.headers.get('content-type') !==
          'application/json; charset=utf-8' ||
        response.headers.get('content-encoding') !== null ||
        (declaredLength !== null &&
          (!/^\d+$/u.test(declaredLength) ||
            Number(declaredLength) > request.maximumResponseBytes))
      ) {
        return undefined;
      }
      const bytes = await readBoundedResponse(
        response,
        request.maximumResponseBytes
      );
      if (bytes === undefined) return undefined;
      try {
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          bytes,
          () => canaries
        );
        return decodeCanonicalJson(bytes);
      } catch {
        return undefined;
      } finally {
        bytes.fill(0);
      }
    };

    return Object.freeze({
      get: ({ route, purpose, maximumResponseBytes }) =>
        invoke({
          method: 'GET',
          route,
          purpose,
          maximumResponseBytes,
          acceptedStatuses: Object.freeze([200]),
        }),
      post: ({
        route,
        purpose,
        request,
        idempotencyKey,
        maximumRequestBytes,
        maximumResponseBytes,
        acceptedStatuses,
      }) => {
        let body: string;
        try {
          body = canonicalJsonText(request);
        } catch {
          return Promise.resolve(undefined);
        }
        if (textEncoder.encode(body).byteLength > maximumRequestBytes) {
          return Promise.resolve(undefined);
        }
        return invoke({
          method: 'POST',
          route,
          purpose,
          body,
          idempotencyKey,
          maximumResponseBytes,
          acceptedStatuses,
        });
      },
    });
  };
