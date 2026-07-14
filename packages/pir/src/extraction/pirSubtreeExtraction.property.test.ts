import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodePirDocument, encodePirDocument } from '../codec/pirCodec';
import type { PIRDocument, PIRNode } from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  PIR_SUBTREE_EXTRACTION_ISSUE_CODES,
  analyzePirSubtreeExtraction,
} from './pirSubtreeExtraction';

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
    [
      'collection',
      {
        id: 'collection',
        kind: 'collection',
        source: { kind: 'literal', value: [{ id: 'one' }] },
        key: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'outer-item',
            path: 'id',
          },
        },
        symbols: {
          itemId: 'outer-item',
          itemName: 'item',
          indexId: 'outer-index',
          indexName: 'index',
        },
      },
    ],
    [
      'panel',
      {
        id: 'panel',
        kind: 'element',
        type: 'section',
        text: {
          kind: 'collection-symbol',
          symbolId: 'outer-item',
          path: 'title',
        },
        style: { opacity: { kind: 'state', stateId: 'visibility' } },
        data: { value: { kind: 'literal', value: { tone: 'info' } } },
        events: { click: { kind: 'navigate-route', routeId: 'route-details' } },
      },
    ],
    [
      'label',
      {
        id: 'label',
        kind: 'element',
        type: 'span',
        text: { kind: 'param', paramId: 'title' },
        props: {
          tone: { kind: 'data', dataId: 'panel', path: 'tone' },
          format: {
            kind: 'code',
            reference: { artifactId: 'code-format', symbolId: 'formatLabel' },
          },
        },
      },
    ],
  ];
  const children: readonly (readonly [string, readonly string[]])[] = [
    ['root', ['collection']],
    ['collection', []],
    ['panel', ['label']],
    ['label', []],
  ];
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById: orderedRecord(nodes, reverse),
        childIdsById: orderedRecord(children, reverse),
        regionsById: { collection: { item: ['panel'] } },
        order: { strategy: 'childIdsById' },
      },
    },
    logic: {
      props: { title: { name: 'title', typeRef: 'string' } },
      state: {
        visibility: {
          name: 'visibility',
          typeRef: 'number',
          initial: 1,
        },
      },
    },
  };
};

const analyze = (document: PIRDocument, rootSelection: boolean) =>
  analyzePirSubtreeExtraction({
    sourceDocumentId: 'page-home',
    definitionDocumentId: 'component-card',
    document,
    subtreeRootId: rootSelection ? 'root' : 'panel',
    instanceNodeId: rootSelection ? 'root' : 'panel',
  });

describe('PIR-current subtree extraction properties', () => {
  it('creates deterministic valid Definition and source replacement for root or nested subtrees', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (rootSelection, reverse) => {
        const source = createSourceDocument(reverse);
        const sourceBefore = encodePirDocument(source);
        const result = analyze(source, rootSelection);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(encodePirDocument(source)).toBe(sourceBefore);
        expect(result).toEqual(
          analyze(createSourceDocument(!reverse), rootSelection)
        );
        expect(validatePirDocument(result.definitionDocument).valid).toBe(true);
        expect(validatePirDocument(result.sourceDocument).valid).toBe(true);
        expect(result.sourcePlacement.kind).toBe(
          rootSelection ? 'document-root' : 'named-region'
        );
        expect(result.definitionDocument.ui.graph.rootId).toBe(
          rootSelection ? 'root' : 'panel'
        );
        expect(
          result.sourceDocument.ui.graph.nodesById[
            rootSelection ? 'root' : 'panel'
          ]?.kind
        ).toBe('component-instance');
        if (rootSelection) {
          expect(Object.keys(result.sourceDocument.ui.graph.nodesById)).toEqual(
            ['root']
          );
          expect(result.subtreeNodeIds).toEqual([
            'collection',
            'label',
            'panel',
            'root',
          ]);
        } else {
          expect(
            result.sourceDocument.ui.graph.regionsById?.collection?.item
          ).toEqual(['panel']);
          expect(result.subtreeNodeIds).toEqual(['label', 'panel']);
          expect(
            result.boundaryDependencies.filter(
              ({ resolution }) => resolution === 'lifted-to-component-prop'
            )
          ).toHaveLength(3);
        }
        expect(
          result.relocationFacts.map(({ sourceNodeId }) => sourceNodeId)
        ).toEqual(result.subtreeNodeIds);
        expect(
          result.boundaryDependencies.some(
            (dependency) =>
              dependency.kind === 'typed-reference' &&
              dependency.referenceKind === 'code-artifact'
          )
        ).toBe(true);
      }),
      propertyParameters
    );
  });

  it('stably blocks boundaries that cannot be promoted or preserved', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'external-inbound',
          'unresolved',
          'slot-outlet',
          'opaque-input',
          'component-part'
        ),
        fc.boolean(),
        (violation, reverse) => {
          const source = createSourceDocument(reverse);
          const graph = source.ui.graph;
          let document: PIRDocument = source;
          if (violation === 'external-inbound') {
            const root = graph.nodesById.root;
            document = {
              ...source,
              ui: {
                graph: {
                  ...graph,
                  nodesById: {
                    ...graph.nodesById,
                    root:
                      root?.kind === 'element'
                        ? {
                            ...root,
                            text: { kind: 'data', dataId: 'panel' },
                          }
                        : root!,
                  },
                },
              },
            };
          } else if (violation === 'unresolved') {
            const panel = graph.nodesById.panel;
            document = {
              ...source,
              ui: {
                graph: {
                  ...graph,
                  nodesById: {
                    ...graph.nodesById,
                    panel:
                      panel?.kind === 'element'
                        ? {
                            ...panel,
                            text: { kind: 'param', paramId: 'missing' },
                          }
                        : panel!,
                  },
                },
              },
            };
          } else if (violation === 'slot-outlet') {
            document = {
              ...source,
              componentContract: {
                propsById: {},
                eventsById: {},
                slotsById: {
                  content: { id: 'content', name: 'content' },
                },
                variantAxesById: {},
              },
              ui: {
                graph: {
                  ...graph,
                  nodesById: {
                    ...graph.nodesById,
                    outlet: {
                      id: 'outlet',
                      kind: 'component-slot-outlet',
                      slotMemberId: 'content',
                      bindings: { props: {} },
                    },
                  },
                  childIdsById: {
                    ...graph.childIdsById,
                    panel: ['label', 'outlet'],
                    outlet: [],
                  },
                },
              },
            };
          } else if (violation === 'opaque-input') {
            const panel = graph.nodesById.panel;
            document = {
              ...source,
              ui: {
                graph: {
                  ...graph,
                  nodesById: {
                    ...graph.nodesById,
                    panel:
                      panel?.kind === 'element'
                        ? {
                            ...panel,
                            events: {
                              execute: {
                                kind: 'run-nodegraph',
                                documentId: 'graph-submit',
                                inputMapping: { targetNodeId: 'panel' },
                              },
                            },
                          }
                        : panel!,
                  },
                },
              },
            };
          } else {
            document = {
              ...source,
              componentContract: {
                propsById: {},
                eventsById: {},
                slotsById: {},
                variantAxesById: {},
                partsById: {
                  panel: {
                    id: 'panel',
                    name: 'panel',
                    targetNodeId: 'panel',
                  },
                },
              },
            };
          }

          const result = analyze(document, false);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          const decoded = decodePirDocument(
            JSON.parse(encodePirDocument(document))
          );
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          const reordered = analyze(decoded.value, false);
          expect(result).toEqual(reordered);
          expect(result.boundaryDependencies).toEqual(
            [...result.boundaryDependencies].sort((left, right) =>
              left.id.localeCompare(right.id)
            )
          );
          const expectedCode =
            violation === 'unresolved'
              ? PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unresolvedBoundary
              : violation === 'slot-outlet'
                ? PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unsupportedSlotOutlet
                : violation === 'opaque-input'
                  ? PIR_SUBTREE_EXTRACTION_ISSUE_CODES.opaqueExternalBinding
                  : PIR_SUBTREE_EXTRACTION_ISSUE_CODES.externalInboundReference;
          expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
          expect(
            result.boundaryDependencies.some(
              ({ resolution }) => resolution === 'blocked'
            )
          ).toBe(true);
        }
      ),
      propertyParameters
    );
  });
});
