import { encodePirDocument, type PIRDocument } from '@prodivix/pir';
import { apiRequest } from '@/infra/api';
import {
  decodeWorkspaceMutation,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  decodeWorkspaceOperationCommitResponse,
  type WorkspaceOperationCommitRequest,
  type WorkspaceSettingsCommitRequest,
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

export type WorkspaceCapabilitiesResponse = {
  workspaceId: string;
  capabilities: Record<string, boolean>;
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
      initialPir?: PIRDocument;
    }
  ) => {
    const { initialPir, ...project } = data;
    return request<{ project: ProjectSummary }>(token, '/projects', {
      method: 'POST',
      body: JSON.stringify({
        ...project,
        ...(initialPir
          ? { pir: JSON.parse(encodePirDocument(initialPir)) }
          : {}),
      }),
    });
  },

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
  ) =>
    request<{ project: ProjectSummary }>(
      token,
      `/projects/${encodeURIComponent(projectId)}`,
      options
    ),

  updateProject: async (
    token: string,
    projectId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) =>
    request<{ project: ProjectSummary }>(
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

  commitWorkspaceOperation: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: WorkspaceOperationCommitRequest,
    domainOperation: WorkspaceOperation
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
      domainOperation
    );
  },

  commitWorkspaceSettings: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: WorkspaceSettingsCommitRequest
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/settings/commit`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceMutation(response, workspace);
  },

  publishProject: async (token: string, projectId: string) =>
    request<{ project: ProjectSummary }>(
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
