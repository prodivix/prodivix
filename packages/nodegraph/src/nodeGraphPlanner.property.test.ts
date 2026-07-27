import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  createNodeGraphDescriptorRegistry,
  type NodeGraphDescriptor,
  type NodeGraphDescriptorRegistry,
  type NodeGraphDocument,
  type NodeGraphNode,
} from './index';
import {
  controlPort,
  dataPort,
  edge,
  node,
} from './__tests__/nodeGraphTestFixtures';

const DIGEST = `sha256-${'a'.repeat(64)}`;

const descriptor = (
  id: string,
  overrides: Partial<NodeGraphDescriptor> = {}
): NodeGraphDescriptor => ({
  id: id.startsWith('core.') ? id : `core.${id}`,
  version: '1',
  executorId: `executor.${id}`,
  implementationDigest: DIGEST,
  configurationSchemaDigest: DIGEST,
  effect: 'pure',
  runtimeZones: ['client', 'test'],
  requiredCapabilities: [],
  codeSlot: 'forbidden',
  entry: false,
  terminal: false,
  ...overrides,
});

const registry = (
  descriptors: readonly NodeGraphDescriptor[]
): NodeGraphDescriptorRegistry => {
  const result = createNodeGraphDescriptorRegistry(descriptors);
  if (!result.ok) {
    throw new Error(result.issues.map(({ message }) => message).join('\n'));
  }
  return result.registry;
};

const descriptors = [
  descriptor('start', { entry: true }),
  descriptor('constant'),
  descriptor('map'),
  descriptor('process'),
  descriptor('end', { terminal: true }),
] as const;

const graph = (): NodeGraphDocument => ({
  nodes: [
    node('start', 'start', [controlPort('out.control.next', 'output', false)]),
    node(
      'constant',
      'constant',
      [dataPort('out.data.value', 'output', 'number', false, 'multiple')],
      { value: 2 }
    ),
    node(
      'map',
      'map',
      [
        controlPort('in.control.prev', 'input', true),
        controlPort('out.control.next', 'output', false),
        dataPort('in.data.value', 'input', 'number', true),
      ],
      {}
    ),
    node('end', 'end', [controlPort('in.control.prev', 'input', true)]),
  ],
  edges: [
    edge(
      'control-start-map',
      'start',
      'out.control.next',
      'map',
      'in.control.prev'
    ),
    edge(
      'data-constant-map',
      'constant',
      'out.data.value',
      'map',
      'in.data.value'
    ),
    edge(
      'control-map-end',
      'map',
      'out.control.next',
      'end',
      'in.control.prev'
    ),
  ],
});

const compile = (
  definition: NodeGraphDocument,
  descriptorRegistry = registry(descriptors),
  overrides: Partial<Parameters<typeof compileNodeGraphProgram>[0]> = {}
) =>
  compileNodeGraphProgram({
    documentId: 'graph-document',
    documentRevision: 7,
    graph: definition,
    registry: descriptorRegistry,
    runtimeZone: 'test',
    availableCapabilities: [],
    ...overrides,
  });

describe('NodeGraph typed planner properties', () => {
  it('produces one byte-stable dependency-wave Program independent of insertion order', () => {
    const forward = compile(graph(), registry(descriptors));
    const reversedGraph = graph();
    reversedGraph.nodes.reverse();
    reversedGraph.edges.reverse();
    const map = reversedGraph.nodes.find(({ id }) => id === 'map')!;
    map.configuration = {};
    const reversed = compile(
      reversedGraph,
      registry([...descriptors].reverse())
    );

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      ok: true,
      program: {
        requiredCapabilities: [],
        executionWaves: [['constant', 'start'], ['map'], ['end']],
      },
    });
    if (forward.ok) {
      expect(forward.program.programDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(forward.program.sourceTrace).toContainEqual({
        kind: 'port',
        id: 'map:in.data.value',
        sourcePath: '/nodesById/map/portsById/in.data.value',
      });
    }
  });

  it('fails closed for legacy handles, type drift, required inputs, and cardinality drift', () => {
    const legacy = graph();
    legacy.edges[0]!.source.portId = '';
    expect(compile(legacy)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-edge' }),
      ]),
    });

    const typeDrift = graph();
    typeDrift.nodes
      .find(({ id }) => id === 'map')!
      .ports.find(({ id }) => id === 'in.data.value')!.typeRef = 'string';
    expect(compile(typeDrift)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'incompatible-port' }),
      ]),
    });

    const missingInput = graph();
    missingInput.edges = missingInput.edges.filter(
      ({ id }) => id !== 'data-constant-map'
    );
    expect(compile(missingInput)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'required-input-missing' }),
      ]),
    });

    const multipleInputs = graph();
    multipleInputs.nodes.push(
      node(
        'constant-two',
        'constant',
        [dataPort('out.data.value', 'output', 'number', false, 'multiple')],
        { value: 3 }
      )
    );
    multipleInputs.edges.push(
      edge(
        'data-constant-two-map',
        'constant-two',
        'out.data.value',
        'map',
        'in.data.value'
      )
    );
    expect(compile(multipleInputs)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'cardinality-violation' }),
      ]),
    });
  });

  it('rejects cycles, unreachable nodes, runtime-zone drift, and missing capabilities', () => {
    const cyclic = graph();
    cyclic.nodes
      .find(({ id }) => id === 'end')!
      .ports.push(controlPort('out.control.loop', 'output', false));
    cyclic.edges.push(
      edge(
        'control-end-map',
        'end',
        'out.control.loop',
        'map',
        'in.control.prev'
      )
    );
    expect(compile(cyclic)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'cycle' }),
        expect.objectContaining({ code: 'terminal-has-outgoing-control' }),
      ]),
    });

    const unreachable = graph();
    unreachable.nodes.push(
      node('orphan', 'process', [
        controlPort('in.control.prev', 'input', false),
        controlPort('out.control.next', 'output', false),
      ])
    );
    expect(compile(unreachable)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'unreachable-node' }),
      ]),
    });

    const restricted = registry([
      ...descriptors.filter(({ id }) => id !== 'core.map'),
      descriptor('map', {
        runtimeZones: ['server'],
        requiredCapabilities: ['data:read'],
      }),
    ]);
    expect(
      compile(graph(), restricted, {
        runtimeZone: 'client',
        availableCapabilities: [],
      })
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'runtime-zone-incompatible' }),
        expect.objectContaining({ code: 'capability-unavailable' }),
      ]),
    });
  });

  it('rejects accessor-backed or unsafe configuration without reading it', () => {
    const definition = graph();
    const getter = fc.sample(fc.string(), 1)[0] ?? 'secret';
    let reads = 0;
    const configuration = {} as Record<string, unknown>;
    Object.defineProperty(configuration, 'unsafe', {
      enumerable: true,
      get() {
        reads += 1;
        return getter;
      },
    });
    definition.nodes.find(({ id }) => id === 'map')!.configuration =
      configuration;

    expect(compile(definition)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-configuration' }),
      ]),
    });
    expect(reads).toBe(0);
  });

  it('is deterministic for arbitrary bounded linear typed DAGs', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/u), {
          minLength: 1,
          maxLength: 30,
        }),
        (ids) => {
          const processNodes: NodeGraphNode[] = ids.map((id) =>
            node(
              `process-${id}`,
              'process',
              [
                controlPort('in.control.prev', 'input', true),
                controlPort('out.control.next', 'output', false),
              ],
              { label: id }
            )
          );
          const nodes: NodeGraphNode[] = [
            node('start', 'start', [
              controlPort('out.control.next', 'output', false),
            ]),
            ...processNodes,
            node('end', 'end', [controlPort('in.control.prev', 'input', true)]),
          ];
          const definition: NodeGraphDocument = {
            nodes,
            edges: nodes
              .slice(0, -1)
              .map((graphNode, index) =>
                edge(
                  `edge-${index}`,
                  graphNode.id,
                  'out.control.next',
                  nodes[index + 1]!.id,
                  'in.control.prev'
                )
              ),
          };
          const forward = compile(definition);
          const reversed = compile({
            ...definition,
            nodes: [...definition.nodes].reverse(),
            edges: [...definition.edges].reverse(),
          });
          expect(forward).toEqual(reversed);
          expect(forward.ok).toBe(true);
          if (forward.ok) {
            expect(forward.program.executionWaves).toHaveLength(
              processNodes.length + 2
            );
          }
        }
      ),
      { numRuns: 120, seed: 0x27_07_2026 }
    );
  });

  it('binds an exact subgraph dependency closure and rejects drift, cycles, and escalation', () => {
    const contractDigest = `sha256-${'b'.repeat(64)}`;
    const programDigest = `sha256-${'c'.repeat(64)}`;
    const definition: NodeGraphDocument = {
      nodes: [
        node('start', 'start', [
          controlPort('out.control.next', 'output'),
          dataPort('out.data.value', 'output', 'json'),
        ]),
        node(
          'call',
          'subgraph.call',
          [
            controlPort('in.control.prev', 'input', true),
            dataPort('in.data.value', 'input', 'json', true),
            controlPort('out.control.next', 'output'),
            dataPort('out.data.value', 'output', 'json'),
          ],
          {
            documentId: 'child-graph',
            expectedDocumentRevision: 4,
            expectedContractDigest: contractDigest,
            requiredCapabilities: ['server:invoke'],
          }
        ),
        node('end', 'end', [
          controlPort('in.control.prev', 'input', true),
          dataPort('in.data.value', 'input', 'json', true),
        ]),
      ],
      edges: [
        edge(
          'start-call-control',
          'start',
          'out.control.next',
          'call',
          'in.control.prev'
        ),
        edge(
          'start-call-data',
          'start',
          'out.data.value',
          'call',
          'in.data.value'
        ),
        edge(
          'call-end-control',
          'call',
          'out.control.next',
          'end',
          'in.control.prev'
        ),
        edge('call-end-data', 'call', 'out.data.value', 'end', 'in.data.value'),
      ],
    };
    const child = {
      documentId: 'child-graph',
      documentRevision: 4,
      contractDigest,
      programDigest,
      requiredCapabilities: ['server:invoke'],
      dependencyDocumentIds: ['leaf-graph'],
    } as const;
    const leaf = {
      documentId: 'leaf-graph',
      documentRevision: 2,
      contractDigest: `sha256-${'d'.repeat(64)}`,
      programDigest: `sha256-${'e'.repeat(64)}`,
      requiredCapabilities: [],
      dependencyDocumentIds: [],
    } as const;
    const compileClosure = (
      resolvedSubgraphs: Parameters<
        typeof compileNodeGraphProgram
      >[0]['resolvedSubgraphs'],
      availableCapabilities: readonly string[] = [
        'nodegraph:invoke',
        'server:invoke',
      ]
    ) =>
      compileNodeGraphProgram({
        documentId: 'graph-document',
        documentRevision: 7,
        graph: definition,
        registry: createFirstPartyNodeGraphDescriptorRegistry(),
        runtimeZone: 'test',
        availableCapabilities,
        resolvedSubgraphs,
      });

    const compiled = compileClosure([leaf, child]);
    expect(compiled).toMatchObject({
      ok: true,
      program: {
        requiredCapabilities: ['nodegraph:invoke', 'server:invoke'],
        resolvedSubgraphs: [
          { documentId: 'child-graph', documentRevision: 4 },
          { documentId: 'leaf-graph', documentRevision: 2 },
        ],
        resourcePlan: {
          maximumParallelism: 1,
          effectNodeIds: ['call'],
        },
      },
    });

    expect(
      compileClosure([{ ...child, documentRevision: 5 }, leaf])
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'subgraph-revision-drift' }),
      ]),
    });
    expect(
      compileClosure([{ ...child, dependencyDocumentIds: ['graph-document'] }])
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'subgraph-dependency-cycle' }),
      ]),
    });
    expect(compileClosure([child, leaf], ['nodegraph:invoke'])).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'subgraph-capability-escalation' }),
      ]),
    });
  });
});
