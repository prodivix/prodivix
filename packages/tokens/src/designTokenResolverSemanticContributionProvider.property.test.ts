import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createDesignSystemSymbolId,
  createDesignTokenContextSymbolId,
  createDesignTokenModifierSymbolId,
  createWorkspaceDocumentSymbolId,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { createDesignTokenResolverSemanticContributionProvider } from './designTokenResolverSemanticContributionProvider';

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);

describe('Design Token Resolver semantic contribution properties', () => {
  it('publishes stable design-system, modifier, context, and document-source facts', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier,
        identifier,
        (workspaceId, resolverId, tokenId) => {
          fc.pre(resolverId !== tokenId);
          const identity: SemanticSnapshotIdentity = {
            workspaceRevisions: {
              workspaceId,
              workspaceRev: 1,
              routeRev: 1,
              opSeq: 1,
              documentRevs: {
                [resolverId]: { contentRev: 3, metaRev: 2 },
                [tokenId]: { contentRev: 1, metaRev: 1 },
              },
            },
            schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
            providerSetDigest: 'resolver-property',
          };
          const contribution =
            createDesignTokenResolverSemanticContributionProvider({
              workspaceId,
              documents: [
                {
                  documentId: resolverId,
                  revision: { contentRev: 3, metaRev: 2 },
                  content: {
                    name: 'Product',
                    version: '2025.10',
                    modifiers: {
                      theme: {
                        contexts: {
                          light: [{ $ref: 'light.tokens.json' }],
                          dark: [{ $ref: 'dark.tokens.json' }],
                        },
                        default: 'light',
                      },
                    },
                    resolutionOrder: [{ $ref: '#/modifiers/theme' }],
                  },
                  documentReferences: [
                    {
                      reference: 'light.tokens.json',
                      workspacePath: '/tokens/light.tokens.json',
                      targetDocumentId: tokenId,
                    },
                  ],
                },
              ],
            }).contribute(identity);

          expect(contribution.symbols).toContainEqual(
            expect.objectContaining({
              id: createDesignSystemSymbolId(workspaceId, resolverId),
              kind: 'design-system',
            })
          );
          expect(contribution.symbols).toContainEqual(
            expect.objectContaining({
              id: createDesignTokenModifierSymbolId(
                workspaceId,
                resolverId,
                'modifier:theme'
              ),
              kind: 'token-modifier',
            })
          );
          expect(contribution.symbols).toContainEqual(
            expect.objectContaining({
              id: createDesignTokenContextSymbolId(
                workspaceId,
                resolverId,
                'modifier:theme',
                'light'
              ),
              kind: 'token-context',
            })
          );
          expect(contribution.references).toContainEqual(
            expect.objectContaining({
              kind: 'token-source',
              target: {
                kind: 'symbol-id',
                symbolId: createWorkspaceDocumentSymbolId(workspaceId, tokenId),
              },
            })
          );
        }
      ),
      { numRuns: 24, seed: 0xd7c6_1510 }
    );
  });
});
