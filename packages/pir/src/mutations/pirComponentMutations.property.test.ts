import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodePirDocument } from '../codec/pirCodec';
import {
  type PIRComponentContract,
  type PIRComponentInstanceNode,
  type PIRDocument,
  type PIRNode,
} from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  insertPirComponentInstance,
  replacePirComponentContract,
  replacePirSubtreeWithComponentInstance,
  updatePirComponentContract,
  type InsertPIRComponentInstanceInput,
  type PIRComponentSlotRegions,
} from './pirComponentMutations';

const propertyParameters = Object.freeze({
  numRuns: 40,
  seed: 0x14_07_2026,
});

const orderedRecord = <T>(
  entries: readonly (readonly [string, T])[],
  reverse: boolean
): Readonly<Record<string, T>> =>
  Object.fromEntries(reverse ? [...entries].reverse() : entries);

const createSourceDocument = (reverse: boolean): PIRDocument => {
  const nodes: readonly (readonly [string, PIRNode])[] = [
    ['root', { id: 'root', kind: 'element', type: 'main' }],
    ['before', { id: 'before', kind: 'element', type: 'header' }],
    ['panel', { id: 'panel', kind: 'element', type: 'section' }],
    ['body', { id: 'body', kind: 'element', type: 'div' }],
    ['nested', { id: 'nested', kind: 'element', type: 'span' }],
    ['after', { id: 'after', kind: 'element', type: 'footer' }],
    [
      'collection',
      {
        id: 'collection',
        kind: 'collection',
        source: { kind: 'literal', value: [] },
        key: { kind: 'index' },
        symbols: {
          itemId: 'collection-item',
          itemName: 'item',
          indexId: 'collection-index',
          indexName: 'index',
        },
      },
    ],
    ['card', { id: 'card', kind: 'element', type: 'article' }],
    ['badge', { id: 'badge', kind: 'element', type: 'strong' }],
  ];
  const childIds: readonly (readonly [string, readonly string[]])[] = [
    ['root', ['before', 'panel', 'collection', 'after']],
    ['before', []],
    ['panel', ['body']],
    ['body', ['nested']],
    ['nested', []],
    ['after', []],
    ['collection', []],
    ['card', ['badge']],
    ['badge', []],
  ];
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById: orderedRecord(nodes, reverse),
        childIdsById: orderedRecord(childIds, reverse),
        regionsById: {
          collection: { item: ['card'] },
        },
      },
    },
  };
};

const createInstance = (
  id: string,
  propMemberId = 'prop-title'
): PIRComponentInstanceNode => ({
  id,
  kind: 'component-instance',
  componentDocumentId: 'component-card',
  bindings: {
    props: {
      [propMemberId]: { kind: 'literal', value: 'Card' },
    },
    events: {},
    variants: {},
  },
});

const assertCanonicalGraph = (document: PIRDocument): void => {
  expect(validatePirDocument(document)).toMatchObject({ valid: true });
  const graph = document.ui.graph;
  const parentCounts = new Map<string, number>();
  const register = (childId: string): void => {
    expect(graph.nodesById[childId]).toBeDefined();
    parentCounts.set(childId, (parentCounts.get(childId) ?? 0) + 1);
  };
  Object.values(graph.childIdsById).forEach((childIds) =>
    childIds.forEach(register)
  );
  Object.values(graph.regionsById ?? {}).forEach((regions) =>
    Object.values(regions).forEach((childIds) => childIds.forEach(register))
  );
  for (const nodeId of Object.keys(graph.nodesById)) {
    expect(parentCounts.get(nodeId) ?? 0).toBe(nodeId === graph.rootId ? 0 : 1);
  }

  const reachable = new Set<string>();
  const pending = [graph.rootId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    pending.push(...(graph.childIdsById[nodeId] ?? []));
    Object.values(graph.regionsById?.[nodeId] ?? {}).forEach((childIds) =>
      pending.push(...childIds)
    );
  }
  expect([...reachable].sort()).toEqual(Object.keys(graph.nodesById).sort());
};

describe('PIR-current Component mutations properties', () => {
  it('inserts instances deterministically and atomically reparents slot roots', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 4 }),
        (suffix, namedTarget, withSlot, requestedIndex) => {
          const instanceId = `instance-${suffix}`;
          const source = createSourceDocument(false);
          const sourceBefore = encodePirDocument(source);
          const target = namedTarget
            ? {
                parentId: 'collection',
                regionName: 'item',
                index: Math.min(requestedIndex, 1),
              }
            : { parentId: 'root', index: requestedIndex };
          const slotRegions: PIRComponentSlotRegions = withSlot
            ? { 'slot-content': ['panel'] }
            : {};
          const input: InsertPIRComponentInstanceInput = {
            document: source,
            instance: createInstance(instanceId),
            target,
            slotRegions,
          };
          const result = insertPirComponentInstance(input);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(encodePirDocument(source)).toBe(sourceBefore);
          expect(result).toEqual(
            insertPirComponentInstance({
              ...input,
              document: createSourceDocument(true),
            })
          );

          const graph = result.document.ui.graph;
          expect(graph.nodesById[instanceId]).toEqual(
            createInstance(instanceId)
          );
          expect(graph.childIdsById[instanceId]).toEqual([]);
          if (withSlot) {
            expect(graph.regionsById?.[instanceId]).toEqual({
              'slot-content': ['panel'],
            });
            expect(result.relocatedChildNodeIds).toEqual(['panel']);
          } else {
            expect(graph.regionsById?.[instanceId]).toBeUndefined();
            expect(result.relocatedChildNodeIds).toEqual([]);
          }

          if (namedTarget) {
            const expected = ['card'];
            expected.splice(target.index, 0, instanceId);
            expect(graph.regionsById?.collection?.item).toEqual(expected);
            expect(graph.childIdsById.root).toEqual(
              withSlot
                ? ['before', 'collection', 'after']
                : ['before', 'panel', 'collection', 'after']
            );
          } else {
            const expected = ['before', 'panel', 'collection', 'after'];
            if (withSlot) expected.splice(1, 1);
            const adjustedIndex =
              target.index - (withSlot && target.index > 1 ? 1 : 0);
            expected.splice(adjustedIndex, 0, instanceId);
            expect(graph.childIdsById.root).toEqual(expected);
            expect(result.placement.index).toBe(adjustedIndex);
          }
          assertCanonicalGraph(result.document);
        }
      ),
      propertyParameters
    );
  });

  it('creates the first named region on an empty Component Instance slot', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/), (suffix) => {
        const host = createInstance(`host-${suffix}`);
        const document: PIRDocument = {
          ui: {
            graph: {
              rootId: 'root',
              nodesById: {
                root: { id: 'root', kind: 'element', type: 'main' },
                [host.id]: host,
              },
              childIdsById: { root: [host.id], [host.id]: [] },
            },
          },
        };
        const nested = createInstance(`nested-${suffix}`);
        const result = insertPirComponentInstance({
          document,
          instance: nested,
          target: {
            parentId: host.id,
            regionName: 'slot-content',
            index: 0,
          },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(
          result.document.ui.graph.regionsById?.[host.id]?.['slot-content']
        ).toEqual([nested.id]);
        assertCanonicalGraph(result.document);
      }),
      propertyParameters
    );
  });

  it('replaces complete default or named-region subtrees at their exact placement', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        fc.boolean(),
        fc.boolean(),
        (suffix, namedPlacement, reuseRootId) => {
          const source = createSourceDocument(false);
          const subtreeRootId = namedPlacement ? 'card' : 'panel';
          const instanceId = reuseRootId
            ? subtreeRootId
            : `replacement-${suffix}`;
          const result = replacePirSubtreeWithComponentInstance({
            document: source,
            subtreeRootId,
            instance: createInstance(instanceId),
          });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result).toEqual(
            replacePirSubtreeWithComponentInstance({
              document: createSourceDocument(true),
              subtreeRootId,
              instance: createInstance(instanceId),
            })
          );

          if (namedPlacement) {
            expect(result.placement).toEqual({
              parentId: 'collection',
              regionName: 'item',
              index: 0,
            });
            expect(result.removedNodeIds).toEqual(['badge', 'card']);
            expect(
              result.document.ui.graph.regionsById?.collection?.item
            ).toEqual([instanceId]);
            if (instanceId !== 'card') {
              expect(result.document.ui.graph.nodesById.card).toBeUndefined();
            }
            expect(result.document.ui.graph.nodesById.badge).toBeUndefined();
          } else {
            expect(result.placement).toEqual({ parentId: 'root', index: 1 });
            expect(result.removedNodeIds).toEqual(['body', 'nested', 'panel']);
            expect(result.document.ui.graph.childIdsById.root).toEqual([
              'before',
              instanceId,
              'collection',
              'after',
            ]);
            expect(result.document.ui.graph.nodesById.body).toBeUndefined();
            expect(result.document.ui.graph.nodesById.nested).toBeUndefined();
          }
          expect(result.document.ui.graph.nodesById[instanceId]?.kind).toBe(
            'component-instance'
          );
          assertCanonicalGraph(result.document);
        }
      ),
      propertyParameters
    );
  });

  it('returns stable issues for illegal slot relocation and mutation identities', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'duplicate',
          'nested',
          'root',
          'cycle',
          'member',
          'placement',
          'conflict'
        ),
        fc.boolean(),
        (violation, reverse) => {
          const document = createSourceDocument(reverse);
          const sourceBefore = encodePirDocument(document);
          const base = {
            document,
            instance: createInstance(
              violation === 'conflict' ? 'before' : 'invalid-instance',
              violation === 'member' ? '' : 'prop-title'
            ),
            target:
              violation === 'cycle'
                ? { parentId: 'body', index: 0 }
                : violation === 'placement'
                  ? { parentId: 'collection', index: 0 }
                  : { parentId: 'root', index: 1 },
          };
          const slotRegions: PIRComponentSlotRegions | undefined =
            violation === 'duplicate'
              ? { a: ['panel'], b: ['panel'] }
              : violation === 'nested'
                ? { a: ['panel'], b: ['body'] }
                : violation === 'root'
                  ? { a: ['root'] }
                  : violation === 'cycle'
                    ? { a: ['panel'] }
                    : undefined;
          const result = insertPirComponentInstance({
            ...base,
            ...(slotRegions ? { slotRegions } : {}),
          });
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(encodePirDocument(document)).toBe(sourceBefore);
          expect(result).toEqual(
            insertPirComponentInstance({
              ...base,
              document: createSourceDocument(!reverse),
              ...(slotRegions ? { slotRegions } : {}),
            })
          );
          const expectedCode =
            violation === 'duplicate'
              ? PIR_COMPONENT_MUTATION_ISSUE_CODES.duplicateSlotChild
              : violation === 'nested' ||
                  violation === 'root' ||
                  violation === 'cycle'
                ? PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidSlotChild
                : violation === 'member'
                  ? PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId
                  : violation === 'placement'
                    ? PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidPlacementOwner
                    : PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict;
          expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
        }
      ),
      propertyParameters
    );
  });

  it('replaces and updates Component contracts without partial invalid states', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/), (suffix) => {
        const document = createSourceDocument(false);
        const memberId = `prop-${suffix}`;
        const contract: PIRComponentContract = {
          propsById: {
            [memberId]: {
              id: memberId,
              name: suffix,
              typeRef: 'string',
            },
          },
          eventsById: {},
          slotsById: {},
          variantAxesById: {},
          partsById: {
            root: { id: 'root', name: 'root', targetNodeId: 'root' },
          },
        };
        const replacement = replacePirComponentContract({
          document,
          componentContract: contract,
        });
        expect(replacement.ok).toBe(true);
        if (!replacement.ok) return;
        expect(replacement.changed).toBe(true);
        expect(replacement.document.componentContract).toEqual(contract);

        const updated = updatePirComponentContract({
          document: replacement.document,
          update: (current) => ({
            ...current!,
            eventsById: {
              'event-open': { id: 'event-open', name: 'open' },
            },
          }),
        });
        expect(updated.ok).toBe(true);
        if (!updated.ok) return;
        expect(updated.document.componentContract?.eventsById).toHaveProperty(
          'event-open'
        );
        assertCanonicalGraph(updated.document);

        const invalid = replacePirComponentContract({
          document,
          componentContract: {
            ...contract,
            propsById: {
              '': { id: '', name: 'invalid', typeRef: 'string' },
            },
          },
        });
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
          expect(invalid.issues.map(({ code }) => code)).toContain(
            PIR_COMPONENT_MUTATION_ISSUE_CODES.resultSemanticInvalid
          );
        }
      }),
      propertyParameters
    );
  });
});
