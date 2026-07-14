import { describe, expect, it } from 'vitest';
import {
  createCodeLanguagePositionAtOffset,
  projectCodeLanguageDiagnostics,
  projectCodeLanguageHover,
} from './codeLanguageCodeMirrorAdapter';

describe('Code Language CodeMirror adapter', () => {
  it('projects UTF-16 positions, diagnostics and hover ranges', () => {
    const source = 'const value = 1;\r\nvalue;';
    const offset = source.lastIndexOf('value') + 2;
    expect(
      createCodeLanguagePositionAtOffset({
        artifactId: 'code-main',
        source,
        offset,
      })
    ).toEqual({ artifactId: 'code-main', line: 2, column: 3 });

    expect(
      projectCodeLanguageDiagnostics({
        artifactId: 'code-main',
        source,
        diagnostics: [
          {
            code: 'COD-2001',
            severity: 'fatal',
            domain: 'code',
            message: 'Unknown symbol.',
            targetRef: { kind: 'code-artifact', artifactId: 'code-main' },
            sourceSpan: {
              artifactId: 'code-main',
              startLine: 2,
              startColumn: 1,
              endLine: 2,
              endColumn: 6,
            },
          },
        ],
      })
    ).toEqual([
      {
        from: source.lastIndexOf('value'),
        to: source.lastIndexOf('value') + 5,
        severity: 'error',
        source: 'Prodivix COD-2001',
        message: 'Unknown symbol.',
      },
    ]);

    expect(
      projectCodeLanguageHover({
        artifactId: 'code-main',
        source,
        offset,
        hover: {
          contents: [{ format: 'plaintext', value: 'const value: number' }],
          sourceSpan: {
            artifactId: 'code-main',
            startLine: 2,
            startColumn: 1,
            endLine: 2,
            endColumn: 6,
          },
        },
      })
    ).toEqual({
      from: source.lastIndexOf('value'),
      to: source.lastIndexOf('value') + 5,
      text: 'const value: number',
    });
  });
});
