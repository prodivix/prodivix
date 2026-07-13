import { describe, expect, it } from 'vitest';
import {
  createSourceSpanFromOffsets,
  resolveSourceSpanOffsets,
} from './workspaceIssueSourceSpan';

describe('workspace issue source spans', () => {
  it('preserves one-based locations across CRLF editor normalization', () => {
    const source = 'alpha\r\nbeta gamma\r\n';
    const from = source.indexOf('beta');
    const sourceSpan = createSourceSpanFromOffsets({
      artifactId: 'artifact-1',
      source,
      from,
      to: from + 'beta'.length,
    });

    expect(sourceSpan).toEqual({
      artifactId: 'artifact-1',
      startLine: 2,
      startColumn: 1,
      endLine: 2,
      endColumn: 5,
    });

    const editorSource = source.replaceAll(/\r\n?/g, '\n');
    expect(resolveSourceSpanOffsets(editorSource, sourceSpan)).toEqual({
      from: editorSource.indexOf('beta'),
      to: editorSource.indexOf('beta') + 'beta'.length,
    });
  });

  it('rejects stale ranges instead of silently clamping them', () => {
    expect(
      resolveSourceSpanOffsets('one line', {
        artifactId: 'artifact-1',
        startLine: 2,
        startColumn: 1,
        endLine: 2,
        endColumn: 2,
      })
    ).toBeNull();
  });
});
