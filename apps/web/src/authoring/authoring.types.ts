import type {
  DiagnosticPlacement,
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@/diagnostics';
import type { WorkspaceCodeDocumentLanguage } from '@/workspace/types';

export type CodeArtifactLanguage = WorkspaceCodeDocumentLanguage;

export type CodeArtifactOwner =
  | { kind: 'pir-node'; documentId: string; nodeId: string }
  | {
      kind: 'inspector-field';
      documentId: string;
      nodeId: string;
      fieldPath: string;
    }
  | { kind: 'nodegraph-node'; graphId: string; nodeId: string }
  | {
      kind: 'nodegraph-port';
      graphId: string;
      nodeId: string;
      portId: string;
    }
  | { kind: 'animation-track'; timelineId: string; trackId: string }
  | {
      kind: 'animation-keyframe';
      timelineId: string;
      trackId: string;
      keyframeId: string;
    }
  | { kind: 'workspace-module'; documentId: string };

export type CodeArtifact = {
  id: string;
  path: string;
  language: CodeArtifactLanguage;
  owner: CodeArtifactOwner;
  source: string;
  revision: string;
};

export type SymbolSource =
  | { kind: 'pir'; documentId: string }
  | { kind: 'route'; routeId: string }
  | { kind: 'nodegraph'; graphId: string }
  | { kind: 'animation'; timelineId?: string }
  | { kind: 'external-library'; libraryId: string }
  | { kind: 'workspace'; documentId?: string }
  | { kind: 'code'; artifactId: string };

export type CodeSymbolKind =
  | 'state'
  | 'param'
  | 'data'
  | 'item'
  | 'node'
  | 'prop'
  | 'event'
  | 'route'
  | 'graph'
  | 'graph-input'
  | 'graph-output'
  | 'timeline'
  | 'track'
  | 'filter-primitive'
  | 'component'
  | 'module'
  | 'asset'
  | 'function';

export type CodeSymbol = {
  id: string;
  name: string;
  kind: CodeSymbolKind;
  typeRef?: string;
  source: SymbolSource;
  scopeId: string;
  targetRef?: DiagnosticTargetRef;
};

export type CodeScopeKind =
  | 'workspace'
  | 'document'
  | 'route'
  | 'pir-node'
  | 'list-item'
  | 'inspector-field'
  | 'nodegraph'
  | 'nodegraph-node'
  | 'animation'
  | 'code-artifact';

export type CodeScope = {
  id: string;
  parentId?: string;
  kind: CodeScopeKind;
  ownerRef: DiagnosticTargetRef;
};

export type AuthoringSurface =
  | 'code-editor'
  | 'inspector'
  | 'blueprint-canvas'
  | 'nodegraph'
  | 'animation-timeline'
  | 'issues-panel';

export type AuthoringContext = {
  surface: AuthoringSurface;
  artifactId?: string;
  targetRef?: DiagnosticTargetRef;
  scopeId?: string;
};

export type ScopedSymbolReference = {
  name: string;
  scopeId?: string;
};

export type CodeReference = {
  artifactId: string;
  exportName?: string;
  symbolName?: string;
  sourceSpan?: SourceSpan;
};

export type ResolvedReference = {
  symbol: CodeSymbol;
};

export type CodeCompletion = {
  label: string;
  symbolId?: string;
  detail?: string;
};

export type DefinitionLocation = {
  targetRef?: DiagnosticTargetRef;
  artifactId?: string;
};

export type ReferenceLocation = {
  targetRef?: DiagnosticTargetRef;
  artifactId?: string;
};

export type AuthoringEnvironment = {
  revision: string;
  listArtifacts(context: AuthoringContext): CodeArtifact[];
  querySymbols(context: AuthoringContext): CodeSymbol[];
  resolveReference(
    reference: CodeReference,
    context: AuthoringContext
  ): ResolvedReference | null;
  getCompletions(context: AuthoringContext): CodeCompletion[];
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
  getDefinition(
    reference: CodeReference,
    context: AuthoringContext
  ): DefinitionLocation | null;
  getReferences(
    symbolId: string,
    context?: AuthoringContext
  ): ReferenceLocation[];
};

export type CodeArtifactProvider = {
  id: string;
  source: SymbolSource;
  listArtifacts(context: AuthoringContext): CodeArtifact[];
  getArtifact(id: string): CodeArtifact | null;
};

export type CodeSymbolProvider = {
  id: string;
  source: SymbolSource;
  listSymbols(context: AuthoringContext): CodeSymbol[];
  listScopes(context: AuthoringContext): CodeScope[];
  getSymbol(id: string): CodeSymbol | null;
};

export type AuthoringDiagnosticProvider = {
  id: string;
  source: SymbolSource;
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
};

export type CodeSlotKind =
  | 'event-handler'
  | 'validator'
  | 'node-executor'
  | 'animation-function'
  | 'external-adapter'
  | 'mounted-css'
  | 'workspace-module';

export type CodeSlotContract = {
  id: string;
  ownerRef: DiagnosticTargetRef;
  kind: CodeSlotKind;
  inputTypeRef?: string;
  outputTypeRef?: string;
  capabilityIds: string[];
  defaultPlacement: DiagnosticPlacement[];
};

export type CodeSlotProvider = {
  id: string;
  source: SymbolSource;
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
};

export type CodeSlotBinding = {
  slotId: string;
  reference: CodeReference;
};

export type TriggerBinding =
  | { kind: 'open-url'; href: string }
  | { kind: 'navigate-route'; routeId: string }
  | { kind: 'run-nodegraph'; graphId: string; inputMapping?: unknown }
  | {
      kind: 'play-animation';
      timelineId: string;
      command: 'play' | 'pause' | 'seek';
    }
  | { kind: 'call-code'; slotId: string; reference: CodeReference };
