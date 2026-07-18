import type { CodeAuthoringOriginSurface } from '@prodivix/authoring';
import type { ExecutionSourceTrace } from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { openWorkspaceCodeArtifact } from '@/editor/features/code';
import type { ExecutionServerFunctionSourceNavigationResult } from './executionServerFunctionModel';
import { createWorkspaceExecutionSnapshotId } from './workspaceExecutionIdentity';

/** Opens only a canonical CodeArtifact from the exact Workspace snapshot that produced the trace. */
export const openWorkspaceExecutionSourceTrace = (input: {
  workspace: WorkspaceSnapshot;
  snapshotId: string;
  sourceTrace: ExecutionSourceTrace;
  originSurface: CodeAuthoringOriginSurface;
}): ExecutionServerFunctionSourceNavigationResult => {
  if (
    createWorkspaceExecutionSnapshotId(input.workspace) !== input.snapshotId
  ) {
    return Object.freeze({ status: 'unavailable', reason: 'snapshot-stale' });
  }
  if (input.sourceTrace.sourceRef.kind !== 'code-artifact') {
    return Object.freeze({
      status: 'unavailable',
      reason: 'source-unavailable',
    });
  }
  const result = openWorkspaceCodeArtifact({
    workspace: input.workspace,
    artifactId: input.sourceTrace.sourceRef.artifactId,
    presentation: 'maximized',
    ...(input.sourceTrace.sourceSpan
      ? { sourceSpan: input.sourceTrace.sourceSpan }
      : {}),
    origin: {
      surface: input.originSurface,
      targetRef: input.sourceTrace.sourceRef,
    },
  });
  return result.status === 'opened'
    ? Object.freeze({ status: 'opened' })
    : Object.freeze({ status: 'unavailable', reason: 'source-unavailable' });
};
