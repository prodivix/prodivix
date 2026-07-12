import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnimationDefinition } from '@prodivix/shared/types/pir';
import { useAnimationEditorState } from '@/editor/features/animation/useAnimationEditorState';
import { createDefaultTimeline } from '@/editor/features/animation/animationEditorModel';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  createEditorWorkspace,
  createPirDoc,
  resetEditorStore,
} from '@/test-utils/editorStore';

const createAnimation = (name: string): AnimationDefinition => ({
  version: 1,
  timelines: [{ ...createDefaultTimeline(0), name }],
});

describe('useAnimationEditorState workspace synchronization', () => {
  beforeEach(() => resetEditorStore());

  it('hydrates an external workspace change without writing the stale animation back', async () => {
    const originalAnimation = createAnimation('Original');
    const externalAnimation = createAnimation('After undo');
    const workspace = createEditorWorkspace({
      ...createPirDoc(),
      animation: originalAnimation,
    });
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    const { result, unmount } = renderHook(() => useAnimationEditorState());

    expect(result.current.animation.timelines[0]?.name).toBe('Original');

    act(() => {
      const current = useEditorStore.getState().workspace;
      if (!current) throw new Error('Expected an active workspace.');
      const document = current.docsById['page-home'];
      useEditorStore.setState({
        workspace: {
          ...current,
          docsById: {
            ...current.docsById,
            'page-home': {
              ...document,
              content: {
                ...(document.content as ReturnType<typeof createPirDoc>),
                animation: externalAnimation,
              },
            },
          },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.animation.timelines[0]?.name).toBe('After undo');
    });
    expect(
      (
        useEditorStore.getState().workspace?.docsById['page-home']
          ?.content as ReturnType<typeof createPirDoc>
      ).animation
    ).toEqual(externalAnimation);
    expect(useEditorStore.getState().documentEditSeqById['page-home']).toBe(
      undefined
    );
    unmount();
    resetEditorStore();
  });
});
