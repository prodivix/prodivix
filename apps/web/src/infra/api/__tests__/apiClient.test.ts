import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiBinaryRequest, apiRequest } from '@/infra/api';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
