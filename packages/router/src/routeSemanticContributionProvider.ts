import {
  createCodeArtifactScopeId,
  createCodeArtifactSymbolId,
  createCodeSymbolId,
  createRouteManifestScopeId,
  createRouteModuleScopeId,
  createRouteModuleSymbolId,
  createRouteMountSymbolId,
  createRouteParamSymbolId,
  createRouteScopeId,
  createRouteSymbolId,
  createSemanticId,
  createWorkspaceDocumentSymbolId,
  createWorkspaceScopeId,
  type SemanticContribution,
  type SemanticContributionProvider,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
  type WorkspaceSymbolKind,
} from '@prodivix/authoring';
import { buildRoutePath, normalizeRouteSegment } from './routeCore';
import type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from './routeTypes';

const ROUTE_SEMANTIC_PROVIDER_ID = 'prodivix.route-manifest';
const ROUTE_SEMANTIC_PROVIDER_VERSION = '1';

const ROUTE_NODE_TYPE_REF = 'route/node';
const ROUTE_MODULE_TYPE_REF = 'route/module';
const ROUTE_MOUNT_TYPE_REF = 'route/mount';
const ROUTE_PARAM_TYPE_REF = 'route/param/string';

const ROUTE_PAGE_DOCUMENT_TYPE_REFS = [
  'workspace-document:pir-page',
  'workspace-document:pir-component',
] as const;
const ROUTE_LAYOUT_DOCUMENT_TYPE_REFS = [
  'workspace-document:pir-layout',
] as const;
const CODE_EXPORT_SYMBOL_KINDS = [
  'code-export',
  'code-function',
] as const satisfies readonly WorkspaceSymbolKind[];

const RUNTIME_ROLES = [
  { role: 'loader', field: 'loaderRef' },
  { role: 'action', field: 'actionRef' },
  { role: 'guard', field: 'guardRef' },
] as const;

export type RouteSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  routeRev: number;
  manifest: WorkspaceRouteManifest;
}>;

type RouteSemanticFacts = {
  scopes: WorkspaceScopeContribution[];
  symbols: WorkspaceSymbolContribution[];
  references: WorkspaceReferenceFact[];
  dependencies: WorkspaceDependencyContribution[];
};

type RouteTreeContext = Readonly<{
  workspaceId: string;
  symbolScopeId: string;
  rootParentScopeId: string;
  qualifiedNamePrefix?: string;
  hostRouteNodeIds?: Set<string>;
}>;

const compareFactIds = (left: { id: string }, right: { id: string }): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

const freezeFacts = <Fact extends { id: string }>(
  facts: Fact[]
): readonly Fact[] =>
  Object.freeze(facts.sort(compareFactIds).map((fact) => Object.freeze(fact)));

const createRouteOwnerRef = (routeNodeId: string) =>
  ({ kind: 'route', routeId: routeNodeId }) as const;

const createWorkspaceOwnerRef = (workspaceId: string) =>
  ({ kind: 'workspace', workspaceId }) as const;

const createRouteQualifiedName = (
  path: string,
  prefix: string | undefined
): string => (prefix ? `${prefix}:${path}` : path);

const createRouteDisplayName = (
  node: WorkspaceRouteNode,
  path: string
): string => (node.index ? `${path} (index)` : path);

const addDocumentReference = (
  facts: RouteSemanticFacts,
  input: Readonly<{
    workspaceId: string;
    routeNodeId: string;
    routeScopeId: string;
    documentId: string;
    role: 'page' | 'layout' | 'outlet-page';
    expectedTypeRefs: readonly string[];
    outletName?: string;
  }>
): void => {
  facts.references.push({
    id: createSemanticId(
      'route-document-reference',
      input.workspaceId,
      input.routeNodeId,
      input.role,
      input.outletName ?? ''
    ),
    kind: 'binding',
    sourceRef: createRouteOwnerRef(input.routeNodeId),
    sourceSymbolId: createRouteSymbolId(input.workspaceId, input.routeNodeId),
    scopeId: input.routeScopeId,
    target: {
      kind: 'symbol-id',
      symbolId: createWorkspaceDocumentSymbolId(
        input.workspaceId,
        input.documentId
      ),
    },
    resolutionMode: 'addressable',
    expectedTypeRefs: input.expectedTypeRefs,
    requiresDurableTarget: true,
  });
};

const addRuntimeReferences = (
  facts: RouteSemanticFacts,
  input: Readonly<{
    workspaceId: string;
    routeNodeId: string;
    routeScopeId: string;
    role: (typeof RUNTIME_ROLES)[number]['role'];
    reference: WorkspaceRouteCodeReference;
  }>
): void => {
  const sourceRef = createRouteOwnerRef(input.routeNodeId);
  const sourceSymbolId = createRouteSymbolId(
    input.workspaceId,
    input.routeNodeId
  );
  facts.references.push({
    id: createSemanticId(
      'route-runtime-artifact-reference',
      input.workspaceId,
      input.routeNodeId,
      input.role
    ),
    kind: 'code-reference',
    sourceRef,
    sourceSymbolId,
    scopeId: input.routeScopeId,
    target: {
      kind: 'symbol-id',
      symbolId: createCodeArtifactSymbolId(
        input.workspaceId,
        input.reference.artifactId
      ),
    },
    resolutionMode: 'addressable',
    requiresDurableTarget: true,
  });

  if (input.reference.symbolId) {
    facts.references.push({
      id: createSemanticId(
        'route-runtime-symbol-reference',
        input.workspaceId,
        input.routeNodeId,
        input.role
      ),
      kind: 'code-reference',
      sourceRef,
      sourceSymbolId,
      scopeId: input.routeScopeId,
      target: {
        kind: 'symbol-id',
        symbolId: createCodeSymbolId(
          input.workspaceId,
          input.reference.artifactId,
          input.reference.symbolId
        ),
      },
      resolutionMode: 'addressable',
      requiresDurableTarget: true,
    });
  }

  if (input.reference.exportName) {
    facts.references.push({
      id: createSemanticId(
        'route-runtime-export-reference',
        input.workspaceId,
        input.routeNodeId,
        input.role
      ),
      kind: 'code-reference',
      sourceRef,
      sourceSymbolId,
      scopeId: input.routeScopeId,
      target: {
        kind: 'name',
        name: input.reference.exportName,
        symbolKinds: CODE_EXPORT_SYMBOL_KINDS,
        targetScopeId: createCodeArtifactScopeId(
          input.workspaceId,
          input.reference.artifactId
        ),
      },
      resolutionMode: 'addressable',
    });
  }
};

const addRouteReferences = (
  facts: RouteSemanticFacts,
  workspaceId: string,
  node: WorkspaceRouteNode,
  routeScopeId: string
): void => {
  if (node.pageDocId) {
    addDocumentReference(facts, {
      workspaceId,
      routeNodeId: node.id,
      routeScopeId,
      documentId: node.pageDocId,
      role: 'page',
      expectedTypeRefs: ROUTE_PAGE_DOCUMENT_TYPE_REFS,
    });
  }
  if (node.layoutDocId) {
    addDocumentReference(facts, {
      workspaceId,
      routeNodeId: node.id,
      routeScopeId,
      documentId: node.layoutDocId,
      role: 'layout',
      expectedTypeRefs: ROUTE_LAYOUT_DOCUMENT_TYPE_REFS,
    });
  }
  Object.entries(node.outletBindings ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([outletName, binding]) => {
      if (!binding.pageDocId) return;
      addDocumentReference(facts, {
        workspaceId,
        routeNodeId: node.id,
        routeScopeId,
        documentId: binding.pageDocId,
        role: 'outlet-page',
        outletName,
        expectedTypeRefs: ROUTE_PAGE_DOCUMENT_TYPE_REFS,
      });
    });

  for (const { role, field } of RUNTIME_ROLES) {
    const reference = node.runtime?.[field];
    if (!reference) continue;
    addRuntimeReferences(facts, {
      workspaceId,
      routeNodeId: node.id,
      routeScopeId,
      role,
      reference,
    });
  }
};

const contributeRouteTree = (
  facts: RouteSemanticFacts,
  node: WorkspaceRouteNode,
  context: RouteTreeContext,
  parentPath = '/',
  parentNode?: WorkspaceRouteNode
): void => {
  const routeScopeId = createRouteScopeId(context.workspaceId, node.id);
  const path = buildRoutePath(parentPath, node);
  const ownerRef = createRouteOwnerRef(node.id);
  context.hostRouteNodeIds?.add(node.id);

  facts.scopes.push({
    id: routeScopeId,
    kind: 'route',
    ownerRef,
    parentId: parentNode
      ? createRouteScopeId(context.workspaceId, parentNode.id)
      : context.rootParentScopeId,
  });
  facts.symbols.push({
    id: createRouteSymbolId(context.workspaceId, node.id),
    stability: 'durable',
    kind: 'route',
    name: node.id,
    displayName: createRouteDisplayName(node, path),
    qualifiedName: createRouteQualifiedName(path, context.qualifiedNamePrefix),
    scopeId: context.symbolScopeId,
    ownerRef,
    typeRef: ROUTE_NODE_TYPE_REF,
    capabilityIds: context.qualifiedNamePrefix
      ? ['route:module-node', 'route:runtime-owner']
      : ['route:navigation-target', 'route:runtime-owner'],
  });

  const segment = normalizeRouteSegment(node.segment);
  if (segment.ok) {
    for (const paramName of segment.params) {
      facts.symbols.push({
        id: createRouteParamSymbolId(context.workspaceId, node.id, paramName),
        stability: 'revision-scoped',
        kind: 'param',
        name: paramName,
        displayName: paramName,
        qualifiedName: `${createRouteQualifiedName(
          path,
          context.qualifiedNamePrefix
        )}::${paramName}`,
        scopeId: routeScopeId,
        ownerRef,
        typeRef: ROUTE_PARAM_TYPE_REF,
        capabilityIds: ['route:param'],
      });
    }
  }

  if (parentNode) {
    const sourceSymbolId = createRouteSymbolId(context.workspaceId, node.id);
    const targetSymbolId = createRouteSymbolId(
      context.workspaceId,
      parentNode.id
    );
    if (sourceSymbolId !== targetSymbolId) {
      facts.dependencies.push({
        id: createSemanticId(
          'route-parent-dependency',
          context.workspaceId,
          node.id,
          parentNode.id
        ),
        kind: 'route',
        sourceSymbolId,
        targetSymbolId,
      });
    }
  }

  addRouteReferences(facts, context.workspaceId, node, routeScopeId);
  for (const child of node.children ?? []) {
    contributeRouteTree(facts, child, context, path, node);
  }
};

const contributeRouteModule = (
  facts: RouteSemanticFacts,
  workspaceId: string,
  manifestScopeId: string,
  module: RouteModule
): void => {
  const moduleScopeId = createRouteModuleScopeId(workspaceId, module.moduleId);
  const moduleSymbolId = createRouteModuleSymbolId(
    workspaceId,
    module.moduleId
  );
  const workspaceOwnerRef = createWorkspaceOwnerRef(workspaceId);

  facts.scopes.push({
    id: moduleScopeId,
    kind: 'route-module',
    ownerRef: workspaceOwnerRef,
    parentId: manifestScopeId,
  });
  facts.symbols.push({
    id: moduleSymbolId,
    stability: 'durable',
    kind: 'route-module',
    name: module.moduleId,
    displayName: module.moduleId,
    qualifiedName: `route-module:${module.moduleId}`,
    scopeId: manifestScopeId,
    ownerRef: workspaceOwnerRef,
    typeRef: ROUTE_MODULE_TYPE_REF,
    capabilityIds: ['route:module'],
  });

  contributeRouteTree(
    facts,
    module.root,
    {
      workspaceId,
      symbolScopeId: moduleScopeId,
      rootParentScopeId: moduleScopeId,
      qualifiedNamePrefix: `route-module:${module.moduleId}`,
    },
    '/'
  );
  facts.dependencies.push({
    id: createSemanticId(
      'route-module-root-dependency',
      workspaceId,
      module.moduleId,
      module.root.id
    ),
    kind: 'route',
    sourceSymbolId: createRouteSymbolId(workspaceId, module.root.id),
    targetSymbolId: moduleSymbolId,
  });
};

const contributeRouteMount = (
  facts: RouteSemanticFacts,
  input: Readonly<{
    workspaceId: string;
    manifestScopeId: string;
    manifestRootId: string;
    hostRouteNodeIds: ReadonlySet<string>;
    mount: RouteModuleMount;
  }>
): void => {
  const ownerRef = createWorkspaceOwnerRef(input.workspaceId);
  const mountSymbolId = createRouteMountSymbolId(
    input.workspaceId,
    input.mount.mountId
  );
  const parentRouteNodeId =
    input.mount.parentRouteNodeId?.trim() || input.manifestRootId;

  facts.symbols.push({
    id: mountSymbolId,
    stability: 'durable',
    kind: 'route-mount',
    name: input.mount.mountId,
    displayName: input.mount.mountPath
      ? `${input.mount.mountId} (${input.mount.mountPath})`
      : input.mount.mountId,
    qualifiedName: `${input.mount.moduleRef}@${parentRouteNodeId}`,
    scopeId: input.manifestScopeId,
    ownerRef,
    typeRef: ROUTE_MOUNT_TYPE_REF,
    capabilityIds: ['route:mount'],
  });
  facts.references.push({
    id: createSemanticId(
      'route-mount-module-reference',
      input.workspaceId,
      input.mount.mountId
    ),
    kind: 'import',
    sourceRef: ownerRef,
    sourceSymbolId: mountSymbolId,
    scopeId: input.manifestScopeId,
    target: {
      kind: 'symbol-id',
      symbolId: createRouteModuleSymbolId(
        input.workspaceId,
        input.mount.moduleRef
      ),
    },
    resolutionMode: 'addressable',
    expectedTypeRefs: [ROUTE_MODULE_TYPE_REF],
    requiresDurableTarget: true,
  });

  const parentSymbolId = createRouteSymbolId(
    input.workspaceId,
    parentRouteNodeId
  );
  if (
    input.hostRouteNodeIds.has(parentRouteNodeId) &&
    mountSymbolId !== parentSymbolId
  ) {
    facts.references.push({
      id: createSemanticId(
        'route-mount-parent-reference',
        input.workspaceId,
        input.mount.mountId
      ),
      kind: 'binding',
      sourceRef: ownerRef,
      sourceSymbolId: mountSymbolId,
      scopeId: input.manifestScopeId,
      target: { kind: 'symbol-id', symbolId: parentSymbolId },
      resolutionMode: 'addressable',
      expectedTypeRefs: [ROUTE_NODE_TYPE_REF],
      requiresDurableTarget: true,
    });
  }
};

const createRouteSemanticContribution = ({
  workspaceId,
  manifest,
}: RouteSemanticContributionProviderInput): SemanticContribution => {
  const facts: RouteSemanticFacts = {
    scopes: [],
    symbols: [],
    references: [],
    dependencies: [],
  };
  const workspaceOwnerRef = createWorkspaceOwnerRef(workspaceId);
  const manifestScopeId = createRouteManifestScopeId(workspaceId);
  const hostRouteNodeIds = new Set<string>();

  facts.scopes.push({
    id: manifestScopeId,
    kind: 'route',
    ownerRef: workspaceOwnerRef,
    parentId: createWorkspaceScopeId(workspaceId),
  });
  contributeRouteTree(facts, manifest.root, {
    workspaceId,
    symbolScopeId: manifestScopeId,
    rootParentScopeId: manifestScopeId,
    hostRouteNodeIds,
  });

  Object.entries(manifest.modules ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([, module]) =>
      contributeRouteModule(facts, workspaceId, manifestScopeId, module)
    );
  [...(manifest.mounts ?? [])]
    .sort((left, right) => left.mountId.localeCompare(right.mountId))
    .forEach((mount) =>
      contributeRouteMount(facts, {
        workspaceId,
        manifestScopeId,
        manifestRootId: manifest.root.id,
        hostRouteNodeIds,
        mount,
      })
    );

  return Object.freeze({
    scopes: freezeFacts(facts.scopes),
    symbols: freezeFacts(facts.symbols),
    references: freezeFacts(facts.references),
    dependencies: freezeFacts(facts.dependencies),
  });
};

/**
 * Projects one canonical RouteManifest revision into complete immutable route
 * facts. Workspace documents, code artifacts, and PIR nodes remain owned by
 * their domain providers; this provider only publishes typed references to
 * their canonical semantic addresses.
 */
export const createRouteSemanticContributionProvider = (
  input: RouteSemanticContributionProviderInput
): SemanticContributionProvider => {
  const contribution = createRouteSemanticContribution(input);
  return Object.freeze({
    descriptor: Object.freeze({
      id: ROUTE_SEMANTIC_PROVIDER_ID,
      semanticVersion: ROUTE_SEMANTIC_PROVIDER_VERSION,
    }),
    contribute(identity) {
      const revisions = identity.workspaceRevisions;
      if (
        revisions.workspaceId !== input.workspaceId ||
        revisions.routeRev !== input.routeRev
      ) {
        throw new Error(
          `Route semantic provider expected workspace ${input.workspaceId} at route revision ${input.routeRev}, received workspace ${revisions.workspaceId} at route revision ${revisions.routeRev}.`
        );
      }
      return contribution;
    },
  });
};
