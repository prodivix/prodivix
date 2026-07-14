import { describe, expect, it } from 'vitest';
import { reconcileCodeResourceEditorDraft } from '@/editor/features/resources/codeResourceModel';
import {
  buildCodeResourceTreeFromWorkspaceVfs,
  flattenCodeResourceFiles,
} from '@/editor/features/resources/workspaceCodeResources';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

describe('code resource editor draft reconciliation', () => {
  it('hydrates the selected document and clean external history changes', () => {
    const selected = reconcileCodeResourceEditorDraft({
      baseline: undefined,
      editorValue: '',
      documentId: 'code-one',
      source: 'const value = 1;',
    });
    expect(selected.editorValue).toBe('const value = 1;');

    expect(
      reconcileCodeResourceEditorDraft({
        baseline: selected.baseline,
        editorValue: selected.editorValue,
        documentId: 'code-one',
        source: 'const value = 0;',
      })
    ).toEqual({
      baseline: { documentId: 'code-one', source: 'const value = 0;' },
      editorValue: 'const value = 0;',
    });
  });

  it('preserves an unsaved draft when the workspace source changes', () => {
    expect(
      reconcileCodeResourceEditorDraft({
        baseline: { documentId: 'code-one', source: 'const value = 1;' },
        editorValue: 'const localDraft = true;',
        documentId: 'code-one',
        source: 'const value = 0;',
      })
    ).toEqual({
      baseline: { documentId: 'code-one', source: 'const value = 0;' },
      editorValue: 'const localDraft = true;',
    });
  });
});

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
