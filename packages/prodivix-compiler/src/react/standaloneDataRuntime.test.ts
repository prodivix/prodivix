import { transformWithEsbuild } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceStandaloneDataRuntimeModule } from './standaloneDataRuntime';

const workspace: WorkspaceSnapshot = {
  id: 'standalone-data-runtime',
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
      children: ['data-node'],
    },
    'data-node': {
      id: 'data-node',
      kind: 'doc',
      name: 'products.data.json',
      parentId: 'root',
      docId: 'data-products',
    },
  },
  docsById: {
    'data-products': {
      id: 'data-products',
      type: 'data-source',
      path: '/products.data.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        source: {
          id: 'products',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        schemasById: {
          products: {
            id: 'products',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
            },
          },
        },
        operationsById: {
          'list-products': {
            id: 'list-products',
            kind: 'query',
            outputSchemaId: 'products',
            configurationByKey: {},
            policies: {},
          },
        },
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'root-route' } },
};

type Runtime = Readonly<{
  subscribeDataLifecycle(listener: () => void): () => void;
  resolveDataLifecycleSnapshot(request: unknown): Readonly<{
    status: string;
    value?: unknown;
  }>;
  dispose(): void;
}>;

describe('standalone Data runtime projection', () => {
  it('publishes loading then success from the provider-projected fixture asset', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(workspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const fetch = vi.fn(async () =>
      Response.json({
        fixtureSetId: 'standalone-test',
        emulatedAdapterIds: ['core.http'],
        fixtures: [
          {
            id: 'products',
            documentId: 'data-products',
            operationId: 'list-products',
            operationKind: 'query',
            behavior: {
              kind: 'result',
              value: [{ id: 'p1' }],
              empty: false,
            },
          },
        ],
      })
    );
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      transformed.code
    )(record, record.exports, fetch);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding: {
        operation: {
          documentId: 'data-products',
          operationId: 'list-products',
        },
      },
    };
    const published = new Promise<void>((resolve) =>
      runtime.subscribeDataLifecycle(resolve)
    );

    expect(runtime.resolveDataLifecycleSnapshot(request).status).toBe(
      'loading'
    );
    await published;
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'success',
      value: [{ id: 'p1' }],
    });
    expect(fetch).toHaveBeenCalledWith(
      '/.prodivix/data-mock-provision.json',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })
    );
    runtime.dispose();
  });
});
