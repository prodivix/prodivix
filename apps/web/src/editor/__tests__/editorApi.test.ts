import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  createEmptyPirDocument,
  encodePirDocument,
  type PIRDocument,
} from '@prodivix/pir';
import {
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const apiRequestMock = vi.hoisted(() => vi.fn());
const apiBinaryRequestMock = vi.hoisted(() => vi.fn());
const encodePirContent = (content: unknown): unknown =>
  JSON.parse(encodePirDocument(content as PIRDocument));

vi.mock('@/infra/api', () => ({
  apiRequest: apiRequestMock,
  apiBinaryRequest: apiBinaryRequestMock,
}));

import { editorApi } from '@/editor/editorApi';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
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
      children: ['document-node'],
    },
    'document-node': {
      id: 'document-node',
      kind: 'doc',
      name: 'pir.json',
      parentId: 'root',
      docId: 'document-1',
    },
  },
  docsById: {
    'document-1': {
      id: 'document-1',
      type: 'pir-page',
      path: '/pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root', children: [] },
  },
  activeDocumentId: 'document-1',
  activeRouteNodeId: 'root',
});

const createWorkspaceWithAsset = () => {
  const contents = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const reference = createBinaryAssetBlobReference({
    contents,
    mediaType: 'image/png',
  });
  const base = createWorkspace();
  const workspace: WorkspaceSnapshot = {
    ...base,
    treeById: {
      ...base.treeById,
      root: {
        ...base.treeById.root!,
        children: [...base.treeById.root!.children, 'asset-node'],
      },
      'asset-node': {
        id: 'asset-node',
        kind: 'doc',
        name: 'logo.png',
        parentId: 'root',
        docId: 'asset-1',
      },
    },
    docsById: {
      ...base.docsById,
      'asset-1': {
        id: 'asset-1',
        type: 'asset',
        path: '/logo.png',
        contentRev: 1,
        metaRev: 1,
        content: {
          kind: 'asset',
          mime: reference.mediaType,
          size: reference.byteLength,
          blob: reference,
          metadata: { originalFileName: 'logo.png' },
        },
      },
    },
  };
  return {
    workspace,
    contents,
    reference,
    materialization: createBinaryAssetMaterialization({
      assetDocumentId: 'asset-1',
      reference,
      contents,
    }),
  };
};

describe('editorApi workspace boundary', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiBinaryRequestMock.mockReset();
  });

  it('uploads exact bytes under their computed Workspace-scoped digest', async () => {
    const contents = new Uint8Array([0, 255, 1, 2]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/png',
    });
    apiRequestMock.mockResolvedValueOnce({ status: 'stored', blob: reference });

    const result = await editorApi.putWorkspaceAssetBlob(
      'token',
      'workspace-1',
      contents,
      'IMAGE/PNG'
    );

    expect(result).toEqual({ kind: 'stored', reference });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/workspaces/workspace-1/asset-blobs/${reference.digest}`,
      expect.objectContaining({
        token: 'token',
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: expect.any(ArrayBuffer),
      })
    );
    const requestBody = (apiRequestMock.mock.calls[0]?.[1] as RequestInit).body;
    expect(new Uint8Array(requestBody as ArrayBuffer)).toEqual(contents);
  });

  it('verifies downloaded bytes against the canonical asset reference', async () => {
    const contents = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'application/octet-stream',
    });
    apiBinaryRequestMock.mockResolvedValueOnce({
      contents,
      mediaType: reference.mediaType,
    });

    await expect(
      editorApi.getWorkspaceAssetBlob(
        'token',
        'workspace-1',
        'asset-1',
        reference
      )
    ).resolves.toEqual(
      expect.objectContaining({
        assetDocumentId: 'asset-1',
        reference,
        contents,
      })
    );
    expect(apiBinaryRequestMock).toHaveBeenCalledWith(
      `/workspaces/workspace-1/asset-blobs/${reference.digest}`,
      { token: 'token' }
    );
  });

  it('rejects an upload response whose canonical identity drifts', async () => {
    const contents = new Uint8Array([1, 2, 3]);
    const drifted = createBinaryAssetBlobReference({
      contents: new Uint8Array([1, 2, 4]),
      mediaType: 'image/png',
    });
    apiRequestMock.mockResolvedValueOnce({
      status: 'existing',
      blob: drifted,
    });

    await expect(
      editorApi.putWorkspaceAssetBlob(
        'token',
        'workspace-1',
        contents,
        'image/png'
      )
    ).rejects.toThrow('identity drifted');
  });

  it('rejects a downloaded blob whose media type drifts', async () => {
    const contents = new Uint8Array([1]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/png',
    });
    apiBinaryRequestMock.mockResolvedValueOnce({
      contents,
      mediaType: 'image/jpeg',
    });

    await expect(
      editorApi.getWorkspaceAssetBlob(
        'token',
        'workspace-1',
        'asset-1',
        reference
      )
    ).rejects.toThrow('media type drifted');
  });

  it('strictly accepts one capability-bound PNG raster delivery session', async () => {
    const contents = new Uint8Array([137, 80, 78, 71]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/png',
    });
    const capability = 'b'.repeat(64);
    apiRequestMock.mockResolvedValueOnce({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      expiresAt: Date.now() + 60_000,
      digest: `sha256-${'c'.repeat(64)}`,
      mediaType: 'image/png',
      byteLength: 67,
      disposition: 'inline',
      deliveryClass: 'static',
      recipeDigest: `sha256-${'d'.repeat(64)}`,
      metadata: { width: 1, height: 1 },
      cacheStatus: 'transformed',
    });

    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'png-raster-reencode', disposition: 'inline' }
      )
    ).resolves.toMatchObject({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      mediaType: 'image/png',
      metadata: { width: 1, height: 1 },
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/workspaces/workspace-1/asset-blobs/${reference.digest}/delivery-sessions`,
      expect.objectContaining({
        token: 'token',
        method: 'POST',
        body: JSON.stringify({
          transform: 'png-raster-reencode',
          disposition: 'inline',
        }),
      })
    );
  });

  it('strictly accepts one capability-bound JPEG raster delivery session', async () => {
    const reference = createBinaryAssetBlobReference({
      contents: new Uint8Array([255, 216, 255, 224, 255, 217]),
      mediaType: 'image/jpeg',
    });
    const capability = 'e'.repeat(64);
    apiRequestMock.mockResolvedValueOnce({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      expiresAt: Date.now() + 60_000,
      digest: `sha256-${'f'.repeat(64)}`,
      mediaType: 'image/jpeg',
      byteLength: 633,
      disposition: 'inline',
      deliveryClass: 'static',
      recipeDigest: `sha256-${'a'.repeat(64)}`,
      metadata: { width: 2, height: 3 },
      cacheStatus: 'cache-hit',
    });

    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'jpeg-raster-reencode', disposition: 'inline' }
      )
    ).resolves.toMatchObject({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      mediaType: 'image/jpeg',
      metadata: { width: 2, height: 3 },
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      `/workspaces/workspace-1/asset-blobs/${reference.digest}/delivery-sessions`,
      expect.objectContaining({
        token: 'token',
        method: 'POST',
        body: JSON.stringify({
          transform: 'jpeg-raster-reencode',
          disposition: 'inline',
        }),
      })
    );
  });

  it('rejects JPEG transform policy drift before network access', async () => {
    const jpeg = createBinaryAssetBlobReference({
      contents: new Uint8Array([255, 216, 255, 217]),
      mediaType: 'image/jpeg',
    });
    const png = createBinaryAssetBlobReference({
      contents: new Uint8Array([137, 80, 78, 71]),
      mediaType: 'image/png',
    });

    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        jpeg,
        { transform: 'jpeg-sanitize', disposition: 'attachment' }
      )
    ).rejects.toThrow('invalid');
    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        png,
        { transform: 'jpeg-sanitize', disposition: 'inline' }
      )
    ).rejects.toThrow('invalid');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('requires exact source identity for scanned original delivery', async () => {
    const reference = createBinaryAssetBlobReference({
      contents: new Uint8Array([37, 80, 68, 70]),
      mediaType: 'application/pdf',
    });
    const response = {
      deliveryUrl: `https://${'9'.repeat(64)}.asset.example.test/asset`,
      expiresAt: Date.now() + 60_000,
      digest: reference.digest,
      mediaType: reference.mediaType,
      byteLength: reference.byteLength,
      disposition: 'attachment',
      deliveryClass: 'download-only',
      recipeDigest: null,
      metadata: null,
      cacheStatus: 'not-applicable',
    };
    apiRequestMock.mockResolvedValueOnce(response);

    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'original', disposition: 'attachment' }
      )
    ).resolves.toMatchObject({
      digest: reference.digest,
      mediaType: 'application/pdf',
      deliveryClass: 'download-only',
    });

    apiRequestMock.mockResolvedValueOnce({
      ...response,
      digest: `sha256-${'8'.repeat(64)}`,
    });
    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'original', disposition: 'attachment' }
      )
    ).rejects.toThrow('identity drifted');
  });

  it('rejects unsafe or shape-drifted delivery sessions', async () => {
    const reference = createBinaryAssetBlobReference({
      contents: new Uint8Array([1]),
      mediaType: 'image/png',
    });
    const response = {
      deliveryUrl: `https://${'b'.repeat(64)}.asset.example.test/asset`,
      expiresAt: Date.now() + 60_000,
      digest: `sha256-${'c'.repeat(64)}`,
      mediaType: 'image/png',
      byteLength: 67,
      disposition: 'inline',
      deliveryClass: 'static',
      recipeDigest: `sha256-${'d'.repeat(64)}`,
      metadata: { width: 1, height: 1 },
      cacheStatus: 'transformed',
    };
    apiRequestMock.mockResolvedValueOnce({ ...response, token: 'canary' });
    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'png-sanitize', disposition: 'inline' }
      )
    ).rejects.toThrow('invalid');

    apiRequestMock.mockResolvedValueOnce({
      ...response,
      deliveryUrl: 'javascript:alert(1)',
    });
    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'png-sanitize', disposition: 'inline' }
      )
    ).rejects.toThrow('invalid');

    apiRequestMock.mockResolvedValueOnce({ ...response, byteLength: 0 });
    await expect(
      editorApi.createWorkspaceAssetDeliverySession(
        'token',
        'workspace-1',
        reference,
        { transform: 'png-sanitize', disposition: 'inline' }
      )
    ).rejects.toThrow('invalid');
  });

  it('decodes backend workspace wire DTOs into the canonical model', async () => {
    const workspace = createWorkspace();
    apiRequestMock.mockResolvedValueOnce({
      workspace: encodeWorkspaceSnapshot(workspace, { locale: 'zh-CN' }),
    });

    const result = await editorApi.getWorkspace('token', workspace.id);

    expect(result).toEqual({
      workspace,
      settings: { locale: 'zh-CN' },
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/workspaces/workspace-1',
      expect.objectContaining({ token: 'token' })
    );
  });

  it('encodes canonical workspaces when importing local projects', async () => {
    const workspace = createWorkspace();
    const wireWorkspace = encodeWorkspaceSnapshot(workspace, {
      locale: 'en-US',
    });
    apiRequestMock.mockResolvedValueOnce({
      project: {
        id: 'project-1',
        resourceType: 'project',
        name: 'Imported',
        isPublic: false,
        starsCount: 0,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
      workspace: wireWorkspace,
    });

    const result = await editorApi.importLocalProject('token', {
      name: 'Imported',
      resourceType: 'project',
      workspace,
      settings: { locale: 'en-US' },
    });

    const [, options] = apiRequestMock.mock.calls[0] as [
      string,
      RequestInit & { defaultHeaders?: HeadersInit },
    ];
    const requestBody = JSON.parse(options.body as string) as Record<
      string,
      unknown
    >;
    expect(requestBody.workspace).toEqual(wireWorkspace);
    expect(requestBody.workspace).not.toHaveProperty('docsById');
    expect(options.defaultHeaders).toEqual({
      'Content-Type': 'application/json',
    });
    expect(result.workspace.docsById['document-1']).toBeDefined();
    expect(result.settings).toEqual({ locale: 'en-US' });
  });

  it('atomically uploads referenced local asset bytes with a JSON-only manifest', async () => {
    const { workspace, contents, reference, materialization } =
      createWorkspaceWithAsset();
    const wireWorkspace = encodeWorkspaceSnapshot(workspace, {
      locale: 'zh-CN',
    });
    apiRequestMock.mockResolvedValueOnce({
      project: {
        id: 'project-asset',
        resourceType: 'project',
        name: 'Imported assets',
        isPublic: false,
        starsCount: 0,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      },
      workspace: wireWorkspace,
    });

    await editorApi.importLocalProject('token', {
      name: 'Imported assets',
      resourceType: 'project',
      workspace,
      settings: { locale: 'zh-CN' },
      assetMaterializations: [materialization],
    });

    const [path, options] = apiRequestMock.mock.calls[0] as [
      string,
      RequestInit & { token?: string },
    ];
    expect(path).toBe('/workspaces/import-local-project');
    expect(options.token).toBe('token');
    expect(options).not.toHaveProperty('defaultHeaders');
    expect(options.body).toBeInstanceOf(FormData);
    const body = options.body as FormData;
    const manifest = body.get('manifest');
    const asset = body.get('asset');
    expect(manifest).toBeInstanceOf(Blob);
    expect(asset).toBeInstanceOf(Blob);
    expect((manifest as File).name).toBe('manifest.json');
    expect((asset as File).name).toBe(reference.digest);
    expect((asset as Blob).type).toBe(reference.mediaType);
    expect(new Uint8Array(await (asset as Blob).arrayBuffer())).toEqual(
      contents
    );
    const decodedManifest = JSON.parse(
      await (manifest as Blob).text()
    ) as Record<string, unknown>;
    expect(decodedManifest.workspace).toEqual(wireWorkspace);
    expect(JSON.stringify(decodedManifest)).not.toContain('data:image');
    expect(JSON.stringify(decodedManifest)).not.toContain('iVBORw0KGgo=');
  });

  it('deduplicates shared asset bytes by digest while preserving every document reference', async () => {
    const {
      workspace: source,
      contents,
      reference,
      materialization,
    } = createWorkspaceWithAsset();
    const workspace: WorkspaceSnapshot = {
      ...source,
      treeById: {
        ...source.treeById,
        root: {
          ...source.treeById.root!,
          children: [...source.treeById.root!.children, 'asset-copy-node'],
        },
        'asset-copy-node': {
          id: 'asset-copy-node',
          kind: 'doc',
          name: 'logo-copy.png',
          parentId: 'root',
          docId: 'asset-2',
        },
      },
      docsById: {
        ...source.docsById,
        'asset-2': {
          ...source.docsById['asset-1']!,
          id: 'asset-2',
          path: '/logo-copy.png',
        },
      },
    };
    const wireWorkspace = encodeWorkspaceSnapshot(workspace, {});
    apiRequestMock.mockResolvedValueOnce({
      project: {
        id: 'project-shared-asset',
        resourceType: 'project',
        name: 'Shared asset',
        isPublic: false,
        starsCount: 0,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      },
      workspace: wireWorkspace,
    });

    await editorApi.importLocalProject('token', {
      name: 'Shared asset',
      resourceType: 'project',
      workspace,
      settings: {},
      assetMaterializations: [
        materialization,
        createBinaryAssetMaterialization({
          assetDocumentId: 'asset-2',
          reference,
          contents,
        }),
      ],
    });

    const body = apiRequestMock.mock.calls[0]?.[1].body as FormData;
    expect(body.getAll('asset')).toHaveLength(1);
    const manifest = JSON.parse(
      await (body.get('manifest') as Blob).text()
    ) as { workspace: { documents: Array<{ id: string }> } };
    expect(
      manifest.workspace.documents.filter((document) =>
        ['asset-1', 'asset-2'].includes(document.id)
      )
    ).toHaveLength(2);
  });

  it('fails closed before network access when local asset materializations are incomplete or unreferenced', async () => {
    const { workspace, materialization } = createWorkspaceWithAsset();
    await expect(
      editorApi.importLocalProject('token', {
        name: 'Missing asset',
        resourceType: 'project',
        workspace,
        settings: {},
      })
    ).rejects.toThrow('AST-2002');

    const withoutAssets = createWorkspace();
    await expect(
      editorApi.importLocalProject('token', {
        name: 'Unreferenced asset',
        resourceType: 'project',
        workspace: withoutAssets,
        settings: {},
        assetMaterializations: [materialization],
      })
    ).rejects.toThrow('AST-2001');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('commits a canonical WorkspaceOperation through the atomic endpoint', async () => {
    const workspace = createWorkspace();
    const document = workspace.docsById['document-1']!;
    const content = document.content as { metadata?: unknown };
    const resolvedMetadata = { name: 'Resolved' };
    const operation = {
      kind: 'command' as const,
      command: {
        id: 'operation-1',
        namespace: 'core.pir',
        type: 'document.update',
        version: '1.0',
        issuedAt: '2026-07-12T00:00:00.000Z',
        target: {
          workspaceId: workspace.id,
          documentId: 'document-1',
        },
        domainHint: 'pir' as const,
        forwardOps: [
          {
            op: 'add' as const,
            path: '/metadata',
            value: resolvedMetadata,
          },
        ],
        reverseOps: [
          content.metadata === undefined
            ? { op: 'remove' as const, path: '/metadata' }
            : {
                op: 'replace' as const,
                path: '/metadata',
                value: content.metadata,
              },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 2,
      updatedDocuments: [
        {
          ...document,
          contentRev: 2,
          content: encodePirContent({
            ...(document.content as object),
            metadata: resolvedMetadata,
          }),
          updatedAt: '2026-07-12T00:00:01.000Z',
        },
      ],
      acceptedMutationId: operation.command.id,
    });

    const mutation = await editorApi.commitWorkspaceOperation(
      'token',
      workspace,
      {
        expected: {
          documents: [{ id: 'document-1', contentRev: 1 }],
        },
        operation,
      },
      operation
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/workspaces/workspace-1/operations/commit',
      {
        token: 'token',
        defaultHeaders: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          expected: {
            documents: [{ id: 'document-1', contentRev: 1 }],
          },
          operation,
        }),
      }
    );
    expect(mutation.acceptedMutationId).toBe(operation.command.id);
  });

  it('preserves explicit null document absence preconditions on the wire', async () => {
    const workspace = createWorkspace();
    const newDocument = {
      id: 'document-new',
      type: 'pir-page' as const,
      name: 'new.pir.json',
      path: '/new.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    };
    const operation = {
      kind: 'command' as const,
      command: {
        id: 'operation-add-document',
        namespace: 'core.workspace',
        type: 'document.create',
        version: '1.0',
        issuedAt: '2026-07-12T00:00:00.000Z',
        target: { workspaceId: workspace.id },
        domainHint: 'workspace' as const,
        forwardOps: [
          {
            op: 'add' as const,
            path: '/docsById/document-new',
            value: newDocument,
          },
          {
            op: 'add' as const,
            path: '/treeById/document-node-new',
            value: {
              id: 'document-node-new',
              kind: 'doc',
              name: 'new.pir.json',
              parentId: 'root',
              docId: 'document-new',
            },
          },
          {
            op: 'replace' as const,
            path: '/treeById/root/children',
            value: ['document-node', 'document-node-new'],
          },
        ],
        reverseOps: [
          {
            op: 'replace' as const,
            path: '/treeById/root/children',
            value: ['document-node'],
          },
          {
            op: 'remove' as const,
            path: '/treeById/document-node-new',
          },
          { op: 'remove' as const, path: '/docsById/document-new' },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 1,
      opSeq: 2,
      tree: {
        treeRootId: workspace.treeRootId,
        treeById: {
          ...workspace.treeById,
          root: {
            ...workspace.treeById.root,
            children: ['document-node', 'document-node-new'],
          },
          'document-node-new': {
            id: 'document-node-new',
            kind: 'doc',
            name: 'new.pir.json',
            parentId: 'root',
            docId: 'document-new',
          },
        },
      },
      updatedDocuments: [
        {
          ...newDocument,
          content: encodePirContent(newDocument.content),
          updatedAt: '2026-07-12T00:00:01.000Z',
        },
      ],
      acceptedMutationId: operation.command.id,
    });

    await editorApi.commitWorkspaceOperation(
      'token',
      workspace,
      {
        expected: {
          workspaceRev: 1,
          documents: [{ id: 'document-new', contentRev: null, metaRev: null }],
        },
        operation,
      },
      operation
    );

    const [, options] = apiRequestMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(options.body as string) as {
      expected: { documents: Array<Record<string, unknown>> };
    };
    expect(requestBody.expected.documents).toEqual([
      { id: 'document-new', contentRev: null, metaRev: null },
    ]);
  });

  it('decodes every affected projection from an aggregate commit response', async () => {
    const workspace = createWorkspace();
    workspace.treeById.root!.children = [
      'document-node',
      'retired-document-node',
    ];
    workspace.treeById['retired-document-node'] = {
      id: 'retired-document-node',
      kind: 'doc',
      name: 'retired.pir.json',
      parentId: 'root',
      docId: 'retired-document',
    };
    workspace.docsById['retired-document'] = {
      id: 'retired-document',
      type: 'pir-page',
      name: 'retired.pir.json',
      path: '/retired.pir.json',
      contentRev: 3,
      metaRev: 2,
      content: createEmptyPirDocument(),
    };
    const nextTree = {
      treeRootId: workspace.treeRootId,
      treeById: {
        root: {
          ...workspace.treeById.root!,
          children: ['document-node'],
        },
        'document-node': workspace.treeById['document-node']!,
      },
    };
    const nextRouteManifest = {
      version: '1' as const,
      root: {
        id: 'root',
        children: [
          { id: 'route-primary', index: true, pageDocId: 'document-1' },
        ],
      },
    };
    const updatedDocument = {
      ...workspace.docsById['document-1']!,
      content: encodePirContent(workspace.docsById['document-1']!.content),
      name: 'Primary page',
      metaRev: 2,
      capabilities: ['pir.author'],
      updatedAt: '2026-07-12T00:01:00.000Z',
    };
    const operation = {
      kind: 'transaction' as const,
      transaction: {
        id: 'operation-aggregate',
        workspaceId: workspace.id,
        issuedAt: '2026-07-12T00:00:00.000Z',
        commands: [
          {
            id: 'operation-aggregate:workspace',
            namespace: 'core.workspace',
            type: 'documents.update',
            version: '1.0',
            issuedAt: '2026-07-12T00:00:00.000Z',
            target: { workspaceId: workspace.id },
            domainHint: 'workspace' as const,
            forwardOps: [
              {
                op: 'replace' as const,
                path: '/treeById/root/children',
                value: ['document-node'],
              },
              {
                op: 'remove' as const,
                path: '/treeById/retired-document-node',
              },
              {
                op: 'remove' as const,
                path: '/docsById/retired-document',
              },
              {
                op: 'add' as const,
                path: '/docsById/document-1/name',
                value: 'Primary page',
              },
              {
                op: 'add' as const,
                path: '/docsById/document-1/capabilities',
                value: ['pir.author'],
              },
            ],
            reverseOps: [
              {
                op: 'remove' as const,
                path: '/docsById/document-1/capabilities',
              },
              {
                op: 'remove' as const,
                path: '/docsById/document-1/name',
              },
              {
                op: 'add' as const,
                path: '/docsById/retired-document',
                value: workspace.docsById['retired-document'],
              },
              {
                op: 'add' as const,
                path: '/treeById/retired-document-node',
                value: workspace.treeById['retired-document-node'],
              },
              {
                op: 'replace' as const,
                path: '/treeById/root/children',
                value: ['document-node', 'retired-document-node'],
              },
            ],
          },
          {
            id: 'operation-aggregate:route',
            namespace: 'core.route',
            type: 'manifest.update',
            version: '1.0',
            issuedAt: '2026-07-12T00:00:00.000Z',
            target: { workspaceId: workspace.id },
            domainHint: 'route' as const,
            forwardOps: [
              {
                op: 'replace' as const,
                path: '/routeManifest',
                value: nextRouteManifest,
              },
            ],
            reverseOps: [
              {
                op: 'replace' as const,
                path: '/routeManifest',
                value: workspace.routeManifest,
              },
            ],
          },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 2,
      opSeq: 2,
      tree: nextTree,
      routeManifest: nextRouteManifest,
      updatedDocuments: [updatedDocument],
      removedDocumentIds: ['retired-document'],
      acceptedMutationId: operation.transaction.id,
    });

    const mutation = await editorApi.commitWorkspaceOperation(
      'token',
      workspace,
      {
        expected: {
          workspaceRev: 1,
          routeRev: 1,
          documents: [
            { id: 'document-1', metaRev: 1 },
            { id: 'retired-document', contentRev: 3, metaRev: 2 },
          ],
        },
        operation,
      },
      operation
    );

    expect(mutation).toMatchObject({
      tree: nextTree,
      routeManifest: nextRouteManifest,
      removedDocumentIds: ['retired-document'],
      updatedDocuments: [
        expect.objectContaining({
          id: 'document-1',
          name: 'Primary page',
          capabilities: ['pir.author'],
          metaRev: 2,
        }),
      ],
      acceptedMutationId: operation.transaction.id,
    });
  });

  it('rejects malformed wire responses at the API boundary', async () => {
    apiRequestMock.mockResolvedValueOnce({ workspace: {} });

    await expect(
      editorApi.getWorkspace('token', 'workspace-1')
    ).rejects.toThrow('/workspace/documents');
  });

  it('projects strict Workspace collaborator roles and issues bounded mutations', async () => {
    const grant = {
      principalId: 'editor-1',
      principalEmail: 'editor@example.test',
      principalName: 'Editor',
      role: 'editor' as const,
      grantedAt: '2026-07-20T01:02:03Z',
    };
    apiRequestMock
      .mockResolvedValueOnce({ roles: [grant] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(
      editorApi.listWorkspaceExecutionRoles('token', 'workspace-1')
    ).resolves.toEqual([grant]);
    await editorApi.putWorkspaceExecutionRole(
      'token',
      'workspace-1',
      ' Editor@Example.Test ',
      'editor'
    );
    await editorApi.deleteWorkspaceExecutionRole(
      'token',
      'workspace-1',
      'editor-1'
    );

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      '/workspaces/workspace-1/execution-roles',
      expect.objectContaining({ token: 'token' })
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      '/workspaces/workspace-1/execution-roles',
      expect.objectContaining({
        token: 'token',
        method: 'PUT',
        body: JSON.stringify({
          principalEmail: 'editor@example.test',
          role: 'editor',
        }),
      })
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      '/workspaces/workspace-1/execution-roles/editor-1',
      expect.objectContaining({ token: 'token', method: 'DELETE' })
    );
  });

  it('rejects widened or duplicate Workspace collaborator role projections', async () => {
    const grant = {
      principalId: 'viewer-1',
      principalEmail: 'viewer@example.test',
      principalName: 'Viewer',
      role: 'viewer',
      grantedAt: '2026-07-20T01:02:03Z',
    };
    apiRequestMock.mockResolvedValueOnce({
      roles: [{ ...grant, permissions: ['workspace.owner'] }],
    });
    await expect(
      editorApi.listWorkspaceExecutionRoles('token', 'workspace-1')
    ).rejects.toThrow('role grant is invalid');

    apiRequestMock.mockResolvedValueOnce({ roles: [grant, grant] });
    await expect(
      editorApi.listWorkspaceExecutionRoles('token', 'workspace-1')
    ).rejects.toThrow('role list is invalid');
  });
});
