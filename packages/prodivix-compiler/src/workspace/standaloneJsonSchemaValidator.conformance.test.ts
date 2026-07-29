import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createWorkspaceStandaloneDataRuntimeModules,
  WORKSPACE_DATA_RUNTIME_MODULE_ID,
} from '#src/workspace/standaloneDataRuntime';
import { compileStandaloneJsonSchemaValidator } from '#src/workspace/standaloneJsonSchemaValidator';
import {
  createWorkspaceStandaloneServerRuntimeModules,
  WORKSPACE_SERVER_RUNTIME_MODULE_ID,
} from '#src/workspace/standaloneServerRuntime';
import { DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET } from '#src/workspace/workspaceServerRuntimeTarget';
import type { WorkspaceServerRuntimeBinding } from '#src/workspace/workspaceServerRuntimeTarget';

const dynamicCodePattern =
  /\beval\s*\(|\bnew\s+Function\s*\(|\bset(?:Interval|Timeout)\s*\(\s*['"]/u;

const workspace: WorkspaceSnapshot = {
  id: 'standalone-validator-conformance',
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
      children: ['data-products-node'],
    },
    'data-products-node': {
      id: 'data-products-node',
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
      contentRev: 3,
      metaRev: 2,
      content: {
        source: {
          id: 'products',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        schemasById: {
          product: {
            id: 'product',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              additionalProperties: false,
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 1 },
              },
            },
          },
          products: {
            id: 'products',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
              items: { $ref: '#/$defs/product' },
              $defs: {
                product: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
        },
        operationsById: {},
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root-route' },
  },
};

const serverBinding: WorkspaceServerRuntimeBinding = {
  routeNodeId: 'route-products',
  routeKind: 'action',
  documentPath: '/products.server.ts',
  definition: {
    reference: {
      artifactId: 'code-products',
      exportName: 'createProduct',
    },
    kind: 'route-action',
    runtimeZone: 'server',
    adapterId: 'test.products.create',
    effect: 'mutation',
    auth: { kind: 'authenticated' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1 } },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['created'],
      properties: { created: { type: 'boolean' } },
    },
    idempotency: { kind: 'invocation-key' },
  },
};

describe('standalone JSON Schema validator projection', () => {
  it('emits ordinary CSP-safe ESM validator code at Compiler time', () => {
    const source = compileStandaloneJsonSchemaValidator({
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1 } },
    });

    expect(source).toContain('validateStandaloneJsonSchemaValue');
    expect(source).not.toMatch(dynamicCodePattern);
  });

  it('wires Data runtime schemas through one exact precompiled authority', () => {
    const modules = createWorkspaceStandaloneDataRuntimeModules(workspace);
    const runtime = modules.find(
      ({ id }) => id === WORKSPACE_DATA_RUNTIME_MODULE_ID
    );
    const authority = modules.find(
      ({ id }) => id === 'workspace-data-runtime-validator-authority'
    );
    const validators = modules.filter(
      ({ id }) =>
        id.startsWith('workspace-data-runtime-validator-') &&
        id !== 'workspace-data-runtime-validator-authority'
    );

    expect(runtime?.imports).toEqual([
      expect.objectContaining({
        kind: 'default',
        source: 'workspace-data-runtime-validator-authority',
      }),
    ]);
    expect(authority?.imports).toHaveLength(2);
    expect(validators).toHaveLength(2);
    expect(
      modules.flatMap(({ imports }) => imports).map(({ source }) => source)
    ).not.toContain('ajv/dist/2020.js');
    expect(modules.map(({ desiredPath }) => desiredPath)).toEqual(
      expect.arrayContaining([
        'src/prodivix-data-runtime-validator-authority.ts',
        'src/prodivix-data-runtime-validators/000.ts',
        'src/prodivix-data-runtime-validators/001.ts',
      ])
    );
    for (const module of modules) {
      expect(module.body).not.toMatch(dynamicCodePattern);
    }
  });

  it('wires deterministic Server input/output schemas without runtime Ajv', () => {
    const modules = createWorkspaceStandaloneServerRuntimeModules(
      DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      [serverBinding]
    );
    const runtime = modules.find(
      ({ id }) => id === WORKSPACE_SERVER_RUNTIME_MODULE_ID
    );
    const validators = modules.filter(({ id }) =>
      id.startsWith('workspace-server-runtime-validator-')
    );

    expect(runtime?.imports).toHaveLength(2);
    expect(validators).toHaveLength(2);
    expect(
      modules.flatMap(({ imports }) => imports).map(({ source }) => source)
    ).not.toContain('ajv/dist/2020.js');
    expect(validators.map(({ desiredPath }) => desiredPath)).toEqual([
      'src/prodivix-server-runtime-validators/000-input.ts',
      'src/prodivix-server-runtime-validators/000-output.ts',
    ]);
    for (const module of modules) {
      expect(module.body).not.toMatch(dynamicCodePattern);
    }
  });
});
