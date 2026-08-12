import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createAgentEvaluationEgressBoundFetch } from './egressBoundFetch';

type FakeRequesterCapture = {
  callCount: number;
  endedBody?: string | Uint8Array;
  options?: RequestOptions;
  lookupAddress?: string;
};

const fakeRequester = (input: {
  remoteAddress: string;
  statusCode?: number;
  capture: FakeRequesterCapture;
}): Parameters<typeof createAgentEvaluationEgressBoundFetch>[0] =>
  ((
    _endpoint: URL,
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void
  ) => {
    input.capture.callCount += 1;
    input.capture.options = options;
    options.lookup?.('provider.invalid', { all: false }, (error, address) => {
      if (error) throw error;
      if (typeof address !== 'string') throw new Error('lookup drifted');
      input.capture.lookupAddress = address;
    });

    const request = new EventEmitter() as EventEmitter & {
      destroy(error: Error): void;
      end(body?: string | Uint8Array): void;
    };
    request.destroy = (error) => request.emit('error', error);
    request.end = (body) => {
      input.capture.endedBody = body;
      const socket = new EventEmitter() as EventEmitter & {
        remoteAddress: string;
      };
      socket.remoteAddress = input.remoteAddress;
      request.emit('socket', socket);
      socket.emit('secureConnect');
      if (input.remoteAddress !== '8.8.8.8') return;
      const incoming = new PassThrough() as PassThrough & {
        statusCode: number;
        statusMessage: string;
        rawHeaders: string[];
      };
      incoming.statusCode = input.statusCode ?? 200;
      incoming.statusMessage = input.statusCode === 302 ? 'Found' : 'OK';
      incoming.rawHeaders = ['content-type', 'application/json'];
      onResponse(incoming as unknown as IncomingMessage);
      incoming.end('{"ok":true}');
    };
    return request;
  }) as unknown as Parameters<typeof createAgentEvaluationEgressBoundFetch>[0];

const requestInit = (): RequestInit => ({
  method: 'POST',
  headers: new Headers({ 'content-type': 'application/json' }),
  body: '{"input":"safe"}',
  redirect: 'manual',
});

const readRequestInit = (): RequestInit => ({
  method: 'GET',
  headers: new Headers({ accept: 'application/json' }),
  redirect: 'manual',
});

const deleteRequestInit = (): RequestInit => ({
  method: 'DELETE',
  headers: new Headers({ accept: 'application/json' }),
  redirect: 'manual',
});

describe('agent evaluation egress-bound HTTPS fetch', () => {
  it('pins lookup and the connected peer while retaining hostname TLS authority', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', capture })
    );

    const response = await fetcher(
      'https://provider.example/v1/responses',
      requestInit(),
      ['8.8.8.8']
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(capture).toMatchObject({
      callCount: 1,
      endedBody: '{"input":"safe"}',
      lookupAddress: '8.8.8.8',
      options: {
        agent: false,
        rejectUnauthorized: true,
        servername: 'provider.example',
      },
    });
  });

  it('fails closed when the connected peer leaves the approved address set', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '1.1.1.1', capture })
    );

    await expect(
      fetcher('https://provider.example/v1/responses', requestInit(), [
        '8.8.8.8',
      ])
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
    });
    expect(capture.callCount).toBe(1);
  });

  it('returns redirect responses without following a second location', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', statusCode: 302, capture })
    );

    const response = await fetcher(
      'https://provider.example/v1/responses',
      requestInit(),
      ['8.8.8.8']
    );

    expect(response.status).toBe(302);
    expect(capture.callCount).toBe(1);
  });

  it('pins a body-free provider resource read to the approved peer', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', capture })
    );

    const response = await fetcher(
      'https://provider.example/v1/responses/resp_probe_1',
      readRequestInit(),
      ['8.8.8.8']
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(capture.endedBody).toBeUndefined();
    expect(capture.options?.method).toBe('GET');
    expect(capture.callCount).toBe(1);
  });

  it('rejects GET requests carrying a body', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', capture })
    );

    await expect(
      fetcher(
        'https://provider.example/v1/responses/resp_probe_1',
        { ...readRequestInit(), body: '{}' },
        ['8.8.8.8']
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
    });
    expect(capture.callCount).toBe(0);
  });

  it('sends a binary resource upload without string coercion', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', capture })
    );
    const body = Uint8Array.from([0, 1, 2, 253, 254, 255]);

    await fetcher(
      'https://provider.example/upload/v1/fileSearchStores/store:upload',
      {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        body: body as unknown as BodyInit,
        redirect: 'manual',
      },
      ['8.8.8.8']
    );

    expect(capture.endedBody).toEqual(body);
    expect(capture.options?.method).toBe('POST');
  });

  it('pins a body-free provider resource deletion to the approved peer', async () => {
    const capture: FakeRequesterCapture = { callCount: 0 };
    const fetcher = createAgentEvaluationEgressBoundFetch(
      fakeRequester({ remoteAddress: '8.8.8.8', capture })
    );

    await fetcher(
      'https://provider.example/v1/vector_stores/vs_probe_1',
      deleteRequestInit(),
      ['8.8.8.8']
    );

    expect(capture.endedBody).toBeUndefined();
    expect(capture.options?.method).toBe('DELETE');
  });
});
