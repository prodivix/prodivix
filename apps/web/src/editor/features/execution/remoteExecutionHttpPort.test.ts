import { describe, expect, it, vi } from 'vitest';
import { createWebRemoteExecutionHttpPort } from './remoteExecutionHttpPort';

describe('Web Remote execution HTTP port', () => {
  it('streams a bounded response without forwarding ambient credentials', async () => {
    const fetcher = vi.fn(async () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': '3',
          },
        })
      )
    );
    const port = createWebRemoteExecutionHttpPort(fetcher);
    await expect(
      port.request({
        url: 'https://runner.example.test/content',
        method: 'GET',
        headers: { authorization: 'Bearer scoped-token' },
        maximumResponseBytes: 3,
      })
    ).resolves.toMatchObject({ status: 200, body: new Uint8Array([1, 2, 3]) });
    expect(fetcher).toHaveBeenCalledWith(
      'https://runner.example.test/content',
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      })
    );
  });

  it('cancels responses that exceed the declared byte limit', async () => {
    const port = createWebRemoteExecutionHttpPort(async () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-length': '3' },
        })
      )
    );
    await expect(
      port.request({
        url: 'https://runner.example.test/content',
        method: 'GET',
        headers: {},
        maximumResponseBytes: 2,
      })
    ).rejects.toThrow('declared byte limit');
  });
});
