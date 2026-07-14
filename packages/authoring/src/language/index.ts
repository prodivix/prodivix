export {
  createCodeLanguageSnapshotIdentity,
  createCodeLanguageSnapshotKey,
  isSameCodeLanguageSnapshotIdentity,
} from './codeLanguageSnapshotIdentity';
export { createCodeLanguageProviderRegistry } from './codeLanguageProviderRegistry';
export {
  createCodeSourceSpanFromOffsets,
  resolveCodeSourceSpanOffsets,
} from './codeSourceSpan';
export { CODE_LANGUAGE_CAPABILITIES } from './codeLanguage.types';
export type { CodeLanguageProviderRegistry } from './codeLanguageProviderRegistry';
export type { CodeLanguageOffsetRange } from './codeSourceSpan';
export type {
  CodeLanguageCapability,
  CodeLanguageCapabilityProvider,
  CodeLanguageCompletion,
  CodeLanguageCompletionKind,
  CodeLanguageCompletionRequest,
  CodeLanguageCompletionsResult,
  CodeLanguageDefinitionRequest,
  CodeLanguageDefinitionResult,
  CodeLanguageDiagnosticsRequest,
  CodeLanguageDiagnosticsResult,
  CodeLanguageHover,
  CodeLanguageHoverRequest,
  CodeLanguageHoverResult,
  CodeLanguageLocation,
  CodeLanguageMarkupContent,
  CodeLanguageMissingResult,
  CodeLanguagePosition,
  CodeLanguagePositionRequest,
  CodeLanguagePrepareRename,
  CodeLanguagePrepareRenameRequest,
  CodeLanguagePrepareRenameResult,
  CodeLanguageProviderDescriptor,
  CodeLanguageReferencesRequest,
  CodeLanguageReferencesResult,
  CodeLanguageRenameRequest,
  CodeLanguageRenameResult,
  CodeLanguageResolvedResult,
  CodeLanguageResult,
  CodeLanguageSemanticContributionRequest,
  CodeLanguageSemanticContributionResult,
  CodeLanguageSession,
  CodeLanguageSnapshot,
  CodeLanguageSnapshotIdentity,
  CodeLanguageSnapshotRequest,
  CodeLanguageStaleResult,
  CodeLanguageTextEdit,
  CodeLanguageUnavailableResult,
  CodeLanguageUnsupportedResult,
  CodeLanguageWorkspaceEditProposal,
} from './codeLanguage.types';
