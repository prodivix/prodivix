import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import { createWorkspaceExecutionSnapshotRef } from '@prodivix/prodivix-compiler';
import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  collectWorkspaceAnimationDiagnostics,
  resolveWorkspaceAnimationTrackLocation,
} from './workspaceAnimationIssueProvider';
import { collectWorkspaceCodeDiagnostics } from './workspaceCodeIssueProvider';
import {
  collectExecutionSessionIssueSnapshot,
  collectWorkspaceModelIssueSnapshots,
  collectWorkspaceShaderCompileIssueSnapshot,
} from './workspaceIssueProviders';

const createWorkspace = (): WorkspaceSnapshot => {
  const pirDocument = createEmptyPirDocument();
  const rootNodeId = pirDocument.ui.graph.rootId;
  return {
    id: 'workspace-1',
    workspaceRev: 2,
    routeRev: 1,
    opSeq: 4,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['page-node', 'animation-node', 'code-node', 'shader-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      'code-node': {
        id: 'code-node',
        kind: 'doc',
        name: 'checkout.ts',
        parentId: 'root',
        docId: 'code-checkout',
      },
      'shader-node': {
        id: 'shader-node',
        kind: 'doc',
        name: 'main.wgsl',
        parentId: 'root',
        docId: 'code-shader',
      },
      'animation-node': {
        id: 'animation-node',
        kind: 'doc',
        name: 'checkout.pir-animation.json',
        parentId: 'root',
        docId: 'animation-checkout',
      },
    },
    docsById: {
      'page-home': {
        id: 'page-home',
        type: 'pir-page',
        path: '/pages/home.pir.json',
        contentRev: 2,
        metaRev: 1,
        content: pirDocument,
      },
      'animation-checkout': {
        id: 'animation-checkout',
        type: 'pir-animation',
        path: '/animations/checkout.pir-animation.json',
        contentRev: 2,
        metaRev: 1,
        content: {
          version: 1,
          target: { kind: 'pir-document', documentId: 'page-home' },
          svgFilters: [{ id: 'filter-shadow', primitives: [{ id: 'blur' }] }],
          timelines: [
            {
              id: 'timeline-checkout',
              name: 'Checkout',
              durationMs: 0,
              bindings: [
                {
                  id: 'binding-card',
                  targetNodeId: `${rootNodeId}-missing`,
                  tracks: [
                    {
                      id: 'track-shadow',
                      kind: 'svg-filter-attr',
                      filterId: 'filter-shadow',
                      primitiveId: 'missing-primitive',
                      attr: 'stdDeviation',
                      keyframes: [
                        { atMs: 200, value: 4 },
                        { atMs: 100, value: 2 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      'code-checkout': {
        id: 'code-checkout',
        type: 'code',
        path: '/src/checkout.ts',
        contentRev: 3,
        metaRev: 1,
        content: {
          language: 'ts',
          source: 'const valid = 1;\nexport const checkout = ;',
        },
      },
      'code-shader': {
        id: 'code-shader',
        type: 'code',
        path: '/shaders/main.wgsl',
        contentRev: 2,
        metaRev: 1,
        content: {
          language: 'wgsl',
          source: '@compute @workgroup_size(1) fn compute_main() {}',
          metadata: {
            'prodivix.shaderCompile': {
              schemaVersion: '1.0',
              target: 'webgpu',
              stage: 'compute',
              entryPoint: 'missing_main',
            },
          },
        },
      },
    },
    routeManifest: {
      version: '1',
      root: { id: 'route-root', pageDocId: 'page-home' },
    },
  };
};

describe('workspace issue providers', () => {
  it('publishes real code and animation diagnostics with stable locations', () => {
    const workspace = createWorkspace();
    const codeDiagnostics = collectWorkspaceCodeDiagnostics(workspace);
    expect(codeDiagnostics).toEqual([
      expect.objectContaining({
        code: 'COD-1001',
        targetRef: {
          kind: 'code-artifact',
          artifactId: 'code-checkout',
        },
        sourceSpan: {
          artifactId: 'code-checkout',
          startLine: 2,
          startColumn: 25,
          endLine: 2,
          endColumn: 26,
        },
      }),
    ]);

    const animationDiagnostics =
      collectWorkspaceAnimationDiagnostics(workspace);
    expect(animationDiagnostics.map((item) => item.code)).toEqual([
      'ANI-1001',
      'ANI-2001',
      'ANI-3002',
      'ANI-4001',
    ]);
    expect(animationDiagnostics[2]).toMatchObject({
      targetRef: {
        kind: 'animation-track',
        documentId: 'animation-checkout',
        timelineId: 'timeline-checkout',
        bindingId: 'binding-card',
        trackId: 'track-shadow',
      },
      meta: {
        path: '/timelines/0/bindings/0/tracks/0/primitiveId',
      },
    });
    const animationDocument = workspace.docsById['animation-checkout'];
    const workspaceWithCollidingLocalIds: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        'animation-a': {
          ...animationDocument,
          id: 'animation-a',
          path: '/animations/a.pir-animation.json',
        },
        ...workspace.docsById,
      },
    };
    expect(
      resolveWorkspaceAnimationTrackLocation(workspaceWithCollidingLocalIds, {
        kind: 'animation-track',
        documentId: 'animation-checkout',
        timelineId: 'timeline-checkout',
        bindingId: 'binding-card',
        trackId: 'track-shadow',
      })
    ).toEqual({
      documentId: 'animation-checkout',
      timelineId: 'timeline-checkout',
      bindingId: 'binding-card',
      trackId: 'track-shadow',
    });

    const providerIds = collectWorkspaceModelIssueSnapshots({
      workspace,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 10,
    }).map((snapshot) => snapshot.providerId);
    expect(providerIds).toContain('workspace-code-language');
    expect(providerIds).toContain('animation-validator');
  });

  it('publishes shader compile results as an independent async provider', async () => {
    const workspace = createWorkspace();
    const snapshot = await collectWorkspaceShaderCompileIssueSnapshot({
      workspace,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 11,
    });
    expect(snapshot).toMatchObject({
      providerId: 'workspace-shader-compile',
      workspaceId: workspace.id,
      revision: { key: '2:1:4', sequence: 1 },
      diagnostics: [
        expect.objectContaining({
          code: 'COD-5002',
          targetRef: {
            kind: 'code-artifact',
            artifactId: 'code-shader',
          },
        }),
      ],
    });
  });

  it('publishes route Server Function profile/export/slot issues', () => {
    const workspace = createWorkspace();
    const codeDocument = workspace.docsById['code-checkout'];
    const candidate: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'code-checkout': {
          ...codeDocument,
          content: {
            language: 'ts',
            source: 'export const loadPrincipal = () => null;',
            metadata: {
              'prodivix.serverRuntime': {
                schemaVersion: '1.0',
                functionsByExport: {
                  loadPrincipal: {
                    kind: 'route-loader',
                    runtimeZone: 'server',
                    adapterId: 'core.auth.current-principal',
                    effect: 'read',
                    auth: { kind: 'authenticated' },
                    inputSchema: true,
                    outputSchema: true,
                  },
                },
              },
            },
          },
        },
      },
      routeManifest: {
        ...workspace.routeManifest,
        root: {
          ...workspace.routeManifest.root,
          runtime: {
            guardRef: {
              artifactId: 'code-checkout',
              exportName: 'loadPrincipal',
            },
          },
        },
      },
    };
    const provider = collectWorkspaceModelIssueSnapshots({
      workspace: candidate,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 12,
    }).find(
      ({ providerId }) => providerId === 'workspace-server-runtime-authoring'
    );
    expect(provider).toMatchObject({
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-SLOT-MISMATCH',
          domain: 'route',
          targetRef: { kind: 'route', routeId: 'route-root' },
          meta: {
            slot: 'guard',
            artifactId: 'code-checkout',
            exportName: 'loadPrincipal',
          },
        },
      ],
    });
  });

  it('publishes an invalid Auth configuration even without a route binding', () => {
    const workspace = createWorkspace();
    const candidate: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'config-auth': {
          id: 'config-auth',
          type: 'project-config',
          path: '/config/auth.json',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'config',
            value: {
              schemaVersion: '1.0',
              providerId: 'prodivix-product-session',
              permissionIds: [],
              token: 'credential-material-is-rejected',
            },
          },
        },
      },
    };
    const provider = collectWorkspaceModelIssueSnapshots({
      workspace: candidate,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 13,
    }).find(
      ({ providerId }) => providerId === 'workspace-server-runtime-authoring'
    );
    expect(provider).toMatchObject({
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID',
          domain: 'workspace',
          targetRef: {
            kind: 'document',
            workspaceId: workspace.id,
            documentId: 'config-auth',
          },
          meta: { path: '/config/auth.json', documentId: 'config-auth' },
        },
      ],
    });
  });

  it('projects invalid canonical Data operations to exact Issues targets', () => {
    const workspace = createWorkspace();
    const candidate: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'data-catalog': {
          id: 'data-catalog',
          type: 'data-source',
          path: '/data/catalog.data.json',
          contentRev: 1,
          metaRev: 1,
          content: {
            source: {
              id: 'catalog',
              adapterId: 'core.http',
              runtimeZone: 'server',
              bindingsById: {},
              configurationByKey: {},
            },
            schemasById: {},
            operationsById: {
              broken: {
                id: 'broken',
                kind: 'query',
                outputSchemaId: 'missing-schema',
                configurationByKey: {},
                policies: {},
              },
            },
          },
        },
      },
    };
    const provider = collectWorkspaceModelIssueSnapshots({
      workspace: candidate,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 14,
    }).find(({ providerId }) => providerId === 'workspace-data-contract');

    expect(provider).toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'DAT-1001',
          domain: 'data',
          targetRef: {
            kind: 'data-operation',
            documentId: 'data-catalog',
            operationId: 'broken',
          },
        }),
      ]),
    });
  });

  it('projects only exact-snapshot execution diagnostics and strips provider-private metadata', () => {
    const workspace = createWorkspace();
    const exactWorkspace = createWorkspaceExecutionSnapshotRef(workspace);
    const provider = createExecutionProviderDescriptor({
      id: 'execution-issues-test',
      version: '1',
      isolation: 'remote-isolated',
      profiles: ['test'],
      runtimeZones: ['test'],
      invocationKinds: ['test'],
      capabilities: [],
    });
    const sessions = createExecutionSessionCoordinator();
    const activateDiagnostic = (
      sessionId: string,
      snapshotId: string,
      code: string
    ) => {
      const controller = createExecutionJobController({
        jobId: `job-${sessionId}`,
        provider,
        request: createExecutionRequest({
          requestId: `request-${sessionId}`,
          profile: 'test',
          runtimeZone: 'test',
          workspace: { ...exactWorkspace, snapshotId },
          invocation: {
            kind: 'test',
            targetRef: {
              kind: 'workspace',
              workspaceId: workspace.id,
            },
          },
          requiredCapabilities: [],
        }),
      });
      sessions.activate({ sessionId, job: controller.job });
      controller.markRunning();
      controller.emitDiagnostic({
        code,
        severity: 'error',
        domain: 'code',
        message: `${code} failed safely.`,
        targetRef: { kind: 'code-artifact', artifactId: 'code-checkout' },
        sourceSpan: {
          artifactId: 'code-checkout',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 2,
        },
        meta: {
          accessToken: 'provider-private-credential-canary',
          responseBody: 'must-not-enter-issues',
        },
      });
    };
    activateDiagnostic(
      'execution-exact',
      exactWorkspace.snapshotId,
      'TST-5001'
    );
    activateDiagnostic('execution-stale', 'snapshot-stale', 'TST-STALE');

    const snapshot = collectExecutionSessionIssueSnapshot({
      workspace,
      revision: { key: '2:1:4', sequence: 1 },
      collectedAt: 20,
      sessions: sessions.listSnapshots(),
    });

    expect(snapshot).toMatchObject({
      providerId: 'execution-session-diagnostics',
      workspaceId: workspace.id,
      diagnostics: [
        {
          code: 'TST-5001',
          targetRef: {
            kind: 'code-artifact',
            artifactId: 'code-checkout',
          },
          meta: {
            executionSessionId: 'execution-exact',
            executionJobId: 'job-execution-exact',
            executionProviderId: provider.id,
            executionSnapshotId: exactWorkspace.snapshotId,
          },
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /TST-STALE|provider-private-credential-canary|must-not-enter-issues|accessToken|responseBody/iu
    );
  });
});
