import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { RuntimeZone } from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { generateWorkspaceReactViteExecutableProject } from '#src/executableProject/workspaceExecutableProject';
import { generateWorkspaceReactViteBundle } from '#src/react/workspaceProject';
import {
  analyzeWorkspaceDataRuntimeTarget,
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  STATIC_CLIENT_DATA_RUNTIME_TARGET,
} from '#src/react/workspaceDataRuntimeTarget';

const SECRET_BINDING_CANARY = 'compile-secret-binding-canary';
const PUBLIC_BINDING_CANARY = 'compile-public-binding-canary';

const createDataWorkspace = (
  runtimeZone: RuntimeZone,
  options: Readonly<{ clientEnvironmentReference?: boolean }> = {}
): WorkspaceSnapshot => {
  const usesServerGateway = runtimeZone === 'server' || runtimeZone === 'edge';
  const usesEnvironment =
    usesServerGateway || options.clientEnvironmentReference;
  return {
    id: `data-target-${runtimeZone}`,
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
        children: ['page-node', 'data-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'page.pir.json',
        parentId: 'root',
        docId: 'page',
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
      page: {
        id: 'page',
        type: 'pir-page',
        path: '/page.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: createEmptyPirDocument(),
      },
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
            runtimeZone,
            bindingsById: usesEnvironment
              ? {
                  [PUBLIC_BINDING_CANARY]: {
                    kind: 'environment-ref',
                    reference: { bindingId: PUBLIC_BINDING_CANARY },
                  },
                  ...(usesServerGateway
                    ? {
                        [SECRET_BINDING_CANARY]: {
                          kind: 'secret-ref' as const,
                          reference: { bindingId: SECRET_BINDING_CANARY },
                        },
                      }
                    : {}),
                }
              : {},
            configurationByKey: {
              baseUrl: usesEnvironment
                ? {
                    kind: 'environment-ref',
                    reference: { bindingId: PUBLIC_BINDING_CANARY },
                  }
                : { kind: 'literal', value: 'https://api.example.test' },
              ...(usesServerGateway
                ? {
                    authorization: {
                      kind: 'secret-ref' as const,
                      reference: { bindingId: SECRET_BINDING_CANARY },
                    },
                  }
                : {}),
            },
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
              configurationByKey: {
                method: { kind: 'literal', value: 'GET' },
                path: { kind: 'literal', value: '/products' },
              },
              policies: {},
            },
          },
        },
      },
    },
    routeManifest: {
      version: '1',
      root: { id: 'root-route', pageDocId: 'page' },
    },
  };
};

describe('Workspace Data runtime target Gate', () => {
  it('blocks server Data from the default static client target', () => {
    const workspace = createDataWorkspace('server');
    const analysis = analyzeWorkspaceDataRuntimeTarget(workspace);
    const bundle = generateWorkspaceReactViteBundle(workspace);

    expect(analysis.target).toBe(STATIC_CLIENT_DATA_RUNTIME_TARGET);
    expect(analysis.requirements).toMatchObject({
      runtimeZones: ['server'],
      requiresNetwork: true,
      requiresServerGateway: true,
      requiresEnvironmentBinding: true,
    });
    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(bundle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-DATA-SERVER-GATEWAY-REQUIRED',
        path: '/products.data.json',
      })
    );
    expect(JSON.stringify(bundle.diagnostics)).not.toContain(
      SECRET_BINDING_CANARY
    );
  });

  it('compiles server Data only for the explicit execution parent gateway target', () => {
    const workspace = createDataWorkspace('server');
    const result = generateWorkspaceReactViteExecutableProject(workspace, {
      dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
    });

    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.preview).toEqual(
      expect.arrayContaining(['environment-binding', 'network'])
    );
    const runtime = result.snapshot.files.find(
      (file) => file.path === 'src/prodivix-data-runtime.ts'
    );
    expect(runtime?.contents).toContain('execution-data-gateway-message-v1');
    expect(JSON.stringify(result.snapshot)).not.toContain(
      SECRET_BINDING_CANARY
    );
    expect(JSON.stringify(result.snapshot)).not.toContain(
      PUBLIC_BINDING_CANARY
    );
  });

  it('blocks unresolved client environment references even when a server gateway exists', () => {
    const workspace = createDataWorkspace('client', {
      clientEnvironmentReference: true,
    });
    const result = generateWorkspaceReactViteExecutableProject(workspace, {
      dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-DATA-CLIENT-ENVIRONMENT-UNAVAILABLE',
      })
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      PUBLIC_BINDING_CANARY
    );
  });

  it('allows server documents only in provider-forced mock mode without live capabilities', () => {
    const workspace = createDataWorkspace('server');
    const result = generateWorkspaceReactViteExecutableProject(workspace, {
      dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
    });

    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.preview).not.toContain(
      'environment-binding'
    );
    expect(result.snapshot.capabilityRequirements.preview).not.toContain(
      'network'
    );
    const runtime = result.snapshot.files.find(
      (file) => file.path === 'src/prodivix-data-runtime.ts'
    );
    expect(runtime?.contents).toContain('"runtimeMode":"mock-only"');
    expect(runtime?.contents).toContain('DATA_RUNTIME_TARGET_MODE_INVALID');
  });

  it('blocks runtime zones outside the standalone client/server/edge contract', () => {
    const result = generateWorkspaceReactViteExecutableProject(
      createDataWorkspace('worker'),
      { dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET }
    );

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-DATA-RUNTIME-ZONE-UNSUPPORTED',
      })
    );
  });
});
