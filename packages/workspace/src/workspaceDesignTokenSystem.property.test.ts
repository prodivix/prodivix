import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDesignSystemSymbolId } from '@prodivix/authoring';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceTransaction,
  createWorkspaceDesignTokenSystemTransactionPlan,
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from './index';

const createEmptyWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-token-system',
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
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
});

describe('Workspace Design Token system transaction properties', () => {
  it('atomically creates a resolvable standard DTCG design system', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc
          .string({ minLength: 1, maxLength: 32 })
          .filter((name) => Boolean(name.trim())),
        (slug, displayName) => {
          const workspace = createEmptyWorkspace();
          const result = createWorkspaceDesignTokenSystemTransactionPlan({
            workspace,
            transactionId: `create-${slug}`,
            issuedAt: '2026-07-15T00:00:00.000Z',
            slug,
            displayName,
          });
          expect(result.status).toBe('ready');
          if (result.status !== 'ready') return;

          const applied = applyWorkspaceTransaction(
            workspace,
            result.plan.transaction
          );
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          expect(Object.keys(applied.snapshot.docsById)).toHaveLength(5);

          const semantic = createWorkspaceSemanticIndexFromSnapshot(
            applied.snapshot
          );
          expect(semantic.status).toBe('ready');
          if (semantic.status !== 'ready') return;
          expect(
            semantic.index.getSymbol(
              createDesignSystemSymbolId(
                workspace.id,
                result.plan.resolverDocumentId
              )
            )
          ).toMatchObject({ kind: 'design-system' });

          const reversed = applyWorkspaceTransaction(applied.snapshot, {
            ...result.plan.transaction,
            id: `reverse-${slug}`,
            commands: [...result.plan.transaction.commands]
              .reverse()
              .map((command, index) => ({
                ...command,
                id: `reverse-${slug}-${index}`,
                forwardOps: command.reverseOps,
                reverseOps: command.forwardOps,
              })),
          });
          expect(
            reversed.ok,
            reversed.ok ? '' : JSON.stringify(reversed.issues)
          ).toBe(true);
          if (!reversed.ok) return;
          expect(reversed.snapshot.docsById).toEqual(workspace.docsById);
          expect(reversed.snapshot.treeById).toEqual(workspace.treeById);
        }
      ),
      { numRuns: 20, seed: 0xd7c6_1512 }
    );
  });
});
