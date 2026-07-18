import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteWorkerHttpControlPlaneClient } from './httpControlPlaneClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote worker HTTP Control Plane client', () => {
  it('hard-cuts an oversized Secret envelope response under a request timeout', async () => {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(400 * 1024));
        chunks += 1;
        if (chunks > 2) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createRemoteWorkerHttpControlPlaneClient({
      baseUrl: 'http://127.0.0.1:8080/',
      workerToken: 'worker-token-canary',
    });

    await expect(
      client.resolveServerFunctionSecrets!({
        executionId: 'execution-secret',
        workerId: 'worker-1',
        leaseToken: 'lease-token-canary',
        recipientPublicKey: Buffer.alloc(32, 0x11).toString('base64url'),
      })
    ).rejects.toThrow('Remote worker response is invalid.');
    expect(cancelled).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
