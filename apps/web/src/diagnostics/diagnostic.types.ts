export type ProdivixDiagnosticSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type ProdivixDiagnosticDomain =
  | 'pir'
  | 'workspace'
  | 'plugin'
  | 'route'
  | 'editor'
  | 'ux'
  | 'code'
  | 'nodegraph'
  | 'animation'
  | 'codegen'
  | 'backend'
  | 'ai';

export type DiagnosticTargetRef =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'document'; workspaceId?: string; documentId: string }
  | { kind: 'pir-node'; documentId: string; nodeId: string }
  | {
      kind: 'inspector-field';
      documentId: string;
      nodeId: string;
      fieldPath: string;
    }
  | { kind: 'route'; routeId: string }
  | { kind: 'nodegraph-node'; graphId: string; nodeId: string }
  | {
      kind: 'nodegraph-port';
      graphId: string;
      nodeId: string;
      portId: string;
    }
  | { kind: 'animation-track'; timelineId: string; trackId: string }
  | { kind: 'code-artifact'; artifactId: string }
  | { kind: 'operation'; operation: string }
  | { kind: 'theme-token'; themeId: string; tokenPath: string }
  | { kind: 'viewport'; routeId?: string; width: number; height: number }
  | { kind: 'runtime-dom'; routeId?: string; stablePath: string }
  | { kind: 'component-slot'; nodeId: string; slotName: string };

export type SourceSpan = {
  artifactId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type ProdivixDiagnostic = {
  code: string;
  severity: ProdivixDiagnosticSeverity;
  domain: ProdivixDiagnosticDomain;
  message: string;
  hint?: string;
  docsUrl?: string;
  retryable?: boolean;
  cause?: unknown;
  meta?: Record<string, unknown>;
  targetRef?: DiagnosticTargetRef;
  sourceSpan?: SourceSpan;
};

export type DiagnosticSurface =
  | 'issues-panel'
  | 'code-editor-inline'
  | 'inspector-field'
  | 'blueprint-canvas'
  | 'nodegraph'
  | 'animation-timeline'
  | 'preview-overlay'
  | 'operation-status'
  | 'export-gate'
  | 'api-error-detail';

export type DiagnosticLocationPreference =
  | 'target'
  | 'source'
  | 'target-then-source'
  | 'source-then-target'
  | 'operation';

export type DiagnosticPresentationLocationKind =
  DiagnosticTargetRef['kind'] | 'source-span';

export type DiagnosticLocationPresentation = {
  id: string;
  role: 'primary' | 'secondary' | 'related';
  label: string;
  kind: DiagnosticPresentationLocationKind;
  ref?: DiagnosticTargetRef;
  sourceSpan?: SourceSpan;
  canNavigate: boolean;
};

export type DiagnosticTemplateVariable = {
  name: string;
  source:
    | { kind: 'diagnostic'; path: string }
    | { kind: 'definition'; path: string }
    | { kind: 'location'; path: string }
    | { kind: 'meta'; path: string };
  fallback?: string;
  format?: 'plain' | 'code' | 'number' | 'ratio' | 'color' | 'path';
};

export type DiagnosticMessageTemplate = {
  defaultText: string;
  i18nKey?: string;
  variables?: DiagnosticTemplateVariable[];
};

export type DiagnosticActionKind =
  | 'navigate'
  | 'open-docs'
  | 'retry'
  | 'apply-fix'
  | 'acknowledge'
  | 'create-exemption'
  | 'copy-report'
  | 'open-related';

export type DiagnosticActionRequirement =
  | 'targetRef'
  | 'sourceSpan'
  | 'docsUrl'
  | 'retryable'
  | 'quickFix'
  | 'exemptable'
  | 'relatedDiagnostics';

export type DiagnosticActionTemplate = {
  id: string;
  kind: DiagnosticActionKind;
  labelKey?: string;
  labelFallback: string;
  requires?: DiagnosticActionRequirement[];
  placement?: 'primary' | 'secondary' | 'overflow';
};

export type DiagnosticActionPresentation = {
  id: string;
  kind: DiagnosticActionKind;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  placement: 'primary' | 'secondary' | 'overflow';
  payload: Record<string, unknown>;
};

export type DiagnosticEvidenceTemplate = {
  id: string;
  labelKey?: string;
  labelFallback: string;
  source:
    | { kind: 'meta'; path: string }
    | { kind: 'upstream'; path: string }
    | { kind: 'diagnostic'; path: string }
    | { kind: 'location'; path: string };
  format?: 'plain' | 'code' | 'number' | 'ratio' | 'color' | 'list' | 'json';
  redaction?: 'none' | 'summary' | 'hash' | 'hidden';
};

export type DiagnosticEvidencePresentation = {
  id: string;
  label: string;
  value: string;
  format: 'plain' | 'code' | 'number' | 'ratio' | 'color' | 'list' | 'json';
  sensitive?: boolean;
};

export type DiagnosticDetailSectionKind =
  | 'what-happened'
  | 'how-to-fix'
  | 'location'
  | 'evidence'
  | 'upstream'
  | 'related-diagnostics'
  | 'host-contract'
  | 'standard-reference'
  | 'developer-details'
  | 'reporting';

export type DiagnosticDetailSectionTemplate = {
  id: string;
  kind: DiagnosticDetailSectionKind;
  titleKey?: string;
  titleFallback: string;
  visibleWhen?: DiagnosticActionRequirement[];
};

export type DiagnosticDetailSectionPresentation = {
  id: string;
  kind: DiagnosticDetailSectionKind;
  title: string;
  visible: boolean;
};

export type DiagnosticPresentationTemplate = {
  code?: string;
  titleKey?: string;
  titleFallback: string;
  summaryTemplate: DiagnosticMessageTemplate;
  detailTemplate?: DiagnosticMessageTemplate;
  primaryLocation?: DiagnosticLocationPreference;
  evidence?: DiagnosticEvidenceTemplate[];
  sections?: DiagnosticDetailSectionTemplate[];
  actions?: DiagnosticActionTemplate[];
};

export type DiagnosticPresentation = {
  code: string;
  title: string;
  summary: string;
  detail?: string;
  severity: ProdivixDiagnosticSeverity;
  domain: ProdivixDiagnosticDomain;
  locations: DiagnosticLocationPresentation[];
  evidence: DiagnosticEvidencePresentation[];
  sections: DiagnosticDetailSectionPresentation[];
  actions: DiagnosticActionPresentation[];
  docsUrl?: string;
};

export type UpstreamDiagnostic = {
  source: 'typescript' | 'eslint' | 'css' | 'scss' | 'glsl' | 'wgsl';
  code?: string | number;
  severity?: 'info' | 'warning' | 'error';
  message: string;
  sourceSpan?: SourceSpan;
  docsUrl?: string;
};

export type UxStandardRef = {
  standard: 'WCAG' | 'WAI-ARIA' | 'HTML' | 'axe' | 'Lighthouse' | 'internal';
  version?: string;
  criterion?: string;
  ruleId?: string;
  level?: 'A' | 'AA' | 'AAA';
};

export type UxDiagnosticEvidence = {
  viewport?: { width: number; height: number; device?: string };
  themeId?: string;
  tokenPaths?: string[];
  computedStyle?: Record<string, string | number>;
  foreground?: string;
  background?: string;
  contrastRatio?: number;
  requiredRatio?: number;
  domPath?: string;
  role?: string;
  accessibleName?: string;
  focusOrder?: string[];
  boundingBox?: { x: number; y: number; width: number; height: number };
  missingEvidence?: string[];
};

export type UxDiagnosticMeta = Record<string, unknown> & {
  standardRef?: UxStandardRef[];
  evidence?: UxDiagnosticEvidence;
};

export type UxDiagnostic = ProdivixDiagnostic & {
  code: `UX-${number}`;
  domain: 'ux';
  meta?: UxDiagnosticMeta;
};

export type CreateDiagnosticInput = Omit<ProdivixDiagnostic, 'retryable'> & {
  retryable?: boolean;
};
