import { request as httpRequest, type RequestOptions } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export type AgentEvaluationEndpointSmokeBoundFetch = (
  input: string | URL,
  init: RequestInit,
  authority: Readonly<{
    endpointClass:
      'first-party-hosted' | 'aggregator' | 'self-hosted' | 'local';
    approvedAddresses: readonly string[];
  }>
) => Promise<Response>;

const normalizedRemoteAddress = (value: string): string =>
  value.toLowerCase().startsWith('::ffff:') && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : (value.split('%', 1)[0] ?? value);

const responseHeaders = (rawHeaders: readonly string[]): Headers => {
  const headers = new Headers();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) headers.append(name, value);
  }
  return headers;
};

const createLoopbackFetch =
  (
    requester: typeof httpRequest = httpRequest
  ): AgentEvaluationEndpointSmokeBoundFetch =>
  async (input, init, authority) => {
    const endpoint = new URL(String(input));
    const hostname = endpoint.hostname.replace(/^\[|\]$/gu, '');
    const requestHeaders = init.headers;
    const loopback = hostname === '127.0.0.1' || hostname === '::1';
    if (
      authority.endpointClass !== 'local' ||
      endpoint.protocol !== 'http:' ||
      !loopback ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port === '' ||
      endpoint.hash !== '' ||
      authority.approvedAddresses.length !== 1 ||
      authority.approvedAddresses[0] !== hostname ||
      init.method !== 'POST' ||
      typeof init.body !== 'string' ||
      init.redirect !== 'manual' ||
      !(requestHeaders instanceof Headers)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    const port = Number(endpoint.port);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    const approvedRemoteAddress = normalizedRemoteAddress(hostname);
    const family = isIP(hostname);
    const lookup: NonNullable<RequestOptions['lookup']> = (
      _requestedHostname,
      options,
      callback
    ) => {
      if (typeof options === 'object' && options.all) {
        callback(null, [{ address: hostname, family }]);
        return;
      }
      callback(null, hostname, family);
    };
    return await new Promise<Response>((resolve, reject) => {
      let connectedToExactLoopback = false;
      const request = requester(
        endpoint,
        {
          method: 'POST',
          headers: Object.fromEntries(requestHeaders.entries()),
          signal: init.signal ?? undefined,
          agent: false,
          lookup,
        },
        (incoming) => {
          if (!connectedToExactLoopback) {
            incoming.destroy();
            reject(
              new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
              )
            );
            return;
          }
          resolve(
            new Response(
              Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              {
                status: incoming.statusCode ?? 500,
                statusText: incoming.statusMessage,
                headers: responseHeaders(incoming.rawHeaders),
              }
            )
          );
        }
      );
      request.once('socket', (socket) => {
        socket.once('connect', () => {
          const remoteAddress = socket.remoteAddress;
          if (
            remoteAddress === undefined ||
            normalizedRemoteAddress(remoteAddress) !== approvedRemoteAddress
          ) {
            request.destroy(
              new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
              )
            );
            return;
          }
          connectedToExactLoopback = true;
        });
      });
      request.once('error', reject);
      request.end(init.body);
    });
  };

export const createAgentEvaluationEndpointSmokeBoundFetch = (
  input: {
    hostedFetch?: AgentEvaluationEgressBoundFetch;
    localRequester?: typeof httpRequest;
  } = {}
): AgentEvaluationEndpointSmokeBoundFetch => {
  const hostedFetch = input.hostedFetch ?? agentEvaluationEgressBoundFetch;
  const localFetch = createLoopbackFetch(input.localRequester);
  return async (endpoint, init, authority) =>
    authority.endpointClass === 'local'
      ? localFetch(endpoint, init, authority)
      : hostedFetch(endpoint, init, authority.approvedAddresses);
};

export const agentEvaluationEndpointSmokeBoundFetch =
  createAgentEvaluationEndpointSmokeBoundFetch();
