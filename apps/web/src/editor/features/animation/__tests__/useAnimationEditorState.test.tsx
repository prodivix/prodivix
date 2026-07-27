import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultTimeline,
  encodeAnimationDefinition,
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
  target: { kind: 'pir-document', documentId: 'page-home' },
  timelines: [
    {
      ...createDefaultTimeline({
        idFactory: (kind) => `${kind}-test`,
      }),
      name,
    },
  ],
  compositions: [],
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
      content: encodeAnimationDefinition(animation),
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const createKeyframedAnimation = (): AnimationDefinition => ({
  target: { kind: 'pir-document', documentId: 'page-home' },
  timelines: [
    {
      id: 'timeline-test',
      name: 'Timeline',
      durationMs: 1000,
      motionIntent: 'decorative',
      reducedMotion: { kind: 'final-state' },
      markers: [],
      bindings: [
        {
          id: 'binding-1',
          targetNodeId: 'root',
          tracks: [
            {
              id: 'track-1',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    },
  ],
  compositions: [],
});

const renderKeyframeEditorState = () => {
  const animation = createKeyframedAnimation();
  useEditorStore.getState().setWorkspaceSnapshot(createWorkspace(animation));
  return renderHook(() =>
    useAnimationEditorState({
      animationDocumentId: 'animation-home',
      persistedAnimation: animation,
    })
  );
};

const readKeyframes = (animation: AnimationDefinition) =>
  animation.timelines[0]?.bindings[0]?.tracks[0]?.keyframes ?? [];

describe('Animation keyframe time moves', () => {
  beforeEach(() => resetEditorStore());

  it('refuses a move onto a time another keyframe already occupies', () => {
    const { result, unmount } = renderKeyframeEditorState();

    act(() => {
      result.current.updateKeyframeAtMs('binding-1', 'track-1', 1, '0');
    });

    expect(readKeyframes(result.current.animation)).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 1000, value: 1 },
    ]);
    unmount();
    resetEditorStore();
  });

  it('moves a keyframe onto a free time', () => {
    const { result, unmount } = renderKeyframeEditorState();

    act(() => {
      result.current.updateKeyframeAtMs('binding-1', 'track-1', 1, '400');
    });

    expect(readKeyframes(result.current.animation)).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 400, value: 1 },
    ]);
    unmount();
    resetEditorStore();
  });
});

describe('Animation composition commands', () => {
  beforeEach(() => resetEditorStore());

  it('authors, renames, selects, and removes a composition through Workspace state', () => {
    const { result, unmount } = renderKeyframeEditorState();
    let compositionId = '';
    act(() => {
      compositionId = result.current.addComposition();
    });
    expect(result.current.animation.compositions[0]).toMatchObject({
      id: compositionId,
      root: {
        kind: 'timeline-ref',
        timelineId: 'timeline-test',
      },
    });
    expect(result.current.animation.entryCompositionId).toBe(compositionId);

    act(() => {
      result.current.updateCompositionName(compositionId, 'Detail enter');
    });
    expect(result.current.animation.compositions[0]?.name).toBe('Detail enter');

    act(() => {
      result.current.deleteComposition(compositionId);
    });
    expect(result.current.animation.compositions).toEqual([]);
    expect(result.current.animation.entryCompositionId).toBeUndefined();
    unmount();
  });
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
              content: encodeAnimationDefinition(externalAnimation),
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
    ).toEqual(encodeAnimationDefinition(externalAnimation));
    expect(
      useEditorStore.getState().documentEditSeqById['animation-home']
    ).toBe(undefined);
    unmount();
    resetEditorStore();
  });
});
