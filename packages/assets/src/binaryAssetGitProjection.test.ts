import { describe, expect, it } from 'vitest';
import {
  BINARY_ASSET_GIT_MANIFEST_PATH,
  createBinaryAssetBlobReference,
  createBinaryAssetGitProjection,
  createBinaryAssetMaterialization,
  type BinaryAssetGitProjectionSource,
} from './index';

const text = (contents: Uint8Array): string =>
  new TextDecoder().decode(contents);

const bytesA = new Uint8Array([0, 1, 2, 3]);
const bytesB = new Uint8Array([4, 5]);
const referenceA = createBinaryAssetBlobReference({
  contents: bytesA,
  mediaType: 'image/png',
});
const referenceB = createBinaryAssetBlobReference({
  contents: bytesB,
  mediaType: 'font/woff2',
});

const sourceA: BinaryAssetGitProjectionSource = Object.freeze({
  assetDocumentId: 'asset-a',
  path: '/public/logo image.png',
  contentRevision: '2',
  metadataRevision: '3',
  reference: referenceA,
});
const sourceB: BinaryAssetGitProjectionSource = Object.freeze({
  assetDocumentId: 'asset-b',
  path: '/public/fonts/site.woff2',
  contentRevision: '1',
  metadataRevision: '1',
  reference: referenceB,
});
const materializationA = createBinaryAssetMaterialization({
  assetDocumentId: sourceA.assetDocumentId,
  reference: referenceA,
  contents: bytesA,
});
const materializationB = createBinaryAssetMaterialization({
  assetDocumentId: sourceB.assetDocumentId,
  reference: referenceB,
  contents: bytesB,
});

describe('binary asset Git projection', () => {
  it('emits deterministic exact binary files and a stable reference manifest', () => {
    const create = (reverse: boolean) =>
      createBinaryAssetGitProjection({
        workspaceId: 'workspace-1',
        workspaceRevision: '42',
        policy: { kind: 'binary' },
        sources: reverse ? [sourceB, sourceA] : [sourceA, sourceB],
        materializations: reverse
          ? [materializationB, materializationA]
          : [materializationA, materializationB],
      });
    const left = create(false);
    const right = create(true);
    expect(left.status).toBe('ready');
    expect(right.status).toBe('ready');
    if (left.status !== 'ready' || right.status !== 'ready') return;

    expect(left.projection.manifest).toEqual(right.projection.manifest);
    expect(
      left.projection.files.map((file) => [
        file.path,
        file.kind,
        [...file.contents],
      ])
    ).toEqual(
      right.projection.files.map((file) => [
        file.path,
        file.kind,
        [...file.contents],
      ])
    );
    expect(left.projection.lfsObjects).toEqual([]);
    expect(
      left.projection.files.find(
        (file) => file.path === 'public/logo image.png'
      )?.contents
    ).toEqual(bytesA);
    expect(
      left.projection.files.some((file) => file.path === '.gitattributes')
    ).toBe(false);
    const manifestFile = left.projection.files.find(
      (file) => file.path === BINARY_ASSET_GIT_MANIFEST_PATH
    );
    expect(JSON.parse(text(manifestFile!.contents))).toEqual(
      left.projection.manifest
    );
    expect(text(manifestFile!.contents)).not.toContain('workspace-blob');
    expect(text(manifestFile!.contents)).not.toContain('https://');
  });

  it('emits canonical LFS pointers, exact upload objects, and path-scoped attributes', () => {
    const result = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'git-lfs', minimumBytes: 3 },
      sources: [sourceA, sourceB],
      materializations: [materializationA, materializationB],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(result.projection.manifest.assets).toEqual([
      expect.objectContaining({
        assetDocumentId: 'asset-b',
        representation: 'binary',
      }),
      expect.objectContaining({
        assetDocumentId: 'asset-a',
        representation: 'git-lfs',
      }),
    ]);
    const pointer = result.projection.files.find(
      (file) => file.kind === 'lfs-pointer'
    );
    expect(text(pointer!.contents)).toBe(
      `version https://git-lfs.github.com/spec/v1\n` +
        `oid sha256:${referenceA.digest.slice('sha256-'.length)}\n` +
        `size ${referenceA.byteLength}\n`
    );
    const attributes = result.projection.files.find(
      (file) => file.kind === 'attributes'
    );
    expect(text(attributes!.contents)).toBe(
      '# prodivix binary assets begin\n' +
        '"/public/logo image.png" filter=lfs diff=lfs merge=lfs -text\n' +
        '# prodivix binary assets end\n'
    );
    expect(result.projection.lfsObjects).toHaveLength(1);
    expect(result.projection.lfsObjects[0]).toMatchObject({
      oid: referenceA.digest.slice('sha256-'.length),
      byteLength: bytesA.byteLength,
      assetDocumentIds: ['asset-a'],
    });
    expect(result.projection.lfsObjects[0]!.contents).toEqual(bytesA);
  });

  it('deduplicates identical LFS objects while preserving each repository path', () => {
    const duplicateSource: BinaryAssetGitProjectionSource = {
      ...sourceA,
      assetDocumentId: 'asset-a-copy',
      path: '/public/logo-copy.png',
    };
    const result = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'git-lfs', minimumBytes: 0 },
      sources: [sourceA, duplicateSource],
      materializations: [
        materializationA,
        createBinaryAssetMaterialization({
          assetDocumentId: duplicateSource.assetDocumentId,
          reference: referenceA,
          contents: bytesA,
        }),
      ],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(
      result.projection.files.filter((file) => file.kind === 'lfs-pointer')
    ).toHaveLength(2);
    expect(result.projection.lfsObjects).toHaveLength(1);
    expect(result.projection.lfsObjects[0]?.assetDocumentIds).toEqual([
      'asset-a',
      'asset-a-copy',
    ]);
  });

  it('fails the whole projection on missing, duplicate, orphan, drifted, or conflicting input', () => {
    const missing = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'binary' },
      sources: [sourceA],
      materializations: [],
    });
    expect(missing).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'AST-1201', assetDocumentId: 'asset-a' }],
    });

    const duplicate = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'binary' },
      sources: [sourceA],
      materializations: [materializationA, materializationA],
    });
    expect(duplicate).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'AST-1202' }],
    });

    const orphan = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'binary' },
      sources: [],
      materializations: [materializationA],
    });
    expect(orphan).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'AST-1205' }],
    });

    const drifted = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'binary' },
      sources: [sourceA],
      materializations: [
        createBinaryAssetMaterialization({
          assetDocumentId: sourceA.assetDocumentId,
          reference: createBinaryAssetBlobReference({
            contents: bytesB,
            mediaType: 'font/woff2',
          }),
          contents: bytesB,
        }),
      ],
    });
    expect(drifted).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'AST-1203' }],
    });

    const conflict = createBinaryAssetGitProjection({
      workspaceId: 'workspace-1',
      workspaceRevision: '42',
      policy: { kind: 'binary' },
      sources: [sourceA, { ...sourceB, path: '/PUBLIC/LOGO IMAGE.PNG' }],
      materializations: [materializationA, materializationB],
    });
    expect(conflict.status).toBe('blocked');
    if (conflict.status === 'blocked') {
      expect(conflict.diagnostics.map((entry) => entry.code)).toContain(
        'AST-1204'
      );
    }
  });
});
