import { describe, expect, it } from 'vitest';
import { createBinaryAssetBlobReference } from '@prodivix/assets';
import type { WorkspaceDocument, WorkspaceVfsNode } from '@prodivix/workspace';
import { findNodeById } from './publicTree';
import {
  buildPublicResourceTreeFromWorkspace,
  createPublicResourceAssetDeliveryRequest,
} from './workspacePublicResources';

describe('createPublicResourceAssetDeliveryRequest', () => {
  it('routes PNG and JPEG through isolated full raster re-encoders', () => {
    expect(createPublicResourceAssetDeliveryRequest('image/png')).toEqual({
      transform: 'png-raster-reencode',
      disposition: 'inline',
    });
    expect(createPublicResourceAssetDeliveryRequest('image/jpeg')).toEqual({
      transform: 'jpeg-raster-reencode',
      disposition: 'inline',
    });
  });

  it('keeps all other media on the scanned attachment path', () => {
    expect(createPublicResourceAssetDeliveryRequest('application/pdf')).toEqual(
      { transform: 'original', disposition: 'attachment' }
    );
  });
});

describe('buildPublicResourceTreeFromWorkspace', () => {
  it('projects only the canonical blob reference and bounded metadata', () => {
    const contents = new Uint8Array([1, 2, 3]);
    const blob = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/png',
    });
    const documentsById: Record<string, WorkspaceDocument> = {
      logo: {
        id: 'logo',
        type: 'asset',
        path: '/public/logo.png',
        contentRev: 1,
        metaRev: 1,
        content: {
          kind: 'asset',
          mime: blob.mediaType,
          size: blob.byteLength,
          category: 'image',
          blob,
        },
      },
    };
    const treeById: Record<string, WorkspaceVfsNode> = {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['public'],
      },
      public: {
        id: 'public',
        kind: 'dir',
        name: 'public',
        parentId: 'root',
        children: ['logo-node'],
      },
      'logo-node': {
        id: 'logo-node',
        kind: 'doc',
        name: 'logo.png',
        parentId: 'public',
        docId: 'logo',
      },
    };

    const projected = findNodeById(
      buildPublicResourceTreeFromWorkspace(documentsById, 'root', treeById),
      'logo'
    );

    expect(projected).toMatchObject({
      id: 'logo',
      path: 'public/logo.png',
      mime: 'image/png',
      size: 3,
      blobReference: blob,
    });
    expect(projected).not.toHaveProperty('contentRef');
    expect(projected).not.toHaveProperty('textContent');
  });
});
