import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { createDataOpenApiImportProposal } from '@prodivix/data-http';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useWorkspaceSemanticNavigationStore } from '@/editor/navigation';
import { useExecutionCenterNavigationStore } from '@/editor/features/execution/executionCenterNavigation';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { WorkspaceIssuesPage } from './WorkspaceIssuesPage';
import { useWorkspaceIssuesStore } from './workspaceIssuesStore';

const workspace = (): WorkspaceSnapshot => {
  const proposal = createDataOpenApiImportProposal({
    spec: {
      openapi: '3.1.0',
      info: { title: 'Catalog API', version: '1' },
      paths: {
        '/products': {
          get: {
            operationId: 'listProducts',
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    },
    documentId: 'data-catalog',
    importId: 'catalog-openapi',
    externalDocumentId: 'catalog-openapi-contract',
    sourceId: 'catalog',
    runtimeZone: 'server',
    baseUrl: 'https://catalog.example.test',
  });
  if (proposal.status !== 'ready') throw new Error('Invalid Data fixture.');
  return {
    id: 'project-data',
    workspaceRev: 2,
    routeRev: 1,
    opSeq: 2,
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
        name: 'catalog.data.json',
        parentId: 'root',
        docId: 'data-catalog',
      },
    },
    docsById: {
      'data-catalog': {
        id: 'data-catalog',
        type: 'data-source',
        path: '/data/catalog.data.json',
        contentRev: 1,
        metaRev: 1,
        content: proposal.document,
      },
    },
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

function RouteProbe() {
  const location = useLocation();
  return <output data-testid="route-probe">{location.pathname}</output>;
}

afterEach(() => {
  act(() => {
    useEditorStore.setState({ workspace: null, workspaceReadonly: false });
    useWorkspaceIssuesStore.getState().clearWorkspace();
    useWorkspaceSemanticNavigationStore.getState().clearNavigation();
    useExecutionCenterNavigationStore.getState().clear();
  });
});

describe('WorkspaceIssuesPage Data navigation', () => {
  it('filters to the exact Data operation and opens its Resources Inspector', async () => {
    const current = workspace();
    act(() => {
      useEditorStore.setState({ workspace: current, workspaceReadonly: false });
      useWorkspaceIssuesStore.getState().publishSnapshot({
        providerId: 'workspace-data-contract',
        workspaceId: current.id,
        revision: { key: '2:1:2', sequence: 1 },
        collectedAt: 10,
        diagnostics: [
          {
            code: 'DAT-1001',
            severity: 'error',
            domain: 'data',
            message: 'List products requires inspection.',
            targetRef: {
              kind: 'data-operation',
              documentId: 'data-catalog',
              operationId: 'listproducts',
            },
            meta: { path: '/operationsById/listproducts' },
          },
          {
            code: 'DAT-1001',
            severity: 'error',
            domain: 'data',
            message: 'Another operation must stay filtered out.',
            targetRef: {
              kind: 'data-operation',
              documentId: 'data-catalog',
              operationId: 'other-operation',
            },
            meta: { path: '/operationsById/other-operation' },
          },
        ],
      });
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/editor/project/project-data/issues?domain=data&documentId=data-catalog&operationId=listproducts',
        ]}
      >
        <Routes>
          <Route
            path="/editor/project/:projectId/issues"
            element={<WorkspaceIssuesPage />}
          />
          <Route
            path="/editor/project/:projectId/resources"
            element={<RouteProbe />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getAllByText('List products requires inspection.')
    ).toHaveLength(2);
    expect(
      screen.queryByText('Another operation must stay filtered out.')
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'issues.actions.openTarget' })
    );
    expect(screen.getByTestId('route-probe').textContent).toBe(
      '/editor/project/project-data/resources'
    );
    await waitFor(() =>
      expect(
        useWorkspaceSemanticNavigationStore.getState().navigationRequest
      ).toMatchObject({
        workspaceId: current.id,
        location: {
          kind: 'diagnostic-target',
          targetRef: {
            kind: 'data-operation',
            documentId: 'data-catalog',
            operationId: 'listproducts',
          },
        },
      })
    );
    expect(useEditorStore.getState().workspace?.activeDocumentId).toBe(
      'data-catalog'
    );
  });

  it('opens an active runtime diagnostic in its exact Execution Center session', () => {
    const current = workspace();
    act(() => {
      useEditorStore.setState({ workspace: current, workspaceReadonly: false });
      useWorkspaceIssuesStore.getState().publishSnapshot({
        providerId: 'execution-session-diagnostics',
        workspaceId: current.id,
        revision: { key: '2:1:2', sequence: 1 },
        collectedAt: 20,
        diagnostics: [
          {
            code: 'TST-5001',
            severity: 'error',
            domain: 'code',
            message: 'Generated test failed.',
            targetRef: {
              kind: 'code-artifact',
              artifactId: 'code-test',
            },
            meta: {
              executionSessionId: 'project-test:project-data',
              executionSnapshotId: 'snapshot-exact',
            },
          },
        ],
      });
    });

    render(
      <MemoryRouter initialEntries={['/editor/project/project-data/issues']}>
        <Routes>
          <Route
            path="/editor/project/:projectId/issues"
            element={<WorkspaceIssuesPage />}
          />
          <Route
            path="/editor/project/:projectId/blueprint"
            element={<RouteProbe />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'issues.actions.openExecution' })
    );
    expect(screen.getByTestId('route-probe').textContent).toBe(
      '/editor/project/project-data/blueprint'
    );
    expect(useExecutionCenterNavigationStore.getState().request).toMatchObject({
      workspaceId: current.id,
      sessionId: 'project-test:project-data',
      diagnosticCode: 'TST-5001',
      surface: 'console',
    });
  });
});
