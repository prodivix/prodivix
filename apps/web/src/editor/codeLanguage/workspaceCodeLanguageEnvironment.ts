import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createCodeLanguageProviderRegistry,
  createSemanticSnapshotIdentity,
  createSemanticWorkspaceRevisionsKey,
  type CodeArtifact,
  type CodeArtifactLanguage,
  type CodeLanguageCapability,
  type CodeLanguageProviderRegistry,
  type CodeLanguageSession,
  type CodeSlotRegistry,
  type SemanticContributionProvider,
  type SemanticSnapshotIdentity,
  type WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import {
  createCssCodeLanguageCapabilityProvider,
  createCssSemanticContributionProvider,
  CSS_SEMANTIC_PROVIDER_ID,
  createShaderCodeLanguageCapabilityProvider,
  createShaderSemanticContributionProvider,
  SHADER_SEMANTIC_PROVIDER_ID,
  createTypeScriptCodeLanguageCapabilityProvider,
  createTypeScriptSemanticContributionProvider,
  TYPESCRIPT_SEMANTIC_PROVIDER_ID,
} from '@prodivix/code-language';
import {
  captureWorkspaceSemanticRevisions,
  createWorkspaceCodeArtifactProvider,
  createWorkspaceCodeSlotRegistryFromSnapshot,
  createWorkspaceSemanticIndexFromSnapshot,
  WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES,
  type WorkspaceSemanticIndexIssue,
  type WorkspaceSemanticIndexCompositionResult,
  type WorkspaceCodeSlotRegistryCompositionResult,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const codeLanguageProviderRegistry = createCodeLanguageProviderRegistry();
codeLanguageProviderRegistry.register(
  createTypeScriptCodeLanguageCapabilityProvider()
);
codeLanguageProviderRegistry.register(
  createCssCodeLanguageCapabilityProvider()
);
codeLanguageProviderRegistry.register(
  createShaderCodeLanguageCapabilityProvider()
);

export type WorkspaceCodeLanguageDraft = Readonly<{
  artifactId: string;
  source: string;
  revision: string;
}>;

export type WorkspaceCodeLanguageSessionResult =
  | Readonly<{ status: 'ready'; session: CodeLanguageSession }>
  | Readonly<{
      status: 'unsupported';
      language: CodeArtifactLanguage;
      capability: CodeLanguageCapability;
    }>
  | Readonly<{ status: 'unavailable'; reason: string }>;

export type WorkspaceCodeLanguageEnvironment = Readonly<{
  artifacts: readonly CodeArtifact[];
  snapshotIdentity: SemanticSnapshotIdentity;
  codeDiagnostics: readonly ProdivixDiagnostic[];
  semanticComposition: WorkspaceSemanticIndexCompositionResult;
  semanticIndex: WorkspaceSemanticIndex | null;
  semanticIndexIssues: readonly WorkspaceSemanticIndexIssue[];
  codeSlotComposition: WorkspaceCodeSlotRegistryCompositionResult;
  codeSlotRegistry: CodeSlotRegistry | null;
  registry: CodeLanguageProviderRegistry;
  openSession(input: {
    language: CodeArtifactLanguage;
    capability: CodeLanguageCapability;
    draft?: WorkspaceCodeLanguageDraft;
  }): Promise<WorkspaceCodeLanguageSessionResult>;
}>;

const MAX_CACHED_REVISIONS = 12;
const environmentByRevisionKey = new Map<
  string,
  WorkspaceCodeLanguageEnvironment
>();

const rememberEnvironment = (
  revisionKey: string,
  environment: WorkspaceCodeLanguageEnvironment
): void => {
  environmentByRevisionKey.delete(revisionKey);
  environmentByRevisionKey.set(revisionKey, environment);
  while (environmentByRevisionKey.size > MAX_CACHED_REVISIONS) {
    const oldestKey = environmentByRevisionKey.keys().next().value;
    if (!oldestKey) break;
    environmentByRevisionKey.delete(oldestKey);
  }
};

const overlayDraft = (
  artifacts: readonly CodeArtifact[],
  draft: WorkspaceCodeLanguageDraft | undefined
): readonly CodeArtifact[] => {
  if (!draft) return artifacts;
  let found = false;
  const nextArtifacts = artifacts.map((artifact) => {
    if (artifact.id !== draft.artifactId) return artifact;
    found = true;
    return Object.freeze({
      ...artifact,
      source: draft.source,
      revision: draft.revision,
    });
  });
  return found ? Object.freeze(nextArtifacts) : artifacts;
};

const createProviderIdentity = (input: {
  workspace: WorkspaceSnapshot;
  semanticProviders: readonly SemanticContributionProvider[];
}): SemanticSnapshotIdentity =>
  createSemanticSnapshotIdentity(
    {
      workspaceRevisions: captureWorkspaceSemanticRevisions(input.workspace),
      schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
    },
    input.semanticProviders.map(({ descriptor }) => descriptor)
  );

/**
 * Composes the browser authoring environment once per immutable Workspace
 * snapshot. Canonical artifacts feed both the global Semantic Index and the
 * provider registry; draft text only overlays an individual editor session.
 */
export const createWorkspaceCodeLanguageEnvironment = (
  workspace: WorkspaceSnapshot
): WorkspaceCodeLanguageEnvironment => {
  const workspaceRevisions = captureWorkspaceSemanticRevisions(workspace);
  const revisionKey = createSemanticWorkspaceRevisionsKey(workspaceRevisions);
  const cached = environmentByRevisionKey.get(revisionKey);
  if (cached) return cached;

  const artifacts = Object.freeze(
    createWorkspaceCodeArtifactProvider(workspace)
      .listArtifacts({ surface: 'code-editor' })
      .sort(
        (left, right) =>
          compareText(left.path, right.path) || compareText(left.id, right.id)
      )
  );
  try {
    const semanticProviders = Object.freeze([
      createTypeScriptSemanticContributionProvider({
        workspaceId: workspace.id,
        workspaceRevisions,
        artifacts,
      }),
      createCssSemanticContributionProvider({
        workspaceId: workspace.id,
        workspaceRevisions,
        artifacts,
      }),
      createShaderSemanticContributionProvider({
        workspaceId: workspace.id,
        workspaceRevisions,
        artifacts,
      }),
    ]);
    const semanticComposition = createWorkspaceSemanticIndexFromSnapshot(
      workspace,
      { additionalProviders: semanticProviders }
    );
    const codeSlotComposition =
      createWorkspaceCodeSlotRegistryFromSnapshot(workspace);
    const providerIdentity =
      semanticComposition.status === 'ready'
        ? semanticComposition.index.snapshotIdentity
        : createProviderIdentity({ workspace, semanticProviders });
    const codeContributions = semanticProviders.map((provider) =>
      provider.contribute(providerIdentity)
    );

    const environment: WorkspaceCodeLanguageEnvironment = Object.freeze({
      artifacts,
      snapshotIdentity: providerIdentity,
      codeDiagnostics: Object.freeze(
        codeContributions
          .flatMap((contribution) => contribution.diagnostics ?? [])
          .sort(
            (left, right) =>
              compareText(
                left.sourceSpan?.artifactId ?? '',
                right.sourceSpan?.artifactId ?? ''
              ) ||
              (left.sourceSpan?.startLine ?? 0) -
                (right.sourceSpan?.startLine ?? 0) ||
              (left.sourceSpan?.startColumn ?? 0) -
                (right.sourceSpan?.startColumn ?? 0) ||
              compareText(left.code, right.code)
          )
      ),
      semanticComposition,
      semanticIndex:
        semanticComposition.status === 'ready'
          ? semanticComposition.index
          : null,
      semanticIndexIssues:
        semanticComposition.status === 'blocked'
          ? semanticComposition.issues
          : Object.freeze([]),
      codeSlotComposition,
      codeSlotRegistry:
        codeSlotComposition.status === 'ready'
          ? codeSlotComposition.registry
          : null,
      registry: codeLanguageProviderRegistry,
      async openSession(input) {
        const provider = codeLanguageProviderRegistry.getProvider(
          input.language,
          input.capability
        );
        if (!provider) {
          return Object.freeze({
            status: 'unsupported' as const,
            language: input.language,
            capability: input.capability,
          });
        }
        try {
          const session = await provider.openSession({
            identity:
              semanticComposition.status === 'ready'
                ? semanticComposition.index.snapshotIdentity
                : providerIdentity,
            artifacts: overlayDraft(artifacts, input.draft),
          });
          return Object.freeze({ status: 'ready' as const, session });
        } catch (error) {
          return Object.freeze({
            status: 'unavailable' as const,
            reason:
              error instanceof Error
                ? error.message
                : 'The code language provider could not open a session.',
          });
        }
      },
    });

    rememberEnvironment(revisionKey, environment);
    return environment;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : 'The code language environment could not be composed.';
    const issue: WorkspaceSemanticIndexIssue = Object.freeze({
      code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.indexBuildFailed,
      path: '/semantic/providers/code-language',
      message: reason,
      causeCode: 'code-language-provider-setup-failed',
    });
    const diagnostic: ProdivixDiagnostic = Object.freeze({
      code: 'COD-9001',
      severity: 'error',
      domain: 'code',
      message: 'The code language environment could not be initialized.',
      hint: 'Retry analysis after reopening the Workspace.',
      retryable: true,
      docsUrl: '/reference/diagnostics/cod-9001',
      targetRef: { kind: 'workspace' as const, workspaceId: workspace.id },
      meta: { stage: 'environment', reason },
    });
    const semanticComposition: WorkspaceSemanticIndexCompositionResult =
      Object.freeze({ status: 'blocked', issues: Object.freeze([issue]) });
    const codeSlotComposition: WorkspaceCodeSlotRegistryCompositionResult =
      Object.freeze({ status: 'blocked', issues: Object.freeze([issue]) });
    const unavailableEnvironment: WorkspaceCodeLanguageEnvironment =
      Object.freeze({
        artifacts,
        snapshotIdentity: createProviderIdentity({
          workspace,
          semanticProviders: [],
        }),
        codeDiagnostics: Object.freeze([diagnostic]),
        semanticComposition,
        semanticIndex: null,
        semanticIndexIssues: semanticComposition.issues,
        codeSlotComposition,
        codeSlotRegistry: null,
        registry: codeLanguageProviderRegistry,
        async openSession() {
          return Object.freeze({
            status: 'unavailable' as const,
            reason,
          });
        },
      });
    rememberEnvironment(revisionKey, unavailableEnvironment);
    return unavailableEnvironment;
  }
};

export const getWorkspaceCodeLanguageDiagnostics = (
  workspace: WorkspaceSnapshot
): readonly ProdivixDiagnostic[] =>
  createWorkspaceCodeLanguageEnvironment(workspace).codeDiagnostics;

export const hasWorkspaceCodeLanguageProvider = (
  environment: WorkspaceCodeLanguageEnvironment,
  providerId: string
): boolean =>
  environment.registry
    .listProviders()
    .some(({ descriptor }) => descriptor.id === providerId);

export const CODE_LANGUAGE_PROVIDER_IDS = Object.freeze({
  css: CSS_SEMANTIC_PROVIDER_ID,
  shader: SHADER_SEMANTIC_PROVIDER_ID,
  typeScript: TYPESCRIPT_SEMANTIC_PROVIDER_ID,
});
