import { describe, expect, it } from 'vitest';
import {
  createEmptyPirComponentContract,
  createEmptyPirDocument,
  type PIRDocument,
} from '@prodivix/pir';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import { createWorkspaceVerificationImpactSet } from './workspaceVerificationImpact';

const pageContent = (componentDocumentId: string): PIRDocument => ({
  ui: {
    graph: {
      rootId: 'page-root',
      nodesById: {
        'page-root': {
          id: 'page-root',
          kind: 'element',
          type: 'container',
        },
        'catalog-card': {
          id: 'catalog-card',
          kind: 'component-instance',
          componentDocumentId,
          bindings: { props: {}, events: {}, variants: {} },
        },
      },
      childIdsById: {
        'page-root': ['catalog-card'],
        'catalog-card': [],
      },
      order: { strategy: 'childIdsById' },
    },
  },
});

const snapshot = (
  workspaceRev: number,
  componentName: string
): WorkspaceSnapshot => {
  const documents: WorkspaceDocument[] = [
    {
      id: 'page.catalog',
      type: 'pir-page',
      path: '/pages/catalog.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: pageContent('component.product-card'),
    },
    {
      id: 'component.product-card',
      type: 'pir-component',
      name: componentName,
      path: '/components/product-card.pir.json',
      contentRev: workspaceRev,
      metaRev: workspaceRev,
      content: createEmptyPirDocument({
        rootId: 'product-card-root',
        componentContract: createEmptyPirComponentContract(),
      }),
    },
  ];
  return {
    id: 'workspace:catalog',
    workspaceRev,
    routeRev: 1,
    opSeq: workspaceRev,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: documents.map((document) => `node:${document.id}`),
      },
      'node:page.catalog': {
        id: 'node:page.catalog',
        kind: 'doc',
        name: 'catalog.pir.json',
        parentId: 'root',
        docId: 'page.catalog',
      },
      'node:component.product-card': {
        id: 'node:component.product-card',
        kind: 'doc',
        name: 'product-card.pir.json',
        parentId: 'root',
        docId: 'component.product-card',
      },
    },
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: {
      version: '1',
      root: {
        id: 'route.catalog',
        pageDocId: 'page.catalog',
      },
    },
  };
};

const snapshotWithUnownedConfig = (
  workspaceRev: number,
  enabled: boolean
): WorkspaceSnapshot => {
  const base = snapshot(workspaceRev, 'Product card');
  return {
    ...base,
    treeById: {
      ...base.treeById,
      root: {
        ...base.treeById.root!,
        children: [
          ...(base.treeById.root!.children ?? []),
          'node:config.unowned',
        ],
      },
      'node:config.unowned': {
        id: 'node:config.unowned',
        kind: 'doc',
        name: 'settings.json',
        parentId: 'root',
        docId: 'config.unowned',
      },
    },
    docsById: {
      ...base.docsById,
      'config.unowned': {
        id: 'config.unowned',
        type: 'project-config',
        path: '/misc/settings.json',
        contentRev: workspaceRev,
        metaRev: 1,
        content: { enabled },
      },
    },
  };
};

describe('Workspace Verification semantic impact', () => {
  it('traces changed definitions through typed transitive consumers', () => {
    const result = createWorkspaceVerificationImpactSet({
      before: snapshot(1, 'Product card'),
      after: snapshot(2, 'Renamed product card'),
      operationIds: ['operation:rename'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      runtimeZones: ['browser'],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.impactSet.completeness).toBe('complete');
    expect(result.impactSet.changedDocumentIds).toEqual([
      'component.product-card',
    ]);
    expect(result.impactSet.impactedDomains).toContain('pir');
    expect(
      result.impactSet.impactPaths.some(
        (path) =>
          path.relationship === 'reference' &&
          path.nodes.some((node) => node.includes('catalog-card'))
      )
    ).toBe(true);
  });

  it('broadens instead of narrowing when the before revision is missing', () => {
    const result = createWorkspaceVerificationImpactSet({
      after: snapshot(2, 'Product card'),
      operationIds: ['operation:import'],
      frameworkTargets: ['react-vite', 'vue-vite'],
      runtimeZones: ['browser', 'server'],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.impactSet.completeness).toBe('conservative');
    expect(result.impactSet.riskFlags).toContain('unknown-impact');
    expect(
      result.impactSet.reasons.some(
        (reason) => reason.kind === 'missing-before'
      )
    ).toBe(true);
  });

  it('broadens when a changed document has no semantic owner contribution', () => {
    const result = createWorkspaceVerificationImpactSet({
      before: snapshotWithUnownedConfig(1, false),
      after: snapshotWithUnownedConfig(2, true),
      operationIds: ['operation:config'],
      frameworkTargets: ['react-vite'],
      runtimeZones: ['browser'],
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.impactSet.completeness).toBe('conservative');
    expect(result.impactSet.changedDocumentIds).toEqual(['config.unowned']);
    expect(result.impactSet.riskFlags).toContain('unknown-impact');
    expect(result.impactSet.reasons).toContainEqual(
      expect.objectContaining({
        kind: 'contributor-incomplete',
        sourceId: 'config.unowned',
      })
    );
  });

  it('fails closed on a mismatched revision range', () => {
    const result = createWorkspaceVerificationImpactSet({
      before: snapshot(3, 'Product card'),
      after: snapshot(2, 'Product card'),
      operationIds: [],
      frameworkTargets: ['react-vite'],
      runtimeZones: ['browser'],
    });
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'VER-1001',
    });
  });
});
