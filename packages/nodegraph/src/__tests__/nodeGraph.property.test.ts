import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createNodeGraphExecutor,
  decodeNodeGraphDocument,
  encodeNodeGraphDocument,
  nodeGraphWireMigrationIsDeterministic,
  validateNodeGraphDocument,
} from '..';
import type { NodeGraphDocument, NodeGraphExecutionRequest } from '..';
import {
  controlPort,
  edge,
  linearControlGraph,
  node,
} from './nodeGraphTestFixtures';

const propertyParameters = Object.freeze({
  numRuns: 250,
  seed: 0x13_07_2026,
});

const migrationFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../specs/nodegraph/fixtures/nodegraph-v1-to-v2.json',
      import.meta.url
    ),
    'utf8'
  )
) as Readonly<{ source: unknown; expected: unknown }>;

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

const createLinearGraph = (messages: string[]): NodeGraphDocument =>
  linearControlGraph([
    { id: 'start', descriptorId: 'start' },
    ...messages.map((message, index) => ({
      id: `log-${index}`,
      descriptorId: 'log',
      configuration: { description: message },
    })),
    { id: 'end', descriptorId: 'end' },
  ]);

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
            nodes: [
              node('start', 'start', [
                controlPort('in.control.loop', 'input'),
                controlPort('out.control.next', 'output'),
              ]),
            ],
            edges: [
              edge(
                'loop',
                'start',
                'out.control.next',
                'start',
                'in.control.loop'
              ),
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

  it('fails closed for unknown executors and dangling control-flow targets', async () => {
    const execute = createNodeGraphExecutor();
    await expect(
      execute(
        {
          nodes: [
            node('unknown', 'not-registered', [
              controlPort('out.control.next', 'output'),
            ]),
          ],
          edges: [],
        },
        request
      )
    ).resolves.toMatchObject({
      status: 'unsupported-node',
      steps: 1,
    });
    await expect(
      execute(
        {
          nodes: [
            node('start', 'start', [controlPort('out.control.next', 'output')]),
          ],
          edges: [
            edge(
              'dangling',
              'start',
              'out.control.next',
              'missing',
              'in.control.prev'
            ),
          ],
        },
        request
      )
    ).resolves.toMatchObject({
      status: 'missing-target',
      steps: 1,
    });
  });

  it('round-trips the version-neutral current model through wire v2', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), {
          maxLength: 20,
        }),
        (nodeIds) => {
          const canonical: NodeGraphDocument = {
            nodes: nodeIds.map((id) =>
              node(id, 'process', [
                controlPort('in.control.prev', 'input'),
                controlPort('out.control.next', 'output'),
              ])
            ),
            edges: [],
          };
          const wire = encodeNodeGraphDocument(canonical);
          expect(wire).toMatchObject({ version: 2 });
          const decoded = decodeNodeGraphDocument(wire);
          expect(decoded).toMatchObject({
            ok: true,
            value: canonical,
            sourceWireVersion: 2,
            appliedMigrations: [],
          });
          expect(validateNodeGraphDocument(canonical)).toEqual({
            ok: true,
            value: canonical,
          });
        }
      ),
      propertyParameters
    );
  });

  it('migrates unambiguous v1 edges and rejects ambiguous node-level edges', () => {
    const legacy = migrationFixture.source;
    expect(decodeNodeGraphDocument(legacy)).toMatchObject({
      ok: true,
      sourceWireVersion: 1,
      appliedMigrations: [{ fromVersion: 1, toVersion: 2 }],
      value: {
        nodes: [
          { descriptorRef: { id: 'core.start', version: '1' } },
          { descriptorRef: { id: 'core.end', version: '1' } },
        ],
        edges: [
          {
            source: { nodeId: 'start', portId: 'out.control.next' },
            target: { nodeId: 'end', portId: 'in.control.prev' },
          },
        ],
      },
    });
    expect(nodeGraphWireMigrationIsDeterministic(legacy)).toBe(true);
    const migrated = decodeNodeGraphDocument(legacy);
    expect(migrated.ok && encodeNodeGraphDocument(migrated.value)).toEqual(
      migrationFixture.expected
    );

    const ambiguous = {
      version: 1,
      nodes: [
        {
          id: 'source',
          data: { kind: 'process' },
          ports: [
            {
              id: 'out.control.first',
              direction: 'output',
              kind: 'control',
            },
            {
              id: 'out.control.second',
              direction: 'output',
              kind: 'control',
            },
          ],
        },
        { id: 'end', data: { kind: 'end' } },
      ],
      edges: [{ id: 'edge', source: 'source', target: 'end' }],
    };
    expect(decodeNodeGraphDocument(ambiguous)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/edges/0/sourceHandle',
          message: expect.stringContaining('ambiguous'),
        }),
      ]),
    });
  });

  it('keeps code source in Workspace artifacts while round-tripping CodeSlot nodes', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        (nodeId, artifactId) => {
          const canonical: NodeGraphDocument = {
            nodes: [
              {
                ...node(nodeId, 'code', [
                  controlPort('in.control.prev', 'input'),
                  controlPort('out.control.next', 'output'),
                ]),
                codeSlot: {
                  slotId: `nodegraph-code-slot:${nodeId}`,
                  reference: { artifactId },
                },
              },
            ],
            edges: [],
          };

          expect(
            decodeNodeGraphDocument(encodeNodeGraphDocument(canonical))
          ).toMatchObject({
            ok: true,
            value: canonical,
          });
          expect(
            validateNodeGraphDocument({
              ...canonical,
              nodes: [
                {
                  ...canonical.nodes[0],
                  configuration: { code: 'return input;' },
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
        expect(
          decodeNodeGraphDocument(encodeNodeGraphDocument(decoded.value))
        ).toMatchObject({ ok: true, value: decoded.value });
      }),
      { ...propertyParameters, numRuns: 500 }
    );
  });
});
