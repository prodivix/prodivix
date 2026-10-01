import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiBinaryRequest,
  apiRequest,
  subscribeApiUnauthorized,
} from '@/infra/api';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('bounds a stalled request and aborts its transport', async () => {
    vi.useFakeTimers();
    let transportSignal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input, init) => {
        transportSignal = init.signal;
        return new Promise(() => undefined);
      })
    );
    const request = apiRequest('/stalled', { timeoutMs: 30 }).catch(
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(30);
    expect(await request).toBeInstanceOf(TypeError);
    expect(transportSignal.aborted).toBe(true);
  });

  it('preserves caller cancellation and releases the deadline after success', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined))
    );
    const pending = apiRequest('/cancelled', { signal: caller.signal }).catch(
      (error: unknown) => error
    );
    caller.abort();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    await expect(apiRequest('/ready')).resolves.toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the structured error envelope for domain recovery', async () => {
    const payload = {
      error: {
        code: 'WKS-4003',
        message: 'Revision conflict.',
        retryable: true,
        details: {
          conflictType: 'DOCUMENT_CONFLICT',
          workspaceId: 'workspace-1',
          expected: {
            document: { id: 'page-home', contentRev: 4 },
          },
          current: {
            workspaceRev: 3,
            routeRev: 2,
            opSeq: 9,
            document: {
              id: 'page-home',
              type: 'pir-page',
              path: '/pages/home.pir.json',
              contentRev: 5,
              metaRev: 1,
              updatedAt: '2026-07-12T00:00:00Z',
            },
          },
        },
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const error = await apiRequest('/workspaces/workspace-1').catch(
      (candidate: unknown) => candidate
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'WKS-4003',
      retryable: true,
      payload,
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['an empty body', ''],
  ])(
    'keeps non-success %s responses inside the ApiError contract',
    async (_, body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(body, {
            status: 502,
            headers: { 'content-type': 'application/json' },
          })
        )
      );

      const error = await apiRequest('/upstream').catch(
        (candidate: unknown) => candidate
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 502 });
    }
  );

  it('publishes authenticated 401 responses without allowing observers to replace the ApiError', async () => {
    const observer = vi.fn(() => {
      throw new Error('observer failure');
    });
    const unsubscribe = subscribeApiUnauthorized(observer);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      apiRequest('/session', { token: 'expired-token' })
    ).rejects.toBeInstanceOf(ApiError);
    expect(observer).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('returns exact binary bytes and the declared response media type', async () => {
    const bytes = new Uint8Array([0, 255, 1, 2]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes.buffer, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      )
    );

    await expect(
      apiBinaryRequest('/asset', { token: 'token' })
    ).resolves.toEqual({ contents: bytes, mediaType: 'image/png' });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('Authorization')).toBe(
      'Bearer token'
    );
  });

  it('applies the same byte budget to binary success bodies and cancels excessive streams', async () => {
    const bytes = new Uint8Array([0, 255, 1, 2]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      )
    );
    await expect(
      apiBinaryRequest('/bounded', { maxResponseBytes: 4 })
    ).resolves.toEqual({
      contents: bytes,
      mediaType: 'application/octet-stream',
    });
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/octet-stream' } }
        )
      )
    );
    await expect(
      apiBinaryRequest('/excessive', { maxResponseBytes: 3 })
    ).rejects.toThrow('byte budget');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects a binary response without an explicit media type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0)))
    );

    await expect(apiBinaryRequest('/asset')).rejects.toThrow(
      'missing its media type'
    );
  });
});
