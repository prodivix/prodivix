import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { ApiError } from '@/infra/api';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { resetEditorStore } from '@/test-utils/editorStore';
import Editor from '@/editor/Editor';
import EditorHome from '@/editor/EditorHome';

const host = vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  return {
    getProject: vi.fn(),
    getWorkspace: vi.fn(),
    getCapabilities: vi.fn(),
    listProjects: vi.fn(),
    localCatalog: vi.fn(),
    loadReplica: vi.fn(),
    saveReplica: vi.fn(),
    token: 'session' as string | null,
    t: (key: string, fallback?: string) => fallback ?? key,
  };
});
vi.mock('@/auth/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({
      token: host.token,
      hasHydrated: true,
      isAuthenticated: () => Boolean(host.token),
    }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: host.t }) }));
vi.mock('@/editor/editorApi', () => ({
  editorApi: {
    getProject: host.getProject,
    getWorkspace: host.getWorkspace,
    getWorkspaceCapabilities: host.getCapabilities,
    listProjects: host.listProjects,
  },
}));
vi.mock('@/editor/workspaceSync/workspaceLocalReplica', () => ({
  loadMaterializedWorkspaceLocalReplica: host.loadReplica,
  canOpenWorkspaceLocalReplicaAfter: (error: unknown) =>
    error instanceof TypeError,
}));
vi.mock('@/editor/workspaceSync/indexedDbWorkspaceLocalReplicaStore', () => ({
  saveWorkspaceLocalReplica: host.saveReplica,
}));
vi.mock('@/editor/localProjectStore', async (original) => ({
  ...(await original<object>()),
  listLocalProjectCatalog: host.localCatalog,
}));
vi.mock('@/editor/EditorBar/EditorBar', () => ({ default: () => null }));
vi.mock('@/editor/EditorDebugFloatingBall', () => ({
  EditorDebugFloatingBall: () => null,
}));
vi.mock('@/editor/features/settings/SettingsEffects', () => ({
  SettingsEffects: () => null,
}));
vi.mock(
  '@/editor/features/revisionConflict/WorkspaceRevisionConflictSurface',
  () => ({ WorkspaceRevisionConflictSurface: () => null })
);
vi.mock('@/editor/workspaceSync/WorkspaceOutboxEffects', () => ({
  WorkspaceOutboxEffects: () => null,
}));
vi.mock('@/editor/features/issues', () => ({
  WorkspaceIssuesEffects: () => null,
}));
vi.mock('@/editor/features/code', () => ({ CodeAuthoringOverlay: () => null }));
vi.mock('@/editor/pluginGatewayServices', () => ({
  createEditorPluginGatewayServices: () => ({}),
}));
vi.mock('@/plugins/platform', () => ({
  WebPluginPlatformProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/editor/EditorTipsRandom', () => ({ EditorTipsRandom: () => null }));
vi.mock('@/editor/EditorBar/EditorBarExitModal', () => ({
  EditorBarExitModal: () => null,
}));
vi.mock('@/editor/features/newfile/NewResourceModal', () => ({
  default: () => null,
}));
vi.mock('@/editor/ProjectCard', () => ({
  ProjectCard: ({ project }: { project: { name: string } }) => (
    <button>{project.name}</button>
  ),
}));

const workspace: WorkspaceSnapshot = {
  id: 'remote-workspace',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  activeDocumentId: 'page',
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      parentId: null,
      name: '/',
      children: ['node'],
    },
    node: {
      id: 'node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
};
const project = {
  id: workspace.id,
  resourceType: 'project' as const,
  name: 'Cached workspace',
  isPublic: false,
  starsCount: 0,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const replica = { workspace, project, settings: {}, capabilities: {} };
const openEditor = () =>
  render(
    <MemoryRouter initialEntries={['/editor/project/remote-workspace']}>
      <Routes>
        <Route path="/editor/project/:projectId" element={<Editor />}>
          <Route index element={<p>Workspace ready</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('Editor local startup before remote settlement', () => {
  beforeEach(() => {
    resetEditorStore();
    vi.clearAllMocks();
    host.token = 'session';
    host.getProject.mockReturnValue(new Promise(() => undefined));
    host.getWorkspace.mockReturnValue(new Promise(() => undefined));
    host.listProjects.mockReturnValue(new Promise(() => undefined));
    host.loadReplica.mockResolvedValue(replica);
    host.getCapabilities.mockResolvedValue({
      workspaceId: workspace.id,
      capabilities: {},
    });
    host.saveReplica.mockResolvedValue(undefined);
  });
  it('opens a materialized local replica while the remote connection is still pending', async () => {
    openEditor();
    expect(await screen.findByText('Workspace ready')).toBeTruthy();
    expect(selectWorkspace(useEditorStore.getState())?.id).toBe(workspace.id);
    expect(host.saveReplica).not.toHaveBeenCalled();
  });
  it('removes cached authoring state if the remote service denies permission', async () => {
    let reject!: (error: Error) => void;
    host.getWorkspace.mockReturnValue(
      new Promise((_, denied) => {
        reject = denied;
      })
    );
    openEditor();
    await screen.findByText('Workspace ready');
    await act(async () => {
      reject(new ApiError('Access denied.', 403, 'API-403'));
    });
    expect(
      await screen.findByText('This project cannot be opened')
    ).toBeTruthy();
    expect(selectWorkspace(useEditorStore.getState())).toBeNull();
  });
  it('does not open a remote cached workspace without an authenticated session', async () => {
    host.token = null;
    openEditor();
    await screen.findByText(
      'Authentication is required to open this workspace.'
    );
    expect(host.loadReplica).not.toHaveBeenCalled();
  });
  it('shows local project cards before a stalled remote project catalog settles', async () => {
    host.localCatalog.mockResolvedValue([
      { ...project, id: 'local-project', name: 'Local project' },
    ]);
    render(
      <MemoryRouter>
        <EditorHome />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Local project' })).toBeTruthy()
    );
    expect(host.listProjects).toHaveBeenCalledOnce();
  });
});
