import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import { applyWorkspaceCommand } from './workspaceCommand';
import { createWorkspaceVfsIntentPlan } from './workspaceVfsIntent';
import type { WorkspaceSnapshot } from './types';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
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
  activeDocumentId: 'page-home',
});

describe('workspace VFS intent properties', () => {
  it('creates arbitrary safe paths as exactly reversible commands', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.string({ maxLength: 256 }),
        (segments, source) => {
          const workspace = createWorkspace();
          const path = `/${segments.join('/')}.ts`;
          const plan = createWorkspaceVfsIntentPlan(workspace, {
            expectedWorkspaceRev: workspace.workspaceRev,
            intent: {
              id: 'create-code',
              namespace: 'core.workspace',
              type: 'code-document.create',
              version: '1.0',
              issuedAt: '2026-07-13T00:00:00.000Z',
              payload: {
                documentId: 'code-new',
                path,
                content: { language: 'ts', source },
              },
            },
          });
          expect(plan).not.toBeNull();
          if (!plan) return;
          const applied = applyWorkspaceCommand(workspace, plan.command);
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          expect(applied.snapshot.docsById['code-new']).toMatchObject({
            id: 'code-new',
            path,
            content: { language: 'ts', source },
          });
          const reversed = applyWorkspaceCommand(applied.snapshot, {
            ...plan.command,
            id: 'reverse-create-code',
            forwardOps: plan.command.reverseOps,
            reverseOps: plan.command.forwardOps,
          });
          expect(reversed.ok).toBe(true);
          if (!reversed.ok) return;
          expect(reversed.snapshot).toEqual(workspace);
        }
      ),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });
});
