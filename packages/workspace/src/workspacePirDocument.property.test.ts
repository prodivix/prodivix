import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import { applyWorkspaceCommand } from './workspaceCommand';
import { createWorkspacePirDocumentUpdateCommand } from './workspacePirDocument';
import { selectActivePirDocument } from './workspaceSelectors';
import type { WorkspaceSnapshot } from './types';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
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

describe('workspace PIR document properties', () => {
  it('builds exactly reversible canonical document commands', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (name) => {
        const workspace = createWorkspace();
        const before = selectActivePirDocument(workspace)!.content;
        const after = {
          ...before,
          metadata: { name },
        };
        const command = createWorkspacePirDocumentUpdateCommand({
          workspace,
          before,
          after,
          commandId: 'update-metadata',
          issuedAt: '2026-07-13T00:00:00.000Z',
          namespace: 'core.pir',
          type: 'metadata.update',
          domainHint: 'pir',
        });
        expect(command).not.toBeNull();
        if (!command) return;

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.snapshot.docsById['page-home'].content).toEqual(after);

        const reversed = applyWorkspaceCommand(applied.snapshot, {
          ...command,
          id: 'reverse-metadata',
          forwardOps: command.reverseOps,
          reverseOps: command.forwardOps,
        });
        expect(reversed.ok).toBe(true);
        if (!reversed.ok) return;
        expect(reversed.snapshot).toEqual(workspace);
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });
});
