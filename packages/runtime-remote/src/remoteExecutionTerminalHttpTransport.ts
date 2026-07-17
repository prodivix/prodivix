import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { RemoteExecutionHttpPort } from './remoteExecutionHttpTransport';
import type {
  RemoteExecutionTerminalOperation,
  RemoteExecutionTerminalTransport,
  RemoteExecutionTerminalTransportRequest,
} from './remoteExecutionTerminal.types';

export type CreateRemoteExecutionTerminalHttpTransportOptions = Readonly<{
  baseUrl: string;
  executionPath: string;
  accessToken: string;
  http: RemoteExecutionHttpPort;
  maximumResponseBytes?: number;
  terminalAccessMode?: 'authorization' | 'x-prodivix-terminal-token';
}>;

export class RemoteExecutionTerminalHttpTransportError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    super(`Remote Terminal HTTP request failed with status ${status}.`);
    this.name = 'RemoteExecutionTerminalHttpTransportError';
    this.status = status;
    this.code = code;
  }
}

const operationPath = (
  request: RemoteExecutionTerminalTransportRequest
): string => {
  const executionId = encodeURIComponent(request.executionId);
  if (request.operation === 'open') return `${executionId}/terminal-sessions`;
  const terminalSessionId = request.terminalSessionId;
  if (!terminalSessionId)
    throw new TypeError('Remote Terminal session id is required.');
  const session = encodeURIComponent(terminalSessionId);
  return request.operation === 'resume'
    ? `${executionId}/terminal-sessions/${session}/resume`
    : `${executionId}/terminal-sessions/${session}/${request.operation}`;
};

const errorCode = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error))
    return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length <= 256 ? code : undefined;
};

const bodyFor = (payload: unknown): Uint8Array =>
  utf8ToBytes(JSON.stringify(payload));

const normalizedBaseUrl = (value: string): string => {
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
    url = new Url(value);
  } catch {
    throw new TypeError('Remote Terminal base URL is invalid.');
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
    throw new TypeError('Remote Terminal base URL must use safe HTTP(S).');
  return url.toString().replace(/\/+$/u, '');
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

/** HTTP polling transport with app auth and a separate short Terminal token. */
export const createRemoteExecutionTerminalHttpTransport = (
  options: CreateRemoteExecutionTerminalHttpTransportOptions
): RemoteExecutionTerminalTransport => {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const executionPath = options.executionPath;
  if (
    !executionPath.startsWith('/') ||
    executionPath.startsWith('//') ||
    executionPath.endsWith('/') ||
    executionPath.includes('?') ||
    executionPath.includes('#') ||
    executionPath.includes('\\') ||
    executionPath.split('/').some((segment) => segment === '..')
  )
    throw new TypeError('Remote Terminal execution path is required.');
  if (
    !options.accessToken.trim() ||
    options.accessToken !== options.accessToken.trim() ||
    /[\r\n]/u.test(options.accessToken)
  )
    throw new TypeError('Remote Terminal app access token is required.');
  const maximumResponseBytes = options.maximumResponseBytes ?? 1024 * 1024;
  const terminalAccessMode = options.terminalAccessMode ?? 'authorization';
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1)
    throw new TypeError('Remote Terminal response budget is invalid.');

  return Object.freeze({
    async send(request) {
      const response = await options.http.request({
        method: 'POST',
        url: `${baseUrl.replace(/\/+$/u, '')}${executionPath}/${operationPath(request)}`,
        headers: Object.freeze({
          authorization: `Bearer ${
            request.accessToken && terminalAccessMode === 'authorization'
              ? request.accessToken
              : options.accessToken
          }`,
          'content-type': 'application/json',
          accept: 'application/json',
          ...(request.accessToken &&
          terminalAccessMode === 'x-prodivix-terminal-token'
            ? { 'x-prodivix-terminal-token': request.accessToken }
            : {}),
        }),
        body: bodyFor(request.payload),
        maximumResponseBytes,
      });
      let value: unknown;
      try {
        value = JSON.parse(decodeUtf8(response.body)) as unknown;
      } catch {
        throw new RemoteExecutionTerminalHttpTransportError(response.status);
      }
      if (response.status < 200 || response.status >= 300)
        throw new RemoteExecutionTerminalHttpTransportError(
          response.status,
          errorCode(value)
        );
      return value;
    },
  });
};

export const REMOTE_EXECUTION_TERMINAL_HTTP_OPERATIONS = Object.freeze([
  'open',
  'resume',
  'read',
  'write',
  'resize',
  'signal',
  'close',
] satisfies readonly RemoteExecutionTerminalOperation[]);
