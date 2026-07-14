import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolveTypeScriptHostLibrary } from './typescriptProject';

describe('TypeScript project host library resolution', () => {
  it('falls back to no-lib when the browser TypeScript runtime rejects Node APIs', () => {
    const result = resolveTypeScriptHostLibrary(
      { target: ts.ScriptTarget.ES2022 },
      {
        fileExists: () => true,
        readFile: () => 'declare const browserSafe: true;',
      },
      () => {
        throw new Error(
          'getDefaultLibFilePath is only supported when consumed as a node module.'
        );
      }
    );

    expect(result).toEqual({
      mode: 'no-lib',
      defaultLibraryPath: '/__prodivix_workspace__/lib.d.ts',
    });
  });
});
