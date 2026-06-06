import type { PIRDocument } from '@/core/types/engine.types';
import { apiRequest } from '@/infra/api';
import {
  validatePirDocument,
  type PirValidationIssue,
} from '@/pir/validator/validator';
import type { WorkspaceCodeDocumentContent } from '@/workspace';
import { isWorkspaceCodeDocumentContent } from '@/workspace';

export type ProjectResourceType = 'project' | 'component' | 'nodegraph';

export type ProjectSummary = {
  id: string;
  resourceType: ProjectResourceType;
  name: string;
  description?: string;
  isPublic: boolean;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  ownerId: string;
  pir: PIRDocument;
};

export type WorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'code'
  | 'asset'
  | 'project-config';

export type WorkspacePatchOperation = {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
};

export type WorkspaceCommandEnvelope = {
  id: string;
  namespace: string;
  type: string;
  version: string;
  issuedAt: string;
  forwardOps: WorkspacePatchOperation[];
  reverseOps: WorkspacePatchOperation[];
  target: {
    workspaceId: string;
    documentId?: string;
  };
  mergeKey?: string;
};

export type WorkspaceIntentEnvelope = {
  id: string;
  namespace: string;
  type: string;
  version: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  actor?: {
    userId?: string;
    clientId?: string;
  };
  issuedAt: string;
};

export type WorkspaceDocumentRecord = {
  id: string;
  type: WorkspaceDocumentType;
  path: string;
  contentRev: number;
  metaRev: number;
  content: PIRDocument | WorkspaceCodeDocumentContent | unknown;
  updatedAt?: string;
};

export type WorkspaceSnapshot = {
  id: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree: Record<string, unknown>;
  documents: WorkspaceDocumentRecord[];
  routeManifest: Record<string, unknown>;
  settings?: Record<string, unknown>;
  activeRouteNodeId?: string;
};

export type WorkspaceMutationDocumentRevision = {
  id: string;
  contentRev: number;
  metaRev: number;
};

export type WorkspaceMutationResponse = {
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  updatedDocuments?: WorkspaceMutationDocumentRevision[];
  acceptedMutationId?: string;
};

export type WorkspaceCapabilitiesResponse = {
  workspaceId: string;
  capabilities: Record<string, boolean>;
};

export type PatchWorkspaceDocumentRequest = {
  expectedContentRev: number;
  command: WorkspaceCommandEnvelope;
  clientMutationId?: string;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

const request = async <T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> =>
  apiRequest<T>(path, {
    ...options,
    token,
    defaultHeaders: JSON_HEADERS,
  });

const reportPirIssues = (origin: string, issues: PirValidationIssue[]) => {
  if (!issues.length) return;
  console.warn(
    `[pir-validation] ${origin} returned ${issues.length} issue(s):`,
    issues
  );
};

const validateAndUnwrapPir = (
  origin: string,
  candidate: unknown
): PIRDocument => {
  const result = validatePirDocument(candidate);
  reportPirIssues(origin, result.issues);
  return result.document;
};

const validateProjectDetail = (
  origin: string,
  project: ProjectDetail
): ProjectDetail => {
  if (!project?.pir) return project;
  return { ...project, pir: validateAndUnwrapPir(origin, project.pir) };
};

const isPirWorkspaceDocumentType = (type: WorkspaceDocumentType): boolean =>
  type === 'pir-page' || type === 'pir-layout' || type === 'pir-component';

const validateWorkspaceDocument = (
  workspaceId: string,
  document: WorkspaceDocumentRecord
): WorkspaceDocumentRecord => {
  if (isPirWorkspaceDocumentType(document.type)) {
    return {
      ...document,
      content: validateAndUnwrapPir(
        `workspace.${workspaceId}/document.${document.id}`,
        document.content
      ),
    };
  }

  if (document.type === 'code') {
    if (!isWorkspaceCodeDocumentContent(document.content)) {
      throw new Error(
        `Workspace code document ${document.id} must use the code content wrapper.`
      );
    }
    return document;
  }

  return document;
};

const validateWorkspaceSnapshot = (
  workspace: WorkspaceSnapshot
): WorkspaceSnapshot => {
  if (!workspace?.documents?.length) return workspace;
  const documents = workspace.documents.map((document) =>
    validateWorkspaceDocument(workspace.id, document)
  );
  return { ...workspace, documents };
};

export const editorApi = {
  listProjects: async (token: string, options: RequestInit = {}) =>
    request<{ projects: ProjectSummary[] }>(token, '/projects', options),

  createProject: async (
    token: string,
    data: {
      name: string;
      description?: string;
      resourceType: ProjectResourceType;
      isPublic?: boolean;
      pir?: PIRDocument;
    }
  ) =>
    request<{ project: ProjectSummary }>(token, '/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProject: async (
    token: string,
    projectId: string,
    options: RequestInit = {}
  ) => {
    const response = await request<{ project: ProjectDetail }>(
      token,
      `/projects/${encodeURIComponent(projectId)}`,
      options
    );
    return {
      project: validateProjectDetail(`project.${projectId}`, response.project),
    };
  },

  updateProject: async (
    token: string,
    projectId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) =>
    request<{ project: ProjectDetail }>(
      token,
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),

  getWorkspace: async (
    token: string,
    workspaceId: string,
    options: RequestInit = {}
  ) => {
    const response = await request<{ workspace: WorkspaceSnapshot }>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}`,
      options
    );
    return { workspace: validateWorkspaceSnapshot(response.workspace) };
  },

  getWorkspaceCapabilities: async (
    token: string,
    workspaceId: string,
    options: RequestInit = {}
  ) =>
    request<WorkspaceCapabilitiesResponse>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/capabilities`,
      options
    ),

  patchWorkspaceDocument: async (
    token: string,
    workspaceId: string,
    documentId: string,
    data: PatchWorkspaceDocumentRequest
  ) =>
    request<WorkspaceMutationResponse>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(documentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),

  applyWorkspaceIntent: async (
    token: string,
    workspaceId: string,
    data: {
      expectedWorkspaceRev: number;
      expectedRouteRev?: number;
      intent: WorkspaceIntentEnvelope;
      clientMutationId?: string;
    }
  ) =>
    request<WorkspaceMutationResponse>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/intents`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  applyWorkspaceBatch: async (
    token: string,
    workspaceId: string,
    data: {
      expectedWorkspaceRev: number;
      expectedRouteRev?: number;
      operations: Array<
        | {
            op: 'patchDocument';
            documentId: string;
            expectedContentRev: number;
            command: WorkspaceCommandEnvelope;
          }
        | {
            op: 'intent';
            intent: WorkspaceIntentEnvelope;
          }
      >;
      clientBatchId?: string;
    }
  ) =>
    request<WorkspaceMutationResponse>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/batch`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  saveProjectPir: async (token: string, projectId: string, pir: PIRDocument) =>
    request<{ project: ProjectDetail }>(
      token,
      `/projects/${encodeURIComponent(projectId)}/pir`,
      {
        method: 'PUT',
        body: JSON.stringify({ pir }),
      }
    ),

  publishProject: async (token: string, projectId: string) =>
    request<{ project: ProjectDetail }>(
      token,
      `/projects/${encodeURIComponent(projectId)}/publish`,
      {
        method: 'POST',
      }
    ),

  deleteProject: async (token: string, projectId: string) =>
    request<void>(token, `/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),
};
