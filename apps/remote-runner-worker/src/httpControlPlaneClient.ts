import {
  decodeRemoteExecutableProjectSnapshot,
  decodeRemoteExecutionTerminalWorkerReadResult,
} from '@prodivix/runtime-remote';
import type {
  RemoteExecutionClaimResult,
  RemoteExecutionLease,
} from '@prodivix/runtime-remote';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerTerminalControlPlaneClient,
} from './worker.types';

const jsonRequest = async (
  baseUrl: string,
  workerToken: string,
  path: string,
  body: unknown
): Promise<Response> =>
  fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${workerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const resultBody = async (
  response: Response
): Promise<Record<string, unknown>> => {
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new TypeError('Remote worker response is invalid.');
  return body as Record<string, unknown>;
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
      return body.claim === null
        ? undefined
        : (body.claim as RemoteExecutionClaimResult);
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
