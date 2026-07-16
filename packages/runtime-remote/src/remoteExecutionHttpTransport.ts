import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { RemoteExecutionArtifactContentTransport } from './remoteExecutionArtifactResolver';
import type { RemoteExecutionTransport } from './remoteExecutionProtocol.types';

export type RemoteExecutionHttpRequest = Readonly<{
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: Uint8Array;
  maximumResponseBytes: number;
}>;

export type RemoteExecutionHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
}>;

export type RemoteExecutionHttpPort = Readonly<{
  request(
    input: RemoteExecutionHttpRequest
  ): Promise<RemoteExecutionHttpResponse>;
}>;

export type CreateRemoteExecutionHttpTransportsOptions = Readonly<{
  baseUrl: string;
  accessToken: string;
  http: RemoteExecutionHttpPort;
  maximumEnvelopeBytes?: number;
  maximumArtifactBytes?: number;
  executionPath?: string;
}>;

export class RemoteExecutionHttpTransportError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RemoteExecutionHttpTransportError';
    this.status = status;
  }
}

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
};

const normalizedCredential = (value: string, label: string): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > 8_192 ||
    /[\r\n]/u.test(value)
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const normalizedBaseUrl = (value: string): string => {
  const normalized = normalizedCredential(value, 'Remote HTTP base URL');
  const Url = (
    globalThis as unknown as {
      URL: new (input: string) => {
        protocol: string;
        hostname: string;
        username: string;
        password: string;
        search: string;
        hash: string;
        toString(): string;
      };
    }
  ).URL;
  let url: InstanceType<typeof Url>;
  try {
    url = new Url(normalized);
  } catch {
    throw new TypeError('Remote HTTP base URL must be absolute HTTP(S).');
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      'Remote HTTP base URL must use HTTPS without embedded authority or query state.'
    );
  return url.toString().replace(/\/+$/u, '');
};

const normalizedExecutionPath = (value: string | undefined): string => {
  const path = value ?? '/v1/executions';
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.endsWith('/') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..')
  )
    throw new TypeError('Remote HTTP execution path is invalid.');
  return path;
};

const decodeUtf8 = (value: Uint8Array): string =>
  new (
    globalThis as unknown as {
      TextDecoder: new (
        label?: string,
        options?: Readonly<{ fatal?: boolean }>
      ) => { decode(input: Uint8Array): string };
    }
  ).TextDecoder('utf-8', { fatal: true }).decode(value);

const assertSuccessfulResponse = (
  response: RemoteExecutionHttpResponse,
  label: string
): void => {
  if (
    !Number.isSafeInteger(response.status) ||
    response.status < 100 ||
    response.status > 599
  )
    throw new RemoteExecutionHttpTransportError(`${label} status is invalid.`);
  if (response.status < 200 || response.status >= 300)
    throw new RemoteExecutionHttpTransportError(
      `${label} failed with HTTP ${response.status}.`,
      response.status
    );
};

/** Creates authenticated HTTP adapters while keeping fetch, cookies, and token storage outside core. */
export const createRemoteExecutionHttpTransports = (
  options: CreateRemoteExecutionHttpTransportsOptions
): Readonly<{
  transport: RemoteExecutionTransport;
  contentTransport: RemoteExecutionArtifactContentTransport;
}> => {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const accessToken = normalizedCredential(
    options.accessToken,
    'Remote HTTP access token'
  );
  const executionPath = normalizedExecutionPath(options.executionPath);
  const maximumEnvelopeBytes = positiveSafeInteger(
    options.maximumEnvelopeBytes ?? 64 * 1024 * 1024,
    'Remote HTTP envelope byte limit'
  );
  const maximumArtifactBytes = positiveSafeInteger(
    options.maximumArtifactBytes ?? 64 * 1024 * 1024,
    'Remote HTTP artifact byte limit'
  );
  const authorization = `Bearer ${accessToken}`;

  const transport: RemoteExecutionTransport = Object.freeze({
    async send(envelope) {
      const body = utf8ToBytes(JSON.stringify(envelope));
      if (body.byteLength > maximumEnvelopeBytes)
        throw new RemoteExecutionHttpTransportError(
          'Remote HTTP request envelope exceeds its byte limit.'
        );
      const response = await options.http.request({
        url: `${baseUrl}${executionPath}`,
        method: 'POST',
        headers: Object.freeze({
          authorization,
          'content-type': 'application/json',
          accept: 'application/json',
        }),
        body,
        maximumResponseBytes: maximumEnvelopeBytes,
      });
      assertSuccessfulResponse(response, 'Remote HTTP execution request');
      if (
        !response.headers['content-type']
          ?.toLowerCase()
          .includes('application/json')
      )
        throw new RemoteExecutionHttpTransportError(
          'Remote HTTP execution response is not JSON.'
        );
      try {
        return JSON.parse(decodeUtf8(response.body)) as unknown;
      } catch {
        throw new RemoteExecutionHttpTransportError(
          'Remote HTTP execution response is invalid JSON.'
        );
      }
    },
  });

  const contentTransport: RemoteExecutionArtifactContentTransport =
    Object.freeze({
      async download(input) {
        const maximumBytes = Math.min(
          positiveSafeInteger(
            input.maximumBytes,
            'Remote artifact download byte limit'
          ),
          maximumArtifactBytes
        );
        const response = await options.http.request({
          url: `${baseUrl}${executionPath}/${encodeURIComponent(input.executionId)}/artifacts/${encodeURIComponent(input.artifactId)}/content`,
          method: 'GET',
          headers: Object.freeze({
            authorization,
            accept: 'application/octet-stream, application/json',
          }),
          maximumResponseBytes: maximumBytes,
        });
        assertSuccessfulResponse(response, 'Remote HTTP artifact download');
        if (response.body.byteLength > maximumBytes)
          throw new RemoteExecutionHttpTransportError(
            'Remote HTTP artifact response exceeds its byte limit.'
          );
        return new Uint8Array(response.body);
      },
    });

  return Object.freeze({ transport, contentTransport });
};
