import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';
import ts from 'typescript';
import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import type { ExportModule } from '#src/export/types';

/**
 * Executes and typechecks compiler output the way an exported project would.
 *
 * Emitted-source defects such as a shadowed binding only surface once the
 * module is actually evaluated (`ReferenceError`) or fed to TypeScript
 * (`TS2448`), so conformance tests share one harness instead of asserting on
 * generated text.
 */

const REACT_NAMED_EXPORTS: Readonly<Record<string, unknown>> = {
  Fragment,
  useCallback,
  useEffect,
  useState,
};
const TEST_SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const evaluateGeneratedModules = async (
  modules: readonly ExportModule[]
): Promise<ReadonlyMap<string, ComponentType<Record<string, unknown>>>> => {
  const evaluated = new Map<string, ComponentType<Record<string, unknown>>>();
  for (const generatedModule of modules) {
    const localNames: string[] = [];
    const localValues: unknown[] = [];
    for (const importIntent of generatedModule.imports) {
      const local = importIntent.local ?? importIntent.imported;
      if (!local) continue;
      const value = importIntent.targetModuleId
        ? evaluated.get(importIntent.targetModuleId)
        : importIntent.imported
          ? REACT_NAMED_EXPORTS[importIntent.imported]
          : undefined;
      if (value === undefined) {
        throw new Error(`Unresolved generated test import ${local}.`);
      }
      localNames.push(local);
      localValues.push(value);
    }
    const transformed = await transformWithEsbuild(
      generatedModule.body,
      `${generatedModule.suggestedName}.tsx`,
      {
        loader: 'tsx',
        target: 'es2022',
        format: 'cjs',
        jsx: 'transform',
        jsxFactory: '__jsx',
        jsxFragment: '__Fragment',
      }
    );
    const moduleRecord: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      '__jsx',
      '__Fragment',
      ...localNames,
      transformed.code
    )(
      moduleRecord,
      moduleRecord.exports,
      createElement,
      Fragment,
      ...localValues
    );
    evaluated.set(
      generatedModule.id,
      moduleRecord.exports.default as ComponentType<Record<string, unknown>>
    );
  }
  return evaluated;
};

export const typecheckGeneratedModule = (
  generatedModule: ExportModule
): string[] => {
  const fileName = join(
    TEST_SOURCE_DIRECTORY,
    `__${generatedModule.id.replace(/[^a-zA-Z0-9]/g, '_')}.tsx`
  ).replaceAll('\\', '/');
  const imports = generatedModule.imports
    .map((importIntent) => {
      const local = importIntent.local ?? importIntent.imported;
      if (!local) return '';
      if (importIntent.targetModuleId) {
        return `declare const ${local}: import('react').ComponentType<Record<string, unknown>>;`;
      }
      if (importIntent.kind === 'named' && importIntent.imported) {
        return `import { ${importIntent.imported}${local === importIntent.imported ? '' : ` as ${local}`} } from ${JSON.stringify(importIntent.source)};`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
  const sourceText = `${imports}\n${generatedModule.body}`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.fileExists = (candidate) =>
    candidate === fileName || fileExists(candidate);
  host.readFile = (candidate) =>
    candidate === fileName ? sourceText : readFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreate) =>
    candidate === fileName
      ? ts.createSourceFile(
          candidate,
          sourceText,
          languageVersion,
          true,
          ts.ScriptKind.TSX
        )
      : getSourceFile(candidate, languageVersion, onError, shouldCreate);
  return ts
    .getPreEmitDiagnostics(ts.createProgram([fileName], options, host))
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    );
};
