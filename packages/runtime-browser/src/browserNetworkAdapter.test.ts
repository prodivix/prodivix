import { describe, expect, it, vi } from 'vitest';
import { createBrowserNetworkAdapter } from './browserNetworkAdapter';

describe('Browser Network adapter', () => {
  it('fetches the full URL but publishes only origin metadata and correlation', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const traces: unknown[] = [];
    const adapter = createBrowserNetworkAdapter({
      fetch: fetch as typeof globalThis.fetch,
      now: (() => {
        let value = 100;
        return () => value++;
      })(),
      publishTrace: (trace) => traces.push(trace),
    });
    const response = await adapter.execute({
      requestId: 'request-1',
      url: 'https://api.example.test/products?page=1#client',
      method: 'get',
      runtimeZone: 'client',
      mode: 'live',
      adapter: 'core.http',
      correlation: {
        kind: 'data-operation',
        documentId: 'data-products',
        operationId: 'list',
        invocationId: 'invocation-1',
        sequence: 1,
        attempt: 1,
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.test/products?page=1#client'),
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      })
    );
    expect(response.text).toBe('{"ok":true}');
    expect(traces).toEqual([
      expect.objectContaining({
        sanitizedUrl: 'https://api.example.test/',
        correlation: expect.objectContaining({ operationId: 'list' }),
        redacted: true,
      }),
    ]);
    expect(JSON.stringify(traces)).not.toContain('page=1');
    expect(JSON.stringify(traces)).not.toContain('#client');
  });

  it('rejects credential URLs and sensitive headers before fetch', async () => {
    const fetch = vi.fn();
    const adapter = createBrowserNetworkAdapter({
      fetch: fetch as typeof globalThis.fetch,
    });
    await expect(
      adapter.execute({
        requestId: 'request-1',
        url: 'https://token@api.example.test/',
        method: 'GET',
        runtimeZone: 'client',
        mode: 'live',
        adapter: 'core.http',
      })
    ).rejects.toThrow(/URL is not safe/u);
    await expect(
      adapter.execute({
        requestId: 'request-2',
        url: 'https://api.example.test/',
        method: 'GET',
        runtimeZone: 'client',
        headers: { authorization: 'Bearer secret' },
        mode: 'live',
        adapter: 'core.http',
      })
    ).rejects.toThrow(/header is forbidden/u);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never turns mock mode into live browser traffic', async () => {
    const fetch = vi.fn();
    const adapter = createBrowserNetworkAdapter({
      fetch: fetch as typeof globalThis.fetch,
    });
    await expect(
      adapter.execute({
        requestId: 'request-mock',
        url: 'https://api.example.test/',
        method: 'GET',
        runtimeZone: 'client',
        mode: 'mock',
        adapter: 'core.http',
      })
    ).rejects.toThrow(/cannot execute mock traffic/u);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('denies private and metadata address literals by default', async () => {
    const fetch = vi.fn();
    const adapter = createBrowserNetworkAdapter({
      fetch: fetch as typeof globalThis.fetch,
    });
    for (const url of [
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.2/',
      'http://[::1]/',
    ]) {
      await expect(
        adapter.execute({
          requestId: 'request-private',
          url,
          method: 'GET',
          runtimeZone: 'client',
          mode: 'live',
          adapter: 'core.http',
        })
      ).rejects.toThrow(/URL is not safe/u);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
