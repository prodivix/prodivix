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
  localName: string;
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
      language: document.content.language,
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

const decodeBase64 = (value: string): Uint8Array | null => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/\s+/g, '').replace(/=+$/, '');
  if (!normalized || [...normalized].some((item) => !alphabet.includes(item))) {
    return normalized ? null : new Uint8Array();
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
};

const decodeAssetDataUrl = (value: string): string | Uint8Array | null => {
  const match = /^data:([^,]*?),(.*)$/s.exec(value);
  if (!match) return null;
  if (match[1]?.split(';').includes('base64')) {
    return decodeBase64(match[2] ?? '');
  }
  try {
    return decodeURIComponent(match[2] ?? '');
  } catch {
    return null;
  }
};

const createWorkspaceResourceContribution = (
  documents: readonly WorkspaceDocument[]
): ExportProgramContribution => {
  const artifacts: ExportArtifactContribution[] = [];
  const diagnostics: CompileDiagnostic[] = [];
  documents.forEach((document) => {
    const sourceTrace = [createDocumentSourceTrace(document)];
    const origin = resolveWorkspaceDocumentExportSource({
      label: document.path,
    }).origin;
    if (
      document.type === 'asset' &&
      isWorkspaceAssetDocumentContent(document.content)
    ) {
      const contents =
        document.content.text ??
        (document.content.dataUrl
          ? decodeAssetDataUrl(document.content.dataUrl)
          : null);
      if (contents === null) {
        diagnostics.push({
          code: 'WKS-EXPORT-ASSET-CONTENT',
          severity: 'error',
          source: 'export',
          message: `Asset ${document.id} has no decodable content.`,
          path: document.path,
        });
        return;
      }
      const isPublic = document.path.startsWith('/public/');
      const emittedPath = normalizeExportPath(document.path);
      artifacts.push({
        id: `workspace-resource:${document.id}`,
        kind: 'asset',
        suggestedName: emittedPath.split('/').at(-1) ?? document.id,
        mimeType: document.content.mime,
        contents,
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
}): { module: ExportModule; diagnostics: CompileDiagnostic[] } => {
  const moduleByDocumentId = new Map(
    input.compiledDocuments.map((compiled) => [compiled.document.id, compiled])
  );
  const imports: ExportImportIntent[] = [
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
  input.routeTopology.runtimeRefs.forEach((reference) => {
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
    current[binding.kind] = binding.localName;
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

const workspacePirRuntime = {
  dispatchTrigger(input: Readonly<{ binding: unknown }>) {
    const binding = input.binding && typeof input.binding === 'object'
      ? input.binding as Readonly<Record<string, unknown>>
      : undefined;
    if (binding?.kind === 'open-url' && typeof binding.href === 'string' && typeof window !== 'undefined') {
      window.open(binding.href, '_blank', 'noopener,noreferrer');
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

const matchesRoutePath = (pattern: string, pathname: string) => {
  const patternSegments = normalizePath(pattern).split('/').filter(Boolean);
  const pathSegments = normalizePath(pathname).split('/').filter(Boolean);
  let pathIndex = 0;
  for (const segment of patternSegments) {
    if (segment.startsWith('*') || /^\\[\\.\\.\\..+\\]$/.test(segment)) return true;
    if (pathIndex >= pathSegments.length) return false;
    if (!(segment.startsWith(':') || /^\\[[^\\]]+\\]$/.test(segment)) && segment !== pathSegments[pathIndex]) {
      return false;
    }
    pathIndex += 1;
  }
  return pathIndex === pathSegments.length;
};

const readPathname = () =>
  typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname);

const subscribeToLocation = (notify: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
};

export default function App() {
  const pathname = useSyncExternalStore(subscribeToLocation, readPathname, () => '/');
  const match = workspaceRoutes.find((route) => matchesRoutePath(route.path, pathname));
  if (!match) return <main data-prodivix-route-not-found="true">Route not found.</main>;
  const Page = match.Component;
  return <Page __pdxRuntime={workspacePirRuntime} />;
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
  });
  const projectContributions: ExportProgramContribution[] = [
    pirCompilation.contribution,
    code.contribution,
    ...nodeGraphContributions,
    ...animationContributions,
    createWorkspaceResourceContribution(documents),
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
      modules: [app.module],
      diagnostics: [
        ...validationDiagnostics,
        ...unsupportedLayoutDiagnostics,
        ...unsupportedOutletDiagnostics,
        ...app.diagnostics,
      ],
      metadata: {
        workspaceId: workspace.id,
        workspaceRevision: {
          workspaceRev: workspace.workspaceRev,
          routeRev: workspace.routeRev,
          opSeq: workspace.opSeq,
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
