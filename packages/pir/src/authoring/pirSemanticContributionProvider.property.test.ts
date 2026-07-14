import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createAnimationTimelineSymbolId,
  createCodeSymbolId,
  createComponentContractMemberSymbolId,
  createComponentScopeId,
  createComponentSlotPropSymbolId,
  createComponentSlotScopeId,
  createComponentSymbolId,
  createComponentVariantOptionSymbolId,
  createPirCollectionErrorScopeId,
  createPirCollectionErrorSymbolId,
  createPirCollectionIndexSymbolId,
  createPirCollectionItemSymbolId,
  createPirCollectionScopeId,
  createPirDataSymbolId,
  createPirNodeScopeId,
  createPirNodeSymbolId,
  createRouteSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticContribution,
  type SemanticSnapshotIdentity,
  type WorkspaceReferenceFact,
} from '@prodivix/authoring';
import type { PIRDocument } from '../pir.types';
import { createPirSemanticContributionProvider } from './pirSemanticContributionProvider';

const propertyParameters = Object.freeze({
  numRuns: 30,
  seed: 0x14_07_2026,
});

const PAGE_DOCUMENT_ID = 'page-catalog';
const COMPONENT_DOCUMENT_ID = 'component-card';

const orderedRecord = <T>(
  entries: readonly (readonly [string, T])[],
  reverse: boolean
): Readonly<Record<string, T>> =>
  Object.fromEntries(reverse ? [...entries].reverse() : entries);

const createComponentDocument = (reverse: boolean): PIRDocument => ({
  componentContract: {
    propsById: orderedRecord(
      [
        [
          'prop-title',
          {
            id: 'prop-title',
            name: 'title',
            typeRef: 'string',
            required: true,
          },
        ],
      ],
      reverse
    ),
    eventsById: {
      'event-activate': {
        id: 'event-activate',
        name: 'activate',
      },
    },
    slotsById: {
      'slot-content': {
        id: 'slot-content',
        name: 'content',
        propsById: {
          'slot-prop-density': {
            id: 'slot-prop-density',
            name: 'density',
            typeRef: 'number',
          },
        },
      },
    },
    variantAxesById: {
      'variant-tone': {
        id: 'variant-tone',
        name: 'tone',
        defaultOptionId: 'option-primary',
        optionsById: {
          'option-primary': {
            id: 'option-primary',
            name: 'primary',
          },
        },
      },
    },
    partsById: {
      'part-root': {
        id: 'part-root',
        name: 'root',
        targetNodeId: 'component-root',
      },
    },
    tokenBindings: [
      {
        id: 'token-accent',
        tokenPath: 'color.accent',
        target: { kind: 'part', memberId: 'part-root' },
      },
    ],
  },
  ui: {
    graph: {
      rootId: 'component-root',
      nodesById: orderedRecord(
        [
          [
            'component-root',
            {
              id: 'component-root',
              kind: 'element',
              type: 'article',
              text: {
                kind: 'component-variant',
                memberId: 'variant-tone',
              },
              events: {
                forward: {
                  kind: 'emit-component-event',
                  memberId: 'event-activate',
                  payload: {
                    kind: 'component-prop',
                    memberId: 'prop-title',
                  },
                },
              },
            },
          ],
          [
            'slot-outlet',
            {
              id: 'slot-outlet',
              kind: 'component-slot-outlet',
              slotMemberId: 'slot-content',
              bindings: {
                props: {
                  'slot-prop-density': {
                    kind: 'component-prop',
                    memberId: 'prop-title',
                  },
                },
              },
            },
          ],
        ],
        reverse
      ),
      childIdsById: orderedRecord(
        [
          ['component-root', ['slot-outlet']],
          ['slot-outlet', []],
        ],
        reverse
      ),
    },
  },
});

const createPageDocument = (reverse: boolean): PIRDocument => ({
  logic: {
    state: {
      'state-items': {
        name: 'items',
        typeRef: 'readonly CatalogItem[]',
        initial: [],
      },
    },
  },
  ui: {
    graph: {
      rootId: 'page-root',
      nodesById: orderedRecord(
        [
          [
            'page-root',
            {
              id: 'page-root',
              kind: 'element',
              type: 'main',
              text: { kind: 'data', dataId: 'page-root' },
              data: { source: { kind: 'literal', value: 'catalog' } },
              events: {
                code: {
                  kind: 'call-code',
                  slotId: 'slot-handler',
                  reference: {
                    artifactId: 'artifact-actions',
                    symbolId: 'openCatalog',
                  },
                },
                navigate: { kind: 'navigate-route', routeId: 'route-details' },
                graph: {
                  kind: 'run-nodegraph',
                  documentId: 'load-catalog',
                },
                animation: {
                  kind: 'play-animation',
                  documentId: 'animation-reveal',
                  timelineId: 'reveal-cards',
                  command: 'play',
                },
              },
            },
          ],
          [
            'outer',
            {
              id: 'outer',
              kind: 'collection',
              source: {
                kind: 'binding',
                value: { kind: 'state', stateId: 'state-items' },
              },
              key: {
                kind: 'binding',
                value: { kind: 'collection-symbol', symbolId: 'outer-item' },
              },
              symbols: {
                itemId: 'outer-item',
                itemName: 'outerItem',
                indexId: 'outer-index',
                indexName: 'outerIndex',
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
                  path: 'children',
                },
              },
              key: {
                kind: 'binding',
                value: { kind: 'collection-symbol', symbolId: 'inner-item' },
              },
              symbols: {
                itemId: 'inner-item',
                itemName: 'innerItem',
                indexId: 'inner-index',
                indexName: 'innerIndex',
              },
            },
          ],
          [
            'instance',
            {
              id: 'instance',
              kind: 'component-instance',
              componentDocumentId: COMPONENT_DOCUMENT_ID,
              bindings: {
                props: {
                  'prop-title': {
                    kind: 'collection-symbol',
                    symbolId: 'inner-item',
                    path: 'title',
                  },
                },
                events: {
                  'event-activate': {
                    kind: 'navigate-route',
                    routeId: 'route-details',
                  },
                },
                variants: { 'variant-tone': 'option-primary' },
              },
            },
          ],
          [
            'projected',
            {
              id: 'projected',
              kind: 'element',
              type: 'span',
              text: {
                kind: 'slot-prop',
                memberId: 'slot-prop-density',
              },
            },
          ],
          [
            'empty',
            {
              id: 'empty',
              kind: 'element',
              type: 'p',
              text: { kind: 'literal', value: 'No items' },
            },
          ],
          ['loading', { id: 'loading', kind: 'element', type: 'p' }],
          [
            'error',
            {
              id: 'error',
              kind: 'element',
              type: 'p',
              text: {
                kind: 'collection-symbol',
                symbolId: 'outer-error',
              },
            },
          ],
        ],
        reverse
      ),
      childIdsById: orderedRecord(
        [
          ['page-root', ['outer']],
          ['outer', []],
          ['inner', []],
          ['instance', []],
          ['projected', []],
          ['empty', []],
          ['loading', []],
          ['error', []],
        ],
        reverse
      ),
      regionsById: orderedRecord<Readonly<Record<string, readonly string[]>>>(
        [
          [
            'outer',
            {
              item: ['inner'],
              empty: ['empty'],
              loading: ['loading'],
              error: ['error'],
            },
          ],
          ['inner', { item: ['instance'] }],
          ['instance', { 'slot-content': ['projected'] }],
        ],
        reverse
      ),
    },
  },
});

const createIdentity = (
  workspaceId: string,
  contentRev: number,
  metaRev: number
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    documentRevs: {
      [PAGE_DOCUMENT_ID]: { contentRev, metaRev },
      [COMPONENT_DOCUMENT_ID]: { contentRev, metaRev },
    },
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'pir-property-provider-set',
});

const createContribution = (
  workspaceId: string,
  contentRev: number,
  metaRev: number,
  reverse: boolean
): SemanticContribution =>
  createPirSemanticContributionProvider({
    workspaceId,
    documents: reverse
      ? [
          {
            documentId: COMPONENT_DOCUMENT_ID,
            documentType: 'pir-component',
            revision: { contentRev, metaRev },
            document: createComponentDocument(reverse),
          },
          {
            documentId: PAGE_DOCUMENT_ID,
            documentType: 'pir-page',
            revision: { contentRev, metaRev },
            document: createPageDocument(reverse),
          },
        ]
      : [
          {
            documentId: PAGE_DOCUMENT_ID,
            documentType: 'pir-page',
            revision: { contentRev, metaRev },
            document: createPageDocument(reverse),
          },
          {
            documentId: COMPONENT_DOCUMENT_ID,
            documentType: 'pir-component',
            revision: { contentRev, metaRev },
            document: createComponentDocument(reverse),
          },
        ],
  }).contribute(createIdentity(workspaceId, contentRev, metaRev));

const getReference = (
  contribution: SemanticContribution,
  workspaceId: string,
  nodeId: string,
  fieldPath: string,
  role: string,
  documentId = PAGE_DOCUMENT_ID
): WorkspaceReferenceFact => {
  const referenceId = createSemanticId(
    'pir-reference',
    workspaceId,
    documentId,
    nodeId,
    fieldPath,
    role
  );
  const reference = contribution.references?.find(
    (candidate) => candidate.id === referenceId
  );
  if (!reference) throw new Error(`Missing reference ${referenceId}`);
  return reference;
};

describe('PIR-current semantic contribution provider properties', () => {
  it('publishes deterministic Component and Collection facts with exact targets', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (workspaceId, contentRev, metaRev, reverse) => {
          const contribution = createContribution(
            workspaceId,
            contentRev,
            metaRev,
            reverse
          );
          expect(contribution).toEqual(
            createContribution(workspaceId, contentRev, metaRev, !reverse)
          );

          const scopes = contribution.scopes ?? [];
          expect(
            scopes.find(
              ({ id }) =>
                id ===
                createWorkspaceDocumentScopeId(
                  workspaceId,
                  COMPONENT_DOCUMENT_ID
                )
            )
          ).toBeUndefined();
          expect(
            scopes.find(
              ({ id }) =>
                id ===
                createComponentScopeId(workspaceId, COMPONENT_DOCUMENT_ID)
            )
          ).toBeDefined();

          const expectedParents = new Map([
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'inner'),
              createPirCollectionScopeId(
                workspaceId,
                PAGE_DOCUMENT_ID,
                'outer'
              ),
            ],
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'instance'),
              createPirCollectionScopeId(
                workspaceId,
                PAGE_DOCUMENT_ID,
                'inner'
              ),
            ],
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'projected'),
              createComponentSlotScopeId(
                workspaceId,
                COMPONENT_DOCUMENT_ID,
                'slot-content'
              ),
            ],
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'error'),
              createPirCollectionErrorScopeId(
                workspaceId,
                PAGE_DOCUMENT_ID,
                'outer'
              ),
            ],
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'empty'),
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'page-root'),
            ],
            [
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'loading'),
              createPirNodeScopeId(workspaceId, PAGE_DOCUMENT_ID, 'page-root'),
            ],
          ]);
          for (const [scopeId, parentId] of expectedParents) {
            expect(scopes.find(({ id }) => id === scopeId)?.parentId).toBe(
              parentId
            );
          }

          expect(
            getReference(
              contribution,
              workspaceId,
              'page-root',
              '/text',
              'data'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createPirDataSymbolId(
              workspaceId,
              PAGE_DOCUMENT_ID,
              'page-root'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'inner',
              '/source',
              'collection-symbol'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createPirCollectionItemSymbolId(
              workspaceId,
              PAGE_DOCUMENT_ID,
              'outer',
              'outer-item'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'inner',
              '/key',
              'collection-symbol'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createPirCollectionItemSymbolId(
              workspaceId,
              PAGE_DOCUMENT_ID,
              'inner',
              'inner-item'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'error',
              '/text',
              'collection-symbol'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createPirCollectionErrorSymbolId(
              workspaceId,
              PAGE_DOCUMENT_ID,
              'outer',
              'outer-error'
            ),
          });
          const componentSymbolId = createComponentSymbolId(
            workspaceId,
            COMPONENT_DOCUMENT_ID
          );
          expect(
            getReference(
              contribution,
              workspaceId,
              'instance',
              '/componentDocumentId',
              'component-definition'
            ).target
          ).toEqual({ kind: 'symbol-id', symbolId: componentSymbolId });
          expect(
            getReference(
              contribution,
              workspaceId,
              'instance',
              '/bindings/props/prop-title',
              'component-prop'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createComponentContractMemberSymbolId(
              workspaceId,
              COMPONENT_DOCUMENT_ID,
              'prop',
              'prop-title'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'instance',
              '/bindings/variants/variant-tone',
              'component-variant-option'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createComponentVariantOptionSymbolId(
              workspaceId,
              COMPONENT_DOCUMENT_ID,
              'variant-tone',
              'option-primary'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'projected',
              '/text',
              'slot-prop'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createComponentSlotPropSymbolId(
              workspaceId,
              COMPONENT_DOCUMENT_ID,
              'slot-content',
              'slot-prop-density'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'component-root',
              '/events/forward',
              'component-event-emission',
              COMPONENT_DOCUMENT_ID
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createComponentContractMemberSymbolId(
              workspaceId,
              COMPONENT_DOCUMENT_ID,
              'event',
              'event-activate'
            ),
          });

          expect(
            getReference(
              contribution,
              workspaceId,
              'page-root',
              '/events/code',
              'code-symbol'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createCodeSymbolId(
              workspaceId,
              'artifact-actions',
              'openCatalog'
            ),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'page-root',
              '/events/navigate',
              'route'
            ).target
          ).toEqual({
            kind: 'symbol-id',
            symbolId: createRouteSymbolId(workspaceId, 'route-details'),
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'page-root',
              '/events/graph',
              'nodegraph'
            )
          ).toMatchObject({
            target: {
              kind: 'symbol-id',
              symbolId: createWorkspaceDocumentSymbolId(
                workspaceId,
                'load-catalog'
              ),
            },
            diagnosticPolicy: 'report',
          });
          expect(
            getReference(
              contribution,
              workspaceId,
              'page-root',
              '/events/animation',
              'animation-timeline'
            )
          ).toMatchObject({
            target: {
              kind: 'symbol-id',
              symbolId: createAnimationTimelineSymbolId(
                workspaceId,
                'animation-reveal',
                'reveal-cards'
              ),
            },
            diagnosticPolicy: 'report',
          });

          const componentRootId = createPirNodeSymbolId(
            workspaceId,
            COMPONENT_DOCUMENT_ID,
            'component-root'
          );
          expect(contribution.dependencies).toContainEqual(
            expect.objectContaining({
              kind: 'component',
              sourceSymbolId: componentRootId,
              targetSymbolId: componentSymbolId,
            })
          );
          expect(contribution.symbols).toContainEqual(
            expect.objectContaining({
              id: createPirCollectionIndexSymbolId(
                workspaceId,
                PAGE_DOCUMENT_ID,
                'outer',
                'outer-index'
              ),
              scopeId: createPirCollectionScopeId(
                workspaceId,
                PAGE_DOCUMENT_ID,
                'outer'
              ),
            })
          );

          const tokenReference = contribution.references?.find(
            ({ id }) =>
              id ===
              createSemanticId(
                'pir-component-token-reference',
                workspaceId,
                COMPONENT_DOCUMENT_ID,
                'token-accent'
              )
          );
          const tokenTargetReference = contribution.references?.find(
            ({ id }) =>
              id ===
              createSemanticId(
                'pir-component-token-target-reference',
                workspaceId,
                COMPONENT_DOCUMENT_ID,
                'token-accent'
              )
          );
          expect(tokenReference?.target).toEqual({
            kind: 'name',
            name: 'color.accent',
            symbolKinds: ['token'],
          });
          expect(tokenTargetReference?.target).toEqual({
            kind: 'symbol-id',
            symbolId: createComponentContractMemberSymbolId(
              workspaceId,
              COMPONENT_DOCUMENT_ID,
              'part',
              'part-root'
            ),
          });
        }
      ),
      propertyParameters
    );
  });
});
