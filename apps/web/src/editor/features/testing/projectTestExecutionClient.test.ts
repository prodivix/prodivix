import {
  createExecutionRequest,
  type ExecutionRequest,
  type ExecutionWorkspaceSnapshotRef,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import { isRemoteProjectTestRequestAligned } from './projectTestExecutionClient';

const partitionRevisions = Object.freeze({
  'document:Card:content': 'revision-1',
  'document:app-shell:content': 'revision-2',
  'document:app_shell:meta': 'revision-3',
});

const plannedRequest = (
  overrides: Partial<Parameters<typeof createExecutionRequest>[0]> = {}
): ExecutionRequest =>
  createExecutionRequest({
    requestId: 'project-test-1',
    profile: 'test',
    runtimeZone: 'test',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions,
    },
    invocation: {
      kind: 'test',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
      entrypoint: 'workspace',
    },
    ...overrides,
  });

/**
 * The snapshot side of the guard is normalized by a different collation than the
 * request side, so the same entries reach it in a different insertion order.
 */
const plannedWorkspace = (
  request: ExecutionRequest,
  revisions: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(request.workspace.partitionRevisions ?? {}).reverse()
  )
): ExecutionWorkspaceSnapshotRef =>
  Object.freeze({
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: Object.freeze(revisions),
  });

describe('Remote Project Test snapshot alignment', () => {
  it('accepts the planned partition revisions whatever order each normalizer emitted', () => {
    const request = plannedRequest();
    const workspace = plannedWorkspace(request);

    expect(JSON.stringify(workspace.partitionRevisions)).not.toBe(
      JSON.stringify(request.workspace.partitionRevisions)
    );
    expect(isRemoteProjectTestRequestAligned(request, workspace)).toBe(true);
  });

  it('accepts a plan that carries no partition revisions on either side', () => {
    const request = createExecutionRequest({
      requestId: 'project-test-2',
      profile: 'test',
      runtimeZone: 'test',
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      invocation: {
        kind: 'test',
        targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
        entrypoint: 'workspace',
      },
    });

    expect(
      isRemoteProjectTestRequestAligned(request, {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-1',
      })
    ).toBe(true);
  });

  it('rejects a drifted revision, identity, or non mock-only policy', () => {
    const request = plannedRequest();

    expect(
      isRemoteProjectTestRequestAligned(
        request,
        plannedWorkspace(request, {
          ...partitionRevisions,
          'document:Card:content': 'revision-9',
        })
      )
    ).toBe(false);
    expect(
      isRemoteProjectTestRequestAligned(
        request,
        plannedWorkspace(request, {
          ...partitionRevisions,
          'document:extra:content': 'revision-4',
        })
      )
    ).toBe(false);
    expect(
      isRemoteProjectTestRequestAligned(request, {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-2',
        partitionRevisions,
      })
    ).toBe(false);
    expect(
      isRemoteProjectTestRequestAligned(
        plannedRequest({ profile: 'preview' }),
        plannedWorkspace(request)
      )
    ).toBe(false);
    expect(
      isRemoteProjectTestRequestAligned(
        plannedRequest({ runtimeZone: 'client' }),
        plannedWorkspace(request)
      )
    ).toBe(false);
    expect(
      isRemoteProjectTestRequestAligned(
        plannedRequest({
          environment: {
            environmentId: 'environment-1',
            revision: 'revision-1',
            mode: 'live',
          },
        }),
        plannedWorkspace(request)
      )
    ).toBe(false);
  });
});
