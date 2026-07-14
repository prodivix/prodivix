import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRCollectionNode, PIRDocument, PIRNode } from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  unwrapPirCollection,
  updatePirElementNode,
  updatePirElementNodes,
} from './pirElementAuthoringMutations';
import { insertPirCollection } from './pirNodeAuthoringMutations';

const createDocument = (): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    before: { id: 'before', kind: 'element', type: 'header' },
    item: { id: 'item', kind: 'element', type: 'article' },
    after: { id: 'after', kind: 'element', type: 'footer' },
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          root: ['before', 'item', 'after'],
          before: [],
          item: [],
          after: [],
        },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

const collection = (suffix: string): PIRCollectionNode => ({
  id: `collection-${suffix}`,
  kind: 'collection',
  source: { kind: 'literal', value: [] },
  key: { kind: 'index' },
  symbols: {
    itemId: `item-symbol-${suffix}`,
    itemName: 'item',
    indexId: `index-symbol-${suffix}`,
    indexName: 'index',
  },
});

describe('PIR element authoring mutation properties', () => {
  it('updates typed element fields without changing stable identity or source', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 32 }), (text) => {
        const source = createDocument();
        const before = JSON.stringify(source);
        const result = updatePirElementNode({
          document: source,
          nodeId: 'item',
          node: {
            id: 'item',
            kind: 'element',
            type: 'article',
            text: { kind: 'literal', value: text },
          },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.node.id).toBe('item');
        expect(JSON.stringify(source)).toBe(before);
        expect(validatePirDocument(result.document).valid).toBe(true);
      }),
      { numRuns: 24, seed: 0x14072026 }
    );
  });

  it('applies a multi-element layout change atomically', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string({ maxLength: 24 }), fc.string({ maxLength: 24 })),
        ([headerText, footerText]) => {
          const source = createDocument();
          const before = JSON.stringify(source);
          const result = updatePirElementNodes({
            document: source,
            updates: [
              {
                nodeId: 'before',
                node: {
                  id: 'before',
                  kind: 'element',
                  type: 'header',
                  text: { kind: 'literal', value: headerText },
                },
              },
              {
                nodeId: 'after',
                node: {
                  id: 'after',
                  kind: 'element',
                  type: 'footer',
                  text: { kind: 'literal', value: footerText },
                },
              },
            ],
          });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.nodes.map((node) => node.id)).toEqual([
            'before',
            'after',
          ]);
          expect(JSON.stringify(source)).toBe(before);
          expect(validatePirDocument(result.document).valid).toBe(true);
        }
      ),
      { numRuns: 24, seed: 0x14072028 }
    );
  });

  it('round-trips one item through a first-class Collection wrapper', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/), (suffix) => {
        const source = createDocument();
        const wrapper = collection(suffix);
        const wrapped = insertPirCollection({
          document: source,
          collection: wrapper,
          target: { parentId: 'root', index: 1 },
          regions: { item: ['item'] },
        });
        expect(wrapped.ok).toBe(true);
        if (!wrapped.ok) return;
        const unwrapped = unwrapPirCollection({
          document: wrapped.document,
          collectionId: wrapper.id,
        });
        expect(unwrapped.ok).toBe(true);
        if (!unwrapped.ok) return;
        expect(unwrapped.promotedNodeId).toBe('item');
        expect(unwrapped.document.ui.graph.childIdsById.root).toEqual([
          'before',
          'item',
          'after',
        ]);
        expect(validatePirDocument(unwrapped.document).valid).toBe(true);
      }),
      { numRuns: 24, seed: 0x14072027 }
    );
  });
});
