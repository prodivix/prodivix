import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
} from '@prodivix/assets';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

const getWorkspaceAssetBlobMock = vi.hoisted(() => vi.fn());
const getLocalWorkspaceAssetBlobMock = vi.hoisted(() => vi.fn());

vi.mock('@/editor/editorApi', () => ({
  editorApi: { getWorkspaceAssetBlob: getWorkspaceAssetBlobMock },
}));
vi.mock('@/editor/localWorkspaceAssetBlobStore', () => ({
  getLocalWorkspaceAssetBlob: getLocalWorkspaceAssetBlobMock,
}));

import { materializeWorkspaceBinaryAssets } from './workspaceAssetMaterialization';

const FIRST_BYTES = new Uint8Array([1, 2, 3]);
const SECOND_BYTES = new Uint8Array([4, 5]);
const FIRST_REFERENCE = createBinaryAssetBlobReference({
  contents: FIRST_BYTES,
  mediaType: 'image/png',
});
const SECOND_REFERENCE = createBinaryAssetBlobReference({
  contents: SECOND_BYTES,
  mediaType: 'font/woff2',
});

const createWorkspace = (withAssets = true): WorkspaceSnapshot => ({
  id: 'workspace-assets',
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
      children: [],
    },
  },
  docsById: withAssets
    ? {
        second: {
          id: 'second',
          type: 'asset',
          path: '/public/z.woff2',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'asset',
            mime: SECOND_REFERENCE.mediaType,
            size: SECOND_REFERENCE.byteLength,
            blob: SECOND_REFERENCE,
          },
        },
        first: {
          id: 'first',
          type: 'asset',
          path: '/public/a.png',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'asset',
            mime: FIRST_REFERENCE.mediaType,
            size: FIRST_REFERENCE.byteLength,
            blob: FIRST_REFERENCE,
          },
        },
      }
    : {},
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('materializeWorkspaceBinaryAssets', () => {
  beforeEach(() => {
    getWorkspaceAssetBlobMock.mockReset();
    getLocalWorkspaceAssetBlobMock.mockReset();
  });

  it('does not require authentication when the Workspace has no assets', async () => {
    await expect(
      materializeWorkspaceBinaryAssets({
        workspace: createWorkspace(false),
        token: null,
      })
    ).resolves.toEqual([]);
    expect(getWorkspaceAssetBlobMock).not.toHaveBeenCalled();
  });

  it('fails closed before compilation when no authorized adapter is available', async () => {
    await expect(
      materializeWorkspaceBinaryAssets({
        workspace: createWorkspace(),
        token: null,
      })
    ).rejects.toThrow('AST-3001');
    expect(getWorkspaceAssetBlobMock).not.toHaveBeenCalled();
  });

  it('materializes a local-only Workspace without authentication', async () => {
    const workspace = { ...createWorkspace(), id: 'local-assets' };
    getLocalWorkspaceAssetBlobMock.mockImplementation(
      async ({ assetDocumentId }: { assetDocumentId: string }) =>
        assetDocumentId === 'first'
          ? createBinaryAssetMaterialization({
              assetDocumentId,
              reference: FIRST_REFERENCE,
              contents: FIRST_BYTES,
            })
          : createBinaryAssetMaterialization({
              assetDocumentId,
              reference: SECOND_REFERENCE,
              contents: SECOND_BYTES,
            })
    );

    const materializations = await materializeWorkspaceBinaryAssets({
      workspace,
      token: null,
    });

    expect(
      materializations.map(({ assetDocumentId }) => assetDocumentId)
    ).toEqual(['first', 'second']);
    expect(getLocalWorkspaceAssetBlobMock).toHaveBeenCalledTimes(2);
    expect(getWorkspaceAssetBlobMock).not.toHaveBeenCalled();
  });

  it('fails closed when a local reference has no exact blob', async () => {
    getLocalWorkspaceAssetBlobMock.mockResolvedValue(undefined);
    await expect(
      materializeWorkspaceBinaryAssets({
        workspace: { ...createWorkspace(), id: 'local-assets' },
        token: null,
      })
    ).rejects.toThrow('AST-1001');
    expect(getWorkspaceAssetBlobMock).not.toHaveBeenCalled();
  });

  it('resolves assets deterministically by canonical path', async () => {
    getWorkspaceAssetBlobMock.mockImplementation(
      async (_token: string, _workspaceId: string, assetDocumentId: string) =>
        assetDocumentId === 'first'
          ? createBinaryAssetMaterialization({
              assetDocumentId,
              reference: FIRST_REFERENCE,
              contents: FIRST_BYTES,
            })
          : createBinaryAssetMaterialization({
              assetDocumentId,
              reference: SECOND_REFERENCE,
              contents: SECOND_BYTES,
            })
    );
    const controller = new AbortController();

    const materializations = await materializeWorkspaceBinaryAssets({
      workspace: createWorkspace(),
      token: 'token',
      signal: controller.signal,
    });

    expect(
      materializations.map(({ assetDocumentId }) => assetDocumentId)
    ).toEqual(['first', 'second']);
    expect(getWorkspaceAssetBlobMock).toHaveBeenNthCalledWith(
      1,
      'token',
      'workspace-assets',
      'first',
      FIRST_REFERENCE,
      { signal: controller.signal }
    );
  });

  it('downloads one Workspace-scoped blob once for multiple document references', async () => {
    const base = createWorkspace();
    const workspace: WorkspaceSnapshot = {
      ...base,
      docsById: {
        ...base.docsById,
        copy: {
          id: 'copy',
          type: 'asset',
          path: '/public/b.png',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'asset',
            mime: FIRST_REFERENCE.mediaType,
            size: FIRST_REFERENCE.byteLength,
            blob: FIRST_REFERENCE,
          },
        },
      },
    };
    getWorkspaceAssetBlobMock.mockImplementation(
      async (_token: string, _workspaceId: string, assetDocumentId: string) =>
        createBinaryAssetMaterialization({
          assetDocumentId,
          reference:
            assetDocumentId === 'first' ? FIRST_REFERENCE : SECOND_REFERENCE,
          contents: assetDocumentId === 'first' ? FIRST_BYTES : SECOND_BYTES,
        })
    );

    const materializations = await materializeWorkspaceBinaryAssets({
      workspace,
      token: 'token',
    });

    expect(
      materializations.map(({ assetDocumentId }) => assetDocumentId)
    ).toEqual(['first', 'copy', 'second']);
    expect(getWorkspaceAssetBlobMock).toHaveBeenCalledTimes(2);
  });
});
