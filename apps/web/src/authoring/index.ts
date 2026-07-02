export { createAuthoringDiagnosticProviderRegistry } from '@/authoring/authoringDiagnosticProviderRegistry';
export { createAuthoringEnvironment } from '@/authoring/createAuthoringEnvironment';
export { createCodeArtifactProviderRegistry } from '@/authoring/codeArtifactProviderRegistry';
export { createCodeSlotRegistry } from '@/authoring/codeSlotRegistry';
export { createCodeSymbolProviderRegistry } from '@/authoring/codeSymbolProviderRegistry';
export { createEmptyAuthoringEnvironment } from '@/authoring/createEmptyAuthoringEnvironment';
export { createWorkspaceCodeArtifactProvider } from '@/authoring/workspaceCodeArtifactProvider';
export { createRouteRuntimeCodeSlotProvider } from '@/authoring/routeRuntimeCodeSlotProvider';
export type { AuthoringDiagnosticProviderRegistry } from '@/authoring/authoringDiagnosticProviderRegistry';
export type { CreateAuthoringEnvironmentInput } from '@/authoring/createAuthoringEnvironment';
export type { CodeArtifactProviderRegistry } from '@/authoring/codeArtifactProviderRegistry';
export type { CodeSlotRegistry } from '@/authoring/codeSlotRegistry';
export type { CodeSymbolProviderRegistry } from '@/authoring/codeSymbolProviderRegistry';
export type {
  AuthoringContext,
  AuthoringDiagnosticProvider,
  AuthoringEnvironment,
  AuthoringSurface,
  CodeArtifact,
  CodeArtifactLanguage,
  CodeArtifactOwner,
  CodeArtifactProvider,
  CodeCompletion,
  CodeReference,
  CodeScope,
  CodeScopeKind,
  CodeSlotBinding,
  CodeSlotContract,
  CodeSlotKind,
  CodeSlotProvider,
  CodeSymbol,
  CodeSymbolKind,
  CodeSymbolProvider,
  DefinitionLocation,
  ReferenceLocation,
  ResolvedReference,
  ScopedSymbolReference,
  SymbolSource,
  TriggerBinding,
} from '@/authoring/authoring.types';
