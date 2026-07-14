import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNodeGraphExecutor, decodeNodeGraphDocument } from '..';
import type { NodeGraphDocument, NodeGraphExecutionRequest } from '..';

const propertyParameters = Object.freeze({
  numRuns: 250,
  seed: 0x13_07_2026,
});

const request: NodeGraphExecutionRequest = {
  documentId: 'graph-document',
  requestId: 'property-request',
  source: {
    ownerId: 'property-owner',
    trigger: 'onClick',
    eventKey: 'click',
  },
  params: {},
};

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
    version: 1,
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

describe('NodeGraph properties', () => {
  it('executes arbitrary valid linear documents deterministically', async () => {
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
          expect(first.trace[0]?.detail).toMatchObject({
            documentId: request.documentId,
          });
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
            version: 1,
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

  it('strictly round-trips canonical documents and rejects legacy identity fields', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), {
          maxLength: 20,
        }),
        (nodeIds) => {
          const canonical = {
            version: 1,
            nodes: nodeIds.map((id) => ({ id, data: {} })),
            edges: [],
          };
          const decoded = decodeNodeGraphDocument(canonical);
          expect(decoded).toEqual({ ok: true, value: canonical });
          expect(
            decodeNodeGraphDocument({ ...canonical, id: 'legacy-graph' }).ok
          ).toBe(false);
        }
      ),
      propertyParameters
    );
  });

  it('keeps code source in Workspace artifacts while round-tripping typed executor nodes', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        (nodeId, artifactId) => {
          const canonical: NodeGraphDocument = {
            version: 1,
            nodes: [
              {
                id: nodeId,
                data: { kind: 'code' },
                ports: [
                  {
                    id: 'in.data.value',
                    direction: 'input',
                    kind: 'data',
                    typeRef: 'unknown',
                  },
                  {
                    id: 'out.data.value',
                    direction: 'output',
                    kind: 'data',
                    typeRef: 'unknown',
                  },
                ],
                executor: {
                  slotId: `nodegraph-code-slot:${nodeId}`,
                  reference: { artifactId },
                },
              },
            ],
            edges: [],
          };

          expect(decodeNodeGraphDocument(canonical)).toEqual({
            ok: true,
            value: canonical,
          });
          expect(
            decodeNodeGraphDocument({
              ...canonical,
              nodes: [
                {
                  ...canonical.nodes[0],
                  data: { kind: 'code', code: 'return input;' },
                },
              ],
            }).ok
          ).toBe(false);
        }
      ),
      propertyParameters
    );
  });

  it('never throws for arbitrary JSON-shaped input', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 6 }), (value) => {
        const decoded = decodeNodeGraphDocument(value);
        if (!decoded.ok) {
          expect(decoded.issues.length).toBeGreaterThan(0);
          return;
        }
        expect(decodeNodeGraphDocument(decoded.value)).toEqual(decoded);
      }),
      { ...propertyParameters, numRuns: 500 }
    );
  });
});
