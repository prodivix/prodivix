import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  createLocalProject,
  deleteLocalProject,
  duplicateLocalProject,
  saveLocalWorkspaceSnapshot,
} from '@/editor/localProjectStore';
import {
  getLocalWorkspaceAssetBlob,
  putLocalWorkspaceAssetBlob,
} from '@/editor/localWorkspaceAssetBlobStore';

const CONTENTS = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe('local project Binary Asset lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('copies exact referenced blobs before duplicate commit and cleans only deleted partitions', async () => {
    const project = await createLocalProject({
      name: 'Local assets',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
    });
    const uploaded = await putLocalWorkspaceAssetBlob({
      workspaceId: project.workspace.id,
      contents: CONTENTS,
      mediaType: 'image/png',
    });
    const workspace = {
      ...project.workspace,
      workspaceRev: project.workspace.workspaceRev + 1,
      treeById: {
        ...project.workspace.treeById,
        root: {
          ...project.workspace.treeById.root,
          children: [...project.workspace.treeById.root.children, 'dir-public'],
        },
        'dir-public': {
          id: 'dir-public',
          kind: 'dir' as const,
          name: 'public',
          parentId: 'root',
          children: ['asset-logo-node'],
        },
        'asset-logo-node': {
          id: 'asset-logo-node',
          kind: 'doc' as const,
          name: 'logo.png',
          parentId: 'dir-public',
          docId: 'asset-logo',
        },
      },
      docsById: {
        ...project.workspace.docsById,
        'asset-logo': {
          id: 'asset-logo',
          type: 'asset' as const,
          path: '/public/logo.png',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'asset' as const,
            category: 'image' as const,
            mime: uploaded.reference.mediaType,
            size: uploaded.reference.byteLength,
            blob: uploaded.reference,
          },
          updatedAt: new Date().toISOString(),
        },
      },
    };
    await saveLocalWorkspaceSnapshot(project.id, workspace, {});

    const duplicated = await duplicateLocalProject(project.id, {
      name: 'Local assets copy',
    });
    expect(duplicated).not.toBeNull();
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: duplicated!.workspace.id,
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toMatchObject({ assetDocumentId: 'asset-logo' });

    await expect(deleteLocalProject(duplicated!.id)).resolves.toBe(true);
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: duplicated!.workspace.id,
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toBeUndefined();
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: project.workspace.id,
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toMatchObject({ assetDocumentId: 'asset-logo' });
  });
});
