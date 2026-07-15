import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceCodeArtifactProvider,
  createWorkspacePirDocumentUpdateCommand,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { scanControlledSourceRegions } from '@prodivix/authoring';
import {
  augmentWorkspaceOperationWithControlledSource,
  createControlledCodeDocumentsPlan,
  createControlledCodeEditPlan,
  createControlledSourceAttachmentPlan,
} from './controlledRoundTrip';

const page = (type: string, color = 'red'): PIRDocument => ({
  metadata: { name: 'Round Trip Page' },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: {
          id: 'root',
          kind: 'element',
          type,
          text: { kind: 'literal', value: 'Hello' },
          style: {
            color: { kind: 'literal', value: color },
            opacity: { kind: 'literal', value: 0.5 },
          },
          events: {
            click: { kind: 'navigate-route', routeId: 'route-details' },
          },
        },
      },
      childIdsById: { root: [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'round-trip-workspace',
  workspaceRev: 4,
  routeRev: 1,
  opSeq: 3,
  treeRootId: 'root-dir',
  activeDocumentId: 'page-home',
  treeById: {
    'root-dir': {
      id: 'root-dir',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'code-node', 'style-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root-dir',
      docId: 'page-home',
    },
    'code-node': {
      id: 'code-node',
      kind: 'doc',
      name: 'Home.tsx',
      parentId: 'root-dir',
      docId: 'code-home',
    },
    'style-node': {
      id: 'style-node',
      kind: 'doc',
      name: 'Home.css',
      parentId: 'root-dir',
      docId: 'style-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: page('main'),
    },
    'code-home': {
      id: 'code-home',
      type: 'code',
      path: '/Home.tsx',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const helper = 1;\n',
      },
    },
    'style-home': {
      id: 'style-home',
      type: 'code',
      path: '/Home.css',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'css',
        source: ':root { --brand: red; }\n',
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
});

const applyOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceSnapshot => {
  const result =
    operation.kind === 'command'
      ? applyWorkspaceCommand(workspace, operation.command)
      : applyWorkspaceTransaction(workspace, operation.transaction);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return result.snapshot;
};

const sourceOf = (workspace: WorkspaceSnapshot, documentId: string): string =>
  (workspace.docsById[documentId]!.content as { source: string }).source;

describe('controlled visual/code round-trip conformance', () => {
  it('creates the JSX and CSS projections in one transaction', () => {
    const workspace = createWorkspace();
    const plan = createControlledCodeDocumentsPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      pirDocumentId: 'page-home',
      parentNodeId: workspace.treeRootId,
      jsx: {
        codeDocumentId: 'controlled-jsx',
        nodeId: 'controlled-jsx-node',
        name: 'Home.controlled.tsx',
      },
      css: {
        codeDocumentId: 'controlled-css',
        nodeId: 'controlled-css-node',
        name: 'Home.controlled.css',
      },
      operationId: 'create-controlled-code',
      issuedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.operation.kind).toBe('transaction');
    const created = applyOperation(workspace, plan.operation);
    expect(
      createWorkspaceCodeArtifactProvider(created).getArtifact('controlled-jsx')
        ?.controlledSource?.regions[0]
    ).toMatchObject({ adapterId: 'react-jsx' });
    expect(
      createWorkspaceCodeArtifactProvider(created).getArtifact('controlled-css')
        ?.controlledSource?.regions[0]
    ).toMatchObject({ adapterId: 'css' });
  });

  it('keeps PIR, JSX, and CSS atomic while preserving unmanaged source', () => {
    const initial = createWorkspace();
    const jsxAttachment = createControlledSourceAttachmentPlan({
      workspace: initial,
      baseRevision: initial.workspaceRev,
      pirDocumentId: 'page-home',
      codeDocumentId: 'code-home',
      adapterId: 'react-jsx',
      operationId: 'attach-jsx',
      issuedAt: '2026-07-15T00:00:00.000Z',
    });
    expect(jsxAttachment.status).toBe('ready');
    if (jsxAttachment.status !== 'ready') return;
    const withJsx = applyOperation(initial, jsxAttachment.operation);

    const cssAttachment = createControlledSourceAttachmentPlan({
      workspace: withJsx,
      baseRevision: withJsx.workspaceRev,
      pirDocumentId: 'page-home',
      codeDocumentId: 'style-home',
      adapterId: 'css',
      operationId: 'attach-css',
      issuedAt: '2026-07-15T00:00:30.000Z',
    });
    expect(cssAttachment.status).toBe('ready');
    if (cssAttachment.status !== 'ready') return;
    const attached = applyOperation(withJsx, cssAttachment.operation);
    expect(
      createWorkspaceCodeArtifactProvider(attached).getArtifact('code-home')
    ).toMatchObject({ ownership: 'adapted' });
    expect(
      createWorkspaceCodeArtifactProvider(attached).getArtifact('style-home')
    ).toMatchObject({ ownership: 'adapted' });
    expect(sourceOf(attached, 'code-home')).toMatch(
      /^export const helper = 1;\n/
    );
    expect(sourceOf(attached, 'style-home')).toMatch(
      /^:root \{ --brand: red; \}\n/
    );

    const jsxScan = scanControlledSourceRegions(
      sourceOf(attached, 'code-home')
    );
    expect(jsxScan.status).toBe('ready');
    if (jsxScan.status !== 'ready') return;
    const jsxRegion = jsxScan.regions[0]!;
    const editedJsxBody = jsxRegion.body
      .replace('<main', '<section')
      .replace('</main>', '</section>');
    const jsxCandidate = `${sourceOf(attached, 'code-home').slice(0, jsxRegion.bodyFrom)}${editedJsxBody}${sourceOf(attached, 'code-home').slice(jsxRegion.bodyTo)}\nexport const unknownCode = 42;\n`;
    const jsxEdit = createControlledCodeEditPlan({
      workspace: attached,
      baseRevision: attached.workspaceRev,
      codeDocumentId: 'code-home',
      source: jsxCandidate,
      operationId: 'jsx-edit',
      issuedAt: '2026-07-15T00:01:00.000Z',
    });
    expect(jsxEdit.status).toBe('ready');
    if (jsxEdit.status !== 'ready') return;
    const augmentedJsx = augmentWorkspaceOperationWithControlledSource({
      workspace: attached,
      operation: jsxEdit.operation,
    });
    expect(augmentedJsx.status).toBe('ready');
    if (augmentedJsx.status !== 'ready') return;
    const afterJsx = applyOperation(attached, augmentedJsx.operation);
    expect(
      (afterJsx.docsById['page-home']!.content as PIRDocument).ui.graph
        .nodesById.root
    ).toMatchObject({
      type: 'section',
      events: {
        click: { kind: 'navigate-route', routeId: 'route-details' },
      },
    });

    const cssScan = scanControlledSourceRegions(
      sourceOf(afterJsx, 'style-home')
    );
    expect(cssScan.status).toBe('ready');
    if (cssScan.status !== 'ready') return;
    const cssRegion = cssScan.regions[0]!;
    const cssCandidate = `${sourceOf(afterJsx, 'style-home').slice(0, cssRegion.bodyFrom)}${cssRegion.body.replace('color: red;', 'color: blue;')}${sourceOf(afterJsx, 'style-home').slice(cssRegion.bodyTo)}\n.unknown { display: contents; }\n`;
    const cssEdit = createControlledCodeEditPlan({
      workspace: afterJsx,
      baseRevision: afterJsx.workspaceRev,
      codeDocumentId: 'style-home',
      source: cssCandidate,
      operationId: 'css-edit',
      issuedAt: '2026-07-15T00:01:30.000Z',
    });
    expect(cssEdit.status).toBe('ready');
    if (cssEdit.status !== 'ready') return;
    const augmentedCss = augmentWorkspaceOperationWithControlledSource({
      workspace: afterJsx,
      operation: cssEdit.operation,
    });
    expect(augmentedCss.status).toBe('ready');
    if (augmentedCss.status !== 'ready') return;
    const afterCss = applyOperation(afterJsx, augmentedCss.operation);
    expect(
      (afterCss.docsById['page-home']!.content as PIRDocument).ui.graph
        .nodesById.root
    ).toMatchObject({
      style: { color: { kind: 'literal', value: 'blue' } },
    });

    const beforeVisualPir = afterCss.docsById['page-home']!
      .content as PIRDocument;
    const visualCommand = createWorkspacePirDocumentUpdateCommand({
      workspace: afterCss,
      documentId: 'page-home',
      before: beforeVisualPir,
      after: page('article', 'green'),
      commandId: 'visual-edit',
      issuedAt: '2026-07-15T00:02:00.000Z',
    });
    expect(visualCommand).not.toBeNull();
    if (!visualCommand) return;
    const augmentedVisual = augmentWorkspaceOperationWithControlledSource({
      workspace: afterCss,
      operation: { kind: 'command', command: visualCommand },
    });
    expect(augmentedVisual.status).toBe('ready');
    if (augmentedVisual.status !== 'ready') return;
    expect(augmentedVisual.operation.kind).toBe('transaction');
    const afterVisual = applyOperation(afterCss, augmentedVisual.operation);
    const finalJsx = sourceOf(afterVisual, 'code-home');
    const finalCss = sourceOf(afterVisual, 'style-home');
    expect(finalJsx).toContain('<article');
    expect(finalJsx).toContain('</article>');
    expect(finalJsx).toContain('export const unknownCode = 42;\n');
    expect(finalCss).toContain('color: green;');
    expect(finalCss).toContain('.unknown { display: contents; }\n');
  });
});
