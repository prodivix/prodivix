import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createComponentScopeId,
  createComponentSlotScopeId,
  createPirCollectionErrorScopeId,
  createPirCollectionScopeId,
  createPirNodeScopeId,
  createWorkspaceDocumentScopeId,
} from '@prodivix/authoring';
import type { PIRDocument, PIRNode } from '../pir.types';
import {
  PIR_COLLECTION_BINDING_LOCATIONS,
  createPirBindingScopeResolver,
  type PIRBindingScopeDocumentType,
} from './pirBindingScope';

const propertyParameters = Object.freeze({
  numRuns: 24,
  seed: 0x14_07_2026,
});

const createDocument = (withErrorSymbol: boolean): PIRDocument => {
  const collection = (
    id: string,
    symbols: { item: string; index: string; error?: string }
  ): PIRNode => ({
    id,
    kind: 'collection',
    source: { kind: 'literal', value: [] },
    key: { kind: 'index' },
    symbols: {
      itemId: symbols.item,
      itemName: `${id}Item`,
      indexId: symbols.index,
      indexName: `${id}Index`,
      ...(symbols.error ? { errorId: symbols.error } : {}),
    },
  });
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    outer: collection('outer', {
      item: 'outer-item',
      index: 'outer-index',
      ...(withErrorSymbol ? { error: 'outer-error' } : {}),
    }),
    inner: collection('inner', {
      item: 'inner-item',
      index: 'inner-index',
    }),
    empty: { id: 'empty', kind: 'element', type: 'p' },
    loading: { id: 'loading', kind: 'element', type: 'p' },
    error: { id: 'error', kind: 'element', type: 'p' },
    'inner-item': { id: 'inner-item', kind: 'element', type: 'span' },
    host: {
      id: 'host',
      kind: 'component-instance',
      componentDocumentId: 'component-card',
      bindings: { props: {}, events: {}, variants: {} },
    },
    'slot-collection': collection('slot-collection', {
      item: 'slot-item-symbol',
      index: 'slot-index-symbol',
    }),
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          ...Object.fromEntries(
            Object.keys(nodesById).map((nodeId) => [nodeId, []])
          ),
          root: ['outer', 'host'],
        },
        regionsById: {
          outer: {
            item: ['inner'],
            empty: ['empty'],
            loading: ['loading'],
            error: ['error'],
          },
          inner: { item: ['inner-item'] },
          host: { 'slot-content': ['slot-collection'] },
          'slot-collection': { item: [] },
        },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

describe('PIR-current binding scope properties', () => {
  it('resolves Collection authoring locations from canonical lexical ownership', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PIRBindingScopeDocumentType>(
          'pir-page',
          'pir-layout',
          'pir-component'
        ),
        fc.boolean(),
        (documentType, withErrorSymbol) => {
          const workspaceId = 'workspace';
          const documentId = 'document';
          const resolver = createPirBindingScopeResolver({
            workspaceId,
            documentId,
            documentType,
            document: createDocument(withErrorSymbol),
          });
          const baseScopeId =
            documentType === 'pir-component'
              ? createComponentScopeId(workspaceId, documentId)
              : createWorkspaceDocumentScopeId(workspaceId, documentId);
          const parentScopeId = createPirNodeScopeId(
            workspaceId,
            documentId,
            'root'
          );
          expect(resolver.baseScope.scopeId).toBe(baseScopeId);

          for (const location of PIR_COLLECTION_BINDING_LOCATIONS) {
            const scope = resolver.resolveCollectionBindingScope(
              'outer',
              location
            );
            expect(scope).toBeDefined();
            if (!scope) continue;
            if (location === 'key' || location === 'item') {
              expect(scope.scopeId).toBe(
                createPirCollectionScopeId(workspaceId, documentId, 'outer')
              );
              expect(scope.localCollectionSymbolIds).toEqual([
                'outer-item',
                'outer-index',
              ]);
            } else if (location === 'error' && withErrorSymbol) {
              expect(scope.scopeId).toBe(
                createPirCollectionErrorScopeId(
                  workspaceId,
                  documentId,
                  'outer'
                )
              );
              expect(scope.localCollectionSymbolIds).toEqual(['outer-error']);
            } else {
              expect(scope.scopeId).toBe(parentScopeId);
              expect(scope.localCollectionSymbolIds).toEqual([]);
            }
          }

          expect(
            resolver.resolveCollectionBindingScope('inner', 'source')?.scopeId
          ).toBe(createPirCollectionScopeId(workspaceId, documentId, 'outer'));
          expect(
            resolver.resolveCollectionBindingScope('slot-collection', 'source')
              ?.scopeId
          ).toBe(
            createComponentSlotScopeId(
              workspaceId,
              'component-card',
              'slot-content'
            )
          );
        }
      ),
      propertyParameters
    );
  });
});
