import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimationTrack } from '@prodivix/animation';
import { AnimationEditorKeyframesEditor } from '@/editor/features/animation/panels/AnimationEditorKeyframesEditor';

const createTrack = (): AnimationTrack => ({
  id: 'track-opacity',
  kind: 'style',
  property: 'opacity',
  keyframes: [
    { atMs: 0, value: 0 },
    { atMs: 1000, value: 100 },
  ],
});

const renderEditor = () => {
  const onUpdateKeyframeAtMs = vi.fn();
  render(
    <AnimationEditorKeyframesEditor
      bindingId="binding-1"
      track={createTrack()}
      timelineDurationMs={1000}
      onAddKeyframe={() => undefined}
      onDeleteKeyframe={() => undefined}
      onUpdateKeyframeAtMs={onUpdateKeyframeAtMs}
      onUpdateKeyframeValue={() => undefined}
      onUpdateKeyframeEasing={() => undefined}
      onUpdateKeyframeHold={() => undefined}
    />
  );
  const timeInputs = screen.getAllByLabelText(
    'animationEditor.keyframes.atMs'
  ) as HTMLInputElement[];
  return { onUpdateKeyframeAtMs, timeInputs };
};

describe('Animation keyframe time editing', () => {
  it('keeps an in-progress time edit local until it is committed', () => {
    const { onUpdateKeyframeAtMs, timeInputs } = renderEditor();
    const secondRow = timeInputs[1]!;

    fireEvent.change(secondRow, { target: { value: '1' } });
    fireEvent.change(secondRow, { target: { value: '15' } });
    fireEvent.change(secondRow, { target: { value: '150' } });

    expect(onUpdateKeyframeAtMs).not.toHaveBeenCalled();
    expect(secondRow.value).toBe('150');

    fireEvent.blur(secondRow);

    expect(onUpdateKeyframeAtMs.mock.calls).toEqual([
      ['binding-1', 'track-opacity', 1, '150'],
    ]);
  });

  it('commits the edited time on Enter and discards it on Escape', () => {
    const { onUpdateKeyframeAtMs, timeInputs } = renderEditor();
    const secondRow = timeInputs[1]!;

    fireEvent.change(secondRow, { target: { value: '500' } });
    fireEvent.keyDown(secondRow, { key: 'Enter' });

    expect(onUpdateKeyframeAtMs.mock.calls).toEqual([
      ['binding-1', 'track-opacity', 1, '500'],
    ]);

    fireEvent.change(secondRow, { target: { value: '250' } });
    fireEvent.keyDown(secondRow, { key: 'Escape' });
    fireEvent.blur(secondRow);

    expect(onUpdateKeyframeAtMs).toHaveBeenCalledTimes(1);
    expect(secondRow.value).toBe('1000');
  });
});
