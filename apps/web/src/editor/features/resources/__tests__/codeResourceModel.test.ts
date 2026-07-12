import { describe, expect, it } from 'vitest';
import { reconcileCodeResourceEditorDraft } from '@/editor/features/resources/codeResourceModel';

describe('code resource editor draft reconciliation', () => {
  it('hydrates the selected document and clean external history changes', () => {
    const selected = reconcileCodeResourceEditorDraft({
      baseline: undefined,
      editorValue: '',
      documentId: 'code-one',
      source: 'const value = 1;',
    });
    expect(selected.editorValue).toBe('const value = 1;');

    expect(
      reconcileCodeResourceEditorDraft({
        baseline: selected.baseline,
        editorValue: selected.editorValue,
        documentId: 'code-one',
        source: 'const value = 0;',
      })
    ).toEqual({
      baseline: { documentId: 'code-one', source: 'const value = 0;' },
      editorValue: 'const value = 0;',
    });
  });

  it('preserves an unsaved draft when the workspace source changes', () => {
    expect(
      reconcileCodeResourceEditorDraft({
        baseline: { documentId: 'code-one', source: 'const value = 1;' },
        editorValue: 'const localDraft = true;',
        documentId: 'code-one',
        source: 'const value = 0;',
      })
    ).toEqual({
      baseline: { documentId: 'code-one', source: 'const value = 0;' },
      editorValue: 'const localDraft = true;',
    });
  });
});
