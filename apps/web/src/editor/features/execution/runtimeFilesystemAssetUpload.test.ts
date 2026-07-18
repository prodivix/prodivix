import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import type { RuntimeFilesystemAssetUploadRequest } from '@prodivix/prodivix-compiler';
import { uploadRuntimeFilesystemAssets } from './runtimeFilesystemAssetUpload';

const putBackendMock = vi.hoisted(() => vi.fn());
const putLocalMock = vi.hoisted(() => vi.fn());

vi.mock('@/editor/editorApi', () => ({
  editorApi: { putWorkspaceAssetBlob: putBackendMock },
}));
vi.mock('@/editor/localWorkspaceAssetBlobStore', () => ({
  putLocalWorkspaceAssetBlob: putLocalMock,
}));

const contents = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const expectedReference = createBinaryAssetBlobReference({
  contents,
  mediaType: 'image/png',
});
const uploadRequest: RuntimeFilesystemAssetUploadRequest = Object.freeze({
  changeId: 'filesystem-change:asset',
  documentId: 'asset-1',
  mediaType: expectedReference.mediaType,
  contents,
  expectedReference,
});

describe('runtime filesystem Asset upload composition', () => {
  beforeEach(() => {
    putBackendMock.mockReset();
    putLocalMock.mockReset();
  });

  it('uses the local blob owner and returns an exact planner receipt', async () => {
    putLocalMock.mockResolvedValue({
      kind: 'stored',
      reference: expectedReference,
    });
    const receipts = await uploadRuntimeFilesystemAssets({
      workspaceId: 'local-workspace-1',
      token: null,
      uploads: [uploadRequest],
    });
    expect(putLocalMock).toHaveBeenCalledWith({
      workspaceId: 'local-workspace-1',
      contents,
      mediaType: 'image/png',
    });
    expect(putBackendMock).not.toHaveBeenCalled();
    expect(receipts).toEqual([
      {
        changeId: uploadRequest.changeId,
        upload: { kind: 'stored', reference: expectedReference },
      },
    ]);
  });

  it('uses the authorized Backend blob owner for cloud Workspaces', async () => {
    putBackendMock.mockResolvedValue({
      kind: 'existing',
      reference: expectedReference,
    });
    const receipts = await uploadRuntimeFilesystemAssets({
      workspaceId: 'workspace-1',
      token: 'user-token',
      uploads: [uploadRequest],
    });
    expect(putBackendMock).toHaveBeenCalledWith(
      'user-token',
      'workspace-1',
      contents,
      'image/png'
    );
    expect(putLocalMock).not.toHaveBeenCalled();
    expect(receipts[0]?.upload.kind).toBe('existing');
  });

  it('fails closed without cloud authorization or on upload identity drift', async () => {
    await expect(
      uploadRuntimeFilesystemAssets({
        workspaceId: 'workspace-1',
        token: null,
        uploads: [uploadRequest],
      })
    ).rejects.toThrow('AST-3001');
    expect(putBackendMock).not.toHaveBeenCalled();

    putBackendMock.mockResolvedValue({
      kind: 'stored',
      reference: createBinaryAssetBlobReference({
        contents: new Uint8Array([...contents, 2]),
        mediaType: 'image/png',
      }),
    });
    await expect(
      uploadRuntimeFilesystemAssets({
        workspaceId: 'workspace-1',
        token: 'user-token',
        uploads: [uploadRequest],
      })
    ).rejects.toThrow('AST-2003');
  });
});
