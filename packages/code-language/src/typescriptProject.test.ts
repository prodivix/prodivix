import * as ts from 'typescript';
import type { CodeArtifact } from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import {
  createTypeScriptCodeProject,
  resolveTypeScriptHostLibrary,
} from './typescriptProject';

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

  it('updates documents without replacing the Language Service', () => {
    const artifact: CodeArtifact = {
      id: 'code-value',
      path: '/src/value.ts',
      language: 'ts',
      ownership: 'code-owned',
      owner: { kind: 'workspace-module', documentId: 'code-value' },
      source: 'export const value = 1;',
      revision: '1',
    };
    const project = createTypeScriptCodeProject([artifact]);
    const service = project.service;
    const fileName = project.getFileName(artifact.id);
    expect(fileName).not.toBeNull();
    expect(service.getSemanticDiagnostics(fileName!)).toEqual([]);

    expect(
      project.updateArtifacts([
        {
          ...artifact,
          source: 'export const value: string = 1;',
          revision: '2',
        },
      ])
    ).toBe(true);

    expect(project.service).toBe(service);
    expect(service.getSemanticDiagnostics(fileName!)).toContainEqual(
      expect.objectContaining({ code: 2322 })
    );
    expect(project.updateArtifacts(project.artifacts)).toBe(false);
    project.dispose();
  });
});
