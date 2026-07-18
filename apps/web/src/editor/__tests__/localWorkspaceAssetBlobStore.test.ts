import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import {
  copyLocalWorkspaceAssetBlobs,
  deleteLocalWorkspaceAssetBlobs,
  getLocalWorkspaceAssetBlob,
  localWorkspaceAssetBlobReader,
  localWorkspaceAssetBlobUploader,
  putLocalWorkspaceAssetBlob,
} from '@/editor/localWorkspaceAssetBlobStore';

const CONTENTS = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

describe('localWorkspaceAssetBlobStore', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('stores and materializes exact Workspace-scoped bytes through the shared ports', async () => {
    const stored = await localWorkspaceAssetBlobUploader.upload({
      workspaceId: 'local-source',
      contents: CONTENTS,
      mediaType: 'image/png',
    });
    const existing = await putLocalWorkspaceAssetBlob({
      workspaceId: 'local-source',
      contents: CONTENTS,
      mediaType: 'image/png',
    });

    expect(stored.kind).toBe('stored');
    expect(existing).toEqual({ kind: 'existing', reference: stored.reference });
    await expect(
      localWorkspaceAssetBlobReader.read({
        workspaceId: 'local-source',
        assetDocumentId: 'asset-logo',
        reference: stored.reference,
      })
    ).resolves.toEqual(CONTENTS);
    const materialization = await getLocalWorkspaceAssetBlob({
      workspaceId: 'local-source',
      assetDocumentId: 'asset-logo',
      reference: stored.reference,
    });
    expect(materialization).toMatchObject({
      assetDocumentId: 'asset-logo',
      reference: stored.reference,
    });
    expect(materialization?.contents).not.toBe(CONTENTS);
  });

  it('partitions identical bytes by Workspace and rejects media identity conflicts', async () => {
    const reference = createBinaryAssetBlobReference({
      contents: CONTENTS,
      mediaType: 'image/png',
    });
    await putLocalWorkspaceAssetBlob({
      workspaceId: 'local-first',
      contents: CONTENTS,
      mediaType: reference.mediaType,
    });

    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: 'local-second',
        assetDocumentId: 'asset-logo',
        reference,
      })
    ).resolves.toBeUndefined();
    await expect(
      putLocalWorkspaceAssetBlob({
        workspaceId: 'local-first',
        contents: CONTENTS,
        mediaType: 'application/octet-stream',
      })
    ).rejects.toThrow('AST-2003');
  });

  it('copies referenced blobs before duplication and deletes only the target partition', async () => {
    const uploaded = await putLocalWorkspaceAssetBlob({
      workspaceId: 'local-source',
      contents: CONTENTS,
      mediaType: 'image/png',
    });
    await copyLocalWorkspaceAssetBlobs({
      sourceWorkspaceId: 'local-source',
      targetWorkspaceId: 'local-copy',
      references: [uploaded.reference, uploaded.reference],
    });

    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: 'local-copy',
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toMatchObject({ assetDocumentId: 'asset-logo' });
    await deleteLocalWorkspaceAssetBlobs('local-copy');
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: 'local-copy',
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toBeUndefined();
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: 'local-source',
        assetDocumentId: 'asset-logo',
        reference: uploaded.reference,
      })
    ).resolves.toMatchObject({ assetDocumentId: 'asset-logo' });
  });

  it('fails closed when a referenced source blob is missing or a read is aborted', async () => {
    const reference = createBinaryAssetBlobReference({
      contents: CONTENTS,
      mediaType: 'image/png',
    });
    await expect(
      copyLocalWorkspaceAssetBlobs({
        sourceWorkspaceId: 'local-source',
        targetWorkspaceId: 'local-copy',
        references: [reference],
      })
    ).rejects.toThrow('AST-1001');

    const controller = new AbortController();
    controller.abort();
    await expect(
      getLocalWorkspaceAssetBlob({
        workspaceId: 'local-source',
        assetDocumentId: 'asset-logo',
        reference,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
