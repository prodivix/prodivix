import { describe, expect, it, vi } from 'vitest';
import {
  BINARY_ASSET_GIT_MANIFEST_PATH,
  createBinaryAssetBlobReference,
  createBinaryAssetGitProjection,
  createBinaryAssetMaterialization,
  type BinaryAssetGitLfsObject,
  type BinaryAssetGitProjection,
} from '@prodivix/assets';
import {
  applyBrowserGitAssetProjection,
  type BrowserGitAssetProjectionClient,
} from './browserGitAssetProjection';

const createProjection = (
  assetDocumentId: string,
  path: string,
  contents: Uint8Array,
  policy: { kind: 'binary' } | { kind: 'git-lfs'; minimumBytes: number }
): BinaryAssetGitProjection => {
  const reference = createBinaryAssetBlobReference({
    contents,
    mediaType: 'image/png',
  });
  const result = createBinaryAssetGitProjection({
    workspaceId: 'workspace-1',
    workspaceRevision: '1',
    policy,
    sources: [
      {
        assetDocumentId,
        path: `/${path}`,
        contentRevision: '1',
        metadataRevision: '1',
        reference,
      },
    ],
    materializations: [
      createBinaryAssetMaterialization({
        assetDocumentId,
        reference,
        contents,
      }),
    ],
  });
  if (result.status !== 'ready') throw new Error('Projection fixture failed.');
  return result.projection;
};

const createClient = (initial: Readonly<Record<string, Uint8Array>>) => {
  const files = new Map(
    Object.entries(initial).map(([path, contents]) => [
      path,
      new Uint8Array(contents),
    ])
  );
  const events: string[] = [];
  const client = {
    readWorkingFileBytes: vi.fn(async (path: string) => files.get(path)),
    writeWorkingFileBytes: vi.fn(async (path: string, contents: Uint8Array) => {
      events.push(`write:${path}`);
      files.set(path, new Uint8Array(contents));
    }),
    deleteWorkingFile: vi.fn(async (path: string) => {
      events.push(`delete:${path}`);
      files.delete(path);
    }),
    add: vi.fn(async (paths: string | string[]) => {
      events.push(`add:${Array.isArray(paths) ? paths.join(',') : paths}`);
    }),
    remove: vi.fn(async (path: string) => {
      events.push(`remove:${path}`);
    }),
  } as unknown as BrowserGitAssetProjectionClient;
  return { client, files, events };
};

const text = (contents: Uint8Array | undefined): string =>
  new TextDecoder().decode(contents);

describe('Browser Git Asset projection adapter', () => {
  it('uploads LFS objects before reconciling files, attributes, removals, and stage', async () => {
    const previous = createProjection(
      'asset-old',
      'public/old.png',
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      { kind: 'git-lfs', minimumBytes: 0 }
    );
    const next = createProjection(
      'asset-new',
      'public/new.png',
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
      { kind: 'git-lfs', minimumBytes: 0 }
    );
    const previousFiles = Object.fromEntries(
      previous.files.map((file) => [file.path, file.contents])
    );
    previousFiles['.gitattributes'] = new TextEncoder().encode(
      `*.txt text\n${text(previousFiles['.gitattributes'])}`
    );
    const { client, files, events } = createClient(previousFiles);
    const upload = vi.fn(async (object: BinaryAssetGitLfsObject) => {
      events.push(`lfs:${object.oid}`);
      return {
        kind: 'stored' as const,
        oid: object.oid,
        byteLength: object.byteLength,
      };
    });

    const applied = await applyBrowserGitAssetProjection({
      client,
      projection: next,
      lfsUploader: { upload },
    });

    expect(events[0]).toMatch(/^lfs:/u);
    expect(files.has('public/old.png')).toBe(false);
    expect(text(files.get('public/new.png'))).toContain(
      'https://git-lfs.github.com/spec/v1'
    );
    expect(text(files.get('.gitattributes'))).toContain('*.txt text\n');
    expect(text(files.get('.gitattributes'))).toContain('/public/new.png');
    expect(text(files.get('.gitattributes'))).not.toContain('/public/old.png');
    expect(JSON.parse(text(files.get(BINARY_ASSET_GIT_MANIFEST_PATH)))).toEqual(
      next.manifest
    );
    expect(applied.removedPaths).toEqual(['public/old.png']);
    expect(applied.stagedPaths).toContain('.gitattributes');
    expect(applied.stagedPaths).toContain('public/new.png');
  });

  it('removes only the managed attributes region when the projection returns to binary', async () => {
    const previous = createProjection(
      'asset-old',
      'public/logo.png',
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      { kind: 'git-lfs', minimumBytes: 0 }
    );
    const next = createProjection(
      'asset-old',
      'public/logo.png',
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
      { kind: 'binary' }
    );
    const previousFiles = Object.fromEntries(
      previous.files.map((file) => [file.path, file.contents])
    );
    previousFiles['.gitattributes'] = new TextEncoder().encode(
      `*.md text eol=lf\n${text(previousFiles['.gitattributes'])}`
    );
    const { client, files } = createClient(previousFiles);

    await applyBrowserGitAssetProjection({ client, projection: next });

    expect(text(files.get('.gitattributes'))).toBe('*.md text eol=lf\n');
    expect(files.get('public/logo.png')).toEqual(
      next.files.find((file) => file.path === 'public/logo.png')?.contents
    );
  });

  it('fails before working-tree mutation without an LFS adapter or on receipt drift', async () => {
    const projection = createProjection(
      'asset-new',
      'public/new.png',
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
      { kind: 'git-lfs', minimumBytes: 0 }
    );
    const missing = createClient({});
    await expect(
      applyBrowserGitAssetProjection({
        client: missing.client,
        projection,
      })
    ).rejects.toThrow('authorized object upload adapter');
    expect(missing.events).toEqual([]);

    const drifted = createClient({});
    await expect(
      applyBrowserGitAssetProjection({
        client: drifted.client,
        projection,
        lfsUploader: {
          upload: async (object) => ({
            kind: 'stored',
            oid: `${object.oid}0`,
            byteLength: object.byteLength,
          }),
        },
      })
    ).rejects.toThrow('identity drifted');
    expect(drifted.events).toEqual([]);
  });
});
