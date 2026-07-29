import {
  decodeWorkspaceAnimationDocument,
  decodeWorkspaceNodeGraphDocument,
  isWorkspaceCodeDocumentContent,
  isWorkspacePirDocument,
  validateWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { compileAnimationExportContributions } from '#src/animation/compileAnimation';
import { compileNodeGraphExportContributions } from '#src/nodegraph/compileNodeGraph';
import {
  createExportProgramBuilder,
  createRouteExportContribution,
  createStaticDeploymentExportContribution,
  mergeExportDependencies,
  type ExportDependency,
  type ExportPlannerPreset,
  type ExportProgram,
  type ExportProgramContribution,
  type ExportRouteTopology,
} from '#src/export';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import {
  analyzeWorkspaceDataRuntimeTarget,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
} from '#src/workspace/workspaceDataRuntimeTarget';
import { analyzeWorkspaceServerRuntimeTarget } from '#src/workspace/workspaceServerRuntimeTarget';
import { createWorkspaceStandaloneDataRuntimeModules } from '#src/workspace/standaloneDataRuntime';
import { createWorkspaceExecutionConsoleRuntimeModule } from '#src/workspace/standaloneExecutionConsoleRuntime';
import { createWorkspaceStandaloneServerRuntimeModules } from '#src/workspace/standaloneServerRuntime';
import {
  createWorkspaceCodeContribution,
  createWorkspaceResourceContribution,
} from '#src/workspace/workspaceContributions';
import {
  attachWorkspaceVerificationProbeToEntryModule,
  createWorkspaceVerificationProbeContribution,
} from '#src/workspace/workspaceVerificationProbe';
import type {
  CompiledWorkspacePirProjection,
  WorkspaceExportCodeArtifact,
  WorkspaceTargetCompileOptions,
  WorkspaceTargetRenderLayer,
} from '#src/workspace/workspaceTargetRenderLayer';

/**
 * The single ExportProgram assembly both framework targets consume.
 *
 * ADR 31:344 requires the second target to consume the same `ExportProgram`,
 * Data current model, runtime requirements and SourceTrace rather than
 * duplicating the PIR/Data/NodeGraph/Animation domain compilers. Everything
 * that is not literally framework syntax lives here; a target only supplies a
 * render layer. Adding a target must never mean adding a second assembly.
 */
export const compileWorkspaceToTargetExportProgram = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceTargetCompileOptions,
  renderLayer: WorkspaceTargetRenderLayer
): ExportProgram => {
  const preset: ExportPlannerPreset = renderLayer.preset;
  const dataRuntime = analyzeWorkspaceDataRuntimeTarget(
    workspace,
    options.dataRuntimeTarget ??
      (options.dataMockProvision
        ? PROVIDER_MOCK_DATA_RUNTIME_TARGET
        : undefined)
  );
  const validationDiagnostics: CompileDiagnostic[] = validateWorkspaceSnapshot(
    workspace
  ).issues.map((issue) => ({
    code: issue.code,
    severity: 'error',
    source: 'export',
    message: issue.message,
    path: issue.path,
  }));

  // Code-point ordering, not locale ordering: this sequence reaches
  // export-manifest.json, origins.json and the bundle contentHash.
  const documents: readonly WorkspaceDocument[] = Object.values(
    workspace.docsById
  ).sort(
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
      documentRevision: document.contentRev,
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

  const pirDocuments: readonly WorkspacePirDocument[] = documents.filter(
    isWorkspacePirDocument
  );
  const codeDocuments = documents.filter(
    (document) =>
      document.type === 'code' &&
      isWorkspaceCodeDocumentContent(document.content)
  );
  const codeArtifacts: WorkspaceExportCodeArtifact[] = codeDocuments.flatMap(
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

  const pirCompilation: CompiledWorkspacePirProjection =
    renderLayer.compilePirDocuments({
      workspace,
      documents: pirDocuments,
      options,
    });
  const code = createWorkspaceCodeContribution({ documents: codeDocuments });
  const routeContribution = createRouteExportContribution({
    manifest: workspace.routeManifest,
    target: preset.target,
    documentInfo: (documentId: string) => {
      const document = workspace.docsById[documentId];
      return document
        ? { id: document.id, path: document.path, type: document.type }
        : null;
    },
    codeArtifactInfo: (artifactId: string) => {
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

  const routeCompositionDiagnostics = createRouteCompositionDiagnostics(
    routeTopology,
    renderLayer.routeAdapterName
  );

  const app = renderLayer.createAppModule({
    compiledDocuments: pirCompilation.documents,
    executableModuleIdByArtifactId: code.executableModuleIdByArtifactId,
    routeTopology,
    serverRuntime,
  });
  const verificationProbe = createWorkspaceVerificationProbeContribution(
    workspace,
    options.verificationProfile
  );
  const appModule = attachWorkspaceVerificationProbeToEntryModule(
    app.module,
    verificationProbe
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
    verificationProbe,
    {
      entryModuleId: appModule.id,
      roots: [
        {
          id: 'app',
          kind: 'app',
          displayName: options.projectName ?? workspace.name ?? 'Prodivix App',
          sourceRef: { domain: 'workspace', id: workspace.id, path: '/' },
        },
      ],
      modules: [
        createWorkspaceExecutionConsoleRuntimeModule(),
        ...createWorkspaceStandaloneDataRuntimeModules(
          workspace,
          dataRuntime.target
        ),
        ...createWorkspaceStandaloneServerRuntimeModules(
          serverRuntime.target,
          serverRuntime.bindings
        ),
        appModule,
      ],
      diagnostics: [
        ...validationDiagnostics,
        ...routeCompositionDiagnostics,
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

  const dependencies: ExportDependency[] = mergeExportDependencies([
    ...projectContributions.flatMap(
      (contribution) => contribution.dependencies ?? []
    ),
    ...renderLayer.createTargetDependencies(),
  ]);
  const scaffoldContributions = renderLayer.createScaffoldContributions({
    projectName: options.projectName ?? workspace.name ?? 'Prodivix App',
    dependencies,
    entryModuleId: appModule.id,
  });

  return [...scaffoldContributions, ...projectContributions, { dependencies }]
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .build();
};

/**
 * A route outlet whose node id is absent from its layout document would render
 * nothing with no signal, so it still fails closed. Layout and outlet
 * composition itself is now compiled — see `pirRouteOutlets` and the node
 * compiler's route-outlet emission.
 */
const createRouteCompositionDiagnostics = (
  routeTopology: ExportRouteTopology,
  adapterName: string
): CompileDiagnostic[] =>
  routeTopology.routes.flatMap((route) =>
    route.outletNodeId && !route.layoutDocId
      ? [
          {
            code: 'WKS-EXPORT-OUTLET-UNSUPPORTED',
            severity: 'error' as const,
            source: 'export' as const,
            message: `Route ${route.routeNodeId} targets outlet node ${route.outletNodeId} but declares no layout document, so the ${adapterName} route adapter has nothing to mount it into.`,
            path: `/routeManifest/routes/${route.routeNodeId}/outletNodeId`,
          },
        ]
      : []
  );
