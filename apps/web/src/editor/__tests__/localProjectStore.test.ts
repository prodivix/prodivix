import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createLocalProject,
  deleteLocalProject,
  duplicateLocalProject,
  getLocalProject,
  isSyncedLocalProject,
  listLocalProjects,
  markLocalProjectSynced,
  saveLocalWorkspaceSnapshot,
  updateLocalProject,
} from '@/editor/localProjectStore';

type MockRequest<T = unknown> = {
  result?: T;
  error?: Error | null;
  onsuccess?: (() => void) | null;
  onerror?: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
};

type PersistedProject = Record<string, unknown> & { id: string };

const records = new Map<string, PersistedProject>();

const queue = (callback: () => void) => {
  setTimeout(callback, 0);
};

const createRequest = <T>(): MockRequest<T> => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
});

const createDatabase = () => ({
  objectStoreNames: {
    contains: () => true,
  },
  createObjectStore: vi.fn(),
  close: vi.fn(),
  transaction: () => {
    const transaction = {
      error: null as Error | null,
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      objectStore: () => ({
        getAll: () => {
          const request = createRequest<PersistedProject[]>();
          queue(() => {
            request.result = [...records.values()];
            request.onsuccess?.();
          });
          return request;
        },
        put: (project: PersistedProject) => {
          records.set(project.id, project);
          queue(() => transaction.oncomplete?.());
          return createRequest();
        },
        delete: (projectId: string) => {
          records.delete(projectId);
          queue(() => transaction.oncomplete?.());
          return createRequest();
        },
      }),
    };
    return transaction;
  },
});

const installIndexedDbMock = () => {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = createRequest<ReturnType<typeof createDatabase>>();
      queue(() => {
        request.result = createDatabase();
        request.onsuccess?.();
      });
      return request;
    },
  });
};

describe('localProjectStore', () => {
  beforeEach(() => {
    records.clear();
    installIndexedDbMock();
  });

  it('persists canonical workspaces through the wire codec', async () => {
    const project = await createLocalProject({
      name: 'Local Draft',
      description: 'Browser-only draft',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
      workspaceSettings: { locale: 'zh-CN' },
    });

    expect(project.id).toMatch(/^local-/);
    expect(project.workspace.id).toBe(project.id);
    expect(project.workspace.treeRootId).toBe('root');
    expect(project.workspace.treeById).toMatchObject({
      root: { children: ['doc_root_node'] },
      doc_root_node: { docId: 'doc_root' },
    });
    expect(project.workspace.docsById.doc_root).toMatchObject({
      id: 'doc_root',
      type: 'pir-page',
      path: '/pir.json',
      contentRev: 1,
    });
    expect(project.workspaceSettings).toEqual({ locale: 'zh-CN' });

    const persisted = records.get(project.id);
    expect(persisted?.workspace).toMatchObject({
      id: project.id,
      tree: { treeRootId: 'root' },
      documents: [{ id: 'doc_root' }],
      settings: { locale: 'zh-CN' },
    });
    expect(persisted?.workspace).not.toHaveProperty('docsById');

    await expect(listLocalProjects()).resolves.toEqual([
      expect.objectContaining({
        id: project.id,
        name: 'Local Draft',
        isPublic: false,
      }),
    ]);
  });

  it('bootstraps NodeGraph projects with one active standalone document', async () => {
    const project = await createLocalProject({
      name: 'Flow',
      resourceType: 'nodegraph',
      pir: createEmptyPirDocument(),
    });

    expect(project.workspace.activeDocumentId).toBe('graph_root');
    expect(project.workspace.docsById.graph_root).toMatchObject({
      id: 'graph_root',
      type: 'pir-graph',
      content: { version: 1, nodes: [], edges: [] },
    });
  });

  it('persists metadata, canonical documents, and settings together', async () => {
    const project = await createLocalProject({
      name: 'Before',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
    });
    const renamed = await updateLocalProject(project.id, { name: 'After' });
    expect(renamed?.name).toBe('After');

    const workspace: WorkspaceSnapshot = {
      ...project.workspace,
      workspaceRev: 2,
      routeRev: 3,
      opSeq: 4,
      treeById: {
        ...project.workspace.treeById,
        root: {
          ...project.workspace.treeById.root,
          children: ['doc_root_node', 'code_button_node'],
        },
        code_button_node: {
          id: 'code_button_node',
          kind: 'doc',
          name: 'Button.ts',
          parentId: 'root',
          docId: 'code_button',
        },
      },
      docsById: {
        ...project.workspace.docsById,
        code_button: {
          id: 'code_button',
          type: 'code',
          path: '/Button.ts',
          contentRev: 1,
          metaRev: 1,
          content: { language: 'ts', source: 'export const Button = 1;' },
          updatedAt: new Date().toISOString(),
        },
      },
      routeManifest: {
        version: '1',
        root: {
          id: 'root',
          children: [{ id: 'route_home', segment: 'home' }],
        },
      },
    };

    await saveLocalWorkspaceSnapshot(project.id, workspace, {
      locale: 'en-US',
      theme: 'dark',
    });
    const restored = await getLocalProject(project.id);

    expect(restored?.name).toBe('After');
    expect(restored?.workspace.routeRev).toBe(3);
    expect(restored?.workspace.routeManifest).toEqual(workspace.routeManifest);
    expect(restored?.workspace.docsById.code_button).toMatchObject({
      type: 'code',
      content: { language: 'ts', source: 'export const Button = 1;' },
    });
    expect(restored?.workspaceSettings).toEqual({
      locale: 'en-US',
      theme: 'dark',
    });
  });

  it('rejects legacy single-PIR records instead of fabricating a workspace', async () => {
    records.set('local-legacy', {
      id: 'local-legacy',
      resourceType: 'project',
      name: 'Legacy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pir: createEmptyPirDocument(),
    });

    await expect(listLocalProjects()).rejects.toThrow(
      'Legacy single-PIR local projects are not supported'
    );
  });

  it('rejects malformed current records instead of applying fallbacks', async () => {
    records.set('local-corrupt', {
      id: 'local-corrupt',
      resourceType: 'project',
      name: 'Corrupt',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace: {},
    });

    await expect(getLocalProject('local-corrupt')).rejects.toThrow(
      '/workspace/documents'
    );
  });

  it('deletes local projects from IndexedDB', async () => {
    const project = await createLocalProject({
      name: 'Disposable',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
    });

    await expect(deleteLocalProject(project.id)).resolves.toBe(true);
    await expect(getLocalProject(project.id)).resolves.toBeNull();
  });

  it('persists sync binding and reports synced local projects as read-only caches', async () => {
    const project = await createLocalProject({
      name: 'Sync me',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
    });

    await markLocalProjectSynced(project.id, {
      remoteProjectId: 'prj_remote',
      remoteWorkspaceId: 'wsp_remote',
      workspaceRev: 5,
    });

    const restored = await getLocalProject(project.id);
    expect(isSyncedLocalProject(restored)).toBe(true);
    expect(restored?.syncBinding).toMatchObject({
      remoteProjectId: 'prj_remote',
      remoteWorkspaceId: 'wsp_remote',
      lastSyncedWorkspaceRev: 5,
      status: 'synced-readonly',
    });
  });

  it('duplicates synced caches as editable canonical workspaces', async () => {
    const project = await createLocalProject({
      name: 'Cloud copy',
      resourceType: 'project',
      pir: createEmptyPirDocument(),
      workspaceSettings: { locale: 'zh-CN' },
    });
    await markLocalProjectSynced(project.id, {
      remoteProjectId: 'prj_remote',
      remoteWorkspaceId: 'wsp_remote',
      workspaceRev: 2,
    });

    const duplicated = await duplicateLocalProject(project.id, {
      name: 'Editable local copy',
    });

    expect(duplicated?.id).toMatch(/^local-/);
    expect(duplicated?.id).not.toBe(project.id);
    expect(duplicated?.name).toBe('Editable local copy');
    expect(duplicated?.workspace.id).toBe(duplicated?.id);
    expect(duplicated?.workspace.workspaceRev).toBe(1);
    expect(duplicated?.workspace.docsById.doc_root.contentRev).toBe(1);
    expect(duplicated?.workspaceSettings).toEqual({ locale: 'zh-CN' });
    expect(duplicated?.syncBinding).toBeUndefined();

    const original = await getLocalProject(project.id);
    expect(isSyncedLocalProject(original)).toBe(true);
  });
});
