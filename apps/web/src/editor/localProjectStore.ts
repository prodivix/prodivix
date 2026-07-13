import type { PIRDocument } from '@prodivix/shared/types/pir';
import type { ProjectResourceType, ProjectSummary } from '@/editor/editorApi';
import { validatePirDocument } from '@prodivix/pir';
import {
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotWireDto,
} from '@prodivix/workspace';

const LOCAL_PROJECT_ID_PREFIX = 'local-';
const LOCAL_PROJECT_DB_NAME = 'prodivix-local-projects';
const LOCAL_PROJECT_DB_VERSION = 2;
const LOCAL_PROJECT_STORE_NAME = 'projects';
const ROOT_DOCUMENT_ID = 'doc_root';

export type LocalProjectRecord = ProjectSummary & {
  workspace: WorkspaceSnapshot;
  workspaceSettings: Record<string, unknown>;
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
  workspaceSettings?: Record<string, unknown>;
};

type LocalProjectUpdate = {
  name?: string;
  description?: string;
  workspace?: WorkspaceSnapshot;
  workspaceSettings?: Record<string, unknown>;
  syncBinding?: LocalProjectSyncBinding | null;
};

type PersistedLocalProject = {
  id: string;
  resourceType: ProjectResourceType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceSnapshotWireDto;
  syncBinding?: LocalProjectSyncBinding;
};

export class LocalProjectRecordError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'LocalProjectRecordError';
    this.path = path;
  }
}

export const LOCAL_WORKSPACE_CAPABILITIES: Record<string, boolean> = {
  'core.pir.document.update@1.0': true,
  'core.pir.graph.replace@1.0': true,
  'core.route.manifest.update@1.0': true,
  'core.settings.commit@1.0': true,
  'core.nodegraph.graph.update@1.0': true,
  'core.animation.definition.update@1.0': true,
  'core.resource.project-config.value.update@1.0': true,
  'core.workspace.code-document.create@1.0': true,
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

const readAllPersistedProjects = async (): Promise<unknown[]> => {
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
      resolve(Array.isArray(request.result) ? request.result : []);
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

const requireRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new LocalProjectRecordError(path, 'Expected an object.');
  }
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LocalProjectRecordError(path, 'Expected a non-empty string.');
  }
  return value;
};

const parseOptionalString = (
  value: unknown,
  path: string
): string | undefined => {
  if (value === undefined) return undefined;
  return requireString(value, path);
};

const parseDate = (value: unknown, path: string): string => {
  const date = requireString(value, path);
  if (Number.isNaN(new Date(date).getTime())) {
    throw new LocalProjectRecordError(path, 'Expected a valid date.');
  }
  return date;
};

const parsePositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new LocalProjectRecordError(path, 'Expected a positive integer.');
  }
  return value as number;
};

const parseResourceType = (
  value: unknown,
  path: string
): ProjectResourceType => {
  if (value !== 'project' && value !== 'component' && value !== 'nodegraph') {
    throw new LocalProjectRecordError(path, 'Unsupported resource type.');
  }
  return value;
};

const cloneData = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const parseSyncBinding = (
  value: unknown,
  path: string
): LocalProjectSyncBinding => {
  const source = requireRecord(value, path);
  if (source.status !== 'synced-readonly') {
    throw new LocalProjectRecordError(
      `${path}/status`,
      'Expected synced-readonly.'
    );
  }
  return {
    remoteProjectId: requireString(
      source.remoteProjectId,
      `${path}/remoteProjectId`
    ),
    remoteWorkspaceId: requireString(
      source.remoteWorkspaceId,
      `${path}/remoteWorkspaceId`
    ),
    lastSyncedAt: parseDate(source.lastSyncedAt, `${path}/lastSyncedAt`),
    lastSyncedWorkspaceRev: parsePositiveInteger(
      source.lastSyncedWorkspaceRev,
      `${path}/lastSyncedWorkspaceRev`
    ),
    status: 'synced-readonly',
  };
};

const requireValidPir = (pir: PIRDocument): PIRDocument => {
  const validation = validatePirDocument(pir);
  if (validation.hasError) {
    throw new LocalProjectRecordError(
      '/workspace/documents/doc_root/content',
      validation.issues.map((issue) => issue.message).join('; ')
    );
  }
  return validation.document;
};

const createRootDocument = (
  pir: PIRDocument,
  updatedAt: string
): WorkspaceDocument => ({
  id: ROOT_DOCUMENT_ID,
  type: 'pir-page',
  path: '/pir.json',
  contentRev: 1,
  metaRev: 1,
  content: requireValidPir(pir),
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
  docsById: {
    [ROOT_DOCUMENT_ID]: createRootDocument(pir, updatedAt),
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [],
    },
  },
  activeDocumentId: ROOT_DOCUMENT_ID,
  activeRouteNodeId: 'root',
});

const assertWorkspaceIdentity = (
  projectId: string,
  workspace: WorkspaceSnapshot
) => {
  if (workspace.id !== projectId) {
    throw new LocalProjectRecordError(
      '/workspace/id',
      'Workspace id must match the local project id.'
    );
  }
};

const decodePersistedProject = (value: unknown): LocalProjectRecord => {
  const source = requireRecord(value, '/project');
  if (Object.hasOwn(source, 'pir')) {
    throw new LocalProjectRecordError(
      '/project/pir',
      'Legacy single-PIR local projects are not supported.'
    );
  }
  const id = requireString(source.id, '/project/id');
  if (!isLocalProjectId(id)) {
    throw new LocalProjectRecordError(
      '/project/id',
      'Expected a local project id.'
    );
  }
  const decoded = decodeWorkspaceSnapshot(source.workspace);
  assertWorkspaceIdentity(id, decoded.workspace);
  const description = parseOptionalString(
    source.description,
    '/project/description'
  );
  const syncBinding =
    source.syncBinding === undefined
      ? undefined
      : parseSyncBinding(source.syncBinding, '/project/syncBinding');
  return {
    id,
    resourceType: parseResourceType(
      source.resourceType,
      '/project/resourceType'
    ),
    name: requireString(source.name, '/project/name'),
    ...(description ? { description } : {}),
    isPublic: false,
    starsCount: 0,
    createdAt: parseDate(source.createdAt, '/project/createdAt'),
    updatedAt: parseDate(source.updatedAt, '/project/updatedAt'),
    workspace: decoded.workspace,
    workspaceSettings: decoded.settings,
    ...(syncBinding ? { syncBinding } : {}),
  };
};

const serializeRecord = (record: LocalProjectRecord): PersistedLocalProject => {
  assertWorkspaceIdentity(record.id, record.workspace);
  const workspace = encodeWorkspaceSnapshot(
    record.workspace,
    record.workspaceSettings
  );
  decodeWorkspaceSnapshot(workspace);
  return {
    id: record.id,
    resourceType: record.resourceType,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    workspace,
    ...(record.syncBinding ? { syncBinding: record.syncBinding } : {}),
  };
};

const readRecords = async (): Promise<LocalProjectRecord[]> =>
  (await readAllPersistedProjects()).map(decodePersistedProject);

const toSummary = (project: LocalProjectRecord): ProjectSummary => ({
  id: project.id,
  resourceType: project.resourceType,
  name: project.name,
  ...(project.description ? { description: project.description } : {}),
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
  workspaceSettings = {},
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
    workspaceSettings: cloneData(workspaceSettings),
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
  const workspace = update.workspace ?? current.workspace;
  assertWorkspaceIdentity(projectId, workspace);
  const workspaceSettings =
    update.workspaceSettings === undefined
      ? current.workspaceSettings
      : cloneData(
          requireRecord(update.workspaceSettings, '/workspace/settings')
        );
  const syncBinding =
    update.syncBinding === undefined
      ? current.syncBinding
      : update.syncBinding === null
        ? undefined
        : parseSyncBinding(update.syncBinding, '/project/syncBinding');
  const next: LocalProjectRecord = {
    ...current,
    name,
    ...(description ? { description } : {}),
    updatedAt: new Date().toISOString(),
    workspace,
    workspaceSettings,
    ...(syncBinding ? { syncBinding } : {}),
  };
  if (!description) delete next.description;
  if (!syncBinding) delete next.syncBinding;
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
      lastSyncedWorkspaceRev: parsePositiveInteger(
        binding.workspaceRev,
        '/syncBinding/workspaceRev'
      ),
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
  const docsById = Object.fromEntries(
    Object.entries(current.workspace.docsById).map(([documentId, document]) => [
      documentId,
      {
        ...cloneData(document),
        contentRev: 1,
        metaRev: 1,
        updatedAt: now,
      },
    ])
  );
  const copy: LocalProjectRecord = {
    id,
    resourceType: current.resourceType,
    name: options.name?.trim() || `${current.name} (local copy)`,
    ...(current.description ? { description: current.description } : {}),
    isPublic: false,
    starsCount: 0,
    createdAt: now,
    updatedAt: now,
    workspace: {
      ...cloneData(current.workspace),
      id,
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      docsById,
    },
    workspaceSettings: cloneData(current.workspaceSettings),
  };

  await putPersistedProject(serializeRecord(copy));
  return copy;
};

export const saveLocalWorkspaceSnapshot = async (
  projectId: string,
  workspace: WorkspaceSnapshot,
  workspaceSettings: Record<string, unknown>
): Promise<LocalProjectRecord | null> => {
  const current = await getLocalProject(projectId);
  if (!current || isSyncedLocalProject(current)) return current;
  return updateLocalProject(projectId, { workspace, workspaceSettings });
};

export const deleteLocalProject = async (
  projectId: string
): Promise<boolean> => {
  const current = await getLocalProject(projectId);
  if (!current) return false;
  await deletePersistedProject(projectId);
  return true;
};
