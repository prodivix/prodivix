import { describe, expect, it } from 'vitest';
import {
  buildCodeResourceTreeFromWorkspaceVfs,
  flattenCodeResourceFiles,
} from '@/editor/features/code/workspaceCodeArtifacts';
import { resolveCodeArtifactDeletion } from '@/editor/features/code/codeAuthoringModel';
import type { CodeArtifact } from '@prodivix/authoring';
import type {
  WorkspaceCodeArtifactLifecycleProjectionResult,
  WorkspaceSnapshot,
} from '@prodivix/workspace';

describe('code resource Workspace VFS projection', () => {
  it('keeps every canonical code document visible regardless of root folder', () => {
    const docsById: WorkspaceSnapshot['docsById'] = {
      handler: {
        id: 'handler',
        type: 'code',
        path: '/src/actions/submit.ts',
        contentRev: 1,
        metaRev: 1,
        content: {
          language: 'ts',
          source: 'export const submit = () => undefined;',
        },
      },
      theme: {
        id: 'theme',
        type: 'code',
        path: '/theme/tokens.css',
        contentRev: 1,
        metaRev: 1,
        content: { language: 'css', source: ':root { color: black; }' },
      },
      page: {
        id: 'page',
        type: 'pir-page',
        path: '/pages/home.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: {},
      },
    };
    const treeById: WorkspaceSnapshot['treeById'] = {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['src', 'theme-dir', 'pages'],
      },
      src: {
        id: 'src',
        kind: 'dir',
        name: 'src',
        parentId: 'root',
        children: ['actions'],
      },
      actions: {
        id: 'actions',
        kind: 'dir',
        name: 'actions',
        parentId: 'src',
        children: ['handler-node'],
      },
      'handler-node': {
        id: 'handler-node',
        kind: 'doc',
        name: 'submit.ts',
        parentId: 'actions',
        docId: 'handler',
      },
      'theme-dir': {
        id: 'theme-dir',
        kind: 'dir',
        name: 'theme',
        parentId: 'root',
        children: ['theme-node'],
      },
      'theme-node': {
        id: 'theme-node',
        kind: 'doc',
        name: 'tokens.css',
        parentId: 'theme-dir',
        docId: 'theme',
      },
      pages: {
        id: 'pages',
        kind: 'dir',
        name: 'pages',
        parentId: 'root',
        children: ['page-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'pages',
        docId: 'page',
      },
    };

    const tree = buildCodeResourceTreeFromWorkspaceVfs(
      docsById,
      'root',
      treeById
    );

    expect(
      flattenCodeResourceFiles(tree).map(({ id, path }) => ({ id, path }))
    ).toEqual([
      { id: 'handler', path: 'code/src/actions/submit.ts' },
      { id: 'theme', path: 'code/theme/tokens.css' },
    ]);
    expect(tree.children?.map(({ name }) => name)).toEqual(['src', 'theme']);
  });
});

describe('code artifact deletion guard', () => {
  const readyProjection = (
    status: 'active' | 'workspace-module'
  ): WorkspaceCodeArtifactLifecycleProjectionResult => ({
    status: 'ready',
    records: [
      {
        artifact: { id: 'handler' } as CodeArtifact,
        lifecycle:
          status === 'active'
            ? { status: 'active', bindings: [] }
            : { status: 'workspace-module' },
      },
    ],
  });

  it('allows deleting an artifact that no CodeSlot binds', () => {
    expect(
      resolveCodeArtifactDeletion(readyProjection('workspace-module'), [
        'handler',
      ])
    ).toEqual({ status: 'allowed' });
  });

  it('blocks deleting an artifact that an active CodeSlot binds', () => {
    expect(
      resolveCodeArtifactDeletion(readyProjection('active'), ['handler'])
    ).toEqual({ status: 'blocked', reason: 'active-binding' });
  });

  it('blocks deletion while the lifecycle projection cannot be built', () => {
    expect(
      resolveCodeArtifactDeletion(
        {
          status: 'blocked',
          issues: [
            {
              code: 'WKS_SEMANTIC_INDEX_DOCUMENT_INVALID',
              path: '/docsById/config',
              message: 'Invalid external adapter config.',
            },
          ],
        },
        ['handler']
      )
    ).toEqual({ status: 'blocked', reason: 'projection-unavailable' });
    expect(resolveCodeArtifactDeletion(null, ['handler'])).toEqual({
      status: 'blocked',
      reason: 'projection-unavailable',
    });
  });
});
