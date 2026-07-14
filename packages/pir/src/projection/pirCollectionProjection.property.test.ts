import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRCollectionNode } from '../pir.types';
import {
  PIR_COLLECTION_PROJECTION_FACT_CODES,
  PIR_COLLECTION_PROJECTION_ISSUE_CODES,
  createPirCollectionKeyIdentity,
  createPirCollectionProjectionPlan,
  projectPirCollection,
} from './pirCollectionProjection';
import {
  appendPirProjectionCollectionItemPath,
  appendPirProjectionComponentPath,
  appendPirProjectionSlotPath,
  createPirProjectionRootPath,
} from './pirProjectionPath';

const propertyParameters = Object.freeze({
  numRuns: 40,
  seed: 0x16_07_2026,
});

const createCollection = (
  source: PIRCollectionNode['source'],
  key: PIRCollectionNode['key'] = {
    kind: 'binding',
    value: {
      kind: 'collection-symbol',
      symbolId: 'row',
      path: 'id',
    },
  }
): PIRCollectionNode => ({
  id: 'rows',
  kind: 'collection',
  source,
  key,
  symbols: {
    itemId: 'row',
    itemName: 'row',
    indexId: 'row-index',
    indexName: 'rowIndex',
    errorId: 'row-error',
  },
});

describe('PIR-current Collection projection properties', () => {
  it('preserves source order and extends each item scope without losing parent symbols', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            id: fc.oneof(fc.string(), fc.integer()),
            value: fc.jsonValue(),
          }),
          {
            minLength: 1,
            maxLength: 16,
            selector: (row) => `${typeof row.id}:${String(row.id)}`,
          }
        ),
        fc.constantFrom('auto', 'item') as fc.Arbitrary<'auto' | 'item'>,
        (rows, state) => {
          const result = projectPirCollection({
            node: createCollection({
              kind: 'binding',
              value: { kind: 'data', dataId: 'rows' },
            }),
            regions: { item: ['card'], empty: ['empty'] },
            parentScope: {
              dataById: { rows },
              collectionSymbolsById: { parent: 'visible' },
            },
            preview: { state },
          });

          expect(result.status).toBe('ready');
          if (result.status !== 'ready' || result.projection.kind !== 'items') {
            return;
          }
          expect(result.projection.nodeIds).toEqual(['card']);
          expect(result.projection.items.map(({ item }) => item)).toEqual(rows);
          expect(result.projection.items.map(({ key }) => key)).toEqual(
            rows.map(({ id }) => id)
          );
          result.projection.items.forEach((projection, index) => {
            expect(projection.index).toBe(index);
            expect(projection.scope.collectionSymbolsById).toMatchObject({
              parent: 'visible',
              row: rows[index],
              'row-index': index,
            });
          });
          expect(result).toEqual(
            projectPirCollection({
              node: createCollection({
                kind: 'binding',
                value: { kind: 'data', dataId: 'rows' },
              }),
              regions: { item: ['card'], empty: ['empty'] },
              parentScope: {
                dataById: { rows },
                collectionSymbolsById: { parent: 'visible' },
              },
              preview: { state },
            })
          );
        }
      ),
      propertyParameters
    );
  });

  it('composes nested item scopes from the outer item scope', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ id: fc.string(), label: fc.string() }), {
          minLength: 1,
          maxLength: 12,
          selector: ({ id }) => id,
        }),
        (rows) => {
          const outer = projectPirCollection({
            node: createCollection(
              { kind: 'literal', value: [{ id: 'group', rows }] },
              {
                kind: 'binding',
                value: {
                  kind: 'collection-symbol',
                  symbolId: 'row',
                  path: 'id',
                },
              }
            ),
            regions: { item: ['inner'] },
            parentScope: {},
            preview: { state: 'auto' },
          });
          expect(outer.status).toBe('ready');
          if (outer.status !== 'ready' || outer.projection.kind !== 'items') {
            return;
          }
          const inner = projectPirCollection({
            node: {
              id: 'inner',
              kind: 'collection',
              source: {
                kind: 'binding',
                value: {
                  kind: 'collection-symbol',
                  symbolId: 'row',
                  path: 'rows',
                },
              },
              key: {
                kind: 'binding',
                value: {
                  kind: 'collection-symbol',
                  symbolId: 'inner-row',
                  path: 'id',
                },
              },
              symbols: {
                itemId: 'inner-row',
                itemName: 'innerRow',
                indexId: 'inner-index',
                indexName: 'innerIndex',
              },
            },
            regions: { item: ['leaf'] },
            parentScope: outer.projection.items[0]!.scope,
            preview: { state: 'auto' },
          });
          expect(inner.status).toBe('ready');
          if (inner.status !== 'ready' || inner.projection.kind !== 'items') {
            return;
          }
          expect(inner.projection.items.map(({ item }) => item)).toEqual(rows);
          inner.projection.items.forEach((item, index) => {
            expect(item.scope.collectionSymbolsById).toMatchObject({
              row: { id: 'group', rows },
              'inner-row': rows[index],
              'inner-index': index,
            });
          });
        }
      ),
      propertyParameters
    );
  });

  it('passes parent and item lexical scopes to code-backed source and key resolvers', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ id: fc.string(), label: fc.string() }), {
          minLength: 1,
          maxLength: 12,
          selector: ({ id }) => id,
        }),
        (rows) => {
          const sourceScopes: unknown[] = [];
          const keyScopes: unknown[] = [];
          const result = projectPirCollection({
            node: createCollection(
              {
                kind: 'binding',
                value: {
                  kind: 'code',
                  reference: { artifactId: 'rows-source' },
                },
              },
              {
                kind: 'binding',
                value: {
                  kind: 'code',
                  reference: { artifactId: 'row-key' },
                },
              }
            ),
            regions: { item: ['row'] },
            parentScope: {
              dataById: { rows },
              collectionSymbolsById: { parent: 'visible' },
            },
            preview: { state: 'auto' },
            resolveCodeValue: (reference, scope) => {
              if (reference.artifactId === 'rows-source') {
                sourceScopes.push(scope);
                return scope.dataById?.rows;
              }
              keyScopes.push(scope);
              return (
                scope.collectionSymbolsById?.row as { id: string } | undefined
              )?.id;
            },
          });

          expect(result.status).toBe('ready');
          expect(sourceScopes).toHaveLength(1);
          expect(sourceScopes[0]).toMatchObject({
            dataById: { rows },
            collectionSymbolsById: { parent: 'visible' },
          });
          expect(keyScopes).toHaveLength(rows.length);
          keyScopes.forEach((scope, index) => {
            expect(scope).toMatchObject({
              collectionSymbolsById: {
                parent: 'visible',
                row: rows[index],
                'row-index': index,
              },
            });
          });
        }
      ),
      propertyParameters
    );
  });

  it('keeps manual non-item states independent from unresolved source values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('empty', 'loading', 'error') as fc.Arbitrary<
          'empty' | 'loading' | 'error'
        >,
        fc.jsonValue(),
        (state, errorValue) => {
          const result = projectPirCollection({
            node: createCollection({
              kind: 'binding',
              value: {
                kind: 'code',
                reference: { artifactId: 'unavailable-source' },
              },
            }),
            regions: { item: ['item'], error: ['error'] },
            parentScope: { collectionSymbolsById: { parent: 1 } },
            preview: { state, errorValue },
            resolveCodeValue: () => {
              throw new Error('source must not be evaluated');
            },
          });

          expect(result.status).toBe('ready');
          if (
            result.status !== 'ready' ||
            result.projection.kind !== 'region'
          ) {
            return;
          }
          expect(result.projection.regionName).toBe(state);
          expect(result.projection.nodeIds).toEqual(
            state === 'error' ? ['error'] : []
          );
          expect(result.projection.scope.collectionSymbolsById?.parent).toBe(1);
          expect(
            result.projection.scope.collectionSymbolsById?.['row-error']
          ).toBe(state === 'error' ? errorValue : undefined);
        }
      ),
      propertyParameters
    );
  });

  it('fails closed for empty explicit item state and invalid or duplicate keys', () => {
    const emptyItem = projectPirCollection({
      node: createCollection({ kind: 'literal', value: [] }),
      regions: { item: ['item'] },
      parentScope: {},
      preview: { state: 'item' },
    });
    expect(emptyItem).toMatchObject({
      status: 'blocked',
      issues: [
        {
          code: PIR_COLLECTION_PROJECTION_ISSUE_CODES.itemSourceEmpty,
        },
      ],
    });

    expect(
      projectPirCollection({
        node: createCollection({ kind: 'literal', value: [] }),
        regions: { item: ['item'], empty: ['empty'] },
        parentScope: {},
        preview: { state: 'auto' },
      })
    ).toMatchObject({
      status: 'ready',
      projection: { kind: 'region', regionName: 'empty', nodeIds: ['empty'] },
    });

    expect(
      projectPirCollection({
        node: createCollection({
          kind: 'binding',
          value: { kind: 'data', dataId: 'rows' },
        }),
        regions: { item: ['item'] },
        parentScope: { dataById: { rows: { not: 'an-array' } } },
        preview: { state: 'auto' },
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [{ code: PIR_COLLECTION_PROJECTION_ISSUE_CODES.sourceNotArray }],
    });

    fc.assert(
      fc.property(fc.string(), (id) => {
        const duplicate = projectPirCollection({
          node: createCollection({
            kind: 'literal',
            value: [{ id }, { id }],
          }),
          regions: { item: ['item'] },
          parentScope: {},
          preview: { state: 'auto' },
        });
        expect(duplicate.status).toBe('blocked');
        if (duplicate.status !== 'blocked') return;
        expect(duplicate.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: PIR_COLLECTION_PROJECTION_ISSUE_CODES.keyDuplicate,
              itemIndex: 1,
            }),
          ])
        );
        expect('projection' in duplicate).toBe(false);
      }),
      propertyParameters
    );

    const invalid = projectPirCollection({
      node: createCollection({
        kind: 'literal',
        value: [{ id: { unstable: true } }],
      }),
      regions: { item: ['item'] },
      parentScope: {},
      preview: { state: 'auto' },
    });
    expect(invalid).toMatchObject({
      status: 'blocked',
      issues: [
        {
          code: PIR_COLLECTION_PROJECTION_ISSUE_CODES.keyValueInvalid,
          itemIndex: 0,
        },
      ],
    });
  });

  it('uses typed key identities and records explicit index key as a stable warning fact', () => {
    expect(createPirCollectionKeyIdentity(1)).not.toBe(
      createPirCollectionKeyIdentity('1')
    );
    expect(createPirCollectionKeyIdentity(-0)).toBe(
      createPirCollectionKeyIdentity(0)
    );
    fc.assert(
      fc.property(fc.string(), fc.integer(), (text, number) => {
        expect(createPirCollectionKeyIdentity(text)).not.toBe(
          createPirCollectionKeyIdentity(number)
        );
        expect(createPirCollectionKeyIdentity(number)).toBe(
          createPirCollectionKeyIdentity(number)
        );
      }),
      propertyParameters
    );

    const plan = createPirCollectionProjectionPlan(
      createCollection(
        { kind: 'literal', value: [{ id: 'a' }] },
        { kind: 'index' }
      ),
      { item: ['item'] }
    );
    expect(plan).toMatchObject({
      sourceStrategy: 'literal',
      keyStrategy: 'index',
      facts: [
        {
          code: PIR_COLLECTION_PROJECTION_FACT_CODES.indexKey,
          severity: 'warning',
        },
      ],
    });
  });
});

describe('PIR-current projection path properties', () => {
  it('is deterministic and delimiter-safe across every projection boundary', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 7, maxLength: 7 }),
        ([documentId, sourceId, instanceId, targetId, slotId, nodeId, key]) => {
          const root = createPirProjectionRootPath(documentId!);
          const component = appendPirProjectionComponentPath(
            root,
            sourceId!,
            instanceId!,
            targetId!
          );
          const slot = appendPirProjectionSlotPath(
            component,
            sourceId!,
            instanceId!,
            slotId!
          );
          const item = appendPirProjectionCollectionItemPath(
            slot,
            sourceId!,
            nodeId!,
            key!
          );
          expect(item).toBe(
            appendPirProjectionCollectionItemPath(
              appendPirProjectionSlotPath(
                appendPirProjectionComponentPath(
                  createPirProjectionRootPath(documentId!),
                  sourceId!,
                  instanceId!,
                  targetId!
                ),
                sourceId!,
                instanceId!,
                slotId!
              ),
              sourceId!,
              nodeId!,
              key!
            )
          );
        }
      ),
      propertyParameters
    );

    expect(appendPirProjectionComponentPath('root', 'a/b', 'c', 'd')).not.toBe(
      appendPirProjectionComponentPath('root', 'a', 'b/c', 'd')
    );
    expect(
      appendPirProjectionCollectionItemPath('root', 'doc', 'node/a', 'b')
    ).not.toBe(
      appendPirProjectionCollectionItemPath('root', 'doc', 'node', 'a/b')
    );
  });
});
