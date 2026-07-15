import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createAssetReferenceExpectedTypeRefs,
  createAssetReferenceSemanticTarget,
  createAssetSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  type SemanticContributionProvider,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '../types';
import { createWorkspaceSemanticIndexFromSnapshot } from './createWorkspaceSemanticIndexFromSnapshot';
import { createWorkspaceAssetSemanticContributionProvider } from './workspaceAssetSemanticContributionProvider';

const propertyParameters = Object.freeze({
  numRuns: 40,
  seed: 0x15_07_2026,
});

type AssetSpec = Readonly<{
  id: string;
  mime: string;
  category: 'image' | 'font' | 'document' | 'other';
  contentRev: number;
  metaRev: number;
  hasText: boolean;
}>;

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
const mimeType = fc.constantFrom(
  'image/png',
  'image/svg+xml',
  'font/woff2',
  'text/plain',
  'application/json'
);
const assetSpecs: fc.Arbitrary<AssetSpec[]> = fc.uniqueArray(
  fc.record<AssetSpec>({
    id: identifier,
    mime: mimeType,
    category: fc.constantFrom('image', 'font', 'document', 'other'),
    contentRev: fc.integer({ min: 1, max: 50 }),
    metaRev: fc.integer({ min: 1, max: 50 }),
    hasText: fc.boolean(),
  }),
  { minLength: 1, maxLength: 6, selector: ({ id }) => id }
);

const createIdentity = (
  workspaceId: string,
  specs: readonly AssetSpec[]
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    documentRevs: Object.fromEntries(
      specs.map((spec) => [
        spec.id,
        { contentRev: spec.contentRev, metaRev: spec.metaRev },
      ])
    ),
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'asset-property-provider-set',
});

describe('createWorkspaceAssetSemanticContributionProvider', () => {
  it('publishes deterministic MIME and category-qualified asset facts', () => {
    fc.assert(
      fc.property(identifier, assetSpecs, (workspaceId, specs) => {
        const documents = specs.map((spec) => ({
          documentId: spec.id,
          path: `/public/${spec.id}`,
          revision: {
            contentRev: spec.contentRev,
            metaRev: spec.metaRev,
          },
          content: {
            kind: 'asset' as const,
            mime: spec.mime,
            category: spec.category,
            dataUrl: `data:${spec.mime},`,
            ...(spec.hasText ? { text: spec.id } : {}),
          },
        }));
        const identity = createIdentity(workspaceId, specs);
        const forward = createWorkspaceAssetSemanticContributionProvider({
          workspaceId,
          documents,
        }).contribute(identity);
        const reversed = createWorkspaceAssetSemanticContributionProvider({
          workspaceId,
          documents: [...documents].reverse(),
        }).contribute(identity);

        expect(reversed).toEqual(forward);
        expect(forward.symbols).toHaveLength(specs.length);
        expect(forward.dependencies).toHaveLength(specs.length);
        specs.forEach((spec) => {
          expect(forward.symbols).toContainEqual(
            expect.objectContaining({
              id: createAssetSymbolId(workspaceId, spec.id),
              kind: 'asset',
              typeRef: `asset:${spec.mime}`,
              capabilityIds: expect.arrayContaining([
                'asset',
                `asset:mime:${spec.mime}`,
                `asset:family:${spec.mime.split('/', 1)[0]}`,
                `asset:category:${spec.category}`,
                'asset:inline',
                ...(spec.hasText ? ['asset:text'] : []),
              ]),
            })
          );
        });
      }),
      propertyParameters
    );
  });

  it('resolves a typed AssetReference through canonical Workspace composition', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier,
        mimeType,
        (workspaceId, assetId, mime) => {
          const path = `/public/${assetId}`;
          const snapshot: WorkspaceSnapshot = {
            id: workspaceId,
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
                children: ['asset-node'],
              },
              'asset-node': {
                id: 'asset-node',
                kind: 'doc',
                name: assetId,
                parentId: 'root',
                docId: assetId,
              },
            },
            docsById: {
              [assetId]: {
                id: assetId,
                type: 'asset',
                path,
                contentRev: 1,
                metaRev: 1,
                content: { kind: 'asset', mime, dataUrl: `data:${mime},` },
              },
            },
            routeManifest: { version: '1', root: { id: 'route-root' } },
          };
          const referenceId = createSemanticId(
            'asset-reference-property',
            workspaceId,
            assetId
          );
          const reference = {
            assetDocumentId: assetId,
            expectedMimeTypes: [mime, ` ${mime.toUpperCase()} `],
          };
          const referenceProvider: SemanticContributionProvider = {
            descriptor: {
              id: 'property.asset-reference',
              semanticVersion: '1',
            },
            contribute: () => ({
              references: [
                {
                  id: referenceId,
                  kind: 'asset-reference',
                  sourceRef: {
                    kind: 'document',
                    workspaceId,
                    documentId: assetId,
                  },
                  sourceSymbolId: createAssetSymbolId(workspaceId, assetId),
                  scopeId: createWorkspaceDocumentScopeId(workspaceId, assetId),
                  target: createAssetReferenceSemanticTarget(
                    workspaceId,
                    reference
                  ),
                  expectedTypeRefs:
                    createAssetReferenceExpectedTypeRefs(reference),
                  resolutionMode: 'addressable',
                  requiresDurableTarget: true,
                },
              ],
            }),
          };

          const composition = createWorkspaceSemanticIndexFromSnapshot(
            snapshot,
            { additionalProviders: [referenceProvider] }
          );
          expect(composition.status).toBe('ready');
          if (composition.status !== 'ready') return;
          expect(composition.index.getDefinition(referenceId)).toMatchObject({
            status: 'resolved',
            symbol: {
              id: createAssetSymbolId(workspaceId, assetId),
              typeRef: `asset:${mime}`,
              providerId: 'core.assets',
            },
          });
        }
      ),
      propertyParameters
    );
  });
});
