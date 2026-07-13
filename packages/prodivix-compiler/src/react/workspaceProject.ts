import {
  isWorkspaceAssetDocumentContent,
  isWorkspaceCodeDocumentContent,
  isWorkspacePirDocument,
  isWorkspaceProjectConfigDocumentContent,
  validateWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { compileAnimationExportContributions } from '#src/animation/compileAnimation';
import type { CompileDiagnostic } from '#src/core/diagnostics';
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
  type ExportRootKind,
  type ExportRouteTopology,
  type ExportSourceTrace,
} from '#src/export';
import { compileNodeGraphExportContributions } from '#src/nodegraph/compileNodeGraph';
import { compilePirToReactComponent } from '#src/react/compileComponent';
import type {
  ReactExportBundle,
  ReactGeneratorCodeArtifact,
  ReactGeneratorOptions,
} from '#src/react/types';

export type WorkspaceReactViteCompileOptions = Pick<
  ReactGeneratorOptions,
  'adapter' | 'codegenPolicySnapshot' | 'packageResolver'
> & {
  exportContributions?: ExportProgramContribution[];
  projectName?: string;
};

type CompiledWorkspacePirDocument = {
  componentName: string;
  document: WorkspaceDocument;
  module: ExportModule;
  contribution: ExportProgramContribution;
};

type WorkspaceRouteRuntimeBinding = {
  artifactId: string;
  exportName?: string;
  kind: 'loader' | 'action' | 'guard';
  localName: string;
  routeNodeId: string;
};

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

const toPascalIdentifier = (value: string, fallback: string): string => {
  const candidate = value
    .trim()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-zA-Z0-9_$]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const normalized = candidate || fallback;
  return /^[a-zA-Z_$]/.test(normalized) ? normalized : `_${normalized}`;
};

const getDocumentDisplayName = (document: WorkspaceDocument): string => {
  const content = document.content as PIRDocument;
  return (
    content.metadata?.name ??
    document.name ??
    document.path.split('/').at(-1) ??
    document.id
  );
};

const createComponentNames = (
  documents: readonly WorkspaceDocument[]
): Map<string, string> => {
  const names = new Map<string, string>();
  const used = new Set<string>();
  documents.forEach((document) => {
    const base = toPascalIdentifier(getDocumentDisplayName(document), 'Page');
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    names.set(document.id, candidate);
  });
  return names;
};

const getRootKind = (document: WorkspaceDocument): ExportRootKind => {
  if (document.type === 'pir-page') return 'page';
  if (document.type === 'pir-layout') return 'layout';
  return 'component';
};

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

const toExportDependencies = (
  dependencies: Record<string, string>,
  origins: Record<string, ExportDependency['origin']>
): ExportDependency[] =>
  Object.entries(dependencies).map(([name, version]) => ({
    name,
    version,
    kind: 'dependency',
    origin:
      origins[name] ??
      createExportPackageOrigin(name, version, { updatePolicy: 'pin' }),
  }));

const prefixContributionId = (documentId: string, id: string): string =>
  `workspace-pir:${documentId}:${id}`;

const namespaceDomainContribution = (
  documentId: string,
  contribution: ExportProgramContribution
): ExportProgramContribution => {
  const moduleIdById = new Map(
    (contribution.modules ?? []).map((module) => [
      module.id,
      prefixContributionId(documentId, module.id),
    ])
  );
  const rootIdById = new Map(
    (contribution.roots ?? []).map((root) => [
      root.id,
      prefixContributionId(documentId, root.id),
    ])
  );
  return {
    ...contribution,
    ...(contribution.entryModuleId
      ? {
          entryModuleId:
            moduleIdById.get(contribution.entryModuleId) ??
            contribution.entryModuleId,
        }
      : {}),
    roots: contribution.roots?.map((root) => ({
      ...root,
      id: rootIdById.get(root.id) ?? root.id,
    })),
    modules: contribution.modules?.map((module) => ({
      ...module,
      id: moduleIdById.get(module.id) ?? module.id,
      ownerRootId: module.ownerRootId
        ? (rootIdById.get(module.ownerRootId) ?? module.ownerRootId)
        : undefined,
    })),
    styles: contribution.styles?.map((style) => ({
      ...style,
      id: prefixContributionId(documentId, style.id),
      ownerRootId: style.ownerRootId
        ? (rootIdById.get(style.ownerRootId) ?? style.ownerRootId)
        : undefined,
    })),
    assets: contribution.assets?.map((asset) => ({
      ...asset,
      id: prefixContributionId(documentId, asset.id),
    })),
    artifacts: contribution.artifacts?.map((artifact) => ({
      ...artifact,
      id: prefixContributionId(documentId, artifact.id),
      ownerRootId: artifact.ownerRootId
        ? (rootIdById.get(artifact.ownerRootId) ?? artifact.ownerRootId)
        : undefined,
    })),
    files: contribution.files?.map((file) => ({
      ...file,
      id: prefixContributionId(documentId, file.id),
    })),
    runtimeRequirements: contribution.runtimeRequirements?.map(
      (requirement) => ({
        ...requirement,
        id: prefixContributionId(documentId, requirement.id),
        ownerModuleId: requirement.ownerModuleId
          ? (moduleIdById.get(requirement.ownerModuleId) ??
            requirement.ownerModuleId)
          : undefined,
      })
    ),
  };
};

const compileWorkspacePirDocuments = (input: {
  documents: readonly WorkspaceDocument[];
  codeArtifacts: ReactGeneratorCodeArtifact[];
  options: WorkspaceReactViteCompileOptions;
}): CompiledWorkspacePirDocument[] => {
  const componentNames = createComponentNames(input.documents);
  return input.documents.map((document) => {
    const componentName = componentNames.get(document.id) as string;
    const compiled = compilePirToReactComponent(
      document.content as PIRDocument,
      {
        componentName,
        adapter: input.options.adapter,
        codegenPolicySnapshot: input.options.codegenPolicySnapshot,
        packageResolver: input.options.packageResolver,
        codeArtifacts: input.codeArtifacts,
        includeWorkspaceCodeArtifacts: false,
      }
    );
    const trace = createDocumentSourceTrace(document);
    const module: ExportModule = {
      ...compiled.module,
      id: `workspace-pir:${document.id}`,
      ownerRootId: document.id,
      suggestedName: componentName,
      sourceTrace: [trace, ...compiled.module.sourceTrace],
    };
    const domainContributions = [
      ...compileNodeGraphExportContributions(document.content as PIRDocument),
      ...compileAnimationExportContributions(document.content as PIRDocument),
    ].map((contribution) =>
      namespaceDomainContribution(document.id, contribution)
    );
    return {
      componentName,
      document,
      module,
      contribution: [
        ...compiled.exportContributions,
        ...domainContributions,
        {
          roots: [
            {
              id: document.id,
              kind: getRootKind(document),
              displayName: getDocumentDisplayName(document),
              sourceRef: trace.sourceRef,
            },
          ],
          modules: [module],
          styles: compiled.styles.map((style) => ({
            ...style,
            ownerRootId: document.id,
          })),
          artifacts: compiled.artifacts.map((artifact) => ({
            ...artifact,
            ownerRootId: document.id,
          })),
          runtimeRequirements: compiled.runtimeRequirements,
          dependencies: toExportDependencies(
            compiled.dependencies,
            compiled.dependencyOrigins
          ),
          diagnostics: compiled.diagnostics,
        },
      ]
        .reduce(
          (builder, contribution) => builder.addContribution(contribution),
          createExportProgramBuilder(createReactViteExportPreset().target)
        )
        .build(),
    };
  });
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
  return <Page />;
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
  const unsupportedDocumentDiagnostics: CompileDiagnostic[] = documents
    .filter(
      (document) =>
        document.type === 'pir-graph' || document.type === 'pir-animation'
    )
    .map((document) => ({
      code: 'WKS-EXPORT-DOCUMENT-UNSUPPORTED',
      severity: 'error',
      source: 'export',
      message: `Workspace export does not yet compile standalone ${document.type} documents.`,
      path: document.path,
    }));
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
  const compiledDocuments = compileWorkspacePirDocuments({
    documents: pirDocuments,
    codeArtifacts,
    options,
  });
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
    ...compiledDocuments.map((compiled) => compiled.contribution),
    code.contribution,
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
        ...unsupportedDocumentDiagnostics,
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
