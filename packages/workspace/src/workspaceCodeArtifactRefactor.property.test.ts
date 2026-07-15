import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES,
  applyWorkspaceCommand,
  createWorkspaceCodeArtifactRelocationPlan,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  undoWorkspaceHistory,
  type WorkspaceSnapshot,
} from './index';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-code-relocation',
  workspaceRev: 4,
  routeRev: 1,
  opSeq: 6,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['scripts'],
    },
    scripts: {
      id: 'scripts',
      kind: 'dir',
      name: 'scripts',
      parentId: 'root',
      children: ['submit-node', 'existing-node'],
    },
    'submit-node': {
      id: 'submit-node',
      kind: 'doc',
      name: 'submit.ts',
      parentId: 'scripts',
      docId: 'code-submit',
    },
    'existing-node': {
      id: 'existing-node',
      kind: 'doc',
      name: 'existing.ts',
      parentId: 'scripts',
      docId: 'code-existing',
    },
  },
  docsById: {
    'code-submit': {
      id: 'code-submit',
      type: 'code',
      path: '/scripts/submit.ts',
      contentRev: 2,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const submit = () => true;\n',
      },
    },
    'code-existing': {
      id: 'code-existing',
      type: 'code',
      path: '/scripts/existing.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const existing = true;\n',
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const pathSegment = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);

describe('Workspace CodeArtifact relocation properties', () => {
  it('moves path and VFS projection while preserving identity, content, and History', () => {
    fc.assert(
      fc.property(
        fc.array(pathSegment, { minLength: 1, maxLength: 4 }),
        (segments) => {
          const workspace = createWorkspace();
          const nextPath = `/${segments.join('/')}/submit.ts`;
          const result = createWorkspaceCodeArtifactRelocationPlan({
            workspace,
            artifactId: 'code-submit',
            path: nextPath,
            operationId: 'move-code-submit',
            issuedAt: '2026-07-15T00:00:00.000Z',
          });
          expect(result.status).toBe('ready');
          if (result.status !== 'ready') return;

          const applied = applyWorkspaceCommand(
            workspace,
            result.plan.operation.command
          );
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          expect(applied.snapshot.docsById['code-submit']).toMatchObject({
            id: 'code-submit',
            path: nextPath,
            contentRev: 2,
            metaRev: 1,
            content: workspace.docsById['code-submit']!.content,
          });
          expect(applied.snapshot.treeById['submit-node']).toMatchObject({
            id: 'submit-node',
            kind: 'doc',
            name: 'submit.ts',
            docId: 'code-submit',
          });

          const history = recordWorkspaceOperation(
            createWorkspaceHistoryState(),
            createWorkspaceCommandOperation(result.plan.operation.command)
          );
          const undone = undoWorkspaceHistory(applied.snapshot, history, {
            kind: 'workspace',
            workspaceId: workspace.id,
          });
          expect(undone.ok).toBe(true);
          if (!undone.ok) return;
          expect(undone.snapshot.docsById).toEqual(workspace.docsById);
          expect(undone.snapshot.treeById).toEqual(workspace.treeById);
        }
      ),
      { numRuns: 24, seed: 0x15_07_2026 }
    );
  });

  it('rejects dot segments and occupied paths before creating an operation', () => {
    const workspace = createWorkspace();
    const invalid = createWorkspaceCodeArtifactRelocationPlan({
      workspace,
      artifactId: 'code-submit',
      path: '/scripts/../submit.ts',
      operationId: 'invalid-move',
      issuedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(invalid).toMatchObject({
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.inputInvalid,
        },
      ],
    });

    const conflict = createWorkspaceCodeArtifactRelocationPlan({
      workspace,
      artifactId: 'code-submit',
      path: '/scripts/existing.ts',
      operationId: 'conflicting-move',
      issuedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(conflict).toMatchObject({
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.pathConflict,
        },
      ],
    });
  });
});
