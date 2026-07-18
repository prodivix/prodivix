import {
  readRemoteExecutionSecretEnvelope,
  type RemoteExecutionSecretEnvelope,
  type RemoteExecutionSecretEnvelopeIdentity,
} from '@prodivix/runtime-remote';

export const REMOTE_EXECUTION_SECRET_RESOLUTION_REQUEST_FORMAT =
  'prodivix.isolated-server-function-secret-resolution.v1' as const;

const maximumResponseBytes = 768 * 1024;

const invalidResponse = (): TypeError =>
  new TypeError('Remote execution Secret broker response is invalid.');

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

const readBoundedResponseBytes = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> => {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      !Number.isSafeInteger(Number(contentLength)) ||
      Number(contentLength) > maximumBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw invalidResponse();
  }
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponse();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw invalidResponse();
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

export type RemoteExecutionSecretBroker = Readonly<{
  resolve(
    input: RemoteExecutionSecretEnvelopeIdentity
  ): Promise<RemoteExecutionSecretEnvelope | undefined>;
}>;

/** Allows Secret re-resolution only for the exact active pre-run or reclaimed read-only lease. */
export const isRemoteExecutionSecretResolutionLeaseEligible = (
  execution:
    | Readonly<{
        record: Readonly<{ status: string }>;
        lease?: Readonly<{
          workerId: string;
          token: string;
          attempt: number;
          expiresAt: number;
        }>;
      }>
    | undefined,
  input: Readonly<{ workerId: string; leaseToken: string }>,
  now: number
): boolean =>
  execution?.lease !== undefined &&
  execution.lease.workerId === input.workerId &&
  execution.lease.token === input.leaseToken &&
  Number.isSafeInteger(execution.lease.attempt) &&
  execution.lease.attempt > 0 &&
  execution.lease.expiresAt > now &&
  (execution.record.status === 'starting' ||
    (execution.record.status === 'running' && execution.lease.attempt > 1));

const normalizedBaseUrl = (value: string): string => {
  const url = new URL(value);
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname.endsWith('.localhost');
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new TypeError('Remote execution Secret broker URL is invalid.');
  return url.toString();
};

/** The Control Plane only forwards authenticated lease identity and ciphertext. */
export const createRemoteExecutionSecretBroker = (input: {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}): RemoteExecutionSecretBroker => {
  const baseUrl = normalizedBaseUrl(input.baseUrl);
  if (!input.token || input.token.length > 8_192)
    throw new TypeError('Remote execution Secret broker token is invalid.');
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1)
    throw new TypeError('Remote execution Secret broker timeout is invalid.');
  return Object.freeze({
    async resolve(request) {
      const response = await fetch(
        new URL('/api/internal/remote-execution-secrets', baseUrl),
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            format: REMOTE_EXECUTION_SECRET_RESOLUTION_REQUEST_FORMAT,
            ...request,
          }),
          signal: AbortSignal.timeout(input.timeoutMs),
        }
      );
      if (response.status === 404 || response.status === 409) {
        await response.body?.cancel().catch(() => undefined);
        return undefined;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Remote execution Secret broker failed with status ${response.status}.`
        );
      }
      if (!hasStrictSecretResponseHeaders(response)) {
        await response.body?.cancel().catch(() => undefined);
        throw invalidResponse();
      }
      const bytes = await readBoundedResponseBytes(
        response,
        maximumResponseBytes
      );
      const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw invalidResponse();
      const record = value as Record<string, unknown>;
      if (
        Object.keys(record).length !== 1 ||
        !Object.hasOwn(record, 'envelope')
      )
        throw invalidResponse();
      const envelope = readRemoteExecutionSecretEnvelope(record.envelope);
      if (!envelope)
        throw new TypeError(
          'Remote execution Secret broker envelope is invalid.'
        );
      return envelope;
    },
  });
};
