import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '@/infra/api';

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
});
