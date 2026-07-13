import {
  composeRouteManifestWithModules,
  flattenRouteManifest,
  validateRouteManifest,
  type RouteManifestIssue,
  type RouteModuleSourceTrace,
  type WorkspaceRouteCodeReference,
  type WorkspaceRouteManifest,
  type WorkspaceRouteNode,
} from '@prodivix/router';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type {
  ExportProgramContribution,
  ExportRouteRuntimeRef,
  ExportRouteRuntimeRefKind,
  ExportRouteTopology,
  ExportRouteTopologyNode,
  ExportSourceTrace,
  ExportTarget,
} from '#src/export/types';

export type RouteExportDocumentInfo = {
  id: string;
  path?: string;
  type?: string;
};

export type RouteExportCodeArtifactInfo = {
  id: string;
  path?: string;
};

export type CreateRouteExportContributionOptions = {
  manifest: WorkspaceRouteManifest;
  target: ExportTarget;
  documentInfo?: (documentId: string) => RouteExportDocumentInfo | null;
  codeArtifactInfo?: (artifactId: string) => RouteExportCodeArtifactInfo | null;
};

const runtimeRefFields: Array<{
  kind: ExportRouteRuntimeRefKind;
  key: keyof NonNullable<WorkspaceRouteNode['runtime']>;
}> = [
  { kind: 'loader', key: 'loaderRef' },
  { kind: 'action', key: 'actionRef' },
  { kind: 'guard', key: 'guardRef' },
];

const createRouteNodeSourceTrace = (
  routeNodeId: string,
  path: string
): ExportSourceTrace => ({
  sourceRef: {
    domain: 'route',
    id: routeNodeId,
    path,
  },
});

const createRouteDocumentSourceTrace = (
  documentId: string,
  role: 'page' | 'layout',
  documentInfo?: RouteExportDocumentInfo | null
): ExportSourceTrace => ({
  sourceRef: {
    domain: 'workspace-document',
    id: documentId,
    path: documentInfo?.path ?? `/documents/${documentId}`,
  },
  artifactId: role,
});

const createRouteModuleSourceTrace = (
  trace: RouteModuleSourceTrace
): ExportSourceTrace => ({
  sourceRef: {
    domain: 'route-module',
    id: trace.moduleId,
    path: trace.path,
  },
  artifactId: trace.mountId,
});

const createRouteRuntimeSourceTrace = (
  routeNodeId: string,
  kind: ExportRouteRuntimeRefKind,
  reference: WorkspaceRouteCodeReference,
  artifactInfo?: RouteExportCodeArtifactInfo | null
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'route-runtime',
      id: routeNodeId,
      path: `/routeManifest/runtime/${routeNodeId}/${kind}`,
    },
    artifactId: reference.artifactId,
  },
  {
    sourceRef: {
      domain: 'code-artifact',
      id: reference.artifactId,
      path: artifactInfo?.path ?? `/codeArtifacts/${reference.artifactId}`,
    },
    artifactId: reference.artifactId,
  },
];

const toRuntimeRefs = (
  node: WorkspaceRouteNode,
  codeArtifactInfo: CreateRouteExportContributionOptions['codeArtifactInfo']
): ExportRouteRuntimeRef[] =>
  runtimeRefFields.flatMap(({ kind, key }) => {
    const reference = node.runtime?.[key];
    if (!reference?.artifactId?.trim()) return [];
    return [
      {
        kind,
        artifactId: reference.artifactId,
        ...(reference.exportName ? { exportName: reference.exportName } : {}),
        ...(reference.symbolId ? { symbolId: reference.symbolId } : {}),
        sourceTrace: createRouteRuntimeSourceTrace(
          node.id,
          kind,
          reference,
          codeArtifactInfo?.(reference.artifactId) ?? null
        ),
      },
    ];
  });

const toOutletBindings = (
  node: WorkspaceRouteNode
): NonNullable<ExportRouteTopologyNode['outletBindings']> =>
  Object.entries(node.outletBindings ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([outletName, binding]) => ({
      outletName,
      outletNodeId: binding.outletNodeId,
      ...(binding.pageDocId ? { pageDocId: binding.pageDocId } : {}),
    }));

const routeIssueToDiagnostic = (
  issue: RouteManifestIssue
): CompileDiagnostic => ({
  code: issue.code,
  severity: 'error',
  source: 'route',
  message: issue.message,
  path: `/routeManifest/routes/${issue.routeNodeId}`,
  ...(issue.artifactId
    ? { suggestion: `Check CodeArtifact ${issue.artifactId}.` }
    : {}),
});

const skippedMountToDiagnostic = (
  mount: ReturnType<
    typeof composeRouteManifestWithModules
  >['skippedMounts'][number]
): CompileDiagnostic => ({
  code: 'RTE-5001',
  severity: 'error',
  source: 'route',
  message: `Route module mount ${mount.mountId} was skipped: ${mount.reason}.`,
  path: `/routeManifest/mounts/${mount.mountId}`,
});

const createRouteNodeTopology = (input: {
  node: WorkspaceRouteNode;
  routeNodeId: string;
  path: string;
  depth: number;
  parentRouteNodeId?: string;
  moduleTrace?: RouteModuleSourceTrace;
  documentInfo: CreateRouteExportContributionOptions['documentInfo'];
  codeArtifactInfo: CreateRouteExportContributionOptions['codeArtifactInfo'];
}): ExportRouteTopologyNode => {
  const pageInfo = input.node.pageDocId
    ? input.documentInfo?.(input.node.pageDocId)
    : null;
  const layoutInfo = input.node.layoutDocId
    ? input.documentInfo?.(input.node.layoutDocId)
    : null;
  const sourceTrace: ExportSourceTrace[] = [
    createRouteNodeSourceTrace(input.routeNodeId, input.path),
    ...(input.node.pageDocId
      ? [createRouteDocumentSourceTrace(input.node.pageDocId, 'page', pageInfo)]
      : []),
    ...(input.node.layoutDocId
      ? [
          createRouteDocumentSourceTrace(
            input.node.layoutDocId,
            'layout',
            layoutInfo
          ),
        ]
      : []),
    ...(input.moduleTrace
      ? [createRouteModuleSourceTrace(input.moduleTrace)]
      : []),
  ];
  const runtimeRefs = toRuntimeRefs(input.node, input.codeArtifactInfo);
  const outletBindings = toOutletBindings(input.node);

  return {
    routeNodeId: input.routeNodeId,
    path: input.path,
    depth: input.depth,
    ...(input.parentRouteNodeId
      ? { parentRouteNodeId: input.parentRouteNodeId }
      : {}),
    ...(input.node.segment ? { segment: input.node.segment } : {}),
    ...(input.node.index ? { index: true } : {}),
    ...(input.node.layoutDocId ? { layoutDocId: input.node.layoutDocId } : {}),
    ...(input.node.pageDocId ? { pageDocId: input.node.pageDocId } : {}),
    ...(input.node.outletNodeId
      ? { outletNodeId: input.node.outletNodeId }
      : {}),
    ...(outletBindings.length ? { outletBindings } : {}),
    runtimeRefs,
    sourceTrace: [
      ...sourceTrace,
      ...runtimeRefs.flatMap((reference) => reference.sourceTrace),
    ],
  };
};

export const createRouteExportContribution = ({
  manifest,
  target,
  documentInfo,
  codeArtifactInfo,
}: CreateRouteExportContributionOptions): ExportProgramContribution => {
  const composed = composeRouteManifestWithModules(manifest);
  const moduleTraceByHostRouteId = new Map(
    composed.sourceTrace.map((trace) => [trace.hostRouteNodeId, trace])
  );
  const documentExists = documentInfo
    ? (documentId: string) => Boolean(documentInfo(documentId))
    : undefined;
  const codeArtifactExists = codeArtifactInfo
    ? (artifactId: string) => Boolean(codeArtifactInfo(artifactId))
    : undefined;
  const routeIssues = validateRouteManifest({
    manifest: composed.manifest,
    documentExists,
    codeArtifactExists,
  });
  const diagnostics = [
    ...routeIssues.map(routeIssueToDiagnostic),
    ...composed.skippedMounts.map(skippedMountToDiagnostic),
  ];
  const rootRoute = createRouteNodeTopology({
    node: composed.manifest.root,
    routeNodeId: composed.manifest.root.id,
    path: '/',
    depth: 0,
    documentInfo,
    codeArtifactInfo,
  });
  const routes = [
    rootRoute,
    ...flattenRouteManifest(composed.manifest).map((item) =>
      createRouteNodeTopology({
        node: item.node,
        routeNodeId: item.id,
        path: item.path,
        depth: item.depth,
        parentRouteNodeId: item.parentId,
        moduleTrace: moduleTraceByHostRouteId.get(item.id),
        documentInfo,
        codeArtifactInfo,
      })
    ),
  ];
  const runtimeRefs = routes.flatMap((route) =>
    route.runtimeRefs.map((reference) => ({
      ...reference,
      routeNodeId: route.routeNodeId,
    }))
  );
  const topology: ExportRouteTopology = {
    version: composed.manifest.version,
    rootRouteNodeId: composed.manifest.root.id,
    target,
    routes,
    runtimeRefs,
    adapter: {
      framework: target.framework,
      preset: target.preset,
      runtimeRefs: runtimeRefs.map((reference) => ({
        routeNodeId: reference.routeNodeId,
        kind: reference.kind,
        artifactId: reference.artifactId,
        ...(reference.exportName ? { exportName: reference.exportName } : {}),
        ...(reference.symbolId ? { symbolId: reference.symbolId } : {}),
      })),
    },
    ...(composed.sourceTrace.length
      ? { moduleSourceTrace: composed.sourceTrace }
      : {}),
  };

  return {
    routes: topology,
    diagnostics,
  };
};
