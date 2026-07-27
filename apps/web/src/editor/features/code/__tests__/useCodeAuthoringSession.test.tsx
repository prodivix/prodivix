import { act, renderHook, waitFor } from '@testing-library/react';
import {
  createCodeAuthoringRequest,
  type CodeAuthoringRequest,
} from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodeAuthoringSession } from '../useCodeAuthoringSession';

const dispatchOperation = vi.hoisted(() => vi.fn());
const readWorkspace = vi.hoisted(() => vi.fn());

vi.mock('@/editor/store/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ workspace: readWorkspace() }) },
}));

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation: dispatchOperation,
}));

const codeDocument = (id: string, source: string) => ({
  id,
  type: 'code' as const,
  path: `/src/${id}.ts`,
  contentRev: 1,
  metaRev: 1,
  content: { language: 'ts', source },
});

const workspace = {
  id: 'workspace-1',
  workspaceRev: 1,
  docsById: {
    'code-a': codeDocument('code-a', 'export const a = 1;'),
    'code-b': codeDocument('code-b', 'export const b = 1;'),
  },
} as unknown as WorkspaceSnapshot;

const request: CodeAuthoringRequest = createCodeAuthoringRequest({
  requestId: 'code-authoring-1',
  workspaceId: 'workspace-1',
  presentation: 'workspace',
  origin: { surface: 'code-workspace' },
});

describe('code authoring session saves', () => {
  beforeEach(() => {
    dispatchOperation.mockReset();
    readWorkspace.mockReset();
    readWorkspace.mockReturnValue(workspace);
  });

  it('releases the save lock when the commit is rejected after the selection moved on', async () => {
    let rejectCommit: (() => void) | undefined;
    dispatchOperation.mockImplementation(
      () =>
        new Promise((resolve) => {
          rejectCommit = () =>
            resolve({
              status: 'rejected',
              message: 'This Workspace is read-only.',
            });
        })
    );
    const { result, rerender } = renderHook(
      (props: { artifactId: string }) =>
        useCodeAuthoringSession({
          request,
          workspace,
          artifactId: props.artifactId,
          readonly: false,
        }),
      { initialProps: { artifactId: 'code-a' } }
    );

    act(() => result.current.setSource('export const a = 2;'));
    let pendingSave: Promise<unknown> | undefined;
    act(() => {
      pendingSave = result.current.save();
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    // The author picks another file while the commit is still in flight.
    rerender({ artifactId: 'code-b' });
    await waitFor(() => expect(result.current.activeArtifactId).toBe('code-b'));
    await act(async () => {
      rejectCommit?.();
      await pendingSave;
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBe('This Workspace is read-only.');

    dispatchOperation.mockResolvedValue({
      status: 'applied',
      operationId: 'operation-2',
    });
    act(() => result.current.setSource('export const b = 2;'));
    await expect(result.current.save()).resolves.toMatchObject({
      status: 'saved',
    });
  });

  it('releases the save lock when the commit throws after the selection moved on', async () => {
    let failCommit: (() => void) | undefined;
    dispatchOperation.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          failCommit = () => reject(new Error('Outbox enqueue failed.'));
        })
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = renderHook(
      (props: { artifactId: string }) =>
        useCodeAuthoringSession({
          request,
          workspace,
          artifactId: props.artifactId,
          readonly: false,
        }),
      { initialProps: { artifactId: 'code-a' } }
    );

    act(() => result.current.setSource('export const a = 3;'));
    let pendingSave: Promise<unknown> | undefined;
    act(() => {
      pendingSave = result.current.save();
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    rerender({ artifactId: 'code-b' });
    await waitFor(() => expect(result.current.activeArtifactId).toBe('code-b'));
    await act(async () => {
      failCommit?.();
      await pendingSave;
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBe('Outbox enqueue failed.');
  });
});
