import type {
  DiagnosticPlacement,
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';

export type CodeArtifactLanguage =
  'ts' | 'js' | 'css' | 'scss' | 'glsl' | 'wgsl' | 'expr';

export type CodeArtifactOwner =
  | { kind: 'pir-node'; documentId: string; nodeId: string }
  | {
      kind: 'inspector-field';
      documentId: string;
      nodeId: string;
      fieldPath: string;
    }
  | { kind: 'nodegraph-node'; documentId: string; nodeId: string }
  | {
      kind: 'nodegraph-port';
      documentId: string;
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
  | { kind: 'route'; routeId: string }
  | { kind: 'workspace-module'; documentId: string };

export type CodeArtifact = {
  id: string;
  path: string;
  language: CodeArtifactLanguage;
  owner: CodeArtifactOwner;
  source: string;
  revision: string;
};

export type AuthoringSource =
  | { kind: 'pir'; documentId: string }
  | { kind: 'route'; routeId: string }
  | { kind: 'nodegraph'; documentId: string }
  | { kind: 'animation'; timelineId?: string }
  | { kind: 'external-library'; libraryId: string }
  | { kind: 'workspace'; documentId?: string }
  | { kind: 'code'; artifactId: string };

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

export type CodeReference = {
  artifactId: string;
  exportName?: string;
  symbolId?: string;
  sourceSpan?: SourceSpan;
};

export type CodeArtifactProvider = {
  id: string;
  source: AuthoringSource;
  listArtifacts(context: AuthoringContext): CodeArtifact[];
  getArtifact(id: string): CodeArtifact | null;
};

export type AuthoringDiagnosticProvider = {
  id: string;
  source: AuthoringSource;
  getDiagnostics(context: AuthoringContext): ProdivixDiagnostic[];
};

export type CodeSlotKind =
  | 'event-handler'
  | 'validator'
  | 'node-executor'
  | 'animation-function'
  | 'animation-script'
  | 'shader'
  | 'external-adapter'
  | 'mounted-css'
  | 'route-loader'
  | 'route-action'
  | 'route-guard'
  | 'route-runtime'
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
  source: AuthoringSource;
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
  listBindingProjections(
    context: AuthoringContext
  ): CodeSlotBindingProjection[];
  getBindingProjection(id: string): CodeSlotBindingProjection | null;
};

export type CodeSlotBinding = {
  slotId: string;
  reference: CodeReference;
};

/**
 * Read-only bridge from a domain-owned binding to its revision-bound semantic
 * reference. The domain document remains the persisted owner of the binding.
 */
export type CodeSlotBindingProjection = Readonly<{
  binding: CodeSlotBinding;
  ownerRef: DiagnosticTargetRef;
  semanticReferenceId: string;
}>;

export type TriggerBinding =
  | { kind: 'open-url'; href: string }
  | { kind: 'navigate-route'; routeId: string }
  | { kind: 'run-nodegraph'; documentId: string; inputMapping?: unknown }
  | {
      kind: 'play-animation';
      documentId: string;
      timelineId: string;
      command: 'play' | 'pause' | 'seek';
    }
  | { kind: 'call-code'; slotId: string; reference: CodeReference };
