import {
  isWorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type {
  ExportImportIntent,
  ExportModule,
  ExportRouteTopology,
} from '#src/export';
import { WORKSPACE_DATA_RUNTIME_MODULE_ID } from '#src/react/standaloneDataRuntime';
import { WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID } from '#src/react/standaloneExecutionConsoleRuntime';
import { WORKSPACE_SERVER_RUNTIME_MODULE_ID } from '#src/react/standaloneServerRuntime';
import type {
  WorkspaceServerRuntimeBinding,
  WorkspaceServerRuntimeTargetAnalysis,
} from '#src/react/workspaceServerRuntimeTarget';
import { WORKSPACE_VUE_PIR_RUNTIME_MODULE_ID } from '#src/vue/workspacePirRuntime';

export const WORKSPACE_VUE_APP_MODULE_ID = 'workspace-vue-entry' as const;

type VueRouteRuntimeBinding = Readonly<{
  artifactId: string;
  exportName?: string;
  kind: 'loader' | 'action' | 'guard';
  routeNodeId: string;
  serverFunction?: WorkspaceServerRuntimeBinding['definition'];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

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

export type CreateWorkspaceVueAppModuleInput = Readonly<{
  workspace: WorkspaceSnapshot;
  routeTopology: ExportRouteTopology;
  serverRuntime: WorkspaceServerRuntimeTargetAnalysis;
  executableModuleIdByArtifactId: ReadonlyMap<string, string>;
}>;

/** Creates the Vue route/auth/server composition root without embedding server-owned source. */
export const createWorkspaceVueAppModule = (
  input: CreateWorkspaceVueAppModuleInput
): Readonly<{
  module: ExportModule;
  diagnostics: readonly CompileDiagnostic[];
}> => {
  const diagnostics: CompileDiagnostic[] = [];
  const imports: ExportImportIntent[] = [
    {
      kind: 'side-effect',
      source: WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
      targetModuleId: WORKSPACE_EXECUTION_CONSOLE_RUNTIME_MODULE_ID,
    },
    {
      kind: 'named',
      source: 'vue',
      imported: 'defineComponent',
      local: 'defineComponent',
    },
    { kind: 'named', source: 'vue', imported: 'h', local: 'h' },
    { kind: 'named', source: 'vue', imported: 'onMounted', local: 'onMounted' },
    {
      kind: 'named',
      source: 'vue',
      imported: 'onUnmounted',
      local: 'onUnmounted',
    },
    { kind: 'named', source: 'vue', imported: 'ref', local: 'ref' },
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
    {
      kind: 'named',
      source: WORKSPACE_VUE_PIR_RUNTIME_MODULE_ID,
      targetModuleId: WORKSPACE_VUE_PIR_RUNTIME_MODULE_ID,
      imported: 'createWorkspacePirDocumentComponent',
      local: 'createWorkspacePirDocumentComponent',
    },
  ];

  const codeModuleLocalByArtifactId = new Map<string, string>();
  [...input.executableModuleIdByArtifactId.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .forEach(([artifactId, moduleId], index) => {
      const local = `workspaceCodeModule${index + 1}`;
      codeModuleLocalByArtifactId.set(artifactId, local);
      imports.push({
        kind: 'namespace',
        source: moduleId,
        targetModuleId: moduleId,
        local,
      });
    });

  const runtimeBindings: VueRouteRuntimeBinding[] = [];
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
    if (!codeModuleLocalByArtifactId.has(reference.artifactId)) {
      diagnostics.push({
        code: 'VUE-EXPORT-RUNTIME-REFERENCE',
        severity: 'error',
        source: 'export',
        message: `Route ${reference.routeNodeId} references a non-executable CodeArtifact: ${reference.artifactId}.`,
        path: `/routeManifest/runtime/${reference.routeNodeId}/${reference.kind}`,
      });
      return;
    }
    runtimeBindings.push({
      artifactId: reference.artifactId,
      exportName: reference.exportName,
      kind: reference.kind,
      routeNodeId: reference.routeNodeId,
    });
  });

  const routes = input.routeTopology.routes
    .map((route) => {
      const pageDocument = route.pageDocId
        ? input.workspace.docsById[route.pageDocId]
        : undefined;
      const layoutDocument = route.layoutDocId
        ? input.workspace.docsById[route.layoutDocId]
        : undefined;
      if (
        route.pageDocId &&
        (!pageDocument || pageDocument.type !== 'pir-page')
      ) {
        diagnostics.push({
          code: 'VUE-EXPORT-ROUTE-DOCUMENT',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} references an unavailable PIR page document: ${route.pageDocId}.`,
          path: `/routeManifest/routes/${route.routeNodeId}/pageDocId`,
        });
      }
      if (
        route.layoutDocId &&
        (!layoutDocument || layoutDocument.type !== 'pir-layout')
      ) {
        diagnostics.push({
          code: 'VUE-EXPORT-LAYOUT-DOCUMENT',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} references an unavailable PIR layout document: ${route.layoutDocId}.`,
          path: `/routeManifest/routes/${route.routeNodeId}/layoutDocId`,
        });
      }
      const outletBindings = (route.outletBindings ?? []).map((binding) => {
        const outletPage = binding.pageDocId
          ? input.workspace.docsById[binding.pageDocId]
          : undefined;
        if (
          binding.pageDocId &&
          (!outletPage || outletPage.type !== 'pir-page')
        ) {
          diagnostics.push({
            code: 'VUE-EXPORT-OUTLET-DOCUMENT',
            severity: 'error',
            source: 'export',
            message: `Route ${route.routeNodeId} outlet ${binding.outletName} references an unavailable PIR page document: ${binding.pageDocId}.`,
            path: `/routeManifest/routes/${route.routeNodeId}/outletBindings/${binding.outletName}/pageDocId`,
          });
        }
        return Object.freeze({
          outletName: binding.outletName,
          outletNodeId: binding.outletNodeId,
          ...(binding.pageDocId ? { pageDocumentId: binding.pageDocId } : {}),
        });
      });
      const containerDocument = layoutDocument ?? pageDocument;
      const outletNodeIds = [
        ...(route.outletNodeId ? [route.outletNodeId] : []),
        ...outletBindings.map(({ outletNodeId }) => outletNodeId),
      ];
      const seenOutletNodeIds = new Set<string>();
      outletNodeIds.forEach((outletNodeId) => {
        if (
          !containerDocument ||
          !isWorkspacePirDocument(containerDocument) ||
          !containerDocument.content.ui.graph.nodesById[outletNodeId]
        ) {
          diagnostics.push({
            code: 'VUE-EXPORT-OUTLET-NODE',
            severity: 'error',
            source: 'export',
            message: `Route ${route.routeNodeId} outlet node ${outletNodeId} is unavailable in its layout/page container.`,
            path: `/routeManifest/routes/${route.routeNodeId}/outletBindings`,
          });
        }
        if (seenOutletNodeIds.has(outletNodeId)) {
          diagnostics.push({
            code: 'VUE-EXPORT-OUTLET-CONFLICT',
            severity: 'error',
            source: 'export',
            message: `Route ${route.routeNodeId} binds outlet node ${outletNodeId} more than once.`,
            path: `/routeManifest/routes/${route.routeNodeId}/outletBindings`,
          });
        }
        seenOutletNodeIds.add(outletNodeId);
      });
      const hasDefaultOutlet = Boolean(
        route.outletNodeId ||
        outletBindings.some(({ outletName }) => outletName === 'default')
      );
      const hasNestedContent = input.routeTopology.routes.some(
        (candidate) =>
          candidate.parentRouteNodeId === route.routeNodeId &&
          Boolean(candidate.pageDocId || candidate.layoutDocId)
      );
      if (
        layoutDocument?.type === 'pir-layout' &&
        (pageDocument?.type === 'pir-page' || hasNestedContent) &&
        !hasDefaultOutlet
      ) {
        diagnostics.push({
          code: 'VUE-EXPORT-LAYOUT-OUTLET-REQUIRED',
          severity: 'error',
          source: 'export',
          message: `Route ${route.routeNodeId} layout has page or child content but no default outlet target.`,
          path: `/routeManifest/routes/${route.routeNodeId}/outletNodeId`,
        });
      }
      return Object.freeze({
        routeNodeId: route.routeNodeId,
        path: route.path,
        depth: route.depth,
        ...(route.parentRouteNodeId
          ? { parentRouteNodeId: route.parentRouteNodeId }
          : {}),
        ...(route.pageDocId ? { pageDocumentId: route.pageDocId } : {}),
        ...(route.layoutDocId ? { layoutDocumentId: route.layoutDocId } : {}),
        ...(route.outletNodeId ? { outletNodeId: route.outletNodeId } : {}),
        ...(outletBindings.length ? { outletBindings } : {}),
        routable: Boolean(
          route.pageDocId ||
          route.layoutDocId ||
          outletBindings.some(({ pageDocumentId }) => pageDocumentId)
        ),
      });
    })
    .sort(
      (left, right) =>
        scoreRoutePath(right.path) - scoreRoutePath(left.path) ||
        right.depth - left.depth ||
        compareText(left.path, right.path) ||
        compareText(left.routeNodeId, right.routeNodeId)
    );
  if (!routes.length) {
    diagnostics.push({
      code: 'VUE-EXPORT-ROUTES-EMPTY',
      severity: 'error',
      source: 'export',
      message: 'Vue Workspace export requires at least one route page.',
      path: '/routeManifest',
    });
  }

  const runtimeByRoute = new Map<
    string,
    Partial<Record<VueRouteRuntimeBinding['kind'], string>>
  >();
  runtimeBindings.forEach((binding) => {
    const current = runtimeByRoute.get(binding.routeNodeId) ?? {};
    if (binding.serverFunction) {
      current[binding.kind] =
        `{ kind: 'server-function', functionRef: ${JSON.stringify(binding.serverFunction.reference)} }`;
    } else {
      const local = codeModuleLocalByArtifactId.get(binding.artifactId)!;
      current[binding.kind] = binding.exportName
        ? `{ kind: 'client-function', invoke: ${local}[${JSON.stringify(binding.exportName)}] }`
        : `{ kind: 'client-function', invoke: ${local} }`;
    }
    runtimeByRoute.set(binding.routeNodeId, current);
  });
  const runtimeTable = [...runtimeByRoute.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(
      ([routeNodeId, values]) =>
        `  ${JSON.stringify(routeNodeId)}: { ${Object.entries(values)
          .sort(([left], [right]) => compareText(left, right))
          .map(([kind, value]) => `${kind}: ${value}`)
          .join(', ')} },`
    )
    .join('\n');
  const codeTable = [...codeModuleLocalByArtifactId.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([artifactId, local]) => `  ${JSON.stringify(artifactId)}: ${local},`)
    .join('\n');

  const body = `type JsonRecord = Readonly<Record<string, any>>;

export const workspaceVueRoutes = ${JSON.stringify(routes)} as const;

type WorkspaceVueRouteOutletBinding = Readonly<{
  outletName: string;
  outletNodeId: string;
  pageDocumentId?: string;
}>;

type WorkspaceVueRoute = Readonly<{
  routeNodeId: string;
  path: string;
  depth: number;
  parentRouteNodeId?: string;
  pageDocumentId?: string;
  layoutDocumentId?: string;
  outletNodeId?: string;
  outletBindings?: readonly WorkspaceVueRouteOutletBinding[];
  routable: boolean;
}>;

const workspaceVueRouteRecords = workspaceVueRoutes as readonly WorkspaceVueRoute[];
const workspaceVueRouteById = Object.freeze(Object.fromEntries(
  workspaceVueRouteRecords.map((route) => [route.routeNodeId, route])
)) as Readonly<Record<string, WorkspaceVueRoute>>;

export const workspaceVueRouteRuntime = {
${runtimeTable}
} as const;

const workspaceCodeModules = {
${codeTable}
} as const;

const workspaceDataRuntime = createWorkspaceDataRuntime();

type ServerFunctionEntry = Readonly<{
  kind: 'server-function';
  functionRef: Readonly<{ artifactId: string; exportName: string }>;
}>;

type ClientFunctionEntry = Readonly<{
  kind: 'client-function';
  invoke: unknown;
}>;

const readRuntimeEntry = (routeNodeId: string, kind: 'loader' | 'action' | 'guard'): ServerFunctionEntry | ClientFunctionEntry | undefined => {
  const runtime = (workspaceVueRouteRuntime as Readonly<Record<string, JsonRecord>>)[routeNodeId];
  const value = runtime?.[kind];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (value.kind === 'server-function') {
    const reference = value.functionRef;
    return reference && typeof reference === 'object' && !Array.isArray(reference) &&
      typeof reference.artifactId === 'string' && typeof reference.exportName === 'string'
      ? value as ServerFunctionEntry
      : undefined;
  }
  return value.kind === 'client-function' ? value as ClientFunctionEntry : undefined;
};

const invokeRouteRuntime = async (
  entry: ServerFunctionEntry | ClientFunctionEntry | undefined,
  input: unknown,
  options: Readonly<{ invocationId?: string; attempt?: number; signal?: AbortSignal }> = {}
) => {
  if (!entry) return undefined;
  if (entry.kind === 'server-function') return invokeWorkspaceServerFunction(entry.functionRef, input, options);
  if (typeof entry.invoke !== 'function') throw new Error('VUE_ROUTE_RUNTIME_INVALID');
  return await entry.invoke(input, options);
};

const normalizePath = (value: string): string => {
  const normalized = (value.split(/[?#]/, 1)[0] || '/').replace(/\\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\\/$/, '') : '/';
};

const matchRoutePath = (pattern: string, pathname: string): Readonly<Record<string, string>> | undefined => {
  const patternSegments = normalizePath(pattern).split('/').filter(Boolean);
  const pathSegments = normalizePath(pathname).split('/').filter(Boolean);
  const params: Record<string, string> = {};
  let pathIndex = 0;
  for (const segment of patternSegments) {
    if (segment.startsWith('*') || /^\\[\\.\\.\\..+\\]$/.test(segment)) {
      const name = segment.startsWith('*') ? segment.slice(1) || 'splat' : segment.slice(4, -1);
      try { params[name] = decodeURIComponent(pathSegments.slice(pathIndex).join('/')); }
      catch { return undefined; }
      return Object.freeze(params);
    }
    if (pathIndex >= pathSegments.length) return undefined;
    const dynamic = segment.startsWith(':') || /^\\[[^\\]]+\\]$/.test(segment);
    if (!dynamic && segment !== pathSegments[pathIndex]) return undefined;
    if (dynamic) {
      const name = segment.startsWith(':') ? segment.slice(1) : segment.slice(1, -1);
      try { params[name] = decodeURIComponent(pathSegments[pathIndex]); }
      catch { return undefined; }
    }
    pathIndex += 1;
  }
  return pathIndex === pathSegments.length ? Object.freeze(params) : undefined;
};

const readPathname = (): string =>
  typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname);

const routeMatchChain = (route: WorkspaceVueRoute): readonly WorkspaceVueRoute[] => {
  const chain: WorkspaceVueRoute[] = [];
  const seen = new Set<string>();
  let current: WorkspaceVueRoute | undefined = route;
  while (current) {
    if (seen.has(current.routeNodeId)) throw new Error('VUE_ROUTE_CHAIN_INVALID');
    seen.add(current.routeNodeId);
    chain.unshift(current);
    current = current.parentRouteNodeId
      ? workspaceVueRouteById[current.parentRouteNodeId]
      : undefined;
  }
  return Object.freeze(chain);
};

const findRoute = (pathname: string) => {
  for (const route of workspaceVueRouteRecords) {
    if (!route.routable) continue;
    const params = matchRoutePath(route.path, pathname);
    if (params) return Object.freeze({
      ...route,
      params,
      matchChain: routeMatchChain(route),
    });
  }
  return undefined;
};

const routeRuntimeSubscribers = new Set<() => void>();
const notifyRouteRuntime = () => routeRuntimeSubscribers.forEach((listener) => listener());
let activeRouteLoaderValue: unknown;

export const readWorkspaceRouteLoaderValue = (): unknown => activeRouteLoaderValue;

const readSearchParams = (): Readonly<Record<string, string | readonly string[]>> => {
  const values: Record<string, string | string[]> = {};
  if (typeof window === 'undefined') return Object.freeze(values);
  new URLSearchParams(window.location.search).forEach((value, key) => {
    const current = values[key];
    values[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  });
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    Array.isArray(value) ? Object.freeze(value) : value,
  ])));
};

export type WorkspaceVueRouteActionSubmission = Readonly<{
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  encType: 'application/json' | 'application/x-www-form-urlencoded';
  value: unknown;
}>;

export const dispatchWorkspaceRouteAction = async (
  submission: WorkspaceVueRouteActionSubmission,
  options: Readonly<{ invocationId?: string; attempt?: number; signal?: AbortSignal }> = {}
) => {
  if (typeof window === 'undefined') throw new Error('SVR_ROUTE_ACTION_BROWSER_REQUIRED');
  const currentPath = readPathname();
  const match = findRoute(currentPath);
  const action = match ? readRuntimeEntry(match.routeNodeId, 'action') : undefined;
  if (!match || !action) throw new Error('SVR_ROUTE_ACTION_UNAVAILABLE');
  if (!submission || typeof submission !== 'object' || Array.isArray(submission) ||
    !['POST', 'PUT', 'PATCH', 'DELETE'].includes(submission.method) ||
    !['application/json', 'application/x-www-form-urlencoded'].includes(submission.encType)) {
    throw new Error('SVR_ROUTE_ACTION_INPUT_INVALID');
  }
  const outcome = await invokeRouteRuntime(action, Object.freeze({
    format: 'prodivix.route-action-input.v1',
    route: Object.freeze({
      routeNodeId: match.routeNodeId,
      currentPath,
      matchedPath: match.path,
      params: match.params,
      searchParams: readSearchParams(),
      ...(window.location.hash ? { hash: window.location.hash } : {}),
    }),
    submission: Object.freeze({ ...submission }),
  }), options);
  if (outcome?.kind === 'redirect') {
    window.location.assign(outcome.location);
    return outcome;
  }
  if (outcome?.kind !== 'value') throw new Error('SVR_ROUTE_ACTION_OUTCOME_INVALID');
  notifyRouteRuntime();
  return outcome;
};

const routePathById = Object.freeze(Object.fromEntries(workspaceVueRouteRecords.map((route) => [route.routeNodeId, route.path])));

const workspacePirRuntime = Object.freeze({
  ...workspaceDataRuntime,
  dispatchTrigger(input: JsonRecord) {
    const binding = input.binding && typeof input.binding === 'object' && !Array.isArray(input.binding)
      ? input.binding as JsonRecord
      : undefined;
    if (!binding) return;
    if (binding.kind === 'open-url' && typeof binding.href === 'string' && typeof window !== 'undefined') {
      window.open(binding.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (binding.kind === 'navigate-route' && typeof binding.routeId === 'string' && typeof window !== 'undefined') {
      const path = routePathById[binding.routeId];
      if (!path) throw new Error('VUE_ROUTE_NAVIGATION_UNAVAILABLE');
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    if (binding.kind === 'dispatch-data-operation') {
      void workspaceDataRuntime.dispatchDataMutation({
        binding: binding as Parameters<typeof workspaceDataRuntime.dispatchDataMutation>[0]['binding'],
        payload: input.payload,
        runtimeValuesById: input.runtimeValuesById ?? {},
        source: input.source,
      }).catch((error: unknown) => console.error(error instanceof Error ? error.message : 'DATA_MUTATION_FAILED'));
      return;
    }
    if (binding.kind === 'call-code') {
      const reference = binding.reference as JsonRecord | undefined;
      const module = reference && typeof reference.artifactId === 'string'
        ? (workspaceCodeModules as Readonly<Record<string, JsonRecord>>)[reference.artifactId]
        : undefined;
      const callback = module && typeof reference?.exportName === 'string' ? module[reference.exportName] : undefined;
      if (typeof callback !== 'function') throw new Error('VUE_CODE_REFERENCE_UNAVAILABLE');
      void Promise.resolve(callback(input.payload, Object.freeze({ source: input.source, scope: input.scope })));
    }
  },
  resolveCodeValue(reference: JsonRecord): unknown {
    const module = typeof reference.artifactId === 'string'
      ? (workspaceCodeModules as Readonly<Record<string, JsonRecord>>)[reference.artifactId]
      : undefined;
    return module && typeof reference.exportName === 'string' ? module[reference.exportName] : undefined;
  },
});

const renderRouteDocument = (
  documentId: string,
  key: string,
  routeId: string,
  paramsById: JsonRecord,
  routeOutletsByNodeId: Readonly<Record<string, () => any>> = {}
) => {
  const Document = createWorkspacePirDocumentComponent(documentId);
  return h(Document, {
    key,
    runtime: workspacePirRuntime,
    routeId,
    paramsById,
    instancePath: '/route:' + routeId + '/document:' + documentId,
    routeOutletsByNodeId,
  });
};

const renderRouteComposition = (
  matchChain: readonly WorkspaceVueRoute[],
  activeRouteId: string,
  paramsById: JsonRecord
) => {
  let content: any = null;
  for (let index = matchChain.length - 1; index >= 0; index -= 1) {
    const route = matchChain[index];
    const bindings = route.outletBindings ?? [];
    const pageIsContainer = !route.layoutDocumentId &&
      Boolean(route.pageDocumentId) &&
      Boolean(route.outletNodeId || bindings.length);
    const ownPage = route.pageDocumentId && !pageIsContainer
      ? renderRouteDocument(
          route.pageDocumentId,
          route.routeNodeId + ':page',
          activeRouteId,
          paramsById
        )
      : null;
    let defaultContent = content ?? ownPage;
    const defaultBinding = bindings.find(({ outletName }) => outletName === 'default');
    if (defaultBinding?.pageDocumentId) {
      defaultContent = renderRouteDocument(
        defaultBinding.pageDocumentId,
        route.routeNodeId + ':outlet:default',
        activeRouteId,
        paramsById
      );
    }
    const outletsByNodeId: Record<string, () => any> = {};
    if (route.outletNodeId && defaultContent !== null) {
      const projected = defaultContent;
      outletsByNodeId[route.outletNodeId] = () => projected;
    }
    bindings.forEach((binding) => {
      const projected = binding.pageDocumentId
        ? renderRouteDocument(
            binding.pageDocumentId,
            route.routeNodeId + ':outlet:' + binding.outletName,
            activeRouteId,
            paramsById
          )
        : binding.outletName === 'default'
          ? defaultContent
          : null;
      if (projected !== null) outletsByNodeId[binding.outletNodeId] = () => projected;
    });
    const containerDocumentId = route.layoutDocumentId ??
      (pageIsContainer ? route.pageDocumentId : undefined);
    if (containerDocumentId) {
      content = renderRouteDocument(
        containerDocumentId,
        route.routeNodeId + ':container',
        activeRouteId,
        paramsById,
        Object.freeze(outletsByNodeId)
      );
      continue;
    }
    if (content === null && ownPage !== null) content = ownPage;
  }
  return content ?? h('main', { 'data-prodivix-route-runtime': 'empty' }, 'Route has no renderable document.');
};

type RouteViewState =
  | Readonly<{ status: 'pending' }>
  | Readonly<{
      status: 'ready';
      routeNodeId: string;
      params: JsonRecord;
      matchChain: readonly WorkspaceVueRoute[];
    }>
  | Readonly<{ status: 'not-found' }>
  | Readonly<{ status: 'denied'; code: string }>
  | Readonly<{ status: 'failed'; code: string }>;

export default defineComponent({
  name: 'ProdivixWorkspaceVueApp',
  setup() {
    const state = ref<RouteViewState>(Object.freeze({ status: 'pending' }));
    let activeController: AbortController | undefined;
    let generation = 0;
    const activate = async () => {
      const currentGeneration = ++generation;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const match = findRoute(readPathname());
      activeRouteLoaderValue = undefined;
      if (!match) {
        state.value = Object.freeze({ status: 'not-found' });
        return;
      }
      state.value = Object.freeze({ status: 'pending' });
      try {
        for (const route of match.matchChain) {
          const guard = await invokeRouteRuntime(
            readRuntimeEntry(route.routeNodeId, 'guard'),
            Object.freeze({ routeId: route.routeNodeId }),
            { signal: controller.signal }
          );
          if (currentGeneration !== generation) return;
          if (guard?.kind === 'deny') {
            state.value = Object.freeze({ status: 'denied', code: guard.code });
            return;
          }
          if (guard?.kind === 'redirect') {
            window.location.assign(guard.location);
            return;
          }
          if (guard && guard.kind !== 'allow') throw new Error('SVR_ROUTE_GUARD_OUTCOME_INVALID');
          const loader = await invokeRouteRuntime(
            readRuntimeEntry(route.routeNodeId, 'loader'),
            Object.freeze({ routeId: route.routeNodeId }),
            { signal: controller.signal }
          );
          if (currentGeneration !== generation) return;
          if (loader?.kind === 'redirect') {
            window.location.assign(loader.location);
            return;
          }
          if (loader && loader.kind !== 'value') throw new Error('SVR_ROUTE_LOADER_OUTCOME_INVALID');
          if (loader?.kind === 'value') activeRouteLoaderValue = loader.value;
        }
        state.value = Object.freeze({
          status: 'ready',
          routeNodeId: match.routeNodeId,
          params: match.params,
          matchChain: match.matchChain,
        });
      } catch (error) {
        if (currentGeneration !== generation || controller.signal.aborted) return;
        state.value = Object.freeze({
          status: 'failed',
          code: error instanceof Error ? error.message : 'SVR_ROUTE_RUNTIME_FAILED',
        });
      }
    };
    const onRouteChange = () => { void activate(); };
    onMounted(() => {
      window.addEventListener('popstate', onRouteChange);
      routeRuntimeSubscribers.add(onRouteChange);
      void activate();
    });
    onUnmounted(() => {
      generation += 1;
      activeController?.abort();
      routeRuntimeSubscribers.delete(onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
      workspaceDataRuntime.dispose();
    });
    return () => {
      const current = state.value;
      if (current.status === 'pending') return h('main', { 'data-prodivix-route-runtime': 'pending', 'aria-busy': 'true' }, 'Loading route.');
      if (current.status === 'not-found') return h('main', { 'data-prodivix-route-not-found': 'true' }, 'Route not found.');
      if (current.status === 'denied') return h('main', { 'data-prodivix-route-runtime': 'denied', role: 'alert' }, 'Access denied.');
      if (current.status === 'failed') return h('main', { 'data-prodivix-route-runtime': 'failed', role: 'alert' }, 'Route runtime failed: ' + current.code);
      return h('div', { 'data-prodivix-vue-workspace': 'ready' }, [
        activeRouteLoaderValue === undefined
          ? null
          : h('output', { 'data-prodivix-route-loader': 'ready', hidden: true }, JSON.stringify(activeRouteLoaderValue)),
        renderRouteComposition(current.matchChain, current.routeNodeId, current.params),
      ]);
    };
  },
});
`;

  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    module: {
      id: WORKSPACE_VUE_APP_MODULE_ID,
      kind: 'workspace-module',
      suggestedName: 'prodivixWorkspaceApp',
      desiredPath: 'src/prodivix-workspace-app.ts',
      language: 'ts',
      imports,
      body,
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
  });
};
