import {
  renameWorkspaceCodeDocumentIntentRequest,
  type WorkspaceCommandEnvelope,
  type WorkspaceCodeDocumentRenameIntentRequest,
} from './workspaceCommand';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import { createWorkspaceVfsIntentPlan } from './workspaceVfsIntent';
import type { WorkspaceSnapshot } from './types';

export const WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES = Object.freeze({
  inputInvalid: 'WKS_CODE_ARTIFACT_RELOCATION_INPUT_INVALID',
  artifactMissing: 'WKS_CODE_ARTIFACT_RELOCATION_ARTIFACT_MISSING',
  artifactTypeInvalid: 'WKS_CODE_ARTIFACT_RELOCATION_ARTIFACT_TYPE_INVALID',
  pathConflict: 'WKS_CODE_ARTIFACT_RELOCATION_PATH_CONFLICT',
  operationRejected: 'WKS_CODE_ARTIFACT_RELOCATION_OPERATION_REJECTED',
} as const);

export type WorkspaceCodeArtifactRelocationIssueCode =
  (typeof WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES)[keyof typeof WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES];

export type WorkspaceCodeArtifactRelocationIssue = Readonly<{
  code: WorkspaceCodeArtifactRelocationIssueCode;
  path: string;
  message: string;
}>;

export type WorkspaceCodeArtifactRelocationPlan = Readonly<{
  artifactId: string;
  currentPath: string;
  nextPath: string;
  request: WorkspaceCodeDocumentRenameIntentRequest;
  operation: Readonly<{
    kind: 'command';
    command: WorkspaceCommandEnvelope;
  }>;
}>;

export type WorkspaceCodeArtifactRelocationPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceCodeArtifactRelocationPlan;
    }>
  | Readonly<{
      status: 'unchanged';
      artifactId: string;
      path: string;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceCodeArtifactRelocationIssue[];
    }>;

const isCanonicalText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();

/** Canonicalizes a user-authored code path without resolving dot segments. */
export const normalizeWorkspaceCodeArtifactPath = (
  value: string
): string | null => {
  const segments = value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean);
  return !segments.length ||
    segments.some((segment) => segment === '.' || segment === '..')
    ? null
    : `/${segments.join('/')}`;
};

const reject = (
  issue: WorkspaceCodeArtifactRelocationIssue
): WorkspaceCodeArtifactRelocationPlanResult => ({
  status: 'rejected',
  issues: Object.freeze([Object.freeze(issue)]),
});

/**
 * Plans a path-only CodeArtifact refactor as one reversible Workspace
 * operation. The artifact id and every typed CodeReference remain unchanged;
 * only the VFS projection and document path move together.
 */
export const createWorkspaceCodeArtifactRelocationPlan = (input: {
  workspace: WorkspaceSnapshot;
  artifactId: string;
  path: string;
  operationId: string;
  issuedAt: string;
}): WorkspaceCodeArtifactRelocationPlanResult => {
  if (
    !isCanonicalText(input.artifactId) ||
    !isCanonicalText(input.operationId) ||
    !isCanonicalText(input.issuedAt)
  ) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.inputInvalid,
      path: '/input',
      message:
        'Artifact id, operation id, and issued-at value must be non-empty and trimmed.',
    });
  }
  const nextPath = normalizeWorkspaceCodeArtifactPath(input.path);
  if (!nextPath) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.inputInvalid,
      path: '/path',
      message:
        'Code artifact path must contain canonical segments and cannot contain dot segments.',
    });
  }
  const document = input.workspace.docsById[input.artifactId];
  if (!document) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.artifactMissing,
      path: `/docsById/${input.artifactId}`,
      message: `Code artifact "${input.artifactId}" does not exist.`,
    });
  }
  if (
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.artifactTypeInvalid,
      path: `/docsById/${input.artifactId}`,
      message: `Workspace document "${input.artifactId}" is not a canonical code artifact.`,
    });
  }
  const currentPath = normalizeWorkspaceCodeArtifactPath(document.path);
  if (!currentPath) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.artifactTypeInvalid,
      path: `/docsById/${input.artifactId}/path`,
      message: 'The current code artifact path is not canonical.',
    });
  }
  if (currentPath === nextPath) {
    return Object.freeze({
      status: 'unchanged',
      artifactId: input.artifactId,
      path: currentPath,
    });
  }
  if (
    Object.values(input.workspace.docsById).some(
      (candidate) =>
        candidate.id !== document.id &&
        normalizeWorkspaceCodeArtifactPath(candidate.path) === nextPath
    )
  ) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.pathConflict,
      path: '/path',
      message: `Another Workspace document already owns "${nextPath}".`,
    });
  }

  const request = renameWorkspaceCodeDocumentIntentRequest({
    workspaceRev: input.workspace.workspaceRev,
    intentId: input.operationId,
    issuedAt: input.issuedAt,
    documentId: input.artifactId,
    path: nextPath,
  });
  const vfsPlan = createWorkspaceVfsIntentPlan(input.workspace, request);
  if (!vfsPlan) {
    return reject({
      code: WORKSPACE_CODE_ARTIFACT_RELOCATION_ISSUE_CODES.operationRejected,
      path: '/operation',
      message: 'The canonical Workspace rejected the code artifact relocation.',
    });
  }

  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      artifactId: input.artifactId,
      currentPath,
      nextPath,
      request,
      operation: Object.freeze({
        kind: 'command' as const,
        command: Object.freeze({
          ...vfsPlan.command,
          label: `Move ${currentPath} to ${nextPath}`,
        }),
      }),
    }),
  });
};
