import type { PIRDocument } from '@prodivix/shared/types/pir';
import { apiRequest } from '@/infra/api';
import { validatePirDocument, type PirValidationIssue } from '@prodivix/pir';
import {
  decodeWorkspaceMutation,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { WorkspaceCommandEnvelope } from '@prodivix/workspace';
import {
  decodeWorkspaceOperationCommitResponse,
  type WorkspaceOperationCommitRequest,
} from '@prodivix/workspace-sync';

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

export type WorkspaceCapabilitiesResponse = {
  workspaceId: string;
  capabilities: Record<string, boolean>;
};

export type PatchWorkspaceDocumentRequest = {
  expectedContentRev: number;
  command: WorkspaceCommandEnvelope;
  clientMutationId?: string;
};

export type ImportLocalProjectRequest = {
  name: string;
  description?: string;
  resourceType: ProjectResourceType;
  workspace: WorkspaceSnapshot;
  settings: Record<string, unknown>;
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

  importLocalProject: async (
    token: string,
    data: ImportLocalProjectRequest
  ) => {
    const { workspace, settings, ...project } = data;
    const response = await request<{
      project: ProjectSummary;
      workspace: unknown;
    }>(token, '/workspaces/import-local-project', {
      method: 'POST',
      body: JSON.stringify({
        ...project,
        workspace: encodeWorkspaceSnapshot(workspace, settings),
      }),
    });
    const decoded = decodeWorkspaceSnapshot(response.workspace);
    return {
      project: response.project,
      ...decoded,
    };
  },

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
    const response = await request<{ workspace: unknown }>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}`,
      options
    );
    return decodeWorkspaceSnapshot(response.workspace);
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
    workspace: WorkspaceSnapshot,
    documentId: string,
    data: PatchWorkspaceDocumentRequest
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/documents/${encodeURIComponent(documentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceMutation(response, workspace);
  },

  commitWorkspaceOperation: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: WorkspaceOperationCommitRequest
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/operations/commit`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceOperationCommitResponse(
      response,
      workspace,
      data.operation
    );
  },

  applyWorkspaceIntent: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: {
      expectedWorkspaceRev: number;
      expectedRouteRev?: number;
      intent: WorkspaceIntentEnvelope;
      clientMutationId?: string;
    }
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/intents`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceMutation(response, workspace);
  },

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
