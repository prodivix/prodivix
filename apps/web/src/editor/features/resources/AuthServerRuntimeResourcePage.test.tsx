import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  readWorkspaceServerRuntimeAuthConfiguration,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';

const dispatchWorkspaceAuthoringOperation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'applied', operationId: 'auth-create' })
);

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation,
}));

import { AuthServerRuntimeResourcePage } from './AuthServerRuntimeResourcePage';

const workspace = (): WorkspaceSnapshot => ({
  id: 'auth-resource-page-workspace',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
});

afterEach(() => {
  cleanup();
  dispatchWorkspaceAuthoringOperation.mockClear();
  act(() =>
    useEditorStore.setState({ workspace: null, workspaceReadonly: false })
  );
});

describe('AuthServerRuntimeResourcePage', () => {
  it('authors only the reference-only product provider through the Workspace operation boundary', async () => {
    const current = workspace();
    act(() =>
      useEditorStore.setState({
        workspace: current,
        workspaceReadonly: false,
      })
    );
    render(<AuthServerRuntimeResourcePage />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/token|cookie|session|secret/iu)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.auth.actions.enable',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    const call = dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0];
    expect(call).toMatchObject({ readonly: false, workspace: current });
    expect(call.operation.kind).toBe('command');
    if (call.operation.kind !== 'command') return;
    const applied = applyWorkspaceCommand(current, call.operation.command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(
      readWorkspaceServerRuntimeAuthConfiguration(applied.snapshot)
    ).toMatchObject({
      status: 'ready',
      configuration: {
        providerId: 'prodivix-product-session',
        permissionIds: [],
      },
    });
    expect(JSON.stringify(call.operation)).not.toMatch(
      /bearer|accessToken|sessionId|cookie|secretValue/iu
    );
  });

  it('disables provider and permission authoring in a read-only Workspace', () => {
    act(() =>
      useEditorStore.setState({
        workspace: workspace(),
        workspaceReadonly: true,
      })
    );
    render(<AuthServerRuntimeResourcePage />);
    expect(
      (
        screen.getByRole('button', {
          name: 'resourceManager.auth.actions.enable',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(
      true
    );
  });
});
