import {
  createServerRuntimeAuthConfiguration,
  decodeServerRuntimeAuthConfiguration,
  type ServerRuntimeAuthConfiguration,
} from '@prodivix/server-runtime';
import type { WorkspaceOperation } from './workspaceOperation';
import { createWorkspaceDocumentAtPathCommand } from './workspaceDocumentFactory';
import {
  createWorkspaceProjectConfigDocumentContent,
  createWorkspaceProjectConfigValueUpdateCommand,
  isWorkspaceProjectConfigDocumentContent,
} from './workspaceResourceDocument';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export const WORKSPACE_SERVER_RUNTIME_AUTH_CONFIG_PATH =
  '/config/auth.json' as const;

export type WorkspaceServerRuntimeAuthConfigurationIssue = Readonly<{
  code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID';
  path: string;
  message: string;
  documentId?: string;
}>;

export type WorkspaceServerRuntimeAuthConfigurationReadResult =
  | Readonly<{
      status: 'ready';
      document: WorkspaceDocument | null;
      configuration: ServerRuntimeAuthConfiguration | null;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly WorkspaceServerRuntimeAuthConfigurationIssue[];
    }>;

export type WorkspaceServerRuntimeAuthConfigurationPlanResult =
  | Readonly<{
      status: 'ready';
      operation: WorkspaceOperation;
      configuration: ServerRuntimeAuthConfiguration;
    }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{
      status: 'rejected';
      code:
        | 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID'
        | 'WKS_SERVER_RUNTIME_AUTH_CONFIG_UNSUPPORTED';
      message: string;
    }>;

const normalizePath = (path: string): string =>
  `/${path.trim().replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+/g, '/')}`.replace(
    /\/$/,
    ''
  );

const findConfigurationDocument = (
  workspace: WorkspaceSnapshot
): WorkspaceDocument | undefined =>
  Object.values(workspace.docsById).find(
    ({ path }) =>
      normalizePath(path) === WORKSPACE_SERVER_RUNTIME_AUTH_CONFIG_PATH
  );

/** Reads the only canonical reference-only Auth provider declaration. */
export const readWorkspaceServerRuntimeAuthConfiguration = (
  workspace: WorkspaceSnapshot
): WorkspaceServerRuntimeAuthConfigurationReadResult => {
  const document = findConfigurationDocument(workspace);
  if (!document) {
    return Object.freeze({
      status: 'ready' as const,
      document: null,
      configuration: null,
    });
  }
  if (
    document.type !== 'project-config' ||
    !isWorkspaceProjectConfigDocumentContent(document.content)
  ) {
    return Object.freeze({
      status: 'invalid' as const,
      issues: Object.freeze([
        Object.freeze({
          code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' as const,
          path: document.path,
          message:
            'Server Runtime Auth configuration must be a project-config document.',
          documentId: document.id,
        }),
      ]),
    });
  }
  const decoded = decodeServerRuntimeAuthConfiguration(document.content.value);
  if (decoded.status !== 'valid') {
    return Object.freeze({
      status: 'invalid' as const,
      issues: Object.freeze(
        decoded.issues.map((issue) =>
          Object.freeze({
            code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' as const,
            path: `${document.path}${issue.path === '/' ? '' : issue.path}`,
            message: issue.message,
            documentId: document.id,
          })
        )
      ),
    });
  }
  return Object.freeze({
    status: 'ready' as const,
    document,
    configuration: decoded.configuration,
  });
};

/** Creates or updates `/config/auth.json` through one reversible Workspace operation. */
export const createWorkspaceServerRuntimeAuthConfigurationPlan = (input: {
  workspace: WorkspaceSnapshot;
  providerId: string;
  permissionIds: readonly string[];
  documentId: string;
  operationId: string;
  issuedAt: string;
}): WorkspaceServerRuntimeAuthConfigurationPlanResult => {
  let configuration: ServerRuntimeAuthConfiguration;
  try {
    configuration = createServerRuntimeAuthConfiguration({
      providerId: input.providerId,
      permissionIds: input.permissionIds,
    });
  } catch (error) {
    return Object.freeze({
      status: 'rejected' as const,
      code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' as const,
      message:
        error instanceof Error
          ? error.message
          : 'Server Runtime Auth configuration is invalid.',
    });
  }
  const current = readWorkspaceServerRuntimeAuthConfiguration(input.workspace);
  if (current.status === 'invalid') {
    return Object.freeze({
      status: 'rejected' as const,
      code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' as const,
      message:
        current.issues[0]?.message ??
        'Server Runtime Auth configuration is invalid.',
    });
  }
  if (
    current.configuration &&
    JSON.stringify(current.configuration) === JSON.stringify(configuration)
  ) {
    return Object.freeze({ status: 'unchanged' as const });
  }
  if (current.document) {
    const command = createWorkspaceProjectConfigValueUpdateCommand({
      commandId: input.operationId,
      document: current.document,
      issuedAt: input.issuedAt,
      label: 'Update Server Runtime Auth configuration',
      value: configuration,
      workspaceId: input.workspace.id,
    });
    return command
      ? Object.freeze({
          status: 'ready' as const,
          operation: Object.freeze({ kind: 'command' as const, command }),
          configuration,
        })
      : Object.freeze({
          status: 'rejected' as const,
          code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_UNSUPPORTED' as const,
          message: 'Server Runtime Auth configuration cannot be updated.',
        });
  }
  const documentId = input.documentId.trim();
  if (!documentId) {
    return Object.freeze({
      status: 'rejected' as const,
      code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' as const,
      message: 'Server Runtime Auth configuration document id is required.',
    });
  }
  try {
    const command = createWorkspaceDocumentAtPathCommand({
      workspace: input.workspace,
      document: {
        id: documentId,
        type: 'project-config',
        name: 'auth.json',
        path: WORKSPACE_SERVER_RUNTIME_AUTH_CONFIG_PATH,
        contentRev: 1,
        metaRev: 1,
        content: createWorkspaceProjectConfigDocumentContent(configuration),
      },
      commandId: input.operationId,
      issuedAt: input.issuedAt,
      label: 'Enable Server Runtime Auth',
    });
    return Object.freeze({
      status: 'ready' as const,
      operation: Object.freeze({ kind: 'command' as const, command }),
      configuration,
    });
  } catch (error) {
    return Object.freeze({
      status: 'rejected' as const,
      code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_UNSUPPORTED' as const,
      message:
        error instanceof Error
          ? error.message
          : 'Server Runtime Auth configuration cannot be created.',
    });
  }
};
