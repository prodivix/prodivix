import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  PIRCollectionNode,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRNode,
} from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  insertPirCollection,
  updatePirCollection,
  updatePirComponentInstanceBindings,
} from './pirNodeAuthoringMutations';

const propertyParameters = Object.freeze({
  numRuns: 32,
  seed: 0x14_07_2026,
});

const instance: PIRComponentInstanceNode = {
  id: 'instance',
  kind: 'component-instance',
  componentDocumentId: 'component-card',
  bindings: { props: {}, events: {}, variants: {} },
};

const collection = (id: string): PIRCollectionNode => ({
  id,
  kind: 'collection',
  source: { kind: 'literal', value: [] },
  key: { kind: 'index' },
  symbols: {
    itemId: `${id}-item-symbol`,
    itemName: 'item',
    indexId: `${id}-index-symbol`,
    indexName: 'index',
  },
});

const createDocument = (): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    instance,
    items: collection('items'),
    'item-template': { id: 'item-template', kind: 'element', type: 'article' },
    'empty-template': { id: 'empty-template', kind: 'element', type: 'p' },
    loose: { id: 'loose', kind: 'element', type: 'section' },
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          root: ['instance', 'items', 'loose'],
          instance: [],
          items: [],
          'item-template': [],
          'empty-template': [],
          loose: [],
        },
        regionsById: {
          items: {
            item: ['item-template'],
            empty: ['empty-template'],
          },
        },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

describe('PIR-current node authoring mutation properties', () => {
  it('updates typed bindings and Collection node/regions without partial graph state', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 24 }),
        fc.boolean(),
        (value, useBindingKey) => {
          const source = createDocument();
          const before = JSON.stringify(source);
          const bindingsResult = updatePirComponentInstanceBindings({
            document: source,
            nodeId: 'instance',
            bindings: {
              props: { 'prop-title': { kind: 'literal', value } },
              events: {},
              variants: {},
            },
          });
          expect(bindingsResult.ok).toBe(true);
          if (!bindingsResult.ok) return;
          expect(JSON.stringify(source)).toBe(before);
          expect(bindingsResult.node.bindings.props['prop-title']).toEqual({
            kind: 'literal',
            value,
          });

          const current = bindingsResult.document.ui.graph.nodesById.items;
          expect(current?.kind).toBe('collection');
          if (current?.kind !== 'collection') return;
          const collectionResult = updatePirCollection({
            document: bindingsResult.document,
            collection: {
              ...current,
              source: { kind: 'literal', value: [value] },
              key: useBindingKey
                ? {
                    kind: 'binding',
                    value: {
                      kind: 'collection-symbol',
                      symbolId: current.symbols.indexId,
                    },
                  }
                : { kind: 'index' },
            },
            regions: {
              item: ['empty-template'],
              empty: ['item-template'],
              loading: [],
              error: [],
            },
          });
          expect(collectionResult.ok).toBe(true);
          if (!collectionResult.ok) return;
          expect(collectionResult.document.ui.graph.regionsById?.items).toEqual(
            {
              item: ['empty-template'],
              empty: ['item-template'],
              loading: [],
              error: [],
            }
          );
          expect(validatePirDocument(collectionResult.document).valid).toBe(
            true
          );
        }
      ),
      propertyParameters
    );
  });

  it('inserts a first-class Collection and relocates its canonical item region', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        fc.integer({ min: 0, max: 3 }),
        (suffix, requestedIndex) => {
          const source = createDocument();
          const node = collection(`inserted-${suffix}`);
          const result = insertPirCollection({
            document: source,
            collection: node,
            target: { parentId: 'root', index: requestedIndex },
            regions: {
              item: ['loose'],
              empty: [],
              loading: [],
              error: [],
            },
          });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.relocatedChildNodeIds).toEqual(['loose']);
          expect(result.document.ui.graph.regionsById?.[node.id]?.item).toEqual(
            ['loose']
          );
          expect(
            result.document.ui.graph.childIdsById.root.filter(
              (nodeId) => nodeId === 'loose'
            )
          ).toEqual([]);
          expect(validatePirDocument(result.document).valid).toBe(true);
        }
      ),
      propertyParameters
    );
  });
});
