import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createNodeGraphExecutor,
  decodeNodeGraphDocuments,
  selectNodeGraphDocument,
} from '..';
import type { NodeGraphDocument, NodeGraphExecutionRequest } from '..';

const propertyParameters = Object.freeze({
  numRuns: 500,
  seed: 0x13_07_2026,
});

const request: NodeGraphExecutionRequest = {
  requestId: 'property-request',
  source: {
    ownerId: 'property-owner',
    trigger: 'onClick',
    eventKey: 'click',
  },
};

const graphId = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/);

const createLinearGraph = (messages: string[]): NodeGraphDocument => {
  const nodes: NodeGraphDocument['nodes'] = [
    { id: 'start', data: { kind: 'start' } },
    ...messages.map((message, index) => ({
      id: `log-${index}`,
      data: { kind: 'log', description: message },
    })),
    { id: 'end', data: { kind: 'end' } },
  ];
  return {
    id: 'main',
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `edge-${index}`,
      source: node.id,
      target: nodes[index + 1]!.id,
      sourceHandle: 'out.control.next',
      targetHandle: 'in.control.prev',
    })),
  };
};

describe('NodeGraph execution properties', () => {
  it('is deterministic for arbitrary valid linear graphs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ maxLength: 80, unit: 'grapheme' }), {
          maxLength: 20,
        }),
        async (messages) => {
          const graph = createLinearGraph(messages);
          const execute = createNodeGraphExecutor();

          const first = await execute(graph, request);
          const second = await execute(graph, request);

          expect(first).toEqual(second);
          expect(first.status).toBe('completed');
          expect(first.steps).toBe(messages.length + 2);
        }
      ),
      propertyParameters
    );
  });

  it('never exceeds an arbitrary positive step budget', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (maxSteps) => {
        const execute = createNodeGraphExecutor({ maxSteps });
        const result = await execute(
          {
            id: 'cycle',
            nodes: [{ id: 'start', data: { kind: 'start' } }],
            edges: [
              {
                id: 'loop',
                source: 'start',
                target: 'start',
                sourceHandle: 'out.control.next',
                targetHandle: 'in.control.prev',
              },
            ],
          },
          request
        );

        expect(result.status).toBe('max-steps');
        expect(result.steps).toBe(maxSteps);
      }),
      propertyParameters
    );
  });

  it('does not fall back when arbitrary explicit graph ids are absent', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(graphId, { minLength: 1, maxLength: 20 }),
        graphId,
        (ids, requestedId) => {
          fc.pre(!ids.includes(requestedId));
          const documents = ids.map((id) => ({
            id,
            nodes: [],
            edges: [],
          }));

          expect(
            selectNodeGraphDocument(documents, { graphId: requestedId })
          ).toBeNull();
        }
      ),
      propertyParameters
    );
  });

  it('never throws for arbitrary JSON-shaped graph input', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 6 }), (value) => {
        const decoded = decodeNodeGraphDocuments(value);
        if (!decoded.ok) {
          expect(decoded.issues.length).toBeGreaterThan(0);
          return;
        }
        expect(decodeNodeGraphDocuments(decoded.value)).toEqual(decoded);
      }),
      { ...propertyParameters, numRuns: 1_000 }
    );
  });
});
