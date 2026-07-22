import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorShortcutProvider } from './ShortcutProvider';
import { useEditorShortcut } from './useShortcut';

function EscapeShortcut({ onEscape }: { onEscape: () => void }) {
  useEditorShortcut('Escape', onEscape);
  return null;
}

describe('EditorShortcutProvider', () => {
  it('does not hijack a key event already handled by an active surface', () => {
    const onEscape = vi.fn();
    render(
      <EditorShortcutProvider>
        <EscapeShortcut onEscape={onEscape} />
      </EditorShortcutProvider>
    );
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();

    act(() => window.dispatchEvent(event));

    expect(onEscape).not.toHaveBeenCalled();
  });
});
