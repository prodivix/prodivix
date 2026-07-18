import { describe, expect, it } from 'vitest';
import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
} from '@prodivix/assets';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceGitAssetProjection } from './workspaceGitAssetProjection';

const contents = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const reference = createBinaryAssetBlobReference({
  contents,
  mediaType: 'image/png',
});
const workspace: WorkspaceSnapshot = {
  id: 'workspace-git',
  workspaceRev: 7,
  routeRev: 1,
  opSeq: 3,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['asset-node'],
    },
    'asset-node': {
      id: 'asset-node',
      kind: 'doc',
      name: 'logo.png',
      parentId: 'root',
      docId: 'asset-logo',
    },
  },
  docsById: {
    'asset-logo': {
      id: 'asset-logo',
      type: 'asset',
      path: '/public/logo.png',
      contentRev: 4,
      metaRev: 2,
      content: {
        kind: 'asset',
        mime: reference.mediaType,
        size: reference.byteLength,
        blob: reference,
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-1' },
  },
};

describe('Workspace Git asset projection', () => {
  it('binds canonical document and Workspace revisions into the asset manifest', () => {
    const result = createWorkspaceGitAssetProjection({
      workspace,
      policy: { kind: 'git-lfs', minimumBytes: 0 },
      materializations: [
        createBinaryAssetMaterialization({
          assetDocumentId: 'asset-logo',
          reference,
          contents,
        }),
      ],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.projection.manifest).toMatchObject({
      workspaceId: workspace.id,
      workspaceRevision: '7',
      assets: [
        {
          assetDocumentId: 'asset-logo',
          path: 'public/logo.png',
          contentRevision: '4',
          metadataRevision: '2',
          representation: 'git-lfs',
        },
      ],
    });
  });

  it('publishes a stable missing-blob diagnostic instead of a partial projection', () => {
    expect(
      createWorkspaceGitAssetProjection({
        workspace,
        policy: { kind: 'binary' },
        materializations: [],
      })
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'AST-1201',
          assetDocumentId: 'asset-logo',
          path: '/public/logo.png',
        },
      ],
    });
  });
});
