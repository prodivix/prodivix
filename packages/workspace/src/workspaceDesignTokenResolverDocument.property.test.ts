import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createDesignSystemSymbolId,
  createWorkspaceDocumentSymbolId,
} from '@prodivix/authoring';
import { createDesignTokenResolutionPlan } from '@prodivix/tokens';
import {
  applyWorkspaceCommand,
  createWorkspaceDesignTokenResolverDocumentUpdateCommand,
  createWorkspaceSemanticIndexFromSnapshot,
  decodeWorkspaceDesignTokenResolverDocument,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from './index';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-design-system',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'resolver-product',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['tokens-dir'],
    },
    'tokens-dir': {
      id: 'tokens-dir',
      kind: 'dir',
      name: 'tokens',
      parentId: 'root',
      children: ['foundation-node', 'light-node', 'dark-node', 'resolver-node'],
    },
    'foundation-node': {
      id: 'foundation-node',
      kind: 'doc',
      name: 'foundation.tokens.json',
      parentId: 'tokens-dir',
      docId: 'tokens-foundation',
    },
    'light-node': {
      id: 'light-node',
      kind: 'doc',
      name: 'light.tokens.json',
      parentId: 'tokens-dir',
      docId: 'tokens-light',
    },
    'dark-node': {
      id: 'dark-node',
      kind: 'doc',
      name: 'dark.tokens.json',
      parentId: 'tokens-dir',
      docId: 'tokens-dark',
    },
    'resolver-node': {
      id: 'resolver-node',
      kind: 'doc',
      name: 'product.resolver.json',
      parentId: 'tokens-dir',
      docId: 'resolver-product',
    },
  },
  docsById: {
    'tokens-foundation': {
      id: 'tokens-foundation',
      type: 'design-tokens',
      path: '/tokens/foundation.tokens.json',
      contentRev: 1,
      metaRev: 1,
      content: { scale: { $type: 'number', base: { $value: 1 } } },
    },
    'tokens-light': {
      id: 'tokens-light',
      type: 'design-tokens',
      path: '/tokens/light.tokens.json',
      contentRev: 1,
      metaRev: 1,
      content: { surface: { $type: 'color', base: { $value: '#fff' } } },
    },
    'tokens-dark': {
      id: 'tokens-dark',
      type: 'design-tokens',
      path: '/tokens/dark.tokens.json',
      contentRev: 1,
      metaRev: 1,
      content: { surface: { $type: 'color', base: { $value: '#000' } } },
    },
    'resolver-product': {
      id: 'resolver-product',
      type: 'design-token-resolver',
      path: '/tokens/product.resolver.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        name: 'Product',
        version: '2025.10',
        sets: {
          foundation: {
            sources: [{ $ref: 'foundation.tokens.json' }],
          },
        },
        modifiers: {
          theme: {
            contexts: {
              light: [{ $ref: 'light.tokens.json' }],
              dark: [{ $ref: 'dark.tokens.json' }],
            },
            default: 'light',
          },
        },
        resolutionOrder: [
          { $ref: '#/sets/foundation' },
          { $ref: '#/modifiers/theme' },
        ],
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('Workspace Design Token Resolver document properties', () => {
  it('round-trips theme defaults and keeps resolver references in the shared Semantic Index', () => {
    fc.assert(
      fc.property(fc.constantFrom('light', 'dark'), (defaultContext) => {
        const workspace = createWorkspace();
        const before = workspace.docsById['resolver-product'].content as Record<
          string,
          unknown
        >;
        const command = createWorkspaceDesignTokenResolverDocumentUpdateCommand(
          {
            workspace,
            documentId: 'resolver-product',
            after: {
              ...before,
              modifiers: {
                theme: {
                  contexts: {
                    light: [{ $ref: 'light.tokens.json' }],
                    dark: [{ $ref: 'dark.tokens.json' }],
                  },
                  default: defaultContext,
                },
              },
            },
            commandId: 'resolver-update',
            issuedAt: '2026-07-15T00:00:00.000Z',
          }
        );
        if (defaultContext === 'light') {
          expect(command).toBeNull();
          return;
        }
        expect(command).not.toBeNull();
        if (!command) return;

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const read = decodeWorkspaceDesignTokenResolverDocument(
          applied.snapshot.docsById['resolver-product']
        );
        expect(read.status).toBe('valid');
        if (read.status !== 'valid') return;
        expect(
          createDesignTokenResolutionPlan(read.decodedContent, {})
        ).toMatchObject({
          ok: true,
          plan: { selection: { theme: 'dark' } },
        });

        const semantic = createWorkspaceSemanticIndexFromSnapshot(
          applied.snapshot
        );
        expect(semantic.status).toBe('ready');
        if (semantic.status !== 'ready') return;
        expect(
          semantic.index.getSymbol(
            createDesignSystemSymbolId(workspace.id, 'resolver-product')
          )
        ).toMatchObject({ kind: 'design-system', name: 'Product' });
        expect(
          semantic.index.getReferences(
            createWorkspaceDocumentSymbolId(workspace.id, 'tokens-dark')
          )
        ).toMatchObject({
          status: 'resolved',
          references: [expect.objectContaining({ kind: 'token-source' })],
        });

        const reversed = applyWorkspaceCommand(applied.snapshot, {
          ...command,
          id: 'resolver-reverse',
          forwardOps: command.reverseOps,
          reverseOps: command.forwardOps,
        } satisfies WorkspaceCommandEnvelope);
        expect(reversed.ok).toBe(true);
        if (!reversed.ok) return;
        expect(reversed.snapshot.docsById['resolver-product'].content).toEqual(
          workspace.docsById['resolver-product'].content
        );
      }),
      { numRuns: 8, seed: 0xd7c6_1511 }
    );
  });
});
