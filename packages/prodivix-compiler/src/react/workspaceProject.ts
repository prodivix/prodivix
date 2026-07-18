import {
  classifyBinaryAssetDelivery,
  createBinaryAssetMaterialization,
  type BinaryAssetBlobReference,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  decodeWorkspaceAnimationDocument,
  decodeWorkspaceNodeGraphDocument,
  isWorkspaceAssetDocumentContent,
  isWorkspaceCodeDocumentContent,
  isWorkspacePirDocument,
  isWorkspaceProjectConfigDocumentContent,
  validateWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { ExecutableProjectDataMockProvision } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import { compileAnimationExportContributions } from '#src/animation/compileAnimation';
import type { TargetAdapter } from '#src/core/adapter';
import {
  createCodegenPolicyTargetAdapter,
  getCodegenPolicyDependenciesForUsage,
  getCodegenPolicyPackageVersions,
  type CodegenPolicySnapshot,
} from '#src/core/codegenPolicy';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import { compileNodeGraphExportContributions } from '#src/nodegraph/compileNodeGraph';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import {
  ProductionExportPlanner,
  collectExportCodeArtifactContributions,
  createExportPackageOrigin,
  createExportProgramBuilder,
  createReactViteExportPreset,
  createReactViteScaffoldContributions,
  createRouteExportContribution,
  createStaticDeploymentExportContribution,
  joinExportPath,
  getExportCodeArtifactLanguage,
  mergeExportDependencies,
  normalizeExportCodeArtifactPath,
  normalizeExportPath,
  resolveWorkspaceDocumentExportSource,
  REACT_VITE_DEPENDENCIES,
  REACT_VITE_DEV_DEPENDENCIES,
  REACT_VITE_PACKAGE_MANAGER,
  type ExportArtifactContribution,
  type ExportDependency,
  type ExportImportIntent,
  type ExportModule,
  type ExportProgram,
  type ExportProgramContribution,
  type ExportRoot,
  type ExportRouteTopology,
  type ExportSourceTrace,
} from '#src/export';
import { reactAdapter } from '#src/react/adapter';
import {
  compileWorkspacePirReactModules,
  createPirReactModuleId,
} from '#src/react/index';
import {
  createWorkspaceStandaloneDataRuntimeModule,
  WORKSPACE_DATA_RUNTIME_MODULE_ID,
} from '#src/react/standaloneDataRuntime';
import {
  createWorkspaceExecutionConsoleRuntimeModule,
  WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
} from '#src/react/standaloneExecutionConsoleRuntime';
import {
  analyzeWorkspaceDataRuntimeTarget,
  type WorkspaceDataRuntimeTarget,
} from '#src/react/workspaceDataRuntimeTarget';
import {
  createWorkspaceStandaloneServerRuntimeModule,
  WORKSPACE_SERVER_RUNTIME_MODULE_ID,
} from '#src/react/standaloneServerRuntime';
import {
  analyzeWorkspaceServerRuntimeTarget,
  isWorkspaceServerRuntimeDocument,
  type WorkspaceServerRuntimeBinding,
  type WorkspaceServerRuntimeTarget,
  type WorkspaceServerRuntimeTargetAnalysis,
} from '#src/react/workspaceServerRuntimeTarget';
import type {
  ReactExportBundle,
  ReactGeneratorCodeArtifact,
} from '#src/react/types';

export type WorkspaceReactViteCompileOptions = Readonly<{
  adapter?: TargetAdapter;
  codegenPolicySnapshot?: CodegenPolicySnapshot;
  packageResolver?: PackageResolverOptions;
  exportContributions?: ExportProgramContribution[];
  projectName?: string;
  dataMockProvision?: ExecutableProjectDataMockProvision;
  dataRuntimeTarget?: WorkspaceDataRuntimeTarget;
  serverRuntimeTarget?: WorkspaceServerRuntimeTarget;
  serverRuntimeMockProvision?: ServerRuntimeTestProvision;
  assetMaterializations?: readonly BinaryAssetMaterialization[];
}>;

type CompiledWorkspacePirDocument = {
  componentName: string;
  document: WorkspacePirDocument;
  module: ExportModule;
};

type CompiledWorkspacePirProjection = Readonly<{
  documents: readonly CompiledWorkspacePirDocument[];
  contribution: ExportProgramContribution;
}>;

type WorkspaceRouteRuntimeBinding = {
  artifactId: string;
  exportName?: string;
  kind: 'loader' | 'action' | 'guard';
  localName?: string;
  serverFunction?: WorkspaceServerRuntimeBinding['definition'];
  routeNodeId: string;
};

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

const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
};

const toCanonicalJson = (value: unknown): string =>
  `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;

const createDocumentSourceTrace = (
  document: WorkspaceDocument
): ExportSourceTrace => ({
  sourceRef: {
    domain: 'workspace-document',
    id: document.id,
    path: document.path,
  },
  ownerRootId: document.id,
});

const compileWorkspacePirDocuments = (input: {
  workspace: WorkspaceSnapshot;
  documents: readonly WorkspacePirDocument[];
  options: WorkspaceReactViteCompileOptions;
}): CompiledWorkspacePirProjection => {
  const fallbackAdapter = input.options.adapter ?? reactAdapter;
  const adapter = input.options.codegenPolicySnapshot
    ? createCodegenPolicyTargetAdapter(
        input.options.codegenPolicySnapshot,
        fallbackAdapter
      )
    : fallbackAdapter;
  const packageResolver = input.options.codegenPolicySnapshot
    ? {
        ...input.options.packageResolver,
        packageVersions: {
          ...getCodegenPolicyPackageVersions(
            input.options.codegenPolicySnapshot
          ),
          ...input.options.packageResolver?.packageVersions,
        },
      }
    : input.options.packageResolver;
  const modulesById = new Map<string, ExportModule>();
  const rootsById = new Map<string, ExportRoot>();
  const dependencies: ExportDependency[] = [];
  const diagnostics = new Map<string, CompileDiagnostic>();
  const componentNameByDocumentId = new Map<string, string>();

  for (const document of input.documents) {
    const result = compileWorkspacePirReactModules({
      workspace: input.workspace,
      entryDocumentId: document.id,
      adapter,
      packageResolver,
    });
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
    for (const root of result.contribution.roots ?? []) {
      if (!rootsById.has(root.id)) rootsById.set(root.id, root);
    }
    dependencies.push(...(result.contribution.dependencies ?? []));
    for (const [documentId, name] of Object.entries(
      result.moduleNameByDocumentId
    )) {
      componentNameByDocumentId.set(documentId, name);
    }
  }

  return {
    documents: input.documents.flatMap((document) => {
      const module = modulesById.get(createPirReactModuleId(document.id));
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

const createCodeContributions = (input: {
  documents: readonly WorkspaceDocument[];
}): {
  contribution: ExportProgramContribution;
  executableModuleIdByArtifactId: Map<string, string>;
} => {
  const executableModuleIdByArtifactId = new Map<string, string>();
  const modules: ExportModule[] = [];
  const nonExecutableArtifacts: ReactGeneratorCodeArtifact[] = [];
  input.documents.forEach((document) => {
    if (!isWorkspaceCodeDocumentContent(document.content)) return;
    if (isWorkspaceServerRuntimeDocument(document)) return;
    if (
      document.content.language !== 'ts' &&
      document.content.language !== 'js'
    ) {
      nonExecutableArtifacts.push({
        id: document.id,
        path: document.path,
        language: document.content.language,
        source: document.content.source,
      });
      return;
    }
    const language = getExportCodeArtifactLanguage({
      id: document.id,
      path: document.path,
      language: document.content.language,
      source: document.content.source,
    });
    const moduleId = `workspace-code:${document.id}`;
    executableModuleIdByArtifactId.set(document.id, moduleId);
    modules.push({
      id: moduleId,
      kind: 'workspace-module',
      suggestedName: document.path.split('/').at(-1) ?? document.id,
      desiredPath: joinExportPath(
        'src',
        normalizeExportCodeArtifactPath(document.path)
      ),
      language:
        language === 'tsx' || language === 'jsx'
          ? language
          : document.content.language,
      imports: [],
      body: document.content.source,
      sourceTrace: [createDocumentSourceTrace(document)],
      origin: resolveWorkspaceDocumentExportSource({
        label: document.path,
      }).origin,
    });
  });
  return {
    executableModuleIdByArtifactId,
    contribution: {
      modules,
      artifacts: collectExportCodeArtifactContributions(
        nonExecutableArtifacts.filter((artifact) => artifact.language !== 'css')
      ),
      files: nonExecutableArtifacts
        .filter((artifact) => artifact.language === 'css')
        .map((artifact) => ({
          id: `workspace-code-file:${artifact.id}`,
          desiredPath: normalizeExportCodeArtifactPath(artifact.path),
          baseDirectory: 'source-root' as const,
          kind: 'stylesheet' as const,
          language: 'css',
          mimeType: 'text/css',
          importMode: 'copy-only' as const,
          contents: artifact.source,
          sourceTrace: [
            {
              sourceRef: {
                domain: 'workspace-document',
                id: artifact.id,
                path: artifact.path,
              },
            },
          ],
          origin: resolveWorkspaceDocumentExportSource({
            label: artifact.path,
          }).origin,
        })),
    },
  };
};

const binaryAssetReferencesEqual = (
  left: BinaryAssetBlobReference,
  right: BinaryAssetBlobReference
): boolean =>
  left.kind === right.kind &&
  left.digest === right.digest &&
  left.byteLength === right.byteLength &&
  left.mediaType === right.mediaType;

const createWorkspaceResourceContribution = (
  documents: readonly WorkspaceDocument[],
  materializations: readonly BinaryAssetMaterialization[] = []
): ExportProgramContribution => {
  const artifacts: ExportArtifactContribution[] = [];
  const diagnostics: CompileDiagnostic[] = [];
  const materializationsByDocumentId = new Map<
    string,
    BinaryAssetMaterialization[]
  >();
  materializations.forEach((materialization, index) => {
    try {
      const verified = createBinaryAssetMaterialization(materialization);
      const existing =
        materializationsByDocumentId.get(verified.assetDocumentId) ?? [];
      existing.push(verified);
      materializationsByDocumentId.set(verified.assetDocumentId, existing);
    } catch (error) {
      diagnostics.push({
        code: 'AST-1004',
        severity: 'error',
        source: 'export',
        message:
          error instanceof Error
            ? `Asset materialization ${index} is invalid: ${error.message}`
            : `Asset materialization ${index} is invalid.`,
        path: `/assetMaterializations/${index}`,
      });
    }
  });
  const referencedMaterializationIds = new Set<string>();
  documents.forEach((document) => {
    const sourceTrace = [createDocumentSourceTrace(document)];
    const origin = resolveWorkspaceDocumentExportSource({
      label: document.path,
    }).origin;
    if (
      document.type === 'asset' &&
      isWorkspaceAssetDocumentContent(document.content)
    ) {
      const candidates = materializationsByDocumentId.get(document.id) ?? [];
      if (candidates.length !== 1) {
        diagnostics.push({
          code: candidates.length ? 'AST-1002' : 'AST-1001',
          severity: 'error',
          source: 'export',
          message: candidates.length
            ? `Asset ${document.id} has duplicate materializations.`
            : `Asset ${document.id} has no verified materialization.`,
          path: document.path,
        });
        return;
      }
      const candidate = candidates[0]!;
      if (
        !binaryAssetReferencesEqual(candidate.reference, document.content.blob)
      ) {
        diagnostics.push({
          code: 'AST-1003',
          severity: 'error',
          source: 'export',
          message: `Asset ${document.id} materialization identity drifted from its Workspace reference.`,
          path: document.path,
        });
        return;
      }
      let verified: BinaryAssetMaterialization;
      try {
        verified = createBinaryAssetMaterialization({
          assetDocumentId: document.id,
          reference: document.content.blob,
          contents: candidate.contents,
        });
      } catch (error) {
        diagnostics.push({
          code: 'AST-1004',
          severity: 'error',
          source: 'export',
          message:
            error instanceof Error
              ? `Asset ${document.id} bytes failed verification: ${error.message}`
              : `Asset ${document.id} bytes failed verification.`,
          path: document.path,
        });
        return;
      }
      const isPublic = document.path.startsWith('/public/');
      const deliveryClass = classifyBinaryAssetDelivery(document.content.mime);
      if (isPublic && deliveryClass !== 'static') {
        diagnostics.push({
          code: deliveryClass === 'active-content' ? 'AST-1101' : 'AST-1102',
          severity: 'error',
          source: 'export',
          message:
            deliveryClass === 'active-content'
              ? `Asset ${document.id} uses active content media type ${document.content.mime}; public delivery requires a sanitizer and isolated-origin policy.`
              : `Asset ${document.id} uses download-only media type ${document.content.mime}; public delivery requires an attachment-capable isolated origin.`,
          path: document.path,
        });
        return;
      }
      referencedMaterializationIds.add(document.id);
      const emittedPath = normalizeExportPath(document.path);
      artifacts.push({
        id: `workspace-resource:${document.id}`,
        kind: 'asset',
        suggestedName: emittedPath.split('/').at(-1) ?? document.id,
        mimeType: document.content.mime,
        contents: verified.contents,
        ...(isPublic
          ? { publicPath: emittedPath }
          : { sourcePath: joinExportPath('src', 'assets', emittedPath) }),
        placement: {
          deliveryPolicy: isPublic ? 'public' : 'copy',
        },
        sourceTrace,
        origin: { ...origin, writePolicy: 'copy' },
      });
      return;
    }
    if (
      document.type === 'project-config' &&
      isWorkspaceProjectConfigDocumentContent(document.content)
    ) {
      artifacts.push({
        id: `workspace-resource:${document.id}`,
        kind: 'config',
        suggestedName: document.path,
        language: 'json',
        mimeType: 'application/json',
        contents: toCanonicalJson(document.content.value),
        placement: {
          desiredPath: normalizeExportPath(document.path),
          baseDirectory: 'project-root',
          fileKind: 'config',
          importMode: 'copy-only',
        },
        sourceTrace,
        origin: { ...origin, writePolicy: 'copy' },
      });
    }
  });
  materializationsByDocumentId.forEach((_entries, assetDocumentId) => {
    if (referencedMaterializationIds.has(assetDocumentId)) return;
    if (
      documents.some(
        (document) =>
          document.id === assetDocumentId && document.type === 'asset'
      )
    ) {
      return;
    }
    diagnostics.push({
      code: 'AST-1005',
      severity: 'error',
      source: 'export',
      message: `Asset materialization ${assetDocumentId} does not match a canonical Workspace asset document.`,
      path: `/assetMaterializations/${assetDocumentId}`,
    });
  });
  return { artifacts, diagnostics };
};

const scoreRoutePath = (path: string): number =>
  path
    .split('/')
    .filter(Boolean)
    .reduce(
      (score, segment) =>
        score +
        (segment.startsWith('*')
          ? 1
          : segment.startsWith(':') || /^\[.+\]$/.test(segment)
            ? 10
            : 100),
      path === '/' ? 1_000 : 0
    );

const createWorkspaceAppModule = (input: {
  compiledDocuments: readonly CompiledWorkspacePirDocument[];
  executableModuleIdByArtifactId: ReadonlyMap<string, string>;
  routeTopology: ExportRouteTopology;
  serverRuntime: WorkspaceServerRuntimeTargetAnalysis;
}): { module: ExportModule; diagnostics: CompileDiagnostic[] } => {
  const moduleByDocumentId = new Map(
    input.compiledDocuments.map((compiled) => [compiled.document.id, compiled])
  );
  const imports: ExportImportIntent[] = [
    {
      kind: 'side-effect',
      source: WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
      targetModuleId: WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
    },
    {
      kind: 'default',
      source: 'react',
      imported: 'React',
      local: 'React',
    },
    {
      kind: 'named',
      source: 'react',
      imported: 'useSyncExternalStore',
      local: 'useSyncExternalStore',
    },
    {
      kind: 'named',
      source: WORKSPACE_DATA_RUNTIME_MODULE_ID,
      targetModuleId: WORKSPACE_DATA_RUNTIME_MODULE_ID,
      imported: 'createWorkspaceDataRuntime',
      local: 'createWorkspaceDataRuntime',
    },
    {
      kind: 'named',
      source: WORKSPACE_SERVER_RUNTIME_MODULE_ID,
      targetModuleId: WORKSPACE_SERVER_RUNTIME_MODULE_ID,
      imported: 'invokeWorkspaceServerFunction',
      local: 'invokeWorkspaceServerFunction',
    },
    ...input.compiledDocuments.map((compiled): ExportImportIntent => ({
      kind: 'default',
      source: compiled.module.id,
      targetModuleId: compiled.module.id,
      local: compiled.componentName,
    })),
  ];
  const diagnostics: CompileDiagnostic[] = [];
  const runtimeBindings: WorkspaceRouteRuntimeBinding[] = [];
  const runtimeImportByKey = new Map<string, WorkspaceRouteRuntimeBinding>();
  const serverArtifactIds = new Set(input.serverRuntime.serverArtifactIds);
  input.routeTopology.runtimeRefs.forEach((reference) => {
    const serverBinding = input.serverRuntime.bindings.find(
      (binding) =>
        binding.routeNodeId === reference.routeNodeId &&
        binding.routeKind === reference.kind &&
        binding.definition.reference.artifactId === reference.artifactId &&
        binding.definition.reference.exportName === reference.exportName
    );
    if (serverBinding) {
      runtimeBindings.push({
        artifactId: reference.artifactId,
        exportName: reference.exportName,
        kind: reference.kind,
        routeNodeId: reference.routeNodeId,
        serverFunction: serverBinding.definition,
      });
      return;
    }
    if (serverArtifactIds.has(reference.artifactId)) return;
    const targetModuleId = input.executableModuleIdByArtifactId.get(
      reference.artifactId
    );
    if (!targetModuleId) {
      diagnostics.push({
        code: 'WKS-EXPORT-RUNTIME-REFERENCE',
        severity: 'error',
        source: 'export',
        message: `Route ${reference.routeNodeId} references a non-executable CodeArtifact: ${reference.artifactId}.`,
        path: `/routeManifest/runtime/${reference.routeNodeId}/${reference.kind}`,
      });
      return;
    }
    const key = `${targetModuleId}:${reference.exportName ?? '*'}`;
    let binding = runtimeImportByKey.get(key);
    if (!binding) {
      binding = {
        artifactId: reference.artifactId,
        exportName: reference.exportName,
        kind: reference.kind,
        localName: `workspaceRouteRuntime${runtimeImportByKey.size + 1}`,
        routeNodeId: reference.routeNodeId,
      };
      runtimeImportByKey.set(key, binding);
      imports.push({
        kind: reference.exportName ? 'named' : 'namespace',
        source: targetModuleId,
        targetModuleId,
        ...(reference.exportName ? { imported: reference.exportName } : {}),
        local: binding.localName,
      });
    }
    runtimeBindings.push({
      ...binding,
      kind: reference.kind,
      routeNodeId: reference.routeNodeId,
    });
  });

  const routeEntries = input.routeTopology.routes
    .flatMap((route) => {
      if (!route.pageDocId) return [];
      const compiled = moduleByDocumentId.get(route.pageDocId);
      if (!compiled) {
        diagnostics.push({
          code: 'WKS-EXPORT-ROUTE-DOCUMENT',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} references an uncompiled page document: ${route.pageDocId}.`,
          path: `/routeManifest/routes/${route.routeNodeId}`,
        });
        return [];
      }
      return [
        {
          path: route.path,
          routeNodeId: route.routeNodeId,
          componentName: compiled.componentName,
        },
      ];
    })
    .sort(
      (left, right) =>
        scoreRoutePath(right.path) - scoreRoutePath(left.path) ||
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.routeNodeId, right.routeNodeId)
    );
  if (!routeEntries.length) {
    diagnostics.push({
      code: 'WKS-EXPORT-ROUTES-EMPTY',
      severity: 'error',
      source: 'export',
      message: 'Workspace export requires at least one route page.',
      path: '/routeManifest',
    });
  }

  const documentRegistry = input.compiledDocuments
    .map(
      (compiled) =>
        `  ${JSON.stringify(compiled.document.id)}: ${compiled.componentName},`
    )
    .join('\n');
  const routeTable = routeEntries
    .map(
      (route) =>
        `  { routeNodeId: ${JSON.stringify(route.routeNodeId)}, path: ${JSON.stringify(route.path)}, Component: ${route.componentName} },`
    )
    .join('\n');
  const runtimeByRoute = new Map<
    string,
    Partial<Record<WorkspaceRouteRuntimeBinding['kind'], string>>
  >();
  runtimeBindings.forEach((binding) => {
    const current = runtimeByRoute.get(binding.routeNodeId) ?? {};
    current[binding.kind] = binding.serverFunction
      ? `{ kind: 'server-function', functionRef: ${JSON.stringify(binding.serverFunction.reference)} }`
      : binding.localName;
    runtimeByRoute.set(binding.routeNodeId, current);
  });
  const runtimeTable = [...runtimeByRoute.entries()]
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .map(
      ([routeNodeId, bindings]) =>
        `  ${JSON.stringify(routeNodeId)}: { ${Object.entries(bindings)
          .map(([kind, localName]) => `${kind}: ${localName}`)
          .join(', ')} },`
    )
    .join('\n');

  return {
    diagnostics,
    module: {
      id: 'workspace-react-entry',
      kind: 'react-entry',
      suggestedName: 'App',
      language: 'tsx',
      imports,
      body: `export const workspaceDocumentComponents = {
${documentRegistry}
} as const;

export const workspaceRouteRuntime = {
${runtimeTable}
} as const;

const workspaceRoutes = [
${routeTable}
] as const;

const workspaceDataRuntime = createWorkspaceDataRuntime();

type WorkspaceServerFunctionRouteRuntimeEntry = Readonly<{
  kind: 'server-function';
  functionRef: Readonly<{ artifactId: string; exportName: string }>;
}>;

const readWorkspaceRouteRuntime = (routeNodeId: string) =>
  (workspaceRouteRuntime as Readonly<Record<string, Partial<Record<'loader' | 'action' | 'guard', unknown>>>>)[routeNodeId];

const readWorkspaceServerFunctionRouteRuntimeEntry = (
  value: unknown
): WorkspaceServerFunctionRouteRuntimeEntry | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entry = value as Readonly<Record<string, unknown>>;
  const functionRef = entry.functionRef;
  if (
    entry.kind !== 'server-function' || !functionRef || typeof functionRef !== 'object' || Array.isArray(functionRef)
  ) return undefined;
  const reference = functionRef as Readonly<Record<string, unknown>>;
  return typeof reference.artifactId === 'string' && typeof reference.exportName === 'string'
    ? value as WorkspaceServerFunctionRouteRuntimeEntry
    : undefined;
};

let activeWorkspaceRouteLoaderValue: unknown;
export const readWorkspaceRouteLoaderValue = () => activeWorkspaceRouteLoaderValue;

const workspacePirRuntime = {
  ...workspaceDataRuntime,
  dispatchTrigger(input: Readonly<{
    binding: unknown;
    payload: unknown;
    runtimeValuesById: Readonly<Record<string, unknown>>;
    source: Readonly<{ documentId: string; nodeId: string; eventName: string; instancePath: string }>;
  }>) {
    const binding = input.binding && typeof input.binding === 'object'
      ? input.binding as Readonly<Record<string, unknown>>
      : undefined;
    if (binding?.kind === 'open-url' && typeof binding.href === 'string' && typeof window !== 'undefined') {
      window.open(binding.href, '_blank', 'noopener,noreferrer');
    }
    if (binding?.kind === 'dispatch-data-operation') {
      void workspaceDataRuntime.dispatchDataMutation({
        binding: input.binding as Parameters<typeof workspaceDataRuntime.dispatchDataMutation>[0]['binding'],
        payload: input.payload,
        runtimeValuesById: input.runtimeValuesById,
        source: input.source,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : 'DATA_MUTATION_FAILED');
      });
    }
  },
  resolveCodeValue() {
    return undefined;
  },
} as const;

const normalizePath = (value: string) => {
  const normalized = (value.split(/[?#]/, 1)[0] || '/').replace(/\\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\\/$/, '') : '/';
};

const matchWorkspaceRoutePath = (pattern: string, pathname: string): Readonly<Record<string, string>> | undefined => {
  const patternSegments = normalizePath(pattern).split('/').filter(Boolean);
  const pathSegments = normalizePath(pathname).split('/').filter(Boolean);
  const params: Record<string, string> = {};
  let pathIndex = 0;
  for (const segment of patternSegments) {
    if (segment.startsWith('*') || /^\\[\\.\\.\\..+\\]$/.test(segment)) {
      const name = segment.startsWith('*') ? segment.slice(1) || 'splat' : segment.slice(4, -1);
      try {
        params[name] = decodeURIComponent(pathSegments.slice(pathIndex).join('/'));
      } catch {
        return undefined;
      }
      return Object.freeze(params);
    }
    if (pathIndex >= pathSegments.length) return undefined;
    const dynamic = segment.startsWith(':') || /^\\[[^\\]]+\\]$/.test(segment);
    if (!dynamic && segment !== pathSegments[pathIndex]) {
      return undefined;
    }
    if (dynamic) {
      const name = segment.startsWith(':') ? segment.slice(1) : segment.slice(1, -1);
      try {
        params[name] = decodeURIComponent(pathSegments[pathIndex]);
      } catch {
        return undefined;
      }
    }
    pathIndex += 1;
  }
  return pathIndex === pathSegments.length ? Object.freeze(params) : undefined;
};

const readPathname = () =>
  typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname);

const findWorkspaceRoute = (pathname: string) => {
  for (const route of workspaceRoutes) {
    const params = matchWorkspaceRoutePath(route.path, pathname);
    if (params) return Object.freeze({ ...route, params });
  }
  return undefined;
};

let activeWorkspaceRouteActionController: AbortController | undefined;
let workspaceRouteRuntimeRevision = 0;
const workspaceRouteRuntimeSubscribers = new Set<() => void>();

const readWorkspaceLocationSnapshot = () =>
  readPathname() + '\\0' + String(workspaceRouteRuntimeRevision);

const subscribeToLocation = (notify: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const onLocationChange = () => {
    activeWorkspaceRouteActionController?.abort();
    notify();
  };
  workspaceRouteRuntimeSubscribers.add(notify);
  window.addEventListener('popstate', onLocationChange);
  return () => {
    workspaceRouteRuntimeSubscribers.delete(notify);
    window.removeEventListener('popstate', onLocationChange);
  };
};

const notifyWorkspaceRouteRevalidation = () => {
  workspaceRouteRuntimeRevision += 1;
  workspaceRouteRuntimeSubscribers.forEach((notify) => notify());
};

const readWorkspaceSearchParams = (): Readonly<Record<string, string | readonly string[]>> => {
  if (typeof window === 'undefined') return Object.freeze({});
  const values: Record<string, string | string[]> = {};
  new URLSearchParams(window.location.search).forEach((value, key) => {
    const current = values[key];
    values[key] = current === undefined
      ? value
      : Array.isArray(current)
        ? [...current, value]
        : [current, value];
  });
  return Object.freeze(Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Array.isArray(value) ? Object.freeze(value) : value,
    ])
  ));
};

export type WorkspaceRouteActionSubmission = Readonly<{
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  encType: 'application/json' | 'application/x-www-form-urlencoded';
  value: unknown;
}>;

export type WorkspaceRouteActionOptions = Readonly<{
  invocationId?: string;
  attempt?: number;
  signal?: AbortSignal;
}>;

/** Dispatches one typed Route action and revalidates the active loader after a value outcome. */
export const dispatchWorkspaceRouteAction = async (
  submission: WorkspaceRouteActionSubmission,
  options: WorkspaceRouteActionOptions = {}
) => {
  if (typeof window === 'undefined') throw new Error('SVR_ROUTE_ACTION_BROWSER_REQUIRED');
  const currentPath = readPathname();
  const match = findWorkspaceRoute(currentPath);
  const action = match
    ? readWorkspaceServerFunctionRouteRuntimeEntry(readWorkspaceRouteRuntime(match.routeNodeId)?.action)
    : undefined;
  if (!match || !action) throw new Error('SVR_ROUTE_ACTION_UNAVAILABLE');
  if (
    !submission ||
    typeof submission !== 'object' ||
    Array.isArray(submission) ||
    Object.keys(submission).sort().join('\\0') !==
    ['encType', 'method', 'value'].sort().join('\\0')
  ) {
    throw new Error('SVR_ROUTE_ACTION_INPUT_INVALID');
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(submission.method)) {
    throw new Error('SVR_ROUTE_ACTION_INPUT_INVALID');
  }
  if (submission.encType !== 'application/json' && submission.encType !== 'application/x-www-form-urlencoded') {
    throw new Error('SVR_ROUTE_ACTION_INPUT_INVALID');
  }
  activeWorkspaceRouteActionController?.abort();
  const controller = new AbortController();
  activeWorkspaceRouteActionController = controller;
  const cancelFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', cancelFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const outcome = await invokeWorkspaceServerFunction(
      action.functionRef,
      Object.freeze({
        format: 'prodivix.route-action-input.v1',
        route: Object.freeze({
          routeNodeId: match.routeNodeId,
          currentPath,
          matchedPath: match.path,
          params: match.params,
          searchParams: readWorkspaceSearchParams(),
          ...(window.location.hash ? { hash: window.location.hash } : {}),
        }),
        submission: Object.freeze({
          method: submission.method,
          encType: submission.encType,
          value: submission.value,
        }),
      }),
      {
        ...(options.invocationId !== undefined
          ? { invocationId: options.invocationId }
          : {}),
        ...(options.attempt !== undefined ? { attempt: options.attempt } : {}),
        signal: controller.signal,
      }
    );
    if (outcome.kind === 'redirect') {
      window.location.assign(outcome.location);
      return outcome;
    }
    if (outcome.kind !== 'value') throw new Error('SVR_ROUTE_ACTION_OUTCOME_INVALID');
    notifyWorkspaceRouteRevalidation();
    return outcome;
  } finally {
    options.signal?.removeEventListener('abort', cancelFromCaller);
    if (activeWorkspaceRouteActionController === controller) {
      activeWorkspaceRouteActionController = undefined;
    }
  }
};

export default function App() {
  const locationSnapshot = useSyncExternalStore(
    subscribeToLocation,
    readWorkspaceLocationSnapshot,
    () => '/\\0' + String(workspaceRouteRuntimeRevision)
  );
  const pathname = locationSnapshot.split('\\0', 1)[0] || '/';
  const match = findWorkspaceRoute(pathname);
  const routeRuntime = match ? readWorkspaceRouteRuntime(match.routeNodeId) : undefined;
  const routeServerGuard = readWorkspaceServerFunctionRouteRuntimeEntry(routeRuntime?.guard);
  const routeServerLoader = readWorkspaceServerFunctionRouteRuntimeEntry(routeRuntime?.loader);
  const [routeRuntimeState, setRouteRuntimeState] = React.useState<
    | Readonly<{ routeNodeId: string; status: 'pending' | 'ready' }>
    | Readonly<{ routeNodeId: string; status: 'denied' | 'failed'; code: string }>
  >(() => ({ routeNodeId: '', status: 'pending' }));

  React.useEffect(() => {
    if (!match || (!routeServerGuard && !routeServerLoader)) {
      activeWorkspaceRouteLoaderValue = undefined;
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const routeNodeId = match.routeNodeId;
    activeWorkspaceRouteLoaderValue = undefined;
    setRouteRuntimeState({ routeNodeId, status: 'pending' });
    const invoke = async (entry: WorkspaceServerFunctionRouteRuntimeEntry | undefined) => {
      if (!entry) return undefined;
      return invokeWorkspaceServerFunction(
        entry.functionRef,
        { routeId: routeNodeId },
        { signal: controller.signal }
      );
    };
    void (async () => {
      try {
        const guard = await invoke(routeServerGuard);
        if (!active) return;
        if (guard?.kind === 'deny') {
          setRouteRuntimeState({ routeNodeId, status: 'denied', code: guard.code });
          return;
        }
        if (guard?.kind === 'redirect') {
          window.location.assign(guard.location);
          return;
        }
        if (guard && guard.kind !== 'allow') throw new Error('SVR_ROUTE_GUARD_OUTCOME_INVALID');
        const loader = await invoke(routeServerLoader);
        if (!active) return;
        if (loader?.kind === 'redirect') {
          window.location.assign(loader.location);
          return;
        }
        if (loader && loader.kind !== 'value') throw new Error('SVR_ROUTE_LOADER_OUTCOME_INVALID');
        activeWorkspaceRouteLoaderValue = loader?.kind === 'value' ? loader.value : undefined;
        setRouteRuntimeState({ routeNodeId, status: 'ready' });
      } catch (error) {
        if (!active) return;
        setRouteRuntimeState({
          routeNodeId,
          status: 'failed',
          code: error instanceof Error ? error.message : 'SVR_ROUTE_RUNTIME_FAILED',
        });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [match?.routeNodeId, locationSnapshot]);

  if (!match) return <main data-prodivix-route-not-found="true">Route not found.</main>;
  if (routeServerGuard || routeServerLoader) {
    if (routeRuntimeState.routeNodeId !== match.routeNodeId || routeRuntimeState.status === 'pending') {
      return <main data-prodivix-route-runtime="pending">Loading route.</main>;
    }
    if (routeRuntimeState.status === 'denied') {
      return <main data-prodivix-route-runtime="denied">Access denied.</main>;
    }
    if (routeRuntimeState.status === 'failed') {
      return <main data-prodivix-route-runtime="failed">Route runtime failed: {routeRuntimeState.code}</main>;
    }
  }
  const Page = match.Component;
  return <Page __pdxRuntime={workspacePirRuntime} __pdxRouteId={match.routeNodeId} />;
}
`,
      sourceTrace: input.routeTopology.routes.flatMap(
        (route) => route.sourceTrace
      ),
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    },
  };
};

/** Compiles the complete canonical Workspace into one React/Vite ExportProgram. */
export const compileWorkspaceToExportProgram = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceReactViteCompileOptions = {}
): ExportProgram => {
  const preset = createReactViteExportPreset();
  const dataRuntime = analyzeWorkspaceDataRuntimeTarget(
    workspace,
    options.dataRuntimeTarget
  );
  const workspaceValidation = validateWorkspaceSnapshot(workspace);
  const validationDiagnostics: CompileDiagnostic[] =
    workspaceValidation.issues.map((issue) => ({
      code: issue.code,
      severity: 'error',
      source: 'export',
      message: issue.message,
      path: issue.path,
    }));
  const documents = Object.values(workspace.docsById).sort(
    (left, right) =>
      compareUnicodeCodePoints(left.path, right.path) ||
      compareUnicodeCodePoints(left.id, right.id)
  );
  const nodeGraphContributions = documents.flatMap((document) => {
    if (document.type !== 'pir-graph') return [];
    const read = decodeWorkspaceNodeGraphDocument(document);
    if (read.status !== 'valid') return [];
    return compileNodeGraphExportContributions({
      documentId: document.id,
      ...(document.name ? { displayName: document.name } : {}),
      definition: read.decodedContent,
    });
  });
  const animationContributions = documents.flatMap((document) => {
    if (document.type !== 'pir-animation') return [];
    const read = decodeWorkspaceAnimationDocument(document);
    if (read.status !== 'valid') return [];
    return compileAnimationExportContributions({
      documentId: document.id,
      ...(document.name ? { displayName: document.name } : {}),
      definition: read.decodedContent,
    });
  });
  const pirDocuments = documents.filter(isWorkspacePirDocument);
  const codeDocuments = documents.filter(
    (document) =>
      document.type === 'code' &&
      isWorkspaceCodeDocumentContent(document.content)
  );
  const codeArtifacts: ReactGeneratorCodeArtifact[] = codeDocuments.flatMap(
    (document) => {
      const content = document.content;
      return isWorkspaceCodeDocumentContent(content)
        ? [
            {
              id: document.id,
              path: document.path,
              language: content.language,
              source: content.source,
            },
          ]
        : [];
    }
  );
  const pirCompilation = compileWorkspacePirDocuments({
    workspace,
    documents: pirDocuments,
    options,
  });
  const compiledDocuments = pirCompilation.documents;
  const code = createCodeContributions({
    documents: codeDocuments,
  });
  const routeContribution = createRouteExportContribution({
    manifest: workspace.routeManifest,
    target: preset.target,
    documentInfo: (documentId) => {
      const document = workspace.docsById[documentId];
      return document
        ? { id: document.id, path: document.path, type: document.type }
        : null;
    },
    codeArtifactInfo: (artifactId) => {
      const artifact = codeArtifacts.find((item) => item.id === artifactId);
      return artifact ? { id: artifact.id, path: artifact.path } : null;
    },
  });
  const routeTopology = routeContribution.routes as ExportRouteTopology;
  const serverRuntime = analyzeWorkspaceServerRuntimeTarget(
    workspace,
    routeTopology,
    options.serverRuntimeTarget,
    options.serverRuntimeMockProvision
  );
  const unsupportedLayoutDiagnostics: CompileDiagnostic[] = routeTopology.routes
    .filter((route) => route.layoutDocId)
    .map((route) => ({
      code: 'WKS-EXPORT-LAYOUT-UNSUPPORTED',
      severity: 'error',
      source: 'export',
      message: `Route ${route.routeNodeId} uses a layout that the React/Vite route adapter cannot compose yet.`,
      path: `/routeManifest/routes/${route.routeNodeId}/layoutDocId`,
    }));
  const unsupportedOutletDiagnostics: CompileDiagnostic[] =
    routeTopology.routes.flatMap((route) => [
      ...(route.outletNodeId
        ? [
            {
              code: 'WKS-EXPORT-OUTLET-UNSUPPORTED',
              severity: 'error' as const,
              source: 'export' as const,
              message: `Route ${route.routeNodeId} targets outlet node ${route.outletNodeId}, but the React/Vite route adapter cannot compose route outlets yet.`,
              path: `/routeManifest/routes/${route.routeNodeId}/outletNodeId`,
            },
          ]
        : []),
      ...(route.outletBindings ?? []).map((binding) => ({
        code: 'WKS-EXPORT-OUTLET-UNSUPPORTED',
        severity: 'error' as const,
        source: 'export' as const,
        message: binding.pageDocId
          ? `Route ${route.routeNodeId} reuses document ${binding.pageDocId} through outlet ${binding.outletName}, but the React/Vite route adapter cannot compose route outlets yet.`
          : `Route ${route.routeNodeId} binds outlet ${binding.outletName}, but the React/Vite route adapter cannot compose route outlets yet.`,
        path: `/routeManifest/routes/${route.routeNodeId}/outletBindings/${binding.outletName}`,
      })),
    ]);
  const app = createWorkspaceAppModule({
    compiledDocuments,
    executableModuleIdByArtifactId: code.executableModuleIdByArtifactId,
    routeTopology,
    serverRuntime,
  });
  const standaloneDataRuntime = createWorkspaceStandaloneDataRuntimeModule(
    workspace,
    dataRuntime.target
  );
  const executionConsoleRuntime =
    createWorkspaceExecutionConsoleRuntimeModule();
  const standaloneServerRuntime = createWorkspaceStandaloneServerRuntimeModule(
    serverRuntime.target,
    serverRuntime.bindings
  );
  const projectContributions: ExportProgramContribution[] = [
    pirCompilation.contribution,
    code.contribution,
    ...nodeGraphContributions,
    ...animationContributions,
    createWorkspaceResourceContribution(
      documents,
      options.assetMaterializations
    ),
    routeContribution,
    createStaticDeploymentExportContribution({
      target: 'static-hosting',
      outputDirectory: 'dist',
    }),
    ...(options.exportContributions ?? []),
    {
      entryModuleId: app.module.id,
      roots: [
        {
          id: 'app',
          kind: 'app',
          displayName: options.projectName ?? workspace.name ?? 'Prodivix App',
          sourceRef: {
            domain: 'workspace',
            id: workspace.id,
            path: '/',
          },
        },
      ],
      modules: [
        executionConsoleRuntime,
        standaloneDataRuntime,
        standaloneServerRuntime,
        app.module,
      ],
      diagnostics: [
        ...validationDiagnostics,
        ...unsupportedLayoutDiagnostics,
        ...unsupportedOutletDiagnostics,
        ...dataRuntime.diagnostics,
        ...serverRuntime.diagnostics,
        ...app.diagnostics,
      ],
      metadata: {
        workspaceId: workspace.id,
        workspaceRevision: {
          workspaceRev: workspace.workspaceRev,
          routeRev: workspace.routeRev,
          opSeq: workspace.opSeq,
        },
        dataRuntime: {
          target: dataRuntime.target,
          requirements: dataRuntime.requirements,
        },
        serverRuntime: {
          target: serverRuntime.target,
          requirements: serverRuntime.requirements,
        },
      },
    },
  ];
  const dependencies = mergeExportDependencies([
    ...projectContributions.flatMap(
      (contribution) => contribution.dependencies ?? []
    ),
    ...Object.entries(REACT_VITE_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'dependency' as const,
      origin: createExportPackageOrigin(name, version, {
        updatePolicy: 'pin',
      }),
    })),
    ...Object.entries(REACT_VITE_DEV_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'devDependency' as const,
      origin: createExportPackageOrigin(name, version, {
        updatePolicy: 'pin',
      }),
    })),
  ]);
  const scaffoldContributions = createReactViteScaffoldContributions({
    projectName: options.projectName ?? workspace.name ?? 'Prodivix App',
    packageManager: REACT_VITE_PACKAGE_MANAGER,
    dependencies,
    entryModuleId: app.module.id,
  });
  return [...scaffoldContributions, ...projectContributions, { dependencies }]
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .build();
};

/** Plans a buildable React/Vite project from the complete canonical Workspace. */
export const generateWorkspaceReactViteBundle = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceReactViteCompileOptions = {}
): ReactExportBundle => {
  const planned = new ProductionExportPlanner(
    createReactViteExportPreset()
  ).plan(compileWorkspaceToExportProgram(workspace, options));
  return {
    type: 'project',
    target: planned.target,
    entryFilePath: planned.entryFilePath ?? 'src/App.tsx',
    files: planned.files,
    dependencies: planned.dependencies,
    diagnostics: planned.diagnostics,
    metadata: planned.metadata,
  };
};
