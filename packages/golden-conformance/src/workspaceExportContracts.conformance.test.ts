import { describe, expect, it } from 'vitest';
import { generateWorkspaceReactViteBundle } from '@prodivix/prodivix-compiler';
import {
  createWorkspaceDocumentAtPathCommand,
  createWorkspaceRouteIntentPlan,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  GOLDEN_ASSET_MATERIALIZATIONS,
  GOLDEN_CODEGEN_POLICY,
  GOLDEN_IDS,
} from './goldenApp.fixture';
import { applyGoldenOperation, authorGoldenWorkspace } from './goldenAuthoring';

const CONTRACT_ISSUED_AT = '2026-07-13T08:02:00.000Z';

const addDocument = (
  workspace: WorkspaceSnapshot,
  document: WorkspaceDocument
): WorkspaceSnapshot => {
  const command = createWorkspaceDocumentAtPathCommand({
    workspace,
    document,
    commandId: `golden-contract-add-${document.id}`,
    issuedAt: CONTRACT_ISSUED_AT,
  });
  return applyGoldenOperation(
    workspace,
    { kind: 'command', command },
    `add ${document.id}`
  );
};

const generate = (workspace: WorkspaceSnapshot) =>
  generateWorkspaceReactViteBundle(workspace, {
    projectName: 'Prodivix Golden Contract',
    codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
    assetMaterializations: GOLDEN_ASSET_MATERIALIZATIONS,
    packageResolver: { strategy: 'npm' },
  });

const blockingCodes = (
  bundle: ReturnType<typeof generateWorkspaceReactViteBundle>
) =>
  bundle.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.code);

const updateRouteNode = (
  node: WorkspaceSnapshot['routeManifest']['root'],
  routeNodeId: string,
  update: (
    target: WorkspaceSnapshot['routeManifest']['root']
  ) => WorkspaceSnapshot['routeManifest']['root']
): WorkspaceSnapshot['routeManifest']['root'] => {
  if (node.id === routeNodeId) return update(node);
  if (!node.children?.length) return node;
  return {
    ...node,
    children: node.children.map((child) =>
      updateRouteNode(child, routeNodeId, update)
    ),
  };
};

describe('Workspace export fail-closed contracts', () => {
  it('blocks route-outlet composition without blocking route-level component reuse', () => {
    const authored = authorGoldenWorkspace();
    const workspace: WorkspaceSnapshot = {
      ...authored.editedWorkspace,
      routeManifest: {
        ...authored.editedWorkspace.routeManifest,
        root: updateRouteNode(
          authored.editedWorkspace.routeManifest.root,
          GOLDEN_IDS.checkoutRoute,
          (route) => ({
            ...route,
            outletBindings: {
              ...route.outletBindings,
              summary: {
                outletNodeId: 'checkout-summary-slot',
                pageDocId: GOLDEN_IDS.orderSummaryComponent,
              },
            },
          })
        ),
      },
    };

    const bundle = generate(workspace);

    expect(blockingCodes(bundle)).toContain('WKS-EXPORT-OUTLET-UNSUPPORTED');
    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(
      bundle.metadata?.routeTopology?.routes.find(
        (route) => route.routeNodeId === GOLDEN_IDS.checkoutRoute
      )?.outletBindings
    ).toEqual([
      {
        outletName: 'summary',
        outletNodeId: 'checkout-summary-slot',
        pageDocId: GOLDEN_IDS.orderSummaryComponent,
      },
    ]);
  });

  it('blocks route layouts until page-to-outlet composition is implemented', () => {
    const authored = authorGoldenWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      authored.editedWorkspace,
      {
        type: 'attach-layout',
        routeNodeId: GOLDEN_IDS.checkoutRoute,
        layoutDocId: 'layout-golden-shell',
      },
      {
        id: 'golden-contract-attach-layout',
        issuedAt: CONTRACT_ISSUED_AT,
      }
    );
    if (!plan) throw new Error('Could not create the Golden layout plan.');
    const workspace = applyGoldenOperation(
      authored.editedWorkspace,
      plan,
      'attach Golden layout'
    );

    const bundle = generate(workspace);

    expect(blockingCodes(bundle)).toContain('WKS-EXPORT-LAYOUT-UNSUPPORTED');
    expect(bundle.metadata?.exportBlocked).toBe(true);
  });

  it('exports standalone NodeGraph and Animation documents', () => {
    const authored = authorGoldenWorkspace();
    const withGraph = addDocument(authored.editedWorkspace, {
      id: 'graph-golden-standalone',
      type: 'pir-graph',
      name: 'Standalone Graph',
      path: '/logic/standalone.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        nodes: [{ id: 'start', data: { kind: 'start' } }],
        edges: [],
      },
    });
    const workspace = addDocument(withGraph, {
      id: 'animation-golden-standalone',
      type: 'pir-animation',
      name: 'Standalone Animation',
      path: '/animations/standalone.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        target: {
          kind: 'pir-document',
          documentId: GOLDEN_IDS.checkoutPage,
        },
        timelines: [
          {
            id: 'timeline-golden-standalone',
            name: 'Golden standalone',
            durationMs: 300,
            bindings: [],
          },
        ],
      },
    });

    const bundle = generate(workspace);
    expect(bundle.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'WKS-EXPORT-DOCUMENT-UNSUPPORTED' })
    );
    expect(bundle.metadata?.sourceTraceSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'nodegraph' }),
        expect.objectContaining({ domain: 'animation' }),
      ])
    );
  });
});
