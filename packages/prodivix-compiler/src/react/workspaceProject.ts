import type { BinaryAssetMaterialization } from '@prodivix/assets';
import type {
  WorkspacePirDocument,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { ExecutableProjectDataMockProvision } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import type { TargetAdapter } from '#src/core/adapter';
import {
  createCodegenPolicyTargetAdapter,
  getCodegenPolicyPackageVersions,
  type CodegenPolicySnapshot,
} from '#src/core/codegenPolicy';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import {
  ProductionExportPlanner,
  createExportPackageOrigin,
  createReactViteExportPreset,
  createReactViteScaffoldContributions,
  REACT_VITE_DEPENDENCIES,
  REACT_VITE_DEV_DEPENDENCIES,
  REACT_VITE_PACKAGE_MANAGER,
  type ExportImportIntent,
  type ExportModule,
  type ExportProgram,
  type ExportProgramContribution,
  type ExportRouteTopology,
} from '#src/export';
import { reactAdapter } from '#src/react/adapter';
import { reactCompileTarget } from '#src/react/target';
import {
  compileWorkspacePirReactModules,
  createPirReactModuleId,
} from '#src/react/index';
import { WORKSPACE_DATA_RUNTIME_MODULE_ID } from '#src/workspace/standaloneDataRuntime';
import { WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID } from '#src/workspace/standaloneExecutionConsoleRuntime';
import type { WorkspaceDataRuntimeTarget } from '#src/workspace/workspaceDataRuntimeTarget';
import { WORKSPACE_SERVER_RUNTIME_MODULE_ID } from '#src/workspace/standaloneServerRuntime';
import type {
  WorkspaceServerRuntimeBinding,
  WorkspaceServerRuntimeTarget,
  WorkspaceServerRuntimeTargetAnalysis,
} from '#src/workspace/workspaceServerRuntimeTarget';
import { compileWorkspaceToTargetExportProgram } from '#src/workspace/workspaceExportProgram';
import { compileWorkspacePirDocumentProjection } from '#src/workspace/workspacePirProjection';
import type {
  WorkspacePirDocumentModuleCompiler,
  WorkspaceTargetCompileOptions,
  WorkspaceTargetRenderLayer,
} from '#src/workspace/workspaceTargetRenderLayer';
import type { WorkspaceVerificationCompileProfile } from '#src/workspace/workspaceVerificationProbe';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { ReactExportBundle } from '#src/react/types';

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
  verificationProfile?: WorkspaceVerificationCompileProfile;
}>;

type CompiledWorkspacePirDocument = {
  componentName: string;
  document: WorkspacePirDocument;
  module: ExportModule;
};

type WorkspaceRouteRuntimeBinding = {
  artifactId: string;
  exportName?: string;
  kind: 'loader' | 'action' | 'guard';
  localName?: string;
  serverFunction?: WorkspaceServerRuntimeBinding['definition'];
  routeNodeId: string;
};
/** Emits one React component module per PIR document. */
const createReactPirModuleCompiler = (input: {
  workspace: WorkspaceSnapshot;
  options: WorkspaceTargetCompileOptions;
}): WorkspacePirDocumentModuleCompiler => {
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
  return {
    moduleIdForDocument: createPirReactModuleId,
    compileDocument: (documentId) => {
      const result = compileWorkspacePirReactModules({
        workspace: input.workspace,
        entryDocumentId: documentId,
        target: reactCompileTarget,
        adapter,
        packageResolver,
      });
      return {
        status: result.status === 'blocked' ? 'blocked' : 'ready',
        diagnostics: result.diagnostics,
        modules: result.modules,
        roots: result.contribution.roots ?? [],
        dependencies: result.contribution.dependencies ?? [],
        moduleNameByDocumentId:
          result.status === 'blocked' ? {} : result.moduleNameByDocumentId,
      };
    },
  };
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
      const page = route.pageDocId
        ? moduleByDocumentId.get(route.pageDocId)
        : undefined;
      if (route.pageDocId && !page) {
        diagnostics.push({
          code: 'WKS-EXPORT-ROUTE-DOCUMENT',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} references an uncompiled page document: ${route.pageDocId}.`,
          path: `/routeManifest/routes/${route.routeNodeId}`,
        });
        return [];
      }
      const layout = route.layoutDocId
        ? moduleByDocumentId.get(route.layoutDocId)
        : undefined;
      if (route.layoutDocId && !layout) {
        diagnostics.push({
          code: 'WKS-EXPORT-ROUTE-DOCUMENT',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} references an uncompiled layout document: ${route.layoutDocId}.`,
          path: `/routeManifest/routes/${route.routeNodeId}/layoutDocId`,
        });
        return [];
      }
      // Named outlet bindings may mount a different document than the page.
      const namedOutlets = (route.outletBindings ?? []).flatMap((binding) => {
        const target = binding.pageDocId
          ? moduleByDocumentId.get(binding.pageDocId)
          : undefined;
        if (binding.pageDocId && !target) {
          diagnostics.push({
            code: 'WKS-EXPORT-ROUTE-DOCUMENT',
            severity: 'error',
            source: 'export',
            message: `Route ${route.routeNodeId} binds outlet ${binding.outletName} to an uncompiled document: ${binding.pageDocId}.`,
            path: `/routeManifest/routes/${route.routeNodeId}/outletBindings/${binding.outletName}`,
          });
          return [];
        }
        return [
          {
            outletName: binding.outletName,
            outletNodeId: binding.outletNodeId,
            ...(target ? { target: target.componentName } : {}),
          },
        ];
      });
      return [
        {
          path: route.path,
          depth: route.depth,
          routeNodeId: route.routeNodeId,
          ...(route.parentRouteNodeId
            ? { parentRouteNodeId: route.parentRouteNodeId }
            : {}),
          ...(page ? { pageComponentName: page.componentName } : {}),
          ...(layout ? { layoutComponentName: layout.componentName } : {}),
          ...(route.outletNodeId ? { outletNodeId: route.outletNodeId } : {}),
          namedOutlets,
          routable: Boolean(
            page || layout || namedOutlets.some(({ target }) => target)
          ),
        },
      ];
    })
    .sort(
      (left, right) =>
        scoreRoutePath(right.path) - scoreRoutePath(left.path) ||
        right.depth - left.depth ||
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.routeNodeId, right.routeNodeId)
    );
  if (!routeEntries.some(({ routable }) => routable)) {
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
    .map((route) => {
      const outletBindings = route.namedOutlets.map(
        (outlet) =>
          `{ outletName: ${JSON.stringify(outlet.outletName)}, outletNodeId: ${JSON.stringify(outlet.outletNodeId)}${
            outlet.target ? `, Component: ${outlet.target}` : ''
          } }`
      );
      return `  { routeNodeId: ${JSON.stringify(route.routeNodeId)}, path: ${JSON.stringify(route.path)}, depth: ${route.depth}${
        route.parentRouteNodeId
          ? `, parentRouteNodeId: ${JSON.stringify(route.parentRouteNodeId)}`
          : ''
      }${route.pageComponentName ? `, Page: ${route.pageComponentName}` : ''}${
        route.layoutComponentName
          ? `, Layout: ${route.layoutComponentName}`
          : ''
      }${
        route.outletNodeId
          ? `, outletNodeId: ${JSON.stringify(route.outletNodeId)}`
          : ''
      }${
        outletBindings.length
          ? `, outletBindings: [${outletBindings.join(', ')}]`
          : ''
      }, routable: ${String(route.routable)} },`;
    })
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

type WorkspaceRouteComponent = (props: any) => any;

type WorkspaceRouteOutletBinding = Readonly<{
  outletName: string;
  outletNodeId: string;
  Component?: WorkspaceRouteComponent;
}>;

type WorkspaceRouteEntry = Readonly<{
  routeNodeId: string;
  path: string;
  depth: number;
  parentRouteNodeId?: string;
  Page?: WorkspaceRouteComponent;
  Layout?: WorkspaceRouteComponent;
  outletNodeId?: string;
  outletBindings?: readonly WorkspaceRouteOutletBinding[];
  routable: boolean;
}>;

const workspaceRoutes: readonly WorkspaceRouteEntry[] = [
${routeTable}
];
const workspaceRouteById = Object.freeze(Object.fromEntries(
  workspaceRoutes.map((route) => [route.routeNodeId, route])
)) as Readonly<Record<string, WorkspaceRouteEntry>>;

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

const workspaceRouteMatchChain = (route: WorkspaceRouteEntry): readonly WorkspaceRouteEntry[] => {
  const chain: WorkspaceRouteEntry[] = [];
  const seen = new Set<string>();
  let current: WorkspaceRouteEntry | undefined = route;
  while (current) {
    if (seen.has(current.routeNodeId)) throw new Error('REACT_ROUTE_CHAIN_INVALID');
    seen.add(current.routeNodeId);
    chain.unshift(current);
    current = current.parentRouteNodeId
      ? workspaceRouteById[current.parentRouteNodeId]
      : undefined;
  }
  return Object.freeze(chain);
};

const findWorkspaceRoute = (pathname: string) => {
  for (const route of workspaceRoutes) {
    if (!route.routable) continue;
    const params = matchWorkspaceRoutePath(route.path, pathname);
    if (params) {
      return Object.freeze({
        ...route,
        params,
        matchChain: workspaceRouteMatchChain(route),
      });
    }
  }
  return undefined;
};

let activeWorkspaceRouteActionController: AbortController | undefined;
let workspaceRouteRuntimeRevision = 0;
const workspaceRouteRuntimeSubscribers = new Set<() => void>();

const createWorkspaceRouteInvocationOptions = (
  options: WorkspaceRouteActionOptions = {}
): Required<Pick<WorkspaceRouteActionOptions, 'invocationId' | 'attempt'>> &
  Pick<WorkspaceRouteActionOptions, 'signal'> => {
  const invocationId = options.invocationId ?? globalThis.crypto?.randomUUID?.();
  if (!invocationId) throw new Error('SVR_INVOCATION_ID_UNAVAILABLE');
  return Object.freeze({
    invocationId,
    attempt: options.attempt ?? 1,
    ...(options.signal ? { signal: options.signal } : {}),
  });
};

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
      createWorkspaceRouteInvocationOptions({
        ...(options.invocationId !== undefined
          ? { invocationId: options.invocationId }
          : {}),
        ...(options.attempt !== undefined ? { attempt: options.attempt } : {}),
        signal: controller.signal,
      })
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

const renderWorkspaceRouteDocument = (
  Document: WorkspaceRouteComponent,
  key: string,
  activeRouteId: string,
  paramsById: Readonly<Record<string, string>>,
  routeOutletsById: Readonly<Record<string, (outletInstancePath: string) => any>> = {}
) => (
  <Document
    key={key}
    __pdxRuntime={workspacePirRuntime}
    __pdxRouteId={activeRouteId}
    __pdxParamsById={paramsById}
    __pdxInstancePath={'/route:' + activeRouteId + '/document:' + key}
    __pdxRouteOutletsById={routeOutletsById}
  />
);

const renderWorkspaceRouteComposition = (
  matchChain: readonly WorkspaceRouteEntry[],
  activeRouteId: string,
  paramsById: Readonly<Record<string, string>>
) => {
  let content: any = null;
  for (let index = matchChain.length - 1; index >= 0; index -= 1) {
    const route = matchChain[index];
    const bindings = route.outletBindings ?? [];
    const pageIsContainer =
      !route.Layout &&
      Boolean(route.Page) &&
      Boolean(route.outletNodeId || bindings.length);
    const ownPage =
      route.Page && !pageIsContainer
        ? renderWorkspaceRouteDocument(
            route.Page,
            route.routeNodeId + ':page',
            activeRouteId,
            paramsById
          )
        : null;
    let defaultContent = content ?? ownPage;
    const defaultBinding = bindings.find(
      ({ outletName }) => outletName === 'default'
    );
    if (defaultBinding?.Component) {
      defaultContent = renderWorkspaceRouteDocument(
        defaultBinding.Component,
        route.routeNodeId + ':outlet:default',
        activeRouteId,
        paramsById
      );
    }
    const routeOutletsById: Record<
      string,
      (outletInstancePath: string) => any
    > = {};
    if (route.outletNodeId && defaultContent !== null) {
      const projected = defaultContent;
      routeOutletsById[route.outletNodeId] = () => projected;
    }
    bindings.forEach((binding) => {
      const projected = binding.Component
        ? renderWorkspaceRouteDocument(
            binding.Component,
            route.routeNodeId + ':outlet:' + binding.outletName,
            activeRouteId,
            paramsById
          )
        : binding.outletName === 'default'
          ? defaultContent
          : null;
      if (projected !== null) {
        routeOutletsById[binding.outletNodeId] = () => projected;
      }
    });
    const Container = route.Layout ?? (pageIsContainer ? route.Page : undefined);
    if (Container) {
      content = renderWorkspaceRouteDocument(
        Container,
        route.routeNodeId + ':container',
        activeRouteId,
        paramsById,
        Object.freeze(routeOutletsById)
      );
      continue;
    }
    if (content === null && ownPage !== null) content = ownPage;
  }
  return (
    content ?? (
      <main data-prodivix-route-runtime="empty">
        Route has no renderable document.
      </main>
    )
  );
};

export default function App() {
  const locationSnapshot = useSyncExternalStore(
    subscribeToLocation,
    readWorkspaceLocationSnapshot,
    () => '/\\0' + String(workspaceRouteRuntimeRevision)
  );
  const pathname = locationSnapshot.split('\\0', 1)[0] || '/';
  const match = findWorkspaceRoute(pathname);
  const hasRouteServerRuntime = Boolean(
    match?.matchChain.some((route) => {
      const runtime = readWorkspaceRouteRuntime(route.routeNodeId);
      return Boolean(
        readWorkspaceServerFunctionRouteRuntimeEntry(runtime?.guard) ||
          readWorkspaceServerFunctionRouteRuntimeEntry(runtime?.loader)
      );
    })
  );
  const [routeRuntimeState, setRouteRuntimeState] = React.useState<
    | Readonly<{ routeNodeId: string; status: 'pending' | 'ready' }>
    | Readonly<{ routeNodeId: string; status: 'denied' | 'failed'; code: string }>
  >(() => ({ routeNodeId: '', status: 'pending' }));

  React.useEffect(() => {
    if (!match || !hasRouteServerRuntime) {
      activeWorkspaceRouteLoaderValue = undefined;
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const routeNodeId = match.routeNodeId;
    activeWorkspaceRouteLoaderValue = undefined;
    setRouteRuntimeState({ routeNodeId, status: 'pending' });
    const invoke = async (
      entry: WorkspaceServerFunctionRouteRuntimeEntry | undefined,
      currentRouteNodeId: string
    ) => {
      if (!entry) return undefined;
      return invokeWorkspaceServerFunction(
        entry.functionRef,
        { routeId: currentRouteNodeId },
        createWorkspaceRouteInvocationOptions({
          signal: controller.signal,
        })
      );
    };
    void (async () => {
      try {
        for (const route of match.matchChain) {
          const runtime = readWorkspaceRouteRuntime(route.routeNodeId);
          const guard = await invoke(
            readWorkspaceServerFunctionRouteRuntimeEntry(runtime?.guard),
            route.routeNodeId
          );
          if (!active) return;
          if (guard?.kind === 'deny') {
            setRouteRuntimeState({
              routeNodeId,
              status: 'denied',
              code: guard.code,
            });
            return;
          }
          if (guard?.kind === 'redirect') {
            window.location.assign(guard.location);
            return;
          }
          if (guard && guard.kind !== 'allow') {
            throw new Error('SVR_ROUTE_GUARD_OUTCOME_INVALID');
          }
          const loader = await invoke(
            readWorkspaceServerFunctionRouteRuntimeEntry(runtime?.loader),
            route.routeNodeId
          );
          if (!active) return;
          if (loader?.kind === 'redirect') {
            window.location.assign(loader.location);
            return;
          }
          if (loader && loader.kind !== 'value') {
            throw new Error('SVR_ROUTE_LOADER_OUTCOME_INVALID');
          }
          if (loader?.kind === 'value') {
            activeWorkspaceRouteLoaderValue = loader.value;
          }
        }
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
  if (hasRouteServerRuntime) {
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
  return (
    <>
      {activeWorkspaceRouteLoaderValue === undefined ? null : (
        <output data-prodivix-route-loader="ready" hidden>
          {JSON.stringify(activeWorkspaceRouteLoaderValue)}
        </output>
      )}
      {renderWorkspaceRouteComposition(
        match.matchChain,
        match.routeNodeId,
        match.params
      )}
    </>
  );
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

/**
 * The React/Vite render layer. It owns framework syntax and nothing else — the
 * ExportProgram assembly itself is shared with every other target so the two
 * cannot drift into different module topologies (ADR 31:344).
 */
export const createReactViteRenderLayer = (): WorkspaceTargetRenderLayer => ({
  preset: createReactViteExportPreset(),
  routeAdapterName: 'React/Vite',
  compilePirDocuments: (input) =>
    compileWorkspacePirDocumentProjection({
      documents: input.documents,
      options: input.options,
      moduleCompiler: createReactPirModuleCompiler({
        workspace: input.workspace,
        options: input.options,
      }),
    }),
  createAppModule: (input) => createWorkspaceAppModule(input),
  createTargetDependencies: () => [
    ...Object.entries(REACT_VITE_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'dependency' as const,
      origin: createExportPackageOrigin(name, version, { updatePolicy: 'pin' }),
    })),
    ...Object.entries(REACT_VITE_DEV_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'devDependency' as const,
      origin: createExportPackageOrigin(name, version, { updatePolicy: 'pin' }),
    })),
  ],
  createScaffoldContributions: (input) =>
    createReactViteScaffoldContributions({
      projectName: input.projectName,
      packageManager: REACT_VITE_PACKAGE_MANAGER,
      dependencies: [...input.dependencies],
      entryModuleId: input.entryModuleId,
    }),
});

/** Compiles the complete canonical Workspace into one React/Vite ExportProgram. */
export const compileWorkspaceToExportProgram = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceReactViteCompileOptions = {}
): ExportProgram =>
  compileWorkspaceToTargetExportProgram(
    workspace,
    options,
    createReactViteRenderLayer()
  );

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
