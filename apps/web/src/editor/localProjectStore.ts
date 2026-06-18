import type { PIRDocument } from '@prodivix/shared/types/pir';
import type {
  ProjectResourceType,
  ProjectSummary,
  WorkspaceDocumentRecord,
  WorkspaceSnapshot,
} from '@/editor/editorApi';
import { normalizePirDocument } from '@/pir/resolvePirDocument';
import { isWorkspaceCodeDocumentContent } from '@/workspace';

const LOCAL_PROJECT_ID_PREFIX = 'local-';
const LOCAL_PROJECT_DB_NAME = 'prodivix-local-projects';
const LOCAL_PROJECT_DB_VERSION = 1;
const LOCAL_PROJECT_STORE_NAME = 'projects';
const ROOT_DOCUMENT_ID = 'doc_root';

export type LocalProjectRecord = ProjectSummary & {
  workspace: WorkspaceSnapshot;
  syncBinding?: LocalProjectSyncBinding;
};

export type LocalProjectSyncBinding = {
  remoteProjectId: string;
  remoteWorkspaceId: string;
  lastSyncedAt: string;
  lastSyncedWorkspaceRev: number;
  status: 'synced-readonly';
};

type LocalProjectInput = {
  name: string;
  description?: string;
  resourceType: ProjectResourceType;
  pir: PIRDocument;
};

type LocalProjectUpdate = {
  name?: string;
  description?: string;
  workspace?: WorkspaceSnapshot;
  syncBinding?: LocalProjectSyncBinding | null;
};

type PersistedLocalProject = {
  id: string;
  resourceType: ProjectResourceType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceSnapshot;
  syncBinding?: LocalProjectSyncBinding;
  pir?: unknown;
};

export const LOCAL_WORKSPACE_CAPABILITIES: Record<string, boolean> = {
  'core.pir.document.update@1.0': true,
  'core.pir.graph.replace@1.0': true,
  'core.route.manifest.update@1.0': true,
  'core.settings.global.update@1.0': true,
  'core.workspace.code-document.create@1.0': true,
  'core.nodegraph.node.move@1.0': false,
  'core.nodegraph.edge.connect@1.0': false,
  'core.animation.timeline.keyframe.add@1.0': false,
  'core.animation.clip.bind@1.0': false,
};

export const LOCAL_READONLY_WORKSPACE_CAPABILITIES: Record<string, boolean> =
  Object.fromEntries(
    Object.keys(LOCAL_WORKSPACE_CAPABILITIES).map((capability) => [
      capability,
      false,
    ])
  );

export const isLocalProjectId = (projectId?: string | null): boolean =>
  Boolean(projectId?.startsWith(LOCAL_PROJECT_ID_PREFIX));

export const isSyncedLocalProject = (
  project?: Pick<LocalProjectRecord, 'syncBinding'> | null
): boolean => project?.syncBinding?.status === 'synced-readonly';

const createLocalProjectId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${LOCAL_PROJECT_ID_PREFIX}${crypto.randomUUID()}`;
  }
  return `${LOCAL_PROJECT_ID_PREFIX}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};

const openLocalProjectDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(
      LOCAL_PROJECT_DB_NAME,
      LOCAL_PROJECT_DB_VERSION
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_PROJECT_STORE_NAME)) {
        database.createObjectStore(LOCAL_PROJECT_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local projects.'));
    request.onsuccess = () => resolve(request.result);
  });

const readAllPersistedProjects = async (): Promise<PersistedLocalProject[]> => {
  const database = await openLocalProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      LOCAL_PROJECT_STORE_NAME,
      'readonly'
    );
    const store = transaction.objectStore(LOCAL_PROJECT_STORE_NAME);
    const request = store.getAll();
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read local projects.'));
    request.onsuccess = () => {
      resolve(
        Array.isArray(request.result)
          ? (request.result as PersistedLocalProject[])
          : []
      );
    };
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not read local projects.'));
    };
  });
};

const putPersistedProject = async (
  project: PersistedLocalProject
): Promise<void> => {
  const database = await openLocalProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      LOCAL_PROJECT_STORE_NAME,
      'readwrite'
    );
    transaction.objectStore(LOCAL_PROJECT_STORE_NAME).put(project);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not save local project.'));
    };
  });
};

const deletePersistedProject = async (projectId: string): Promise<void> => {
  const database = await openLocalProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      LOCAL_PROJECT_STORE_NAME,
      'readwrite'
    );
    transaction.objectStore(LOCAL_PROJECT_STORE_NAME).delete(projectId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not delete local project.'));
    };
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const cloneData = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizeResourceType = (value: unknown): ProjectResourceType => {
  if (value === 'component' || value === 'nodegraph') return value;
  return 'project';
};

const normalizeDate = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : value;
};

const normalizeSyncBinding = (
  value: unknown
): LocalProjectSyncBinding | undefined => {
  if (!isRecord(value)) return undefined;
  const remoteProjectId =
    typeof value.remoteProjectId === 'string'
      ? value.remoteProjectId.trim()
      : '';
  const remoteWorkspaceId =
    typeof value.remoteWorkspaceId === 'string'
      ? value.remoteWorkspaceId.trim()
      : remoteProjectId;
  const lastSyncedAt = normalizeDate(
    value.lastSyncedAt,
    new Date().toISOString()
  );
  const lastSyncedWorkspaceRev =
    typeof value.lastSyncedWorkspaceRev === 'number' &&
    value.lastSyncedWorkspaceRev > 0
      ? Math.round(value.lastSyncedWorkspaceRev)
      : 1;
  if (!remoteProjectId || !remoteWorkspaceId) return undefined;
  return {
    remoteProjectId,
    remoteWorkspaceId,
    lastSyncedAt,
    lastSyncedWorkspaceRev,
    status: 'synced-readonly',
  };
};

const createRootTree = (): WorkspaceSnapshot['tree'] => ({
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['doc_root_node'],
    },
    doc_root_node: {
      id: 'doc_root_node',
      kind: 'doc',
      name: 'pir.json',
      parentId: 'root',
      docId: ROOT_DOCUMENT_ID,
    },
  },
});

const createRootDocument = (
  pir: PIRDocument,
  updatedAt: string
): WorkspaceDocumentRecord => ({
  id: ROOT_DOCUMENT_ID,
  type: 'pir-page',
  path: '/pir.json',
  contentRev: 1,
  metaRev: 1,
  content: normalizePirDocument(pir),
  updatedAt,
});

const createWorkspaceSnapshot = ({
  projectId,
  pir,
  updatedAt,
}: {
  projectId: string;
  pir: PIRDocument;
  updatedAt: string;
}): WorkspaceSnapshot => ({
  id: projectId,
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  tree: createRootTree(),
  documents: [createRootDocument(pir, updatedAt)],
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [],
    },
  },
  settings: {},
  activeRouteNodeId: 'root',
});

const normalizeWorkspaceDocument = (
  value: unknown,
  fallbackPir: PIRDocument,
  fallbackUpdatedAt: string
): WorkspaceDocumentRecord | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const path = typeof value.path === 'string' ? value.path.trim() : '';
  if (!id || !path) return null;
  const type =
    value.type === 'pir-layout' ||
    value.type === 'pir-component' ||
    value.type === 'pir-graph' ||
    value.type === 'pir-animation' ||
    value.type === 'code' ||
    value.type === 'asset' ||
    value.type === 'project-config'
      ? value.type
      : 'pir-page';
  const content =
    type === 'pir-page' || type === 'pir-layout' || type === 'pir-component'
      ? normalizePirDocument(value.content ?? fallbackPir)
      : type === 'code'
        ? isWorkspaceCodeDocumentContent(value.content)
          ? value.content
          : { language: 'ts', source: '' }
        : value.content;
  return {
    id,
    type,
    path,
    contentRev:
      typeof value.contentRev === 'number' && value.contentRev > 0
        ? Math.round(value.contentRev)
        : 1,
    metaRev:
      typeof value.metaRev === 'number' && value.metaRev > 0
        ? Math.round(value.metaRev)
        : 1,
    content,
    updatedAt: normalizeDate(value.updatedAt, fallbackUpdatedAt),
  };
};

const normalizeWorkspaceSnapshot = ({
  value,
  projectId,
  fallbackPir,
  updatedAt,
}: {
  value: unknown;
  projectId: string;
  fallbackPir: PIRDocument;
  updatedAt: string;
}): WorkspaceSnapshot => {
  const fallback = createWorkspaceSnapshot({
    projectId,
    pir: fallbackPir,
    updatedAt,
  });
  if (!isRecord(value)) return fallback;

  const rawDocuments = Array.isArray(value.documents) ? value.documents : [];
  const documents = rawDocuments
    .map((item) => normalizeWorkspaceDocument(item, fallbackPir, updatedAt))
    .filter((item): item is WorkspaceDocumentRecord => Boolean(item));

  return {
    id: projectId,
    workspaceRev:
      typeof value.workspaceRev === 'number' && value.workspaceRev > 0
        ? Math.round(value.workspaceRev)
        : 1,
    routeRev:
      typeof value.routeRev === 'number' && value.routeRev > 0
        ? Math.round(value.routeRev)
        : 1,
    opSeq:
      typeof value.opSeq === 'number' && value.opSeq > 0
        ? Math.round(value.opSeq)
        : 1,
    tree: isRecord(value.tree) ? value.tree : fallback.tree,
    documents: documents.length ? documents : fallback.documents,
    routeManifest: isRecord(value.routeManifest)
      ? value.routeManifest
      : fallback.routeManifest,
    settings: isRecord(value.settings) ? value.settings : fallback.settings,
    activeRouteNodeId:
      typeof value.activeRouteNodeId === 'string'
        ? value.activeRouteNodeId
        : fallback.activeRouteNodeId,
  };
};

const normalizeProjectRecord = (value: unknown): LocalProjectRecord | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!isLocalProjectId(id)) return null;

  const now = new Date().toISOString();
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : 'Untitled';
  const description =
    typeof value.description === 'string' && value.description.trim()
      ? value.description.trim()
      : undefined;
  const createdAt = normalizeDate(value.createdAt, now);
  const updatedAt = normalizeDate(value.updatedAt, now);
  const legacyPir = isRecord(value.pir)
    ? normalizePirDocument(value.pir)
    : normalizePirDocument(undefined);
  const workspace = normalizeWorkspaceSnapshot({
    value: value.workspace,
    projectId: id,
    fallbackPir: legacyPir,
    updatedAt,
  });

  const syncBinding = normalizeSyncBinding(value.syncBinding);

  return {
    id,
    resourceType: normalizeResourceType(value.resourceType),
    name,
    ...(description ? { description } : {}),
    isPublic: false,
    starsCount: 0,
    createdAt,
    updatedAt,
    workspace,
    ...(syncBinding ? { syncBinding } : {}),
  };
};

const serializeRecord = (
  record: LocalProjectRecord
): PersistedLocalProject => ({
  id: record.id,
  resourceType: record.resourceType,
  name: record.name,
  description: record.description,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  workspace: record.workspace,
  syncBinding: record.syncBinding,
});

const readRecords = async (): Promise<LocalProjectRecord[]> => {
  const persisted = await readAllPersistedProjects();
  return persisted
    .map((item) => normalizeProjectRecord(item))
    .filter((item): item is LocalProjectRecord => Boolean(item));
};

const toSummary = (project: LocalProjectRecord): ProjectSummary => ({
  id: project.id,
  resourceType: project.resourceType,
  name: project.name,
  description: project.description,
  isPublic: false,
  starsCount: 0,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const listLocalProjects = async (): Promise<ProjectSummary[]> =>
  (await readRecords()).map(toSummary);

export const listLocalProjectRecords = async (): Promise<
  LocalProjectRecord[]
> => readRecords();

export const getLocalProject = async (
  projectId: string
): Promise<LocalProjectRecord | null> =>
  (await readRecords()).find((project) => project.id === projectId) ?? null;

export const createLocalProject = async ({
  name,
  description,
  resourceType,
  pir,
}: LocalProjectInput): Promise<LocalProjectRecord> => {
  const now = new Date().toISOString();
  const id = createLocalProjectId();
  const finalName = name.trim() || 'Untitled';
  const project: LocalProjectRecord = {
    id,
    resourceType,
    name: finalName,
    ...(description?.trim() ? { description: description.trim() } : {}),
    isPublic: false,
    starsCount: 0,
    createdAt: now,
    updatedAt: now,
    workspace: createWorkspaceSnapshot({
      projectId: id,
      pir,
      updatedAt: now,
    }),
  };
  await putPersistedProject(serializeRecord(project));
  return project;
};

export const updateLocalProject = async (
  projectId: string,
  update: LocalProjectUpdate
): Promise<LocalProjectRecord | null> => {
  const current = await getLocalProject(projectId);
  if (!current) return null;
  const name =
    update.name !== undefined
      ? update.name.trim() || current.name
      : current.name;
  const description =
    update.description !== undefined
      ? update.description.trim() || undefined
      : current.description;
  const updatedAt = new Date().toISOString();
  const fallbackPir = current.workspace.documents.find(
    (document) =>
      document.type === 'pir-page' ||
      document.type === 'pir-layout' ||
      document.type === 'pir-component'
  )?.content;
  const workspace = update.workspace
    ? normalizeWorkspaceSnapshot({
        value: update.workspace,
        projectId,
        fallbackPir: normalizePirDocument(fallbackPir),
        updatedAt,
      })
    : current.workspace;
  const syncBinding =
    update.syncBinding === undefined
      ? current.syncBinding
      : normalizeSyncBinding(update.syncBinding);
  const next: LocalProjectRecord = {
    ...current,
    name,
    ...(description ? { description } : {}),
    updatedAt,
    workspace,
    ...(syncBinding ? { syncBinding } : {}),
  };
  if (!description) {
    delete next.description;
  }
  if (!syncBinding) {
    delete next.syncBinding;
  }
  await putPersistedProject(serializeRecord(next));
  return next;
};

export const markLocalProjectSynced = async (
  projectId: string,
  binding: {
    remoteProjectId: string;
    remoteWorkspaceId: string;
    workspaceRev: number;
  }
): Promise<LocalProjectRecord | null> =>
  updateLocalProject(projectId, {
    syncBinding: {
      remoteProjectId: binding.remoteProjectId,
      remoteWorkspaceId: binding.remoteWorkspaceId,
      lastSyncedAt: new Date().toISOString(),
      lastSyncedWorkspaceRev: Math.max(1, Math.round(binding.workspaceRev)),
      status: 'synced-readonly',
    },
  });

export const duplicateLocalProject = async (
  projectId: string,
  options: { name?: string } = {}
): Promise<LocalProjectRecord | null> => {
  const current = await getLocalProject(projectId);
  if (!current) return null;

  const now = new Date().toISOString();
  const id = createLocalProjectId();
  const fallbackPir = current.workspace.documents.find(
    (document) =>
      document.type === 'pir-page' ||
      document.type === 'pir-layout' ||
      document.type === 'pir-component'
  )?.content;
  const workspace = normalizeWorkspaceSnapshot({
    value: {
      ...cloneData(current.workspace),
      id,
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      documents: current.workspace.documents.map((document) => ({
        ...cloneData(document),
        contentRev: 1,
        metaRev: 1,
        updatedAt: now,
      })),
    },
    projectId: id,
    fallbackPir: normalizePirDocument(fallbackPir),
    updatedAt: now,
  });
  const copy: LocalProjectRecord = {
    id,
    resourceType: current.resourceType,
    name: options.name?.trim() || `${current.name} (local copy)`,
    ...(current.description ? { description: current.description } : {}),
    isPublic: false,
    starsCount: 0,
    createdAt: now,
    updatedAt: now,
    workspace,
  };

  await putPersistedProject(serializeRecord(copy));
  return copy;
};

export const saveLocalWorkspaceSnapshot = async (
  projectId: string,
  workspace: WorkspaceSnapshot
): Promise<LocalProjectRecord | null> =>
  isSyncedLocalProject(await getLocalProject(projectId))
    ? getLocalProject(projectId)
    : updateLocalProject(projectId, { workspace });

export const deleteLocalProject = async (
  projectId: string
): Promise<boolean> => {
  const current = await getLocalProject(projectId);
  if (!current) return false;
  await deletePersistedProject(projectId);
  return true;
};
