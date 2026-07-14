import * as ts from 'typescript';
import {
  createCodeSourceSpanFromOffsets,
  resolveCodeSourceSpanOffsets,
  type CodeArtifact,
  type CodeLanguagePosition,
} from '@prodivix/authoring';

const VIRTUAL_WORKSPACE_ROOT = '/__prodivix_workspace__';
const VIRTUAL_DEFAULT_LIBRARY_PATH = `${VIRTUAL_WORKSPACE_ROOT}/lib.d.ts`;

export const TYPESCRIPT_CODE_LANGUAGES = Object.freeze(['ts', 'js'] as const);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeArtifactPath = (artifact: CodeArtifact): string => {
  const segments: string[] = [];
  for (const segment of artifact.path.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const path = segments.join('/') || artifact.id;
  const hasScriptExtension = /\.(?:[cm]?[jt]sx?|d\.ts)$/i.test(path);
  return `${VIRTUAL_WORKSPACE_ROOT}/${
    hasScriptExtension ? path : `${path}.${artifact.language}`
  }`;
};

const isTypeScriptArtifact = (artifact: CodeArtifact): boolean =>
  artifact.language === 'ts' || artifact.language === 'js';

const scriptKindForArtifact = (artifact: CodeArtifact): ts.ScriptKind => {
  const path = artifact.path.toLowerCase();
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return artifact.language === 'js' ? ts.ScriptKind.JS : ts.ScriptKind.TS;
};

const safeSystem = (): ts.System | undefined => {
  try {
    const system = ts.sys as ts.System | undefined;
    return system &&
      typeof system.fileExists === 'function' &&
      typeof system.readFile === 'function'
      ? system
      : undefined;
  } catch {
    return undefined;
  }
};

type TypeScriptHostLibrary = Readonly<{
  mode: 'host-lib' | 'no-lib';
  defaultLibraryPath: string;
}>;

type TypeScriptHostSystem = Pick<ts.System, 'fileExists' | 'readFile'>;

/** Resolves host libraries without assuming the TypeScript runtime is Node-backed. */
export const resolveTypeScriptHostLibrary = (
  compilerOptions: ts.CompilerOptions,
  system: TypeScriptHostSystem | undefined = safeSystem(),
  getDefaultLibraryPath: (
    options: ts.CompilerOptions
  ) => string = ts.getDefaultLibFilePath
): TypeScriptHostLibrary => {
  if (!system) {
    return Object.freeze({
      mode: 'no-lib',
      defaultLibraryPath: VIRTUAL_DEFAULT_LIBRARY_PATH,
    });
  }

  try {
    const defaultLibraryPath = getDefaultLibraryPath(compilerOptions);
    if (
      system.fileExists(defaultLibraryPath) &&
      system.readFile(defaultLibraryPath) !== undefined
    ) {
      return Object.freeze({ mode: 'host-lib', defaultLibraryPath });
    }
  } catch {
    // The browser TypeScript bundle exposes a throwing Node-only implementation.
  }

  return Object.freeze({
    mode: 'no-lib',
    defaultLibraryPath: VIRTUAL_DEFAULT_LIBRARY_PATH,
  });
};

export const getTypeScriptHostLibraryMode = (): 'host-lib' | 'no-lib' =>
  resolveTypeScriptHostLibrary({
    target: ts.ScriptTarget.ES2022,
  }).mode;

export type TypeScriptCodeProject = Readonly<{
  artifacts: readonly CodeArtifact[];
  service: ts.LanguageService;
  compilerOptions: ts.CompilerOptions;
  getArtifact(artifactId: string): CodeArtifact | null;
  getArtifactByFileName(fileName: string): CodeArtifact | null;
  getFileName(artifactId: string): string | null;
  getOffset(position: CodeLanguagePosition): number | null;
  createSourceSpan(
    artifactId: string,
    textSpan: ts.TextSpan
  ): ReturnType<typeof createCodeSourceSpanFromOffsets>;
  dispose(): void;
}>;

/** Creates an in-memory TypeScript/JavaScript project over immutable artifacts. */
export const createTypeScriptCodeProject = (
  inputArtifacts: readonly CodeArtifact[]
): TypeScriptCodeProject => {
  const artifacts = Object.freeze(
    inputArtifacts.filter(isTypeScriptArtifact).sort((left, right) => {
      return (
        compareText(left.path, right.path) || compareText(left.id, right.id)
      );
    })
  );
  const artifactById = new Map<string, CodeArtifact>();
  const artifactByFileName = new Map<string, CodeArtifact>();
  const fileNameByArtifactId = new Map<string, string>();
  for (const artifact of artifacts) {
    if (artifactById.has(artifact.id)) {
      throw new Error(`Duplicate CodeArtifact id "${artifact.id}".`);
    }
    const fileName = normalizeArtifactPath(artifact);
    if (artifactByFileName.has(fileName)) {
      throw new Error(
        `CodeArtifact path "${artifact.path}" collides with another virtual module.`
      );
    }
    artifactById.set(artifact.id, artifact);
    artifactByFileName.set(fileName, artifact);
    fileNameByArtifactId.set(artifact.id, fileName);
  }

  const system = safeSystem();
  const baseCompilerOptions: ts.CompilerOptions = {
    allowImportingTsExtensions: true,
    allowJs: true,
    checkJs: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const hostLibrary = resolveTypeScriptHostLibrary(baseCompilerOptions, system);
  const compilerOptions: ts.CompilerOptions = Object.freeze({
    ...baseCompilerOptions,
    ...(hostLibrary.mode === 'host-lib' ? {} : { noLib: true }),
  });

  const readArtifact = (fileName: string): CodeArtifact | undefined =>
    artifactByFileName.get(fileName);
  const fileExists = (fileName: string): boolean =>
    artifactByFileName.has(fileName) || Boolean(system?.fileExists(fileName));
  const readFile = (fileName: string): string | undefined =>
    readArtifact(fileName)?.source ?? system?.readFile(fileName);

  const moduleResolutionHost: ts.ModuleResolutionHost = {
    fileExists,
    readFile,
    directoryExists: (directoryName) =>
      directoryName === VIRTUAL_WORKSPACE_ROOT ||
      [...artifactByFileName.keys()].some((fileName) =>
        fileName.startsWith(`${directoryName.replace(/\/$/, '')}/`)
      ) ||
      Boolean(system?.directoryExists?.(directoryName)),
    getCurrentDirectory: () => VIRTUAL_WORKSPACE_ROOT,
    getDirectories: (directoryName) =>
      system?.getDirectories?.(directoryName) ?? [],
    realpath: (path) => system?.realpath?.(path) ?? path,
    useCaseSensitiveFileNames: true,
  };

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => VIRTUAL_WORKSPACE_ROOT,
    getDefaultLibFileName: () => hostLibrary.defaultLibraryPath,
    getNewLine: () => '\n',
    getProjectVersion: () =>
      artifacts.map(({ id, revision }) => `${id}:${revision}`).join('|'),
    getScriptFileNames: () => [...artifactByFileName.keys()],
    getScriptKind: (fileName) => {
      const artifact = readArtifact(fileName);
      return artifact ? scriptKindForArtifact(artifact) : ts.ScriptKind.Unknown;
    },
    getScriptSnapshot: (fileName) => {
      const source = readFile(fileName);
      return source === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(source);
    },
    getScriptVersion: (fileName) => readArtifact(fileName)?.revision ?? '0',
    fileExists,
    readFile,
    readDirectory: (rootDir, extensions, excludes, includes, depth) => {
      const local = [...artifactByFileName.keys()].filter((fileName) =>
        fileName.startsWith(`${rootDir.replace(/\/$/, '')}/`)
      );
      const systemEntries =
        system?.readDirectory?.(
          rootDir,
          extensions,
          excludes,
          includes,
          depth
        ) ?? [];
      return [...new Set([...local, ...systemEntries])].sort(compareText);
    },
    directoryExists: moduleResolutionHost.directoryExists,
    getDirectories: moduleResolutionHost.getDirectories,
    realpath: moduleResolutionHost.realpath,
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map(
        (moduleName) =>
          ts.resolveModuleName(
            moduleName,
            containingFile,
            compilerOptions,
            moduleResolutionHost
          ).resolvedModule
      ),
    useCaseSensitiveFileNames: () => true,
  };

  const service = ts.createLanguageService(
    host,
    ts.createDocumentRegistry(true, VIRTUAL_WORKSPACE_ROOT)
  );

  return Object.freeze({
    artifacts,
    service,
    compilerOptions,
    getArtifact: (artifactId) => artifactById.get(artifactId) ?? null,
    getArtifactByFileName: (fileName) =>
      artifactByFileName.get(fileName) ?? null,
    getFileName: (artifactId) => fileNameByArtifactId.get(artifactId) ?? null,
    getOffset(position) {
      const artifact = artifactById.get(position.artifactId);
      if (!artifact) return null;
      const range = resolveCodeSourceSpanOffsets(artifact.source, {
        artifactId: artifact.id,
        startLine: position.line,
        startColumn: position.column,
        endLine: position.line,
        endColumn: position.column,
      });
      return range?.from ?? null;
    },
    createSourceSpan(artifactId, textSpan) {
      const artifact = artifactById.get(artifactId);
      return artifact
        ? createCodeSourceSpanFromOffsets({
            artifactId,
            source: artifact.source,
            from: textSpan.start,
            to: textSpan.start + textSpan.length,
          })
        : null;
    },
    dispose: () => service.dispose(),
  });
};
