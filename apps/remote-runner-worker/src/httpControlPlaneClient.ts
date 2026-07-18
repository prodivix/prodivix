import {
  decodeRemoteExecutableProjectSnapshot,
  decodeRemoteExecutionTerminalWorkerReadResult,
  readRemoteExecutionSecretEnvelope,
  readRemoteExecutionServerAuthorityLease,
} from '@prodivix/runtime-remote';
import type {
  RemoteExecutionClaimResult,
  RemoteExecutionLease,
} from '@prodivix/runtime-remote';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerTerminalControlPlaneClient,
} from './worker.types';

const maximumSecretResolutionResponseBytes = 768 * 1024;
const secretResolutionTimeoutMs = 15_000;

const hasStrictSecretResponseHeaders = (response: Response): boolean =>
  response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase() === 'application/json' &&
  (response.headers.get('cache-control') ?? '')
    .split(',')
    .some((value) => value.trim().toLowerCase() === 'no-store') &&
  response.headers.get('x-content-type-options')?.trim().toLowerCase() ===
    'nosniff';

const jsonRequest = async (
  baseUrl: string,
  workerToken: string,
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<Response> =>
  fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${workerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

const resultBody = async (
  response: Response
): Promise<Record<string, unknown>> => {
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new TypeError('Remote worker response is invalid.');
  return body as Record<string, unknown>;
};

const boundedResultBody = async (
  response: Response,
  maximumBytes: number
): Promise<Record<string, unknown>> => {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      !Number.isSafeInteger(Number(contentLength)) ||
      Number(contentLength) > maximumBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new TypeError('Remote worker response is invalid.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError('Remote worker response is invalid.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new TypeError('Remote worker response is invalid.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new TypeError('Remote worker response is invalid.');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Remote worker response is invalid.');
  return value as Record<string, unknown>;
};

export const createRemoteWorkerHttpControlPlaneClient = (
  input: Readonly<{
    baseUrl: string;
    workerToken: string;
  }>
): RemoteWorkerControlPlaneClient & RemoteWorkerTerminalControlPlaneClient => {
  const baseUrl = new URL(input.baseUrl).toString();
  return Object.freeze({
    async claim(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        '/internal/v1/claims',
        request
      );
      if (!response.ok)
        throw new Error(
          `Remote worker claim failed with status ${response.status}.`
        );
      const body = await resultBody(response);
      if (body.claim === null) return undefined;
      if (
        !body.claim ||
        typeof body.claim !== 'object' ||
        Array.isArray(body.claim)
      )
        throw new TypeError('Remote worker claim response is invalid.');
      const raw = body.claim as Record<string, unknown>;
      const authority =
        raw.authority === undefined
          ? undefined
          : readRemoteExecutionServerAuthorityLease(raw.authority);
      if (raw.authority !== undefined && !authority)
        throw new TypeError('Remote worker authority lease is invalid.');
      return Object.freeze({
        ...(body.claim as RemoteExecutionClaimResult),
        ...(authority === undefined ? {} : { authority }),
      });
    },
    async renew(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/lease`,
        {
          workerId: request.workerId,
          leaseToken: request.leaseToken,
          leaseDurationMs: request.leaseDurationMs,
        }
      );
      if (response.status === 409) return undefined;
      if (!response.ok)
        throw new Error(
          `Remote worker lease renewal failed with status ${response.status}.`
        );
      const body = await resultBody(response);
      return Object.freeze({
        lease: body.lease as RemoteExecutionLease,
        cancellationRequested: body.cancellationRequested === true,
      });
    },
    async transition(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/transition`,
        request
      );
      if (response.status === 409) return false;
      if (!response.ok)
        throw new Error(
          `Remote worker transition failed with status ${response.status}.`
        );
      return true;
    },
    async snapshot(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/snapshot`,
        request
      );
      if (response.status === 409) return undefined;
      if (!response.ok)
        throw new Error(
          `Remote worker snapshot failed with status ${response.status}.`
        );
      return decodeRemoteExecutableProjectSnapshot(
        (await resultBody(response)).snapshot
      );
    },
    async resolveServerFunctionSecrets(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/server-function-secrets`,
        request,
        AbortSignal.timeout(secretResolutionTimeoutMs)
      );
      if (response.status === 404 || response.status === 409) {
        await response.body?.cancel().catch(() => undefined);
        return undefined;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Remote worker Secret resolution failed with status ${response.status}.`
        );
      }
      if (!hasStrictSecretResponseHeaders(response)) {
        await response.body?.cancel().catch(() => undefined);
        throw new TypeError('Remote worker Secret response is invalid.');
      }
      const envelope = readRemoteExecutionSecretEnvelope(
        (
          await boundedResultBody(
            response,
            maximumSecretResolutionResponseBytes
          )
        ).envelope
      );
      if (!envelope)
        throw new TypeError('Remote worker Secret envelope is invalid.');
      return envelope;
    },
    async appendEvent(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/events`,
        request
      );
      if (response.status === 409) return 'rejected';
      if (response.status === 413) return 'budget-exceeded';
      if (!response.ok)
        throw new Error(
          `Remote worker event ingestion failed with status ${response.status}.`
        );
      const body = await resultBody(response);
      return body.kind === 'existing' ? 'existing' : 'stored';
    },
    async uploadArtifact(request) {
      const response = await fetch(
        new URL(
          `/internal/v1/executions/${encodeURIComponent(request.executionId)}/artifacts/${encodeURIComponent(request.descriptor.artifactId)}`,
          baseUrl
        ),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.workerToken}`,
            'content-type': request.descriptor.mediaType,
            'x-prodivix-worker-id': request.workerId,
            'x-prodivix-lease-token': request.leaseToken,
            'x-prodivix-worker-event-id': request.workerEventId,
            'x-prodivix-artifact-kind': request.descriptor.kind,
            'x-prodivix-artifact-size': String(request.descriptor.size),
            'x-prodivix-artifact-digest': request.descriptor.digest,
            'x-prodivix-artifact-expires-at': String(
              request.descriptor.expiresAt
            ),
          },
          body: Buffer.from(request.contents),
        }
      );
      if (response.status === 201) return 'stored';
      if (response.status === 200) return 'existing';
      if (response.status === 413) return 'budget-exceeded';
      if (response.status === 409) return 'rejected';
      throw new Error(
        `Remote worker artifact upload failed with status ${response.status}.`
      );
    },
    async readTerminalCommands(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/terminal/commands`,
        request
      );
      if (response.status === 409) return undefined;
      if (!response.ok)
        throw new Error(
          `Remote worker Terminal command read failed with status ${response.status}.`
        );
      const terminal = (await resultBody(response)).terminal;
      return terminal === null
        ? undefined
        : decodeRemoteExecutionTerminalWorkerReadResult(terminal);
    },
    async publishTerminalOutput(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/terminal/output`,
        request
      );
      if (response.status === 409) {
        const body = await resultBody(response);
        const code = (body.error as { code?: unknown } | undefined)?.code;
        return code === 'identity-conflict'
          ? 'identity-conflict'
          : 'lease-rejected';
      }
      if (!response.ok)
        throw new Error(
          `Remote worker Terminal output failed with status ${response.status}.`
        );
      const result = (await resultBody(response)).result;
      if (
        result !== 'stored' &&
        result !== 'existing' &&
        result !== 'session-closed'
      )
        throw new TypeError('Remote worker Terminal output result is invalid.');
      return result;
    },
    async closeTerminal(request) {
      const response = await jsonRequest(
        baseUrl,
        input.workerToken,
        `/internal/v1/executions/${encodeURIComponent(request.executionId)}/terminal/close`,
        request
      );
      if (response.status === 409) return false;
      if (!response.ok)
        throw new Error(
          `Remote worker Terminal close failed with status ${response.status}.`
        );
      return (await resultBody(response)).closed === true;
    },
  });
};
