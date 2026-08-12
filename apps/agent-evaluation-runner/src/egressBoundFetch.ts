import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export type AgentEvaluationEgressBoundFetch = (
  input: string | URL | Request,
  init: RequestInit | undefined,
  approvedAddresses: readonly string[]
) => Promise<Response>;

const normalizedRemoteAddress = (value: string): string =>
  value.toLowerCase().startsWith('::ffff:') && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : (value.split('%', 1)[0] ?? value);

const addressFamily = (address: string): 4 | 6 => {
  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  return family;
};

const responseHeaders = (rawHeaders: readonly string[]): Headers => {
  const headers = new Headers();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) headers.append(name, value);
  }
  return headers;
};

/**
 * Sends one HTTPS request through only the addresses authorized for this call.
 * Hostname SNI and the platform certificate verifier remain active while the
 * connected peer is checked again before any response is exposed.
 */
export const createAgentEvaluationEgressBoundFetch =
  (
    requester: typeof httpsRequest = httpsRequest
  ): AgentEvaluationEgressBoundFetch =>
  async (input, init, approvedAddresses) => {
    const endpoint = new URL(String(input));
    const approved = Object.freeze(
      approvedAddresses.map((address) => ({
        address,
        family: addressFamily(address),
      }))
    );
    const method = init?.method;
    const body = init?.body;
    if (
      init === undefined ||
      endpoint.protocol !== 'https:' ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port !== '' ||
      approved.length === 0 ||
      new Set(approved.map(({ address }) => address)).size !==
        approved.length ||
      (method !== 'POST' && method !== 'GET' && method !== 'DELETE') ||
      (method === 'POST'
        ? !(
            (typeof body === 'string' && body.length > 0) ||
            (body instanceof Uint8Array && body.byteLength > 0)
          )
        : body !== undefined && body !== null) ||
      init.redirect !== 'manual' ||
      !(init.headers instanceof Headers)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    const requestHeaders = init.headers;

    const approvedRemoteAddresses = new Set(
      approved.map(({ address }) => normalizedRemoteAddress(address))
    );
    const lookup: NonNullable<RequestOptions['lookup']> = (
      _hostname,
      options,
      callback
    ) => {
      if (typeof options === 'object' && options.all) {
        callback(
          null,
          approved.map(({ address, family }) => ({ address, family }))
        );
        return;
      }
      const requestedFamily =
        typeof options === 'number' ? options : options?.family;
      const selected =
        approved.find(({ family }) =>
          requestedFamily === 4 || requestedFamily === 6
            ? family === requestedFamily
            : true
        ) ?? approved[0]!;
      callback(null, selected.address, selected.family);
    };

    return await new Promise<Response>((resolve, reject) => {
      let connectedToApprovedAddress = false;
      const request = requester(
        endpoint,
        {
          method,
          headers: Object.fromEntries(requestHeaders.entries()),
          signal: init.signal ?? undefined,
          agent: false,
          lookup,
          servername: endpoint.hostname,
          rejectUnauthorized: true,
        },
        (incoming) => {
          if (!connectedToApprovedAddress) {
            incoming.destroy();
            reject(
              new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
              )
            );
            return;
          }
          const body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
          resolve(
            new Response(body, {
              status: incoming.statusCode ?? 500,
              statusText: incoming.statusMessage,
              headers: responseHeaders(incoming.rawHeaders),
            })
          );
        }
      );
      request.once('socket', (socket) => {
        socket.once('secureConnect', () => {
          const remoteAddress = socket.remoteAddress;
          if (
            remoteAddress === undefined ||
            !approvedRemoteAddresses.has(normalizedRemoteAddress(remoteAddress))
          ) {
            request.destroy(
              new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
              )
            );
            return;
          }
          connectedToApprovedAddress = true;
        });
      });
      request.once('error', reject);
      request.end(
        method === 'POST' ? (body as string | Uint8Array) : undefined
      );
    });
  };

export const agentEvaluationEgressBoundFetch =
  createAgentEvaluationEgressBoundFetch();
