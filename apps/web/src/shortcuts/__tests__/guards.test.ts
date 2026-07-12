import { describe, expect, it } from 'vitest';
import { isEditableEvent, isEditableTarget } from '@/shortcuts';

describe('shortcut editable guards', () => {
  it('recognizes native editable elements', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });

  it('recognizes the stable native-history boundary through composed paths', () => {
    const boundary = document.createElement('div');
    boundary.dataset.editorNativeHistory = 'true';
    const child = document.createElement('span');
    boundary.append(child);
    document.body.append(boundary);

    const event = {
      composedPath: () => [child, boundary, document.body, document],
    } as unknown as Event;

    expect(isEditableTarget(child)).toBe(true);
    expect(isEditableEvent(event)).toBe(true);
    boundary.remove();
  });
});
