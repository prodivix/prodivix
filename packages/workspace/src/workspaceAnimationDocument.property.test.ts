import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  createWorkspaceAnimationDocumentUpdateCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from './index';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-animation',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'animation-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'animation-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'animation-node': {
      id: 'animation-node',
      kind: 'doc',
      name: 'home.pir-animation.json',
      parentId: 'root',
      docId: 'animation-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'animation-home': {
      id: 'animation-home',
      type: 'pir-animation',
      path: '/animations/home.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        target: { kind: 'pir-document', documentId: 'page-home' },
        timelines: [],
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('standalone Workspace Animation document properties', () => {
  it('builds commands whose reverse operations restore canonical content', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60_000 }), (durationMs) => {
        const workspace = createWorkspace();
        const command = createWorkspaceAnimationDocumentUpdateCommand({
          workspace,
          documentId: 'animation-home',
          after: {
            version: 1,
            target: { kind: 'pir-document', documentId: 'page-home' },
            timelines: [
              {
                id: 'timeline-main',
                name: 'Main',
                durationMs,
                bindings: [],
              },
            ],
          },
          commandId: 'animation-update',
          issuedAt: '2026-07-14T00:00:00.000Z',
        });
        expect(command).not.toBeNull();
        if (!command) return;

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const reversed = applyWorkspaceCommand(applied.snapshot, {
          ...command,
          id: 'animation-reverse',
          forwardOps: command.reverseOps,
          reverseOps: command.forwardOps,
        } satisfies WorkspaceCommandEnvelope);
        expect(reversed.ok).toBe(true);
        if (!reversed.ok) return;
        expect(reversed.snapshot.docsById['animation-home'].content).toEqual(
          workspace.docsById['animation-home'].content
        );
      }),
      { numRuns: 24 }
    );
  });
});
