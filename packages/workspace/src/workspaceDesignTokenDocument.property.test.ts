import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createDesignTokenSymbolId,
  createSemanticId,
} from '@prodivix/authoring';
import {
  applyWorkspaceCommand,
  createWorkspaceDesignTokenDocumentUpdateCommand,
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from './index';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-tokens',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'tokens-main',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['tokens-node'],
    },
    'tokens-node': {
      id: 'tokens-node',
      kind: 'doc',
      name: 'main.tokens.json',
      parentId: 'root',
      docId: 'tokens-main',
    },
  },
  docsById: {
    'tokens-main': {
      id: 'tokens-main',
      type: 'design-tokens',
      path: '/tokens/main.tokens.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        scale: {
          $type: 'number',
          base: { $value: 1 },
        },
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('Workspace Design Token document properties', () => {
  it('round-trips reversible DTCG updates and composes alias references', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (tokenName, tokenValue) => {
          fc.pre(tokenName !== 'alias');
          const workspace = createWorkspace();
          const command = createWorkspaceDesignTokenDocumentUpdateCommand({
            workspace,
            documentId: 'tokens-main',
            after: {
              scale: {
                $type: 'number',
                [tokenName]: { $value: tokenValue },
                alias: { $value: `{scale.${tokenName}}` },
              },
            },
            commandId: 'tokens-update',
            issuedAt: '2026-07-15T00:00:00.000Z',
          });
          expect(command).not.toBeNull();
          if (!command) return;

          const applied = applyWorkspaceCommand(workspace, command);
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          const semantic = createWorkspaceSemanticIndexFromSnapshot(
            applied.snapshot
          );
          expect(semantic.status).toBe('ready');
          if (semantic.status !== 'ready') return;
          const tokenSymbolId = createDesignTokenSymbolId(
            workspace.id,
            'tokens-main',
            `scale.${tokenName}`
          );
          expect(semantic.index.getReferences(tokenSymbolId)).toMatchObject({
            status: 'resolved',
            references: [
              {
                id: createSemanticId(
                  'design-token-reference',
                  workspace.id,
                  'tokens-main',
                  'scale.alias',
                  ''
                ),
                targetSymbolId: tokenSymbolId,
              },
            ],
          });

          const reversed = applyWorkspaceCommand(applied.snapshot, {
            ...command,
            id: 'tokens-reverse',
            forwardOps: command.reverseOps,
            reverseOps: command.forwardOps,
          } satisfies WorkspaceCommandEnvelope);
          expect(reversed.ok).toBe(true);
          if (!reversed.ok) return;
          expect(reversed.snapshot.docsById['tokens-main'].content).toEqual(
            workspace.docsById['tokens-main'].content
          );
        }
      ),
      { numRuns: 24, seed: 0x15_07_2026 }
    );
  });
});
