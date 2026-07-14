import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import AnimationEditor from '@/editor/features/animation/AnimationEditor';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { resetEditorStore } from '@/test-utils/editorStore';

const enqueueOperation = vi.hoisted(() => vi.fn());

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation: enqueueOperation,
}));

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-animation-shell',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages-dir'],
    },
    'pages-dir': {
      id: 'pages-dir',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages-dir',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('AnimationEditor standalone document authoring', () => {
  beforeEach(() => {
    resetEditorStore();
    enqueueOperation.mockReset();
    enqueueOperation.mockResolvedValue({ status: 'applied', entry: {} });
  });

  it('keeps the original authoring controls reachable and creates a canonical document command', async () => {
    const workspace = createWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);

    render(<AnimationEditor />);

    expect(screen.getByRole('status').textContent).toContain(
      'Choose a PIR target'
    );
    expect(
      screen.getByLabelText('animationEditor.preview.jumpToStart')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('animationEditor.inspector.binding.select')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('animationEditor.inspector.track.select')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('animationEditor.svgFilters.units')
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('Animation target document') as HTMLSelectElement)
        .value
    ).toBe('page-home');

    fireEvent.click(screen.getByRole('button', { name: 'New animation' }));

    await waitFor(() => expect(enqueueOperation).toHaveBeenCalledTimes(1));
    const input = enqueueOperation.mock.calls[0]?.[0] as {
      operation: {
        kind: 'command';
        command: Parameters<typeof applyWorkspaceCommand>[1];
      };
    };
    expect(input.operation.kind).toBe('command');
    const applied = applyWorkspaceCommand(workspace, input.operation.command);
    if (applied.ok === false) {
      throw new TypeError(JSON.stringify(applied.issues));
    }
    const animationDocument = Object.values(applied.snapshot.docsById).find(
      (document) => document.type === 'pir-animation'
    );
    expect(animationDocument?.content).toMatchObject({
      target: { kind: 'pir-document', documentId: 'page-home' },
      timelines: [],
    });
  });
});
