import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeBlueprintGraph } from '@/editor/features/design/blueprint/editor/model/graphExecutor';

describe('executeBlueprintGraph', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches graph request and resolves runtime patch from matched result', async () => {
    let capturedRequestId = '';
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown>;
      capturedRequestId = String(detail.requestId ?? '');
      window.dispatchEvent(
        new CustomEvent('prodivix:execute-graph-result', {
          detail: {
            requestId: capturedRequestId,
            result: {
              statePatch: {
                products: [{ id: 'p-1' }],
              },
            },
          },
        })
      );
    };
    window.addEventListener('prodivix:execute-graph', onRequest);

    const result = await executeBlueprintGraph({
      nodeId: 'node-1',
      trigger: 'click',
      eventKey: 'onClick',
      params: { graphId: 'g-1' },
    });

    window.removeEventListener('prodivix:execute-graph', onRequest);
    expect(capturedRequestId).not.toBe('');
    expect(result.statePatch).toEqual({
      products: [{ id: 'p-1' }],
    });
  });

  it('normalizes patch payload shape from result.patch', async () => {
    let capturedRequestId = '';
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent).detail as Record<string, unknown>;
      capturedRequestId = String(detail.requestId ?? '');
      window.dispatchEvent(
        new CustomEvent('prodivix:execute-graph-result', {
          detail: {
            requestId: capturedRequestId,
            result: {
              patch: {
                count: 2,
              },
            },
          },
        })
      );
    };
    window.addEventListener('prodivix:execute-graph', onRequest);

    const result = await executeBlueprintGraph({
      nodeId: 'node-2',
      trigger: 'change',
      eventKey: 'onChange',
    });

    window.removeEventListener('prodivix:execute-graph', onRequest);
    expect(result.statePatch).toEqual({ count: 2 });
  });

  it('returns empty patch when no graph result arrives before timeout', async () => {
    vi.useFakeTimers();
    const promise = executeBlueprintGraph(
      {
        nodeId: 'node-timeout',
        trigger: 'click',
        eventKey: 'onClick',
      },
      60
    );
    await vi.advanceTimersByTimeAsync(70);
    await expect(promise).resolves.toEqual({ statePatch: {} });
  });
});
