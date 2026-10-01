import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BackendTransportFailure,
  requestBackend,
  validateBackendUrl,
} from './backendTransport.js';

test('authenticated transport rejects downgraded or embedded authority before fetching', async () => {
  for (const value of [
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com?token=x',
    'https://example.com#fragment',
    'file:///tmp/data',
  ]) {
    assert.throws(() => validateBackendUrl(value), BackendTransportFailure);
  }
  for (const value of [
    'https://example.com/api',
    'http://127.0.0.1:8080/api',
    'http://[::1]:8080/api',
    'http://localhost:8080/api',
  ])
    assert.equal(validateBackendUrl(value).href, new URL(value).href);
});

test('authenticated transport fences redirects, bounds bodies and retains caller cancellation', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.PRODIVIX_TRANSPORT_TEST_TOKEN;
  process.env.PRODIVIX_TRANSPORT_TEST_TOKEN = 'fixture-access-token';
  const controller = new AbortController();
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options?.redirect, 'error');
      assert.equal(
        new Headers(options?.headers).get('Authorization'),
        'Bearer fixture-access-token'
      );
      assert.ok(options?.signal);
      assert.equal(options?.signal.aborted, false);
      controller.abort();
      assert.equal(options.signal.aborted, true);
      return new Response('{}');
    };
    await assert.rejects(
      requestBackend(
        'https://example.com/api',
        { signal: controller.signal },
        'PRODIVIX_TRANSPORT_TEST_TOKEN'
      ),
      BackendTransportFailure
    );
    globalThis.fetch = async () => new Response(new Uint8Array(8_388_609));
    await assert.rejects(
      requestBackend(
        'https://example.com/api',
        {},
        'PRODIVIX_TRANSPORT_TEST_TOKEN'
      ),
      /exceeds its contract budget/u
    );
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(
      (
        await requestBackend(
          'https://example.com/api',
          {},
          'PRODIVIX_TRANSPORT_TEST_TOKEN'
        )
      ).status,
      204
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined)
      delete process.env.PRODIVIX_TRANSPORT_TEST_TOKEN;
    else process.env.PRODIVIX_TRANSPORT_TEST_TOKEN = previousToken;
  }
});

test('transport settles cancellation when fetch, stream reads or cleanup ignore abort', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.PRODIVIX_TRANSPORT_TEST_TOKEN;
  process.env.PRODIVIX_TRANSPORT_TEST_TOKEN = 'fixture-access-token';
  try {
    for (const stage of ['fetch', 'body'] as const) {
      const controller = new AbortController();
      globalThis.fetch = async () => {
        if (stage === 'fetch') {
          queueMicrotask(() => controller.abort());
          return new Promise<Response>(() => {});
        }
        return new Response(
          new ReadableStream<Uint8Array>({
            pull: () => {
              queueMicrotask(() => controller.abort());
              return new Promise<void>(() => {});
            },
            cancel: () => new Promise<void>(() => {}),
          })
        );
      };
      const result = requestBackend(
        'https://example.com/api',
        { signal: controller.signal },
        'PRODIVIX_TRANSPORT_TEST_TOKEN'
      );
      await assert.rejects(result, /cancelled or timed out/u);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined)
      delete process.env.PRODIVIX_TRANSPORT_TEST_TOKEN;
    else process.env.PRODIVIX_TRANSPORT_TEST_TOKEN = previousToken;
  }
});
