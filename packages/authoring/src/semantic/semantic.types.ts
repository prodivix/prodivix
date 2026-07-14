import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';

export type SemanticDocumentRevision = Readonly<{
  contentRev: number;
  metaRev: number;
}>;

export type SemanticWorkspaceRevisions = Readonly<{
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  documentRevs: Readonly<Record<string, SemanticDocumentRevision>>;
}>;

export type SemanticSnapshotRevision = Readonly<{
  workspaceRevisions: SemanticWorkspaceRevisions;
  schemaVersion: string;
}>;

export type SemanticSnapshotIdentity = SemanticSnapshotRevision &
  Readonly<{
    providerSetDigest: string;
  }>;

export type SemanticProviderDescriptor = Readonly<{
  id: string;
  semanticVersion: string;
  configurationDigest?: string;
}>;

export type WorkspaceSymbolKind =
  | 'workspace-document'
  | 'route'
  | 'route-module'
  | 'route-mount'
  | 'component'
  | 'component-prop'
  | 'component-event'
  | 'component-slot'
  | 'component-variant'
  | 'component-variant-option'
  | 'component-part'
  | 'pir-node'
  | 'pir-region'
  | 'state'
  | 'param'
  | 'data'
  | 'collection-item'
  | 'collection-index'
  | 'collection-error'
  | 'nodegraph'
  | 'nodegraph-node'
  | 'nodegraph-port'
  | 'nodegraph-input'
  | 'nodegraph-output'
  | 'animation-timeline'
  | 'animation-track'
  | 'animation-binding'
  | 'code-artifact'
  | 'code-module'
  | 'code-export'
  | 'code-function'
  | 'code-type'
  | 'css-symbol'
  | 'shader-entry'
  | 'token'
  | 'asset'
  | 'external-contract'
  | `plugin:${string}`;

export type WorkspaceScopeKind =
  | 'workspace'
  | 'document'
  | 'route'
  | 'route-module'
  | 'component'
  | 'component-slot'
  | 'pir-node'
  | 'collection-item'
  | 'collection-error'
  | 'nodegraph'
  | 'nodegraph-node'
  | 'animation'
  | 'code-artifact'
  | 'code-module'
  | `plugin:${string}`;

export type WorkspaceReferenceKind =
  | 'definition'
  | 'binding'
  | 'import'
  | 'component-instance'
  | 'component-member'
  | 'slot-projection'
  | 'collection-source'
  | 'collection-key'
  | 'nodegraph-port'
  | 'animation-target'
  | 'code-reference'
  | 'token-reference'
  | 'asset-reference'
  | `plugin:${string}`;

export type WorkspaceDependencyKind =
  | 'document'
  | 'component'
  | 'route'
  | 'nodegraph'
  | 'animation'
  | 'import'
  | 'runtime'
  | 'export'
  | `plugin:${string}`;

export type SemanticSymbolStability = 'durable' | 'revision-scoped';

export type WorkspaceScopeContribution = Readonly<{
  id: string;
  kind: WorkspaceScopeKind;
  ownerRef: DiagnosticTargetRef;
  parentId?: string;
  importedScopeIds?: readonly string[];
}>;

export type WorkspaceScope = WorkspaceScopeContribution &
  Readonly<{
    providerId: string;
  }>;

export type WorkspaceSymbolContribution = Readonly<{
  id: string;
  stability: SemanticSymbolStability;
  kind: WorkspaceSymbolKind;
  name: string;
  displayName?: string;
  qualifiedName?: string;
  scopeId: string;
  ownerRef: DiagnosticTargetRef;
  sourceSpan?: SourceSpan;
  typeRef?: string;
  capabilityIds?: readonly string[];
}>;

export type WorkspaceSymbol = WorkspaceSymbolContribution &
  Readonly<{
    providerId: string;
  }>;

export type SemanticReferenceTarget =
  | Readonly<{ kind: 'symbol-id'; symbolId: string }>
  | Readonly<{
      kind: 'name';
      name: string;
      symbolKinds?: readonly WorkspaceSymbolKind[];
      targetScopeId?: string;
    }>;

export type SemanticResolutionMode = 'visible' | 'addressable';
export type SemanticReferenceDiagnosticPolicy = 'report' | 'defer';

export type WorkspaceReferenceFact = Readonly<{
  id: string;
  kind: WorkspaceReferenceKind;
  sourceRef: DiagnosticTargetRef;
  sourceSymbolId?: string;
  sourceSpan?: SourceSpan;
  scopeId: string;
  target: SemanticReferenceTarget;
  resolutionMode: SemanticResolutionMode;
  expectedTypeRefs?: readonly string[];
  requiredCapabilityIds?: readonly string[];
  requiresDurableTarget?: boolean;
  diagnosticPolicy?: SemanticReferenceDiagnosticPolicy;
}>;

export type SemanticResolutionStatus =
  | 'resolved'
  | 'missing'
  | 'not-visible'
  | 'ambiguous'
  | 'type-incompatible'
  | 'stale';

export type SemanticStoredResolutionStatus = Exclude<
  SemanticResolutionStatus,
  'stale'
>;

export type WorkspaceReferenceEdge = WorkspaceReferenceFact &
  Readonly<{
    providerId: string;
    status: SemanticStoredResolutionStatus;
    targetSymbolId?: string;
    candidateSymbolIds?: readonly string[];
  }>;

export type WorkspaceDependencyContribution = Readonly<{
  id: string;
  kind: WorkspaceDependencyKind;
  sourceSymbolId: string;
  targetSymbolId: string;
}>;

export type WorkspaceDependencyEdge = WorkspaceDependencyContribution &
  Readonly<{
    providerId: string;
  }>;

export type SemanticContribution = Readonly<{
  scopes?: readonly WorkspaceScopeContribution[];
  symbols?: readonly WorkspaceSymbolContribution[];
  references?: readonly WorkspaceReferenceFact[];
  dependencies?: readonly WorkspaceDependencyContribution[];
  diagnostics?: readonly ProdivixDiagnostic[];
}>;

export type SemanticContributionProvider = Readonly<{
  descriptor: SemanticProviderDescriptor;
  contribute(identity: SemanticSnapshotIdentity): SemanticContribution;
}>;

export type SemanticQueryOptions = Readonly<{
  expectedSnapshotIdentity?: SemanticSnapshotIdentity;
}>;

export type SemanticQueryContext = SemanticQueryOptions &
  Readonly<{
    scopeId: string;
    name?: string;
    symbolKinds?: readonly WorkspaceSymbolKind[];
    expectedTypeRef?: string;
    requiredCapabilityIds?: readonly string[];
  }>;

export type SemanticStaleResult = Readonly<{
  status: 'stale';
  expectedSnapshotIdentity: SemanticSnapshotIdentity;
  actualSnapshotIdentity: SemanticSnapshotIdentity;
}>;

export type SemanticVisibleSymbolsResult =
  | Readonly<{ status: 'resolved'; symbols: readonly WorkspaceSymbol[] }>
  | Readonly<{
      status: 'missing';
      scopeId: string;
      symbols: readonly WorkspaceSymbol[];
    }>
  | (SemanticStaleResult & Readonly<{ symbols: readonly WorkspaceSymbol[] }>);

export type SemanticResolutionResult =
  | Readonly<{
      status: 'resolved';
      reference: WorkspaceReferenceEdge;
      symbol: WorkspaceSymbol;
    }>
  | Readonly<{
      status: Exclude<SemanticStoredResolutionStatus, 'resolved'>;
      referenceId: string;
      reference?: WorkspaceReferenceEdge;
      candidateSymbolIds: readonly string[];
    }>
  | (SemanticStaleResult & Readonly<{ referenceId: string }>);

export type SemanticReferencesResult =
  | Readonly<{
      status: 'resolved';
      symbol: WorkspaceSymbol;
      references: readonly WorkspaceReferenceEdge[];
    }>
  | Readonly<{
      status: 'missing';
      symbolId: string;
      references: readonly WorkspaceReferenceEdge[];
    }>
  | (SemanticStaleResult &
      Readonly<{ references: readonly WorkspaceReferenceEdge[] }>);

export type SemanticImpact = Readonly<{
  rootSymbolIds: readonly string[];
  impactedSymbolIds: readonly string[];
  referenceIds: readonly string[];
  dependencyIds: readonly string[];
}>;

export type SemanticImpactResult =
  | Readonly<{ status: 'resolved'; impact: SemanticImpact }>
  | Readonly<{
      status: 'missing';
      missingSymbolIds: readonly string[];
    }>
  | SemanticStaleResult;

export type SemanticCompletion = Readonly<{
  label: string;
  symbolId: string;
  kind: WorkspaceSymbolKind;
  detail?: string;
}>;

export type SemanticCompletionsResult =
  | Readonly<{
      status: 'resolved';
      completions: readonly SemanticCompletion[];
    }>
  | Readonly<{
      status: 'missing';
      scopeId: string;
      completions: readonly SemanticCompletion[];
    }>
  | (SemanticStaleResult &
      Readonly<{ completions: readonly SemanticCompletion[] }>);

export type SemanticDiagnosticContribution = Readonly<{
  providerId: string;
  diagnostics: readonly ProdivixDiagnostic[];
}>;

export type SemanticDiagnosticsResult =
  | Readonly<{
      status: 'resolved';
      diagnostics: readonly ProdivixDiagnostic[];
      contributions: readonly SemanticDiagnosticContribution[];
    }>
  | (SemanticStaleResult &
      Readonly<{
        diagnostics: readonly ProdivixDiagnostic[];
        contributions: readonly SemanticDiagnosticContribution[];
      }>);

export type SemanticIndexBuildIssueCode =
  | 'invalid-provider-descriptor'
  | 'duplicate-provider-id'
  | 'provider-contribution-failed'
  | 'duplicate-scope-id'
  | 'duplicate-symbol-id'
  | 'duplicate-reference-id'
  | 'duplicate-dependency-id'
  | 'missing-parent-scope'
  | 'missing-imported-scope'
  | 'scope-cycle'
  | 'missing-symbol-scope'
  | 'missing-reference-scope'
  | 'missing-reference-source-symbol'
  | 'missing-dependency-source-symbol'
  | 'missing-dependency-target-symbol';

export type SemanticIndexBuildIssue = Readonly<{
  code: SemanticIndexBuildIssueCode;
  message: string;
  providerId?: string;
  factId?: string;
  relatedIds?: readonly string[];
  cause?: unknown;
}>;

export type WorkspaceSemanticIndex = Readonly<{
  snapshotIdentity: SemanticSnapshotIdentity;
  getScope(id: string): WorkspaceScope | null;
  getSymbol(id: string): WorkspaceSymbol | null;
  getReference(id: string): WorkspaceReferenceEdge | null;
  getDependency(id: string): WorkspaceDependencyEdge | null;
  queryVisibleSymbols(
    context: SemanticQueryContext
  ): SemanticVisibleSymbolsResult;
  resolveReference(
    referenceId: string,
    options?: SemanticQueryOptions
  ): SemanticResolutionResult;
  getDefinition(
    referenceId: string,
    options?: SemanticQueryOptions
  ): SemanticResolutionResult;
  getReferences(
    symbolId: string,
    options?: SemanticQueryOptions
  ): SemanticReferencesResult;
  getImpact(
    symbolIds: readonly string[],
    options?: SemanticQueryOptions
  ): SemanticImpactResult;
  getCompletions(context: SemanticQueryContext): SemanticCompletionsResult;
  getSemanticDiagnostics(
    options?: SemanticQueryOptions
  ): SemanticDiagnosticsResult;
}>;

export type CreateWorkspaceSemanticIndexInput = SemanticSnapshotRevision &
  Readonly<{
    providers: readonly SemanticContributionProvider[];
  }>;

export type SemanticIndexBuildResult =
  | Readonly<{ ok: true; index: WorkspaceSemanticIndex }>
  | Readonly<{ ok: false; issues: readonly SemanticIndexBuildIssue[] }>;
