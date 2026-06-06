import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import {
  projectWorkspaceToMfeFiles,
  readWorkspaceFromMfeFiles,
  type StableWorkspaceSnapshot,
} from '..';

const createWorkspace = (): StableWorkspaceSnapshot => ({
  id: 'workspace-1',
  name: 'Projection Test',
  workspaceRev: 3,
  routeRev: 2,
  opSeq: 7,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  activeRouteNodeId: 'route-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages', 'src'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['page-home-node'],
    },
    'page-home-node': {
      id: 'page-home-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
    src: {
      id: 'src',
      kind: 'dir',
      name: 'src',
      parentId: 'root',
      children: ['code-index-node'],
    },
    'code-index-node': {
      id: 'code-index-node',
      kind: 'doc',
      name: 'index.ts',
      parentId: 'src',
      docId: 'code-index',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      name: 'Home',
      path: '/pages/home.pir.json',
      contentRev: 3,
      metaRev: 1,
      content: createDefaultPirDoc(),
      updatedAt: '2026-05-10T00:00:00.000Z',
    },
    'code-index': {
      id: 'code-index',
      type: 'code',
      name: 'index.ts',
      path: '/src/index.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const value = 1;',
        metadata: {
          generated: false,
        },
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'route-root',
      children: [
        {
          id: 'route-home',
          index: true,
          pageDocId: 'page-home',
        },
      ],
    },
  },
});

describe('workspace projection', () => {
  it('projects a workspace to .mfe source files with stable paths', () => {
    const result = projectWorkspaceToMfeFiles(createWorkspace());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.files.map((file) => file.path)).toEqual([
      '.mfe/documents/pages/home.pir.json',
      '.mfe/route-manifest.json',
      '.mfe/workspace.json',
      'src/index.ts',
    ]);
    expect(
      result.files.find((file) => file.documentId === 'page-home')
    ).toMatchObject({
      mime: 'application/json',
      role: 'document',
    });
    expect(
      result.files.find((file) => file.documentId === 'code-index')
    ).toMatchObject({
      content: 'export const value = 1;',
      mime: 'text/plain',
      role: 'document',
    });
    expect(
      result.files
        .find((file) => file.path === '.mfe/workspace.json')
        ?.content.includes('"codeContent"')
    ).toBe(true);
    expect(
      result.files
        .find((file) => file.path === '.mfe/workspace.json')
        ?.content.includes('export const value = 1;')
    ).toBe(false);
  });

  it('projects mounted CSS code documents at their VFS path', () => {
    const workspace = createWorkspace();
    workspace.treeById.root.children = [
      ...workspace.treeById.root.children,
      'styles',
    ];
    workspace.treeById.styles = {
      id: 'styles',
      kind: 'dir',
      name: 'styles',
      parentId: 'root',
      children: ['mounted'],
    };
    workspace.treeById.mounted = {
      id: 'mounted',
      kind: 'dir',
      name: 'mounted',
      parentId: 'styles',
      children: ['node-code-mounted-css-button-1'],
    };
    workspace.treeById['node-code-mounted-css-button-1'] = {
      id: 'node-code-mounted-css-button-1',
      kind: 'doc',
      name: 'button-1.css',
      parentId: 'mounted',
      docId: 'code-mounted-css-button-1',
    };
    workspace.docsById['code-mounted-css-button-1'] = {
      id: 'code-mounted-css-button-1',
      type: 'code',
      name: 'button-1.css',
      path: '/styles/mounted/button-1.css',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'css',
        source: '.button { color: red; }',
        metadata: {
          slotKind: 'mounted-css',
        },
      },
    };

    const result = projectWorkspaceToMfeFiles(workspace);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.files).toContainEqual(
      expect.objectContaining({
        path: 'styles/mounted/button-1.css',
        content: '.button { color: red; }',
        documentId: 'code-mounted-css-button-1',
      })
    );
  });

  it('round-trips .mfe source files back into a workspace snapshot', () => {
    const workspace = createWorkspace();
    const projected = projectWorkspaceToMfeFiles(workspace);
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    const read = readWorkspaceFromMfeFiles(projected.files);

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.snapshot).toEqual(workspace);
  });

  it('restores stable document ids from the manifest after code path changes', () => {
    const workspace = createWorkspace();
    const codeDocument = workspace.docsById['code-index'];
    codeDocument.path = '/src/openDialog.ts';
    codeDocument.name = 'openDialog.ts';
    workspace.treeById['code-index-node'].name = 'openDialog.ts';

    const projected = projectWorkspaceToMfeFiles(workspace);
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    expect(projected.files.map((file) => file.path)).toContain(
      'src/openDialog.ts'
    );

    const read = readWorkspaceFromMfeFiles(projected.files);

    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.snapshot.docsById['code-index']).toMatchObject({
      id: 'code-index',
      path: '/src/openDialog.ts',
      content: {
        language: 'ts',
        source: 'export const value = 1;',
        metadata: {
          generated: false,
        },
      },
    });
  });

  it('rejects invalid workspaces before writing files', () => {
    const workspace = createWorkspace();
    workspace.docsById['page-home'].path = '/wrong/home.pir.json';

    const result = projectWorkspaceToMfeFiles(workspace);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues[0]).toMatchObject({
      code: 'WKS_PROJECTION_INVALID_WORKSPACE',
    });
    expect(
      result.issues[0].validationIssues?.map((issue) => issue.code)
    ).toContain('WKS_DOCUMENT_PATH_MISMATCH');
  });

  it('rejects code documents that do not use the code wrapper', () => {
    const workspace = createWorkspace();
    workspace.docsById['code-index'].content = 'export const value = 1;';

    const result = projectWorkspaceToMfeFiles(workspace);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'WKS_PROJECTION_CODE_DOCUMENT_INVALID',
        documentId: 'code-index',
        path: '/src/index.ts',
      }),
    ]);
  });

  it('rejects missing declared document files while reading', () => {
    const projected = projectWorkspaceToMfeFiles(createWorkspace());
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    const read = readWorkspaceFromMfeFiles(
      projected.files.filter((file) => file.documentId !== 'page-home')
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;

    expect(read.issues.map((issue) => issue.code)).toContain(
      'WKS_PROJECTION_DOCUMENT_MISSING'
    );
  });
});
