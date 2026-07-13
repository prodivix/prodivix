import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@prodivix/pir';
import { applyWorkspaceCommand } from './workspaceCommand';
import { createWorkspacePirDocumentUpdateCommand } from './workspacePirDocument';
import { selectActivePirWorkspaceDocument } from './workspaceSelectors';
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
      content: createDefaultPirDoc(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
});

describe('workspace PIR document properties', () => {
  it('builds exactly reversible animation commands', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10_000_000 }), (cursorMs) => {
        const workspace = createWorkspace();
        const before = selectActivePirWorkspaceDocument(workspace)!.content;
        const after = {
          ...before,
          animation: {
            version: 1 as const,
            timelines: [],
            'x-animationEditor': { version: 1 as const, cursorMs },
          },
        };
        const command = createWorkspacePirDocumentUpdateCommand({
          workspace,
          before,
          after,
          commandId: 'update-animation',
          issuedAt: '2026-07-13T00:00:00.000Z',
          namespace: 'core.animation',
          type: 'definition.update',
          domainHint: 'animation',
        });
        expect(command).not.toBeNull();
        if (!command) return;

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.snapshot.docsById['page-home'].content).toEqual(after);

        const reversed = applyWorkspaceCommand(applied.snapshot, {
          ...command,
          id: 'reverse-animation',
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
