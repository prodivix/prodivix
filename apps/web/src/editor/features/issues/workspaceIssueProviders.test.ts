import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  collectWorkspaceAnimationDiagnostics,
  resolveWorkspaceAnimationTrackLocation,
} from './workspaceAnimationIssueProvider';
import { collectWorkspaceCodeDiagnostics } from './workspaceCodeIssueProvider';
import {
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
});
