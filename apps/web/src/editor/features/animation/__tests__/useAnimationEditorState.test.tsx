import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultTimeline,
  type AnimationDefinition,
} from '@prodivix/animation';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  selectWorkspaceAnimationDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { useAnimationEditorState } from '@/editor/features/animation/useAnimationEditorState';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { resetEditorStore } from '@/test-utils/editorStore';

const createAnimation = (name: string): AnimationDefinition => ({
  version: 1,
  target: { kind: 'pir-document', documentId: 'page-home' },
  timelines: [
    {
      ...createDefaultTimeline({
        idFactory: (kind) => `${kind}-test`,
      }),
      name,
    },
  ],
});

const createWorkspace = (
  animation: AnimationDefinition
): WorkspaceSnapshot => ({
  id: 'workspace-animation-test',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'animation-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'animation-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'animation-node': {
      id: 'animation-node',
      kind: 'doc',
      name: 'home.pir-animation.json',
      parentId: 'root',
      docId: 'animation-home',
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
    'animation-home': {
      id: 'animation-home',
      type: 'pir-animation',
      path: '/animations/home.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: animation,
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('useAnimationEditorState workspace synchronization', () => {
  beforeEach(() => resetEditorStore());

  it('hydrates an external workspace change without writing the stale animation back', async () => {
    const originalAnimation = createAnimation('Original');
    const externalAnimation = createAnimation('After undo');
    const workspace = createWorkspace(originalAnimation);
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    const { result, unmount } = renderHook(() => {
      const currentWorkspace = useEditorStore((state) => state.workspace);
      const read = selectWorkspaceAnimationDocument(
        currentWorkspace ?? undefined,
        'animation-home'
      );
      if (read?.status !== 'valid') {
        throw new Error('Expected a canonical standalone Animation document.');
      }
      return useAnimationEditorState({
        animationDocumentId: 'animation-home',
        persistedAnimation: read.decodedContent,
      });
    });

    expect(result.current.animation.timelines[0]?.name).toBe('Original');

    act(() => {
      const current = useEditorStore.getState().workspace;
      if (!current) throw new Error('Expected an active workspace.');
      const document = current.docsById['animation-home'];
      useEditorStore.setState({
        workspace: {
          ...current,
          docsById: {
            ...current.docsById,
            'animation-home': {
              ...document,
              content: externalAnimation,
            },
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.animation.timelines[0]?.name).toBe('After undo');
    });
    expect(
      useEditorStore.getState().workspace?.docsById['animation-home']?.content
    ).toEqual(externalAnimation);
    expect(
      useEditorStore.getState().documentEditSeqById['animation-home']
    ).toBe(undefined);
    unmount();
    resetEditorStore();
  });
});
