import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';
import type { CodeArtifact, CodeArtifactLanguage } from '../authoring.types';
import type {
  SemanticContribution,
  SemanticProviderDescriptor,
  SemanticSnapshotIdentity,
} from '../semantic/semantic.types';

export const CODE_LANGUAGE_CAPABILITIES = Object.freeze([
  'definition',
  'references',
  'completion',
  'diagnostics',
  'rename',
  'hover',
  'semantic-contribution',
] as const);

export type CodeLanguageCapability =
  (typeof CODE_LANGUAGE_CAPABILITIES)[number];

export type CodeLanguageSnapshot = Readonly<{
  identity: SemanticSnapshotIdentity;
  artifacts: readonly CodeArtifact[];
}>;

export type CodeLanguageSnapshotIdentity = Readonly<{
  semanticSnapshotIdentity: SemanticSnapshotIdentity;
  artifactRevisions: Readonly<Record<string, string>>;
}>;

/** A one-based UTF-16 position in one CodeArtifact. */
export type CodeLanguagePosition = Readonly<{
  artifactId: string;
  line: number;
  column: number;
}>;

export type CodeLanguageLocation = Readonly<{
  targetRef: DiagnosticTargetRef;
  sourceSpan: SourceSpan;
  symbolId?: string;
  referenceId?: string;
}>;

export type CodeLanguageTextEdit = Readonly<{
  artifactId: string;
  expectedRevision: string;
  sourceSpan: SourceSpan;
  newText: string;
}>;

export type CodeLanguageWorkspaceEditProposal = Readonly<{
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  edits: readonly CodeLanguageTextEdit[];
}>;

export type CodeLanguageCompletionKind =
  'symbol' | 'keyword' | 'snippet' | 'path';

export type CodeLanguageMarkupContent = Readonly<{
  format: 'plaintext' | 'markdown';
  value: string;
}>;

export type CodeLanguageCompletion = Readonly<{
  label: string;
  kind: CodeLanguageCompletionKind;
  detail?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  symbolId?: string;
  documentation?: CodeLanguageMarkupContent;
  textEdit?: CodeLanguageTextEdit;
}>;

export type CodeLanguageHover = Readonly<{
  contents: readonly CodeLanguageMarkupContent[];
  sourceSpan?: SourceSpan;
  symbolId?: string;
}>;

export type CodeLanguagePrepareRename = Readonly<{
  sourceSpan: SourceSpan;
  placeholder: string;
  symbolId?: string;
}>;

export type CodeLanguageResolvedResult<Value> = Readonly<{
  status: 'resolved';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  value: Value;
}>;

export type CodeLanguageMissingResult = Readonly<{
  status: 'missing';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
}>;

export type CodeLanguageUnsupportedResult = Readonly<{
  status: 'unsupported';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  capability: CodeLanguageCapability;
}>;

export type CodeLanguageStaleResult = Readonly<{
  status: 'stale';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  expectedSnapshotIdentity: CodeLanguageSnapshotIdentity;
}>;

export type CodeLanguageUnavailableResult = Readonly<{
  status: 'unavailable';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  reason?: string;
  diagnostics?: readonly ProdivixDiagnostic[];
}>;

export type CodeLanguageResult<Value> =
  | CodeLanguageResolvedResult<Value>
  | CodeLanguageMissingResult
  | CodeLanguageUnsupportedResult
  | CodeLanguageStaleResult
  | CodeLanguageUnavailableResult;

export type CodeLanguageSnapshotRequest = Readonly<{
  expectedSnapshotIdentity: CodeLanguageSnapshotIdentity;
}>;

export type CodeLanguagePositionRequest = CodeLanguageSnapshotRequest &
  Readonly<{
    position: CodeLanguagePosition;
  }>;

export type CodeLanguageDefinitionRequest = CodeLanguagePositionRequest;

export type CodeLanguageReferencesRequest = CodeLanguagePositionRequest &
  Readonly<{
    includeDeclaration?: boolean;
  }>;

export type CodeLanguageCompletionRequest = CodeLanguagePositionRequest &
  Readonly<{
    trigger?: Readonly<{
      kind: 'invoked' | 'character' | 'incomplete';
      character?: string;
    }>;
  }>;

export type CodeLanguageDiagnosticsRequest = CodeLanguageSnapshotRequest &
  Readonly<{
    artifactId?: string;
  }>;

export type CodeLanguagePrepareRenameRequest = CodeLanguagePositionRequest;

export type CodeLanguageRenameRequest = CodeLanguagePositionRequest &
  Readonly<{
    newName: string;
  }>;

export type CodeLanguageHoverRequest = CodeLanguagePositionRequest;

export type CodeLanguageSemanticContributionRequest =
  CodeLanguageSnapshotRequest;

export type CodeLanguageDefinitionResult = CodeLanguageResult<
  readonly CodeLanguageLocation[]
>;
export type CodeLanguageReferencesResult = CodeLanguageResult<
  readonly CodeLanguageLocation[]
>;
export type CodeLanguageCompletionsResult = CodeLanguageResult<
  readonly CodeLanguageCompletion[]
>;
export type CodeLanguageDiagnosticsResult = CodeLanguageResult<
  readonly ProdivixDiagnostic[]
>;
export type CodeLanguagePrepareRenameResult =
  CodeLanguageResult<CodeLanguagePrepareRename>;
export type CodeLanguageRenameResult =
  CodeLanguageResult<CodeLanguageWorkspaceEditProposal>;
export type CodeLanguageHoverResult = CodeLanguageResult<CodeLanguageHover>;
export type CodeLanguageSemanticContributionResult =
  CodeLanguageResult<SemanticContribution>;

export type CodeLanguageProviderDescriptor = SemanticProviderDescriptor &
  Readonly<{
    languageIds: readonly CodeArtifactLanguage[];
    capabilities: readonly CodeLanguageCapability[];
  }>;

/**
 * A session is an immutable view of one language snapshot. Implementations may
 * keep an incremental engine behind it, but every result remains tagged with
 * this session's identity and calls after dispose must be rejected.
 */
export type CodeLanguageSession = Readonly<{
  descriptor: CodeLanguageProviderDescriptor;
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  getDefinition(
    request: CodeLanguageDefinitionRequest
  ): Promise<CodeLanguageDefinitionResult>;
  getReferences(
    request: CodeLanguageReferencesRequest
  ): Promise<CodeLanguageReferencesResult>;
  getCompletions(
    request: CodeLanguageCompletionRequest
  ): Promise<CodeLanguageCompletionsResult>;
  getDiagnostics(
    request: CodeLanguageDiagnosticsRequest
  ): Promise<CodeLanguageDiagnosticsResult>;
  prepareRename(
    request: CodeLanguagePrepareRenameRequest
  ): Promise<CodeLanguagePrepareRenameResult>;
  getRenameEdits(
    request: CodeLanguageRenameRequest
  ): Promise<CodeLanguageRenameResult>;
  getHover(request: CodeLanguageHoverRequest): Promise<CodeLanguageHoverResult>;
  getSemanticContribution(
    request: CodeLanguageSemanticContributionRequest
  ): Promise<CodeLanguageSemanticContributionResult>;
  dispose(): void;
}>;

export type CodeLanguageCapabilityProvider = Readonly<{
  descriptor: CodeLanguageProviderDescriptor;
  openSession(snapshot: CodeLanguageSnapshot): Promise<CodeLanguageSession>;
}>;
