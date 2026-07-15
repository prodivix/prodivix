import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createDesignTokenGroupSymbolId,
  createDesignTokenSymbolId,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { createDesignTokenSemanticContributionProvider } from './designTokenSemanticContributionProvider';

const propertyParameters = Object.freeze({
  numRuns: 35,
  seed: 0x15_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);

const createIdentity = (
  workspaceId: string,
  revisions: Readonly<Record<string, SemanticDocumentRevision>>
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    documentRevs: revisions,
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'design-token-property',
});

describe('Design Token semantic contribution properties', () => {
  it('publishes stable group, token and alias facts independent of document order', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.uniqueArray(identifier, { minLength: 1, maxLength: 4 }),
        identifier,
        (workspaceId, documentIds, tokenName) => {
          fc.pre(tokenName !== 'alias');
          const revisions = Object.fromEntries(
            documentIds.map((documentId, index) => [
              documentId,
              { contentRev: index + 1, metaRev: index + 2 },
            ])
          );
          const identity = createIdentity(workspaceId, revisions);
          const createContribution = (reverse: boolean) =>
            createDesignTokenSemanticContributionProvider({
              workspaceId,
              documents: (reverse
                ? [...documentIds].reverse()
                : documentIds
              ).map((documentId) => ({
                documentId,
                revision: revisions[documentId]!,
                content: {
                  palette: {
                    $type: 'color',
                    [tokenName]: { $value: '#000' },
                    alias: { $value: `{palette.${tokenName}}` },
                  },
                },
              })),
            }).contribute(identity);

          const forward = createContribution(false);
          expect(createContribution(true)).toEqual(forward);
          for (const documentId of documentIds) {
            expect(forward.symbols).toContainEqual(
              expect.objectContaining({
                id: createDesignTokenGroupSymbolId(
                  workspaceId,
                  documentId,
                  'palette'
                ),
                kind: 'token-group',
              })
            );
            expect(forward.symbols).toContainEqual(
              expect.objectContaining({
                id: createDesignTokenSymbolId(
                  workspaceId,
                  documentId,
                  `palette.${tokenName}`
                ),
                kind: 'token',
                typeRef: 'design-token:color',
              })
            );
            expect(forward.references).toContainEqual(
              expect.objectContaining({
                target: {
                  kind: 'symbol-id',
                  symbolId: createDesignTokenSymbolId(
                    workspaceId,
                    documentId,
                    `palette.${tokenName}`
                  ),
                },
              })
            );
          }
        }
      ),
      propertyParameters
    );
  });

  it('rejects a contribution under a mismatched document revision', () => {
    fc.assert(
      fc.property(identifier, identifier, (workspaceId, documentId) => {
        const revision = { contentRev: 1, metaRev: 1 };
        const provider = createDesignTokenSemanticContributionProvider({
          workspaceId,
          documents: [
            {
              documentId,
              revision,
              content: {
                value: { $type: 'number', $value: 1 },
              },
            },
          ],
        });
        expect(() =>
          provider.contribute(
            createIdentity(workspaceId, {
              [documentId]: { contentRev: 2, metaRev: 1 },
            })
          )
        ).toThrow(`snapshot mismatch for document "${documentId}"`);
      }),
      propertyParameters
    );
  });
});
