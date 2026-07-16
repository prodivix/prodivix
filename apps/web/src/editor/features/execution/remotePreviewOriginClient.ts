import type { ExecutionArtifact } from '@prodivix/runtime-core';
import type { RemoteExecutionHttpPort } from '@prodivix/runtime-remote';

export type RemotePreviewOriginGrant = Readonly<{
  previewUrl: string;
  expiresAt: number;
}>;

export type CreateRemotePreviewOriginClientOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
  http: RemoteExecutionHttpPort;
  now?: () => number;
}>;

const normalizedIdentifier = (value: string, label: string): string => {
  if (!value || value !== value.trim() || value.length > 1_024)
    throw new TypeError(`${label} must be a normalized identifier.`);
  return value;
};

const exactRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Remote Preview origin response must be an object.');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !Object.hasOwn(record, 'previewUrl') ||
    !Object.hasOwn(record, 'expiresAt')
  )
    throw new TypeError('Remote Preview origin response has invalid fields.');
  return record;
};

const decodeGrant = (
  bytes: Uint8Array,
  now: number
): RemotePreviewOriginGrant => {
  const record = exactRecord(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    ) as unknown
  );
  if (
    typeof record.previewUrl !== 'string' ||
    !Number.isSafeInteger(record.expiresAt) ||
    (record.expiresAt as number) <= now ||
    (record.expiresAt as number) > now + 60 * 60 * 1_000
  )
    throw new TypeError('Remote Preview origin grant is invalid or expired.');
  const url = new URL(record.previewUrl);
  const loopback =
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.hostname.endsWith('.localhost');
  const capabilityLabel = url.hostname.split('.', 1)[0];
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !capabilityLabel ||
    !/^[a-f0-9]{64}$/u.test(capabilityLabel)
  )
    throw new TypeError('Remote Preview origin URL is invalid.');
  return Object.freeze({
    previewUrl: url.href,
    expiresAt: record.expiresAt as number,
  });
};

/** Requests a per-session capability origin without exposing service credentials to Web. */
export const createRemotePreviewOriginClient = (
  options: CreateRemotePreviewOriginClientOptions
) => {
  const accessToken = options.accessToken.trim();
  if (!accessToken)
    throw new TypeError(
      'Remote Preview origin requires product authentication.'
    );
  const baseUrl = new URL(options.baseUrl);
  const now = options.now ?? Date.now;
  return Object.freeze({
    async materialize(
      input: Readonly<{
        executionId: string;
        artifact: ExecutionArtifact;
      }>
    ): Promise<ExecutionArtifact> {
      const executionId = normalizedIdentifier(
        input.executionId,
        'Remote executionId'
      );
      const artifactId = normalizedIdentifier(
        input.artifact.artifactId,
        'Remote artifactId'
      );
      const endpoint = new URL(
        `${baseUrl.pathname.replace(/\/$/u, '')}/remote-executions/${encodeURIComponent(executionId)}/artifacts/${encodeURIComponent(artifactId)}/preview-sessions`,
        baseUrl.origin
      );
      const response = await options.http.request({
        method: 'POST',
        url: endpoint.href,
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        }),
        maximumResponseBytes: 64 * 1_024,
      });
      if (
        response.status !== 201 ||
        !response.headers['content-type']
          ?.toLowerCase()
          .startsWith('application/json')
      )
        throw new Error('Remote Preview origin could not be created.');
      const grant = decodeGrant(response.body, now());
      return Object.freeze({ ...input.artifact, uri: grant.previewUrl });
    },
  });
};
