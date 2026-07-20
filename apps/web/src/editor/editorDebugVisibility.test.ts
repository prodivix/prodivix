import { describe, expect, it } from 'vitest';
import { isEditorDebugSurfaceEnabled } from './editorDebugVisibility';

describe('editor debug surface visibility', () => {
  it('stays hidden unless development mode explicitly opts in', () => {
    expect(isEditorDebugSurfaceEnabled('', true)).toBe(false);
    expect(isEditorDebugSurfaceEnabled('?debug=0', true)).toBe(false);
    expect(isEditorDebugSurfaceEnabled('?debug=1', false)).toBe(false);
  });

  it('allows the explicit development query flag', () => {
    expect(isEditorDebugSurfaceEnabled('?view=canvas&debug=1', true)).toBe(
      true
    );
  });
});
