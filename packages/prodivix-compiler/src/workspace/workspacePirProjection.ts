import type { WorkspacePirDocument } from '@prodivix/workspace';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  getCodegenPolicyDependenciesForUsage,
  type CodegenPolicySnapshot,
} from '#src/core/codegenPolicy';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import {
  createExportPackageOrigin,
  mergeExportDependencies,
  type ExportDependency,
  type ExportModule,
  type ExportRoot,
} from '#src/export';
import type {
  CompiledWorkspacePirProjection,
  WorkspacePirDocumentModuleCompiler,
  WorkspaceTargetCompileOptions,
} from '#src/workspace/workspaceTargetRenderLayer';

const collectCodegenPolicyUsage = (
  documents: readonly WorkspacePirDocument[]
): Readonly<{
  runtimeTypes: readonly string[];
  iconProviderIds: readonly string[];
}> => {
  const runtimeTypes = new Set<string>();
  const iconProviderIds = new Set<string>();
  for (const document of documents) {
    for (const node of Object.values(document.content.ui.graph.nodesById)) {
      if (node.kind !== 'element') continue;
      runtimeTypes.add(node.type);
      const iconRef = node.props?.iconRef;
      if (
        node.type !== 'PdxIcon' ||
        iconRef?.kind !== 'literal' ||
        !iconRef.value ||
        typeof iconRef.value !== 'object' ||
        Array.isArray(iconRef.value)
      ) {
        continue;
      }
      const provider = (iconRef.value as Readonly<Record<string, unknown>>)
        .provider;
      if (typeof provider === 'string' && provider.trim()) {
        iconProviderIds.add(provider.trim());
      }
    }
  }
  return {
    runtimeTypes: [...runtimeTypes].sort(compareUnicodeCodePoints),
    iconProviderIds: [...iconProviderIds].sort(compareUnicodeCodePoints),
  };
};

const createCodegenPolicyExportDependencies = (
  snapshot: CodegenPolicySnapshot,
  documents: readonly WorkspacePirDocument[]
): readonly ExportDependency[] =>
  getCodegenPolicyDependenciesForUsage(
    snapshot,
    collectCodegenPolicyUsage(documents)
  ).map((dependency) => ({
    name: dependency.name,
    version: dependency.version,
    kind: dependency.kind,
    origin: createExportPackageOrigin(dependency.name, dependency.version, {
      updatePolicy: 'pin',
      metadata: {
        [dependency.name]: {
          license: dependency.license,
          owner: 'third-party',
        },
      },
    }),
  }));

/**
 * One PIR document compiles to one component module, in every target.
 *
 * This projection owns the topology — iteration order, module/root dedup,
 * dependency accumulation and the document-to-module mapping — so a target can
 * only decide what a module's source text looks like, never how many modules a
 * document becomes or what they are attributed to. Cross-target behaviour
 * findings, visual baselines and SourceTrace navigation only line up because
 * this shape is shared (ADR 31:344).
 */
export const compileWorkspacePirDocumentProjection = (input: {
  documents: readonly WorkspacePirDocument[];
  options: WorkspaceTargetCompileOptions;
  moduleCompiler: WorkspacePirDocumentModuleCompiler;
}): CompiledWorkspacePirProjection => {
  const modulesById = new Map<string, ExportModule>();
  const rootsById = new Map<string, ExportRoot>();
  const dependencies: ExportDependency[] = [];
  const diagnostics = new Map<string, CompileDiagnostic>();
  const componentNameByDocumentId = new Map<string, string>();

  for (const document of input.documents) {
    const result = input.moduleCompiler.compileDocument(document.id);
    for (const diagnostic of result.diagnostics) {
      diagnostics.set(
        `${diagnostic.code}:${diagnostic.path}:${diagnostic.message}`,
        diagnostic
      );
    }
    if (result.status === 'blocked') continue;
    for (const module of result.modules) {
      if (!modulesById.has(module.id)) modulesById.set(module.id, module);
    }
    for (const root of result.roots) {
      if (!rootsById.has(root.id)) rootsById.set(root.id, root);
    }
    dependencies.push(...result.dependencies);
    for (const [documentId, name] of Object.entries(
      result.moduleNameByDocumentId
    )) {
      componentNameByDocumentId.set(documentId, name);
    }
  }

  return {
    documents: input.documents.flatMap((document) => {
      const module = modulesById.get(
        input.moduleCompiler.moduleIdForDocument(document.id)
      );
      const componentName = componentNameByDocumentId.get(document.id);
      return module && componentName
        ? [{ componentName, document, module }]
        : [];
    }),
    contribution: {
      roots: [...rootsById.values()],
      modules: [...modulesById.values()],
      dependencies: mergeExportDependencies([
        ...dependencies,
        ...(input.options.codegenPolicySnapshot
          ? createCodegenPolicyExportDependencies(
              input.options.codegenPolicySnapshot,
              input.documents
            )
          : []),
      ]),
      diagnostics: [...diagnostics.values()],
      metadata: {
        pirProjection: {
          entryDocumentIds: input.documents.map((document) => document.id),
        },
      },
    },
  };
};
