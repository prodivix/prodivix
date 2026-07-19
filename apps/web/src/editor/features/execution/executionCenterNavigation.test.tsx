import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  useExecutionCenterNavigationStore,
  useExecutionCenterNavigationVisibility,
} from './executionCenterNavigation';

afterEach(() => {
  act(() => useExecutionCenterNavigationStore.getState().clear());
});

describe('Execution Center navigation visibility', () => {
  it('keeps the owning surface open after consuming one exact focus request', async () => {
    const view = renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useExecutionCenterNavigationVisibility(workspaceId),
      { initialProps: { workspaceId: 'workspace-data' } }
    );
    expect(view.result.current).toBe(false);

    act(() =>
      useExecutionCenterNavigationStore.getState().openNetworkOperation({
        workspaceId: 'workspace-data',
        documentId: 'data-catalog',
        operationId: 'listproducts',
      })
    );
    await waitFor(() => expect(view.result.current).toBe(true));
    const request = useExecutionCenterNavigationStore.getState().request;
    if (!request) throw new Error('Missing navigation request fixture.');
    act(() => useExecutionCenterNavigationStore.getState().consume(request.id));

    expect(useExecutionCenterNavigationStore.getState().request).toBeNull();
    expect(view.result.current).toBe(true);
    view.rerender({ workspaceId: 'workspace-other' });
    expect(view.result.current).toBe(false);
    view.unmount();

    const remounted = renderHook(() =>
      useExecutionCenterNavigationVisibility('workspace-data')
    );
    expect(remounted.result.current).toBe(false);
  });

  it('does not open for a request owned by another Workspace', () => {
    useExecutionCenterNavigationStore.getState().openNetworkOperation({
      workspaceId: 'workspace-other',
      documentId: 'data-catalog',
      operationId: 'listproducts',
    });
    const view = renderHook(() =>
      useExecutionCenterNavigationVisibility('workspace-data')
    );
    expect(view.result.current).toBe(false);
  });

  it('carries one bounded diagnostic focus to the exact execution session', () => {
    useExecutionCenterNavigationStore.getState().openExecutionDiagnostic({
      workspaceId: 'workspace-data',
      sessionId: 'project-test:workspace-data',
      diagnosticCode: 'TST-5001',
    });
    expect(useExecutionCenterNavigationStore.getState().request).toMatchObject({
      workspaceId: 'workspace-data',
      sessionId: 'project-test:workspace-data',
      diagnosticCode: 'TST-5001',
      surface: 'console',
    });
  });
});
