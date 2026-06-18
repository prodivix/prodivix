import { afterEach, describe, expect, it, vi } from 'vitest';
import { executePirNodeGraph } from '@/core/executor/nodeGraph/nodeGraphExecutor';
import type { PIRDocument } from '@prodivix/shared/types/pir';

const createPirDoc = (graphs: unknown[]): PIRDocument => ({
  version: '1.2',
  ui: {
    root: {
      id: 'root',
      type: 'page',
    },
  },
  logic: {
    graphs,
  },
});

describe('nodeGraphExecutor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs start -> log -> end', async () => {
    const consoleSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    const result = await executePirNodeGraph(
      createPirDoc([
        {
          id: 'graph-1',
          name: 'Main',
          nodes: [
            { id: 'start-1', data: { kind: 'start', label: 'Start' } },
            {
              id: 'log-1',
              data: {
                kind: 'log',
                label: 'Log',
                description: 'hello node graph',
              },
            },
            { id: 'end-1', data: { kind: 'end', label: 'End' } },
          ],
          edges: [
            {
              id: 'e-1',
              source: 'start-1',
              target: 'log-1',
              sourceHandle: 'out.control.next',
              targetHandle: 'in.control.prev',
            },
            {
              id: 'e-2',
              source: 'log-1',
              target: 'end-1',
              sourceHandle: 'out.control.next',
              targetHandle: 'in.control.prev',
            },
          ],
        },
      ]),
      {
        requestId: 'request-1',
        nodeId: 'component-1',
        trigger: 'onClick',
        eventKey: 'click',
        params: { graphId: 'graph-1' },
      }
    );

    expect(consoleSpy).toHaveBeenCalledWith('hello node graph');
    expect(result.statePatch).toEqual({});
  });
});
