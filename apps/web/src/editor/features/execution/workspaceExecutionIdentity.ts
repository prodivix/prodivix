import type { ExecutionWorkspaceSnapshotRef } from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export const createClientExecutionRequestId = (prefix: string): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

export const createWorkspaceExecutionSnapshotId = (
  workspace: WorkspaceSnapshot
): string => {
  const documentRevisions = Object.values(workspace.docsById)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .map(
      (document) =>
        `${encodeURIComponent(document.id)}@${document.contentRev}.${document.metaRev}`
    )
    .join(',');
  return `${workspace.id}|w=${workspace.workspaceRev}|r=${workspace.routeRev}|o=${workspace.opSeq}|d=${documentRevisions}`;
};

export const createWorkspaceExecutionPartitionRevisions = (
  workspace: WorkspaceSnapshot
): Readonly<Record<string, string>> =>
  Object.freeze({
    workspace: String(workspace.workspaceRev),
    route: String(workspace.routeRev),
    ...Object.fromEntries(
      Object.values(workspace.docsById).flatMap((document) => [
        [`document:${document.id}:content`, String(document.contentRev)],
        [`document:${document.id}:meta`, String(document.metaRev)],
      ])
    ),
  });

export const createWorkspaceExecutionSnapshotRef = (
  workspace: WorkspaceSnapshot
): ExecutionWorkspaceSnapshotRef =>
  Object.freeze({
    workspaceId: workspace.id,
    snapshotId: createWorkspaceExecutionSnapshotId(workspace),
    partitionRevisions: createWorkspaceExecutionPartitionRevisions(workspace),
  });
