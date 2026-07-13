import { describe, expect, it } from 'vitest';
import {
  createDefaultNodeGraphNodeExecutorRegistry,
  createNodeGraphExecutor,
} from '..';
import type { NodeGraphDocument, NodeGraphExecutionRequest } from '..';

const request: NodeGraphExecutionRequest = {
  requestId: 'request-1',
  source: {
    ownerId: 'button-1',
    trigger: 'onClick',
    eventKey: 'click',
  },
};

const createGraph = (
  nodes: NodeGraphDocument['nodes'],
  edges: NodeGraphDocument['edges']
): NodeGraphDocument => ({ id: 'main', name: 'Main', nodes, edges });

describe('NodeGraph executor', () => {
  it('runs start -> log -> end and reports log data through deterministic trace', async () => {
    const execute = createNodeGraphExecutor();
    const result = await execute(
      createGraph(
        [
          { id: 'start', data: { kind: 'start', value: 'input' } },
          { id: 'log', data: { kind: 'log', description: 'hello' } },
          { id: 'end', data: { kind: 'end' } },
        ],
        [
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
        ]
      ),
      request
    );

    expect(result.status).toBe('completed');
    expect(result.steps).toBe(3);
    expect(result.output).toBe('hello');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        kind: 'log',
        detail: expect.objectContaining({ value: 'hello' }),
      })
    );
  });

  it('stops on unsupported nodes instead of silently passing through', async () => {
    const execute = createNodeGraphExecutor();
    const result = await execute(
      createGraph([{ id: 'unknown', data: { kind: 'not-registered' } }], []),
      request
    );

    expect(result.status).toBe('unsupported-node');
    expect(result.trace.at(-1)?.detail).toMatchObject({
      nodeId: 'unknown',
      nodeKind: 'not-registered',
    });
  });

  it('supports instance-scoped custom executors and merges state patches', async () => {
    const registry = createDefaultNodeGraphNodeExecutorRegistry();
    registry.register('set-state', () => ({
      statePatch: { count: 2 },
      stop: true,
    }));
    const execute = createNodeGraphExecutor({ registry });
    const result = await execute(
      createGraph([{ id: 'set', data: { kind: 'set-state' } }], []),
      request
    );

    expect(result.status).toBe('completed');
    expect(result.statePatch).toEqual({ count: 2 });
  });

  it('enforces a deterministic step budget for cycles', async () => {
    const execute = createNodeGraphExecutor({ maxSteps: 2 });
    const result = await execute(
      createGraph(
        [{ id: 'start', data: { kind: 'start' } }],
        [
          {
            id: 'loop',
            source: 'start',
            target: 'start',
            sourceHandle: 'out.control.next',
            targetHandle: 'in.control.prev',
          },
        ]
      ),
      request
    );

    expect(result.status).toBe('max-steps');
    expect(result.steps).toBe(2);
  });
});
