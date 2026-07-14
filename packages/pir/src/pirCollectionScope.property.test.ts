import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  PIRCollectionNode,
  PIRDocument,
  PIRElementNode,
  PIRNode,
  PIRValueBinding,
} from './pir.types';
import { PIR_VALIDATION_CODES, validatePirDocument } from './pirValidator';

const propertyParameters = Object.freeze({
  numRuns: 32,
  seed: 0x16_07_2026,
});

type MutableGraph = {
  nodesById: Record<string, PIRNode>;
};

const collectionBinding = (symbolId: string): PIRValueBinding => ({
  kind: 'collection-symbol',
  symbolId,
});

const createCollectionScopeDocument = (reverse: boolean): PIRDocument => {
  const entries: Array<[string, PIRNode]> = [
    ['root', { id: 'root', kind: 'element', type: 'main' }],
    [
      'outer',
      {
        id: 'outer',
        kind: 'collection',
        source: {
          kind: 'literal',
          value: [{ id: 'group', rows: [{ id: 'row' }] }],
        },
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
          itemName: 'group',
          indexId: 'outer-index',
          indexName: 'groupIndex',
          errorId: 'outer-error',
        },
      },
    ],
    [
      'inner',
      {
        id: 'inner',
        kind: 'collection',
        source: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'outer-item',
            path: 'rows',
          },
        },
        key: {
          kind: 'binding',
          value: {
            kind: 'collection-symbol',
            symbolId: 'inner-item',
            path: 'id',
          },
        },
        symbols: {
          itemId: 'inner-item',
          itemName: 'row',
          indexId: 'inner-index',
          indexName: 'rowIndex',
          errorId: 'inner-error',
        },
      },
    ],
    [
      'outer-item-leaf',
      {
        id: 'outer-item-leaf',
        kind: 'element',
        type: 'section',
        text: collectionBinding('outer-index'),
      },
    ],
    [
      'outer-empty-leaf',
      { id: 'outer-empty-leaf', kind: 'element', type: 'p' },
    ],
    [
      'inner-item-leaf',
      {
        id: 'inner-item-leaf',
        kind: 'element',
        type: 'article',
        text: collectionBinding('inner-item'),
        props: { group: collectionBinding('outer-item') },
      },
    ],
    [
      'inner-error-leaf',
      {
        id: 'inner-error-leaf',
        kind: 'element',
        type: 'aside',
        text: collectionBinding('inner-error'),
        props: { group: collectionBinding('outer-item') },
      },
    ],
    ['sibling', { id: 'sibling', kind: 'element', type: 'footer' }],
  ];
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById: Object.fromEntries(reverse ? entries.reverse() : entries),
        childIdsById: {
          root: ['outer', 'sibling'],
          outer: [],
          inner: [],
          'outer-item-leaf': [],
          'outer-empty-leaf': [],
          'inner-item-leaf': [],
          'inner-error-leaf': [],
          sibling: [],
        },
        regionsById: {
          outer: {
            item: ['inner', 'outer-item-leaf'],
            empty: ['outer-empty-leaf'],
          },
          inner: {
            item: ['inner-item-leaf'],
            error: ['inner-error-leaf'],
          },
        },
      },
    },
  };
};

const setElementText = (
  graph: MutableGraph,
  nodeId: string,
  symbolId: string
): void => {
  const node = graph.nodesById[nodeId];
  if (node?.kind !== 'element') return;
  (node as PIRElementNode & { text: PIRValueBinding }).text =
    collectionBinding(symbolId);
};

describe('PIR-current Collection lexical-scope properties', () => {
  it('accepts current and inherited Collection symbols in their exact regions', () => {
    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        expect(
          validatePirDocument(createCollectionScopeDocument(reverse))
        ).toEqual({ valid: true, issues: [] });
      }),
      propertyParameters
    );
  });

  it('rejects own-source, sibling, state-region, key-error and unresolved references deterministically', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'own-source',
          'inner-own-source',
          'sibling',
          'empty-item',
          'error-item',
          'item-error',
          'key-error',
          'unresolved'
        ),
        fc.boolean(),
        (violation, reverse) => {
          const document = structuredClone(
            createCollectionScopeDocument(reverse)
          );
          const graph = document.ui.graph as unknown as MutableGraph;
          const outer = graph.nodesById.outer;
          const inner = graph.nodesById.inner;
          if (violation === 'own-source' && outer?.kind === 'collection') {
            (
              outer as unknown as {
                source: PIRCollectionNode['source'];
              }
            ).source = {
              kind: 'binding',
              value: collectionBinding('outer-item'),
            };
          } else if (
            violation === 'inner-own-source' &&
            inner?.kind === 'collection'
          ) {
            (
              inner as unknown as {
                source: PIRCollectionNode['source'];
              }
            ).source = {
              kind: 'binding',
              value: collectionBinding('inner-item'),
            };
          } else if (violation === 'sibling') {
            setElementText(graph, 'sibling', 'outer-item');
          } else if (violation === 'empty-item') {
            setElementText(graph, 'outer-empty-leaf', 'outer-item');
          } else if (violation === 'error-item') {
            setElementText(graph, 'inner-error-leaf', 'inner-item');
          } else if (violation === 'item-error') {
            setElementText(graph, 'inner-item-leaf', 'inner-error');
          } else if (
            violation === 'key-error' &&
            outer?.kind === 'collection'
          ) {
            (outer as unknown as { key: PIRCollectionNode['key'] }).key = {
              kind: 'binding',
              value: collectionBinding('outer-error'),
            };
          } else if (violation === 'unresolved') {
            setElementText(graph, 'sibling', 'missing-symbol');
          }

          const result = validatePirDocument(document);
          expect(result.valid).toBe(false);
          expect(result.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  violation === 'unresolved'
                    ? PIR_VALIDATION_CODES.collectionSymbolUnresolved
                    : PIR_VALIDATION_CODES.collectionSymbolScope,
              }),
            ])
          );
          expect(result).toEqual(
            validatePirDocument(structuredClone(document))
          );
        }
      ),
      propertyParameters
    );
  });
});
