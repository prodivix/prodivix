import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentNode } from '@/core/types/engine.types';
import { useMountedCssEditorState } from '../useMountedCssEditorState';

const createNode = (): ComponentNode => ({
  id: 'PdxText-1',
  type: 'PdxText',
  props: {
    className: 'my',
  },
});

describe('useMountedCssEditorState', () => {
  it('does not write mounted CSS source into PIR when VFS save fails', async () => {
    const updateSelectedNode = vi.fn();
    const saveMountedCssToVfs = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useMountedCssEditorState({
        selectedNode: createNode(),
        mountedCssEntries: [],
        updateSelectedNode,
        saveMountedCssToVfs,
      })
    );

    act(() => {
      result.current.openMountedCssEditor();
      result.current.setMountedCssEditorValue('/* Mounted CSS */\n.my {}');
    });

    await act(async () => {
      await result.current.saveMountedCss();
    });

    expect(saveMountedCssToVfs).toHaveBeenCalledWith(
      '/* Mounted CSS */\n.my {}'
    );
    expect(updateSelectedNode).not.toHaveBeenCalled();
    expect(result.current.mountedCssEditorError).toBe(
      'Mounted CSS must be saved as a Workspace VFS code document.'
    );
  });
});
