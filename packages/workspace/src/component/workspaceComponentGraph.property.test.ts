import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createEmptyPirComponentContract,
  createEmptyPirDocument,
  type PIRComponentContract,
  type PIRComponentInstanceNode,
  type PIRDocument,
  type PIRNode,
} from '@prodivix/pir';
import {
  WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES,
  validateWorkspaceComponentGraph,
} from './workspaceComponentGraph';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
} from '../types';

const propertyParameters = Object.freeze({
  numRuns: 60,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);
const literal = { kind: 'literal', value: 'value' } as const;

type InstanceSpec = Readonly<{
  id: string;
  targetDocumentId: string;
  bindings?: PIRComponentInstanceNode['bindings'];
  regionChildCounts?: Readonly<Record<string, number>>;
}>;

const createPirDocument = (input: {
  componentContract?: PIRComponentContract;
  instances?: readonly InstanceSpec[];
}): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'container' },
  };
  const childIdsById: Record<string, readonly string[]> = { root: [] };
  const regionsById: Record<string, Record<string, readonly string[]>> = {};
  const instanceIds: string[] = [];

  for (const instance of input.instances ?? []) {
    instanceIds.push(instance.id);
    nodesById[instance.id] = {
      id: instance.id,
      kind: 'component-instance',
      componentDocumentId: instance.targetDocumentId,
      bindings: instance.bindings ?? { props: {}, events: {}, variants: {} },
    };
    childIdsById[instance.id] = [];

    const regions: Record<string, readonly string[]> = {};
    for (const [slotId, childCount] of Object.entries(
      instance.regionChildCounts ?? {}
    )) {
      const childIds = Array.from(
        { length: childCount },
        (_, index) => `${instance.id}-${slotId}-${index}`
      );
      regions[slotId] = childIds;
      for (const childId of childIds) {
        nodesById[childId] = {
          id: childId,
          kind: 'element',
          type: 'span',
        };
        childIdsById[childId] = [];
      }
    }
    if (Object.keys(regions).length > 0) regionsById[instance.id] = regions;
  }
  childIdsById.root = instanceIds;

  return {
    ...(input.componentContract
      ? { componentContract: input.componentContract }
      : {}),
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById,
        ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

const createDocument = (
  id: string,
  type: WorkspaceDocumentType,
  content: unknown
): WorkspaceDocument => ({
  id,
  type,
  path: `/${id}.pir.json`,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createSnapshot = (
  documents: readonly WorkspaceDocument[],
  reverse = false
): WorkspaceSnapshot => ({
  id: 'workspace-components',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    },
  },
  docsById: Object.fromEntries(
    (reverse ? [...documents].reverse() : documents).map((document) => [
      document.id,
      document,
    ])
  ),
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const createComponentDocument = (
  documentId: string,
  instances: readonly InstanceSpec[] = [],
  contract: PIRComponentContract = createEmptyPirComponentContract()
) =>
  createDocument(
    documentId,
    'pir-component',
    createPirDocument({ componentContract: contract, instances })
  );

describe('Workspace canonical PIR Component graph properties', () => {
  it('builds the same sorted DAG regardless of Workspace map insertion order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        (componentCount, reverse) => {
          const componentIds = Array.from(
            { length: componentCount },
            (_, index) => `component-${String(index).padStart(2, '0')}`
          );
          const components = componentIds.map((componentId, index) =>
            createComponentDocument(
              componentId,
              index + 1 < componentIds.length
                ? [
                    {
                      id: `instance-${index}`,
                      targetDocumentId: componentIds[index + 1]!,
                    },
                  ]
                : []
            )
          );
          const page = createDocument(
            'page-root',
            'pir-page',
            createPirDocument({
              instances: [
                { id: 'page-instance', targetDocumentId: componentIds[0]! },
              ],
            })
          );
          const documents = [page, ...components];

          const forward = validateWorkspaceComponentGraph(
            createSnapshot(documents)
          );
          const reordered = validateWorkspaceComponentGraph(
            createSnapshot(documents, reverse)
          );

          expect(reordered).toEqual(forward);
          expect(forward.valid).toBe(true);
          expect(forward.issues).toEqual([]);
          expect(forward.graph.componentDocumentIds).toEqual(componentIds);
          expect(forward.graph.componentTopologicalOrder).toEqual(
            [...componentIds].reverse()
          );
          expect(forward.graph.edges).toHaveLength(componentCount);
          expect(
            forward.graph.documents.map(({ documentId }) => documentId)
          ).toEqual([...componentIds, 'page-root'].sort());
          expect(forward.graph.dependenciesByDocumentId['page-root']).toEqual([
            componentIds[0],
          ]);
        }
      ),
      propertyParameters
    );
  });

  it('detects direct and indirect cycles as one stable issue per component SCC', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7 }), (componentCount) => {
        const componentIds = Array.from(
          { length: componentCount },
          (_, index) => `cycle-${String(index).padStart(2, '0')}`
        );
        const documents = componentIds.map((componentId, index) =>
          createComponentDocument(componentId, [
            {
              id: `instance-${index}`,
              targetDocumentId:
                componentIds[(index + 1) % componentIds.length]!,
            },
          ])
        );

        const result = validateWorkspaceComponentGraph(
          createSnapshot(documents, true)
        );
        const cycleIssues = result.issues.filter(
          ({ code }) => code === WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.cycle
        );

        expect(result.valid).toBe(false);
        expect(result.graph.componentTopologicalOrder).toBeNull();
        expect(cycleIssues).toHaveLength(1);
        expect(cycleIssues[0]?.message).toContain(componentIds.join(', '));
      }),
      propertyParameters
    );
  });

  it('enforces every target Contract boundary and required member', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.constantFrom(0, 3, 4),
        fc.boolean(),
        (suffix, bodyChildCount, reverse) => {
          const contract: PIRComponentContract = {
            propsById: {
              requiredProp: {
                id: 'requiredProp',
                name: 'requiredProp',
                typeRef: 'string',
                required: true,
              },
            },
            eventsById: {
              allowedEvent: { id: 'allowedEvent', name: 'allowedEvent' },
            },
            slotsById: {
              body: {
                id: 'body',
                name: 'body',
                minChildren: 1,
                maxChildren: 2,
              },
            },
            variantAxesById: {
              requiredAxis: {
                id: 'requiredAxis',
                name: 'requiredAxis',
                required: true,
                optionsById: { one: { id: 'one', name: 'one' } },
              },
              tone: {
                id: 'tone',
                name: 'tone',
                optionsById: { one: { id: 'one', name: 'one' } },
              },
            },
          };
          const target = createComponentDocument('target', [], contract);
          const source = createDocument(
            'source',
            'pir-page',
            createPirDocument({
              instances: [
                {
                  id: 'instance',
                  targetDocumentId: 'target',
                  bindings: {
                    props: { [`unknown-prop-${suffix}`]: literal },
                    events: {
                      [`unknown-event-${suffix}`]: {
                        kind: 'open-url',
                        href: '/',
                      },
                    },
                    variants: {
                      [`unknown-axis-${suffix}`]: 'unknown-option',
                      tone: 'unknown-option',
                    },
                  },
                  regionChildCounts: {
                    body: bodyChildCount,
                    [`unknown-slot-${suffix}`]: 0,
                  },
                },
              ],
            })
          );

          const result = validateWorkspaceComponentGraph(
            createSnapshot([source, target], reverse)
          );
          const codes = new Set(result.issues.map(({ code }) => code));

          expect(result.valid).toBe(false);
          expect(codes).toEqual(
            new Set([
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.propNotExposed,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.eventNotExposed,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.variantNotExposed,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.variantOptionNotExposed,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.slotNotExposed,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.requiredPropMissing,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.requiredVariantMissing,
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.slotCardinality,
            ])
          );
          expect(result.issues).toEqual(
            [...result.issues].sort(
              (left, right) =>
                left.path.localeCompare(right.path) ||
                left.code.localeCompare(right.code) ||
                left.message.localeCompare(right.message)
            )
          );
        }
      ),
      propertyParameters
    );
  });

  it('resolves consumer slot-prop bindings against the target slot Contract', () => {
    fc.assert(
      fc.property(fc.boolean(), (exposesDensity) => {
        const target = createComponentDocument('target', [], {
          ...createEmptyPirComponentContract(),
          slotsById: {
            body: {
              id: 'body',
              name: 'body',
              propsById: {
                [exposesDensity ? 'density' : 'other']: {
                  id: exposesDensity ? 'density' : 'other',
                  name: exposesDensity ? 'density' : 'other',
                  typeRef: 'string',
                },
              },
            },
          },
        });
        const sourceContent = createPirDocument({
          instances: [
            {
              id: 'instance',
              targetDocumentId: 'target',
              regionChildCounts: { body: 1 },
            },
          ],
        });
        const consumerNodeId = 'instance-body-0';
        const consumerNode = sourceContent.ui.graph.nodesById[consumerNodeId]!;
        if (consumerNode.kind !== 'element') {
          throw new Error('Expected consumer region Element.');
        }
        const source = createDocument('source', 'pir-page', {
          ...sourceContent,
          ui: {
            graph: {
              ...sourceContent.ui.graph,
              nodesById: {
                ...sourceContent.ui.graph.nodesById,
                [consumerNodeId]: {
                  ...consumerNode,
                  text: { kind: 'slot-prop', memberId: 'density' },
                },
              },
            },
          },
        } satisfies PIRDocument);

        const result = validateWorkspaceComponentGraph(
          createSnapshot([source, target])
        );

        expect(result.valid).toBe(exposesDensity);
        expect(
          result.issues.filter(
            ({ code, causeCode }) =>
              code === WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.bindingInvalid &&
              causeCode === 'PIR_SLOT_PROP_MEMBER'
          )
        ).toHaveLength(exposesDensity ? 0 : 1);
      }),
      { ...propertyParameters, numRuns: 12 }
    );
  });

  it('distinguishes missing, wrong-type, invalid, and contractless targets', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'missing' as const,
          'wrong-type' as const,
          'invalid' as const,
          'contractless' as const
        ),
        (scenario) => {
          const source = createDocument(
            'source',
            'pir-layout',
            createPirDocument({
              instances: [{ id: 'instance', targetDocumentId: 'target' }],
            })
          );
          const target =
            scenario === 'missing'
              ? undefined
              : scenario === 'wrong-type'
                ? createDocument('target', 'pir-page', createEmptyPirDocument())
                : scenario === 'invalid'
                  ? createDocument('target', 'pir-component', {})
                  : createDocument(
                      'target',
                      'pir-component',
                      createEmptyPirDocument()
                    );
          const expectedCode = {
            missing: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetMissing,
            'wrong-type': WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetType,
            invalid: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetInvalid,
            contractless:
              WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetContractMissing,
          }[scenario];

          const result = validateWorkspaceComponentGraph(
            createSnapshot(target ? [source, target] : [source])
          );

          expect(result.valid).toBe(false);
          expect(result.issues.map(({ code }) => code)).toEqual(
            scenario === 'contractless'
              ? [
                  expectedCode,
                  WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.documentContractRole,
                ]
              : [expectedCode]
          );
          expect(result.graph.edges).toHaveLength(1);
        }
      ),
      propertyParameters
    );
  });

  it('keeps Component Contract ownership aligned with the Workspace document role', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('component-without-contract', 'page-with-contract'),
        (scenario) => {
          const document =
            scenario === 'component-without-contract'
              ? createDocument(
                  'component',
                  'pir-component',
                  createEmptyPirDocument()
                )
              : createDocument(
                  'page',
                  'pir-page',
                  createEmptyPirDocument({
                    componentContract: createEmptyPirComponentContract(),
                  })
                );

          const result = validateWorkspaceComponentGraph(
            createSnapshot([document])
          );

          expect(result.valid).toBe(false);
          expect(result.issues).toEqual([
            expect.objectContaining({
              code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.documentContractRole,
              documentId: document.id,
            }),
          ]);
        }
      ),
      { ...propertyParameters, numRuns: 8 }
    );
  });
});
