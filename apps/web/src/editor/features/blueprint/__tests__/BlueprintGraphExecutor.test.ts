import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultNodeGraphNodeExecutorRegistry,
  createNodeGraphExecutor,
} from '@prodivix/nodegraph';
import { executeNodeGraphAction } from '@prodivix/runtime-browser';

const request = {
  nodeId: 'button-1',
  trigger: 'onClick',
  eventKey: 'click',
  params: { graphId: 'main' },
};

describe('Blueprint NodeGraph execution adapter', () => {
  it('executes directly and exposes log trace through an explicit Web port', async () => {
    const onLog = vi.fn();
    const result = await executeNodeGraphAction(
      [
        {
          id: 'main',
          nodes: [
            { id: 'start', data: { kind: 'start' } },
            { id: 'log', data: { kind: 'log', description: 'hello' } },
            { id: 'end', data: { kind: 'end' } },
          ],
          edges: [
            {
              id: 'edge-1',
              source: 'start',
              target: 'log',
              sourceHandle: 'out.control.next',
              targetHandle: 'in.control.prev',
            },
            {
              id: 'edge-2',
              source: 'log',
              target: 'end',
              sourceHandle: 'out.control.next',
              targetHandle: 'in.control.prev',
            },
          ],
        },
      ],
      request,
      { onLog, createRequestId: () => 'request-1' }
    );

    expect(result.status).toBe('completed');
    expect(onLog).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        kind: 'log',
      })
    );
  });

  it('applies state patches from an instance-scoped custom executor', async () => {
    const registry = createDefaultNodeGraphNodeExecutorRegistry();
    registry.register('set-state', () => ({
      statePatch: { products: [{ id: 'p-1' }] },
      stop: true,
    }));
    const result = await executeNodeGraphAction(
      [
        {
          id: 'main',
          nodes: [{ id: 'set', data: { kind: 'set-state' } }],
          edges: [],
        },
      ],
      request,
      {
        executor: createNodeGraphExecutor({ registry }),
        createRequestId: () => 'request-2',
      }
    );

    expect(result.statePatch).toEqual({ products: [{ id: 'p-1' }] });
  });

  it('fails closed for invalid persisted graph data', async () => {
    const result = await executeNodeGraphAction(
      [{ id: 'main', nodes: [], edges: [{ id: 'dangling' }] }],
      request
    );

    expect(result.status).toBe('invalid-document');
    expect(result.statePatch).toEqual({});
  });

  it('does not execute another graph when an explicit graph id is missing', async () => {
    const result = await executeNodeGraphAction(
      [{ id: 'other', nodes: [], edges: [] }],
      request
    );

    expect(result.status).toBe('no-graph');
    expect(result.statePatch).toEqual({});
  });
});
