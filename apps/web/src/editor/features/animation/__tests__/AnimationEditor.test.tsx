import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  createDefaultTimeline,
  createEmptyAnimationDefinition,
  encodeAnimationDefinition,
} from '@prodivix/animation';
import {
  applyWorkspaceCommand,
  createWorkspaceDocumentAtPathCommand,
  selectWorkspaceAnimationDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import AnimationEditor from '@/editor/features/animation/AnimationEditor';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { resetEditorStore } from '@/test-utils/editorStore';
import { WebPluginQueryHarness } from './webPluginQueryHarness';

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

    render(
      <MemoryRouter>
        <WebPluginQueryHarness>
          <AnimationEditor />
        </WebPluginQueryHarness>
      </MemoryRouter>
    );

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

  it('authors a binding and track in an empty timeline, retargets it, and removes it through canonical commands', async () => {
    const initial = createWorkspace();
    const basePage = createEmptyPirDocument();
    const targetId = basePage.ui.graph.rootId;
    const page = {
      ...basePage,
      ui: {
        ...basePage.ui,
        graph: {
          ...basePage.ui.graph,
          nodesById: {
            ...basePage.ui.graph.nodesById,
            'child-target': {
              id: 'child-target',
              kind: 'element' as const,
              type: 'div',
              props: {},
            },
          },
          childIdsById: {
            ...basePage.ui.graph.childIdsById,
            [targetId]: ['child-target'],
          },
        },
      },
    };
    initial.docsById['page-home'] = {
      ...initial.docsById['page-home'],
      content: page,
    };
    const animation = {
      ...createEmptyAnimationDefinition({ targetDocumentId: 'page-home' }),
      timelines: [
        createDefaultTimeline({ idFactory: (kind) => `${kind}-empty` }),
      ],
    };
    const creation = applyWorkspaceCommand(
      initial,
      createWorkspaceDocumentAtPathCommand({
        workspace: initial,
        document: {
          id: 'animation-empty',
          type: 'pir-animation',
          path: '/animations/empty.pir-animation.json',
          contentRev: 1,
          metaRev: 1,
          content: encodeAnimationDefinition(animation),
        },
        commandId: 'create-animation',
        issuedAt: '2026-10-01T00:00:00Z',
      })
    );
    if (!creation.ok) throw new TypeError(JSON.stringify(creation.issues));
    useEditorStore.getState().setWorkspaceSnapshot({
      ...creation.snapshot,
      activeDocumentId: 'animation-empty',
    });
    enqueueOperation.mockImplementation(
      async (input: {
        operation: {
          kind: 'command';
          command: Parameters<typeof applyWorkspaceCommand>[1];
        };
      }) => {
        const current = useEditorStore.getState().workspace;
        if (!current) throw new TypeError('Expected an open workspace.');
        const applied = applyWorkspaceCommand(current, input.operation.command);
        if (!applied.ok) throw new TypeError(JSON.stringify(applied.issues));
        useEditorStore.getState().setWorkspaceSnapshot(applied.snapshot);
        return { status: 'applied', entry: {} };
      }
    );
    render(
      <MemoryRouter>
        <WebPluginQueryHarness>
          <AnimationEditor />
        </WebPluginQueryHarness>
      </MemoryRouter>
    );
    const read = () => {
      const result = selectWorkspaceAnimationDocument(
        useEditorStore.getState().workspace ?? undefined,
        'animation-empty'
      );
      if (result?.status !== 'valid')
        throw new TypeError('Expected a valid canonical animation.');
      return result.decodedContent.timelines[0]!;
    };
    expect(read().bindings).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'animationEditor.bindings.addBinding',
      })
    );
    await waitFor(() => expect(read().bindings).toHaveLength(1));
    expect(read().bindings[0]?.targetNodeId).toBe(targetId);
    fireEvent.change(
      screen.getByLabelText('animationEditor.inspector.binding.targetNode'),
      { target: { value: 'child-target' } }
    );
    await waitFor(() =>
      expect(read().bindings[0]?.targetNodeId).toBe('child-target')
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'animationEditor.inspector.track.addStyle',
      })
    );
    await waitFor(() => expect(read().bindings[0]?.tracks).toHaveLength(1));
    expect(read().bindings[0]?.tracks[0]?.kind).toBe('style');
    fireEvent.click(
      screen.getByRole('button', { name: 'animationEditor.bindings.remove' })
    );
    await waitFor(() => expect(read().bindings).toEqual([]));
    expect(enqueueOperation).toHaveBeenCalledTimes(4);
    expect(
      enqueueOperation.mock.calls.every(
        ([input]) => input.operation.kind === 'command'
      )
    ).toBe(true);
  });
});
