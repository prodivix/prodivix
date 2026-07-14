import type { DiagnosticDefinition } from './diagnosticRegistry';
import type {
  DiagnosticActionPresentation,
  DiagnosticActionRequirement,
  DiagnosticActionTemplate,
  DiagnosticEvidencePresentation,
  DiagnosticEvidenceTemplate,
  DiagnosticLocationPresentation,
  DiagnosticMessageTemplate,
  DiagnosticPresentation,
  DiagnosticPresentationTemplate,
  DiagnosticSurface,
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from './diagnostic.types';

type BuildDiagnosticPresentationInput = {
  diagnostic: ProdivixDiagnostic;
  definition?: DiagnosticDefinition;
  template?: DiagnosticPresentationTemplate;
  surface?: DiagnosticSurface;
  resolver?: Partial<DiagnosticPresentationResolver>;
};

export type DiagnosticPresentationResolver = {
  resolveLocation(
    targetRef?: DiagnosticTargetRef,
    sourceSpan?: SourceSpan
  ): DiagnosticLocationPresentation[];
  resolveActions(input: {
    diagnostic: ProdivixDiagnostic;
    template: DiagnosticPresentationTemplate;
    locations: DiagnosticLocationPresentation[];
    surface: DiagnosticSurface;
  }): DiagnosticActionPresentation[];
  formatEvidence(input: {
    diagnostic: ProdivixDiagnostic;
    template: DiagnosticPresentationTemplate;
  }): DiagnosticEvidencePresentation[];
};

const DEFAULT_SURFACE: DiagnosticSurface = 'issues-panel';

const getPathValue = (source: unknown, path: string): unknown => {
  if (!path) return source;

  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current !== 'object') return undefined;

    return (current as Record<string, unknown>)[segment];
  }, source);
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  return JSON.stringify(value);
};

const interpolateMessage = (
  template: DiagnosticMessageTemplate,
  diagnostic: ProdivixDiagnostic,
  definition?: DiagnosticDefinition,
  locations: DiagnosticLocationPresentation[] = []
): string => {
  if (!template.variables?.length) return template.defaultText;

  return template.variables.reduce((message, variable) => {
    const source =
      variable.source.kind === 'diagnostic'
        ? diagnostic
        : variable.source.kind === 'definition'
          ? definition
          : variable.source.kind === 'location'
            ? locations
            : diagnostic.meta;
    const value =
      getPathValue(source, variable.source.path) ?? variable.fallback ?? '';

    return message.replaceAll(`{${variable.name}}`, formatValue(value));
  }, template.defaultText);
};

const labelForTargetRef = (targetRef: DiagnosticTargetRef): string => {
  switch (targetRef.kind) {
    case 'workspace':
      return `Workspace ${targetRef.workspaceId}`;
    case 'workspace-node':
      return `Workspace node ${targetRef.nodeId}`;
    case 'document':
      return `Document ${targetRef.documentId}`;
    case 'pir-node':
      return `Node ${targetRef.nodeId}`;
    case 'inspector-field':
      return `Field ${targetRef.fieldPath}`;
    case 'route':
      return `Route ${targetRef.routeId}`;
    case 'nodegraph-node':
      return `NodeGraph node ${targetRef.nodeId}`;
    case 'nodegraph-port':
      return `NodeGraph port ${targetRef.portId}`;
    case 'animation-timeline':
      return `Animation timeline ${targetRef.timelineId}`;
    case 'animation-track':
      return `Animation track ${targetRef.trackId}`;
    case 'code-artifact':
      return `Code artifact ${targetRef.artifactId}`;
    case 'operation':
      return `Operation ${targetRef.operation}`;
    case 'theme-token':
      return `Theme token ${targetRef.tokenPath}`;
    case 'viewport':
      return `Viewport ${targetRef.width}x${targetRef.height}`;
    case 'runtime-dom':
      return `Runtime DOM ${targetRef.stablePath}`;
    case 'component-slot':
      return `Component slot ${targetRef.slotName}`;
  }
};

const defaultResolveLocation = (
  targetRef?: DiagnosticTargetRef,
  sourceSpan?: SourceSpan
): DiagnosticLocationPresentation[] => {
  const locations: DiagnosticLocationPresentation[] = [];

  if (targetRef) {
    locations.push({
      id: 'target',
      role: 'primary',
      label: labelForTargetRef(targetRef),
      kind: targetRef.kind,
      ref: targetRef,
      canNavigate: true,
    });
  }

  if (sourceSpan) {
    locations.push({
      id: 'source',
      role: locations.length === 0 ? 'primary' : 'secondary',
      label: `Code ${sourceSpan.artifactId}:${sourceSpan.startLine}:${sourceSpan.startColumn}`,
      kind: 'source-span',
      sourceSpan,
      canNavigate: true,
    });
  }

  return locations;
};

const hasRequirement = (
  requirement: DiagnosticActionRequirement,
  diagnostic: ProdivixDiagnostic,
  locations: DiagnosticLocationPresentation[]
): boolean => {
  switch (requirement) {
    case 'targetRef':
      return Boolean(diagnostic.targetRef);
    case 'sourceSpan':
      return Boolean(diagnostic.sourceSpan);
    case 'docsUrl':
      return Boolean(diagnostic.docsUrl);
    case 'retryable':
      return diagnostic.retryable === true;
    case 'quickFix':
      return Boolean(diagnostic.quickFixes?.length);
    case 'exemptable':
      return diagnostic.domain === 'ux';
    case 'relatedDiagnostics':
      return Boolean(getPathValue(diagnostic.meta, 'relatedDiagnostics'));
    default:
      return locations.length > 0;
  }
};

const defaultResolveActions = ({
  diagnostic,
  template,
  locations,
}: {
  diagnostic: ProdivixDiagnostic;
  template: DiagnosticPresentationTemplate;
  locations: DiagnosticLocationPresentation[];
  surface: DiagnosticSurface;
}): DiagnosticActionPresentation[] =>
  (template.actions ?? []).map((action) => {
    const enabled = (action.requires ?? []).every((requirement) =>
      hasRequirement(requirement, diagnostic, locations)
    );

    return {
      id: action.id,
      kind: action.kind,
      label: action.labelFallback,
      enabled,
      disabledReason: enabled
        ? undefined
        : 'Required diagnostic context is missing.',
      placement: action.placement ?? 'secondary',
      payload: {
        code: diagnostic.code,
        docsUrl: diagnostic.docsUrl,
        targetRef: diagnostic.targetRef,
        sourceSpan: diagnostic.sourceSpan,
        quickFixes: diagnostic.quickFixes,
      },
    };
  });

const readEvidenceValue = (
  diagnostic: ProdivixDiagnostic,
  evidence: DiagnosticEvidenceTemplate
): unknown => {
  if (evidence.source.kind === 'diagnostic') {
    return getPathValue(diagnostic, evidence.source.path);
  }

  if (evidence.source.kind === 'meta') {
    return getPathValue(diagnostic.meta, evidence.source.path);
  }

  if (evidence.source.kind === 'upstream') {
    return getPathValue(diagnostic.meta, `upstream.${evidence.source.path}`);
  }

  return undefined;
};

const defaultFormatEvidence = ({
  diagnostic,
  template,
}: {
  diagnostic: ProdivixDiagnostic;
  template: DiagnosticPresentationTemplate;
}): DiagnosticEvidencePresentation[] =>
  (template.evidence ?? []).flatMap((evidence) => {
    if (evidence.redaction === 'hidden') return [];

    const value = readEvidenceValue(diagnostic, evidence);
    if (value === undefined || value === null || value === '') return [];

    return [
      {
        id: evidence.id,
        label: evidence.labelFallback,
        value: formatValue(value),
        format: evidence.format ?? 'plain',
        sensitive:
          evidence.redaction !== undefined && evidence.redaction !== 'none',
      },
    ];
  });

const DEFAULT_ACTIONS: DiagnosticActionTemplate[] = [
  {
    id: 'apply-fix',
    kind: 'apply-fix',
    labelFallback: 'Apply fix',
    requires: ['quickFix'],
    placement: 'primary',
  },
  {
    id: 'open-target',
    kind: 'navigate',
    labelFallback: 'Open target',
    requires: ['targetRef'],
    placement: 'primary',
  },
  {
    id: 'open-source',
    kind: 'navigate',
    labelFallback: 'Open source',
    requires: ['sourceSpan'],
    placement: 'primary',
  },
  {
    id: 'open-docs',
    kind: 'open-docs',
    labelFallback: 'Open docs',
    requires: ['docsUrl'],
    placement: 'overflow',
  },
];

export const createDefaultDiagnosticPresentationTemplate = (
  definition?: DiagnosticDefinition
): DiagnosticPresentationTemplate => ({
  code: definition?.code,
  titleFallback: definition?.code ?? 'Diagnostic',
  summaryTemplate: {
    defaultText: '{message}',
    variables: [
      {
        name: 'message',
        source: { kind: 'diagnostic', path: 'message' },
        fallback: definition?.code ?? 'Diagnostic',
      },
    ],
  },
  detailTemplate: {
    defaultText: '{hint}',
    variables: [
      {
        name: 'hint',
        source: { kind: 'diagnostic', path: 'hint' },
        fallback: '',
      },
    ],
  },
  primaryLocation:
    definition?.domain === 'code'
      ? 'source-then-target'
      : definition?.domain === 'ux'
        ? 'target-then-source'
        : 'target',
  actions: DEFAULT_ACTIONS,
});

export const buildDiagnosticPresentation = ({
  diagnostic,
  definition,
  template = definition?.presentation ??
    createDefaultDiagnosticPresentationTemplate(definition),
  surface = DEFAULT_SURFACE,
  resolver,
}: BuildDiagnosticPresentationInput): DiagnosticPresentation => {
  const resolveLocation = resolver?.resolveLocation ?? defaultResolveLocation;
  const locations = resolveLocation(
    diagnostic.targetRef,
    diagnostic.sourceSpan
  );
  const formatEvidence = resolver?.formatEvidence ?? defaultFormatEvidence;
  const resolveActions = resolver?.resolveActions ?? defaultResolveActions;

  const detail = template.detailTemplate
    ? interpolateMessage(
        template.detailTemplate,
        diagnostic,
        definition,
        locations
      )
    : diagnostic.hint;

  return {
    code: diagnostic.code,
    title: template.titleFallback,
    summary: interpolateMessage(
      template.summaryTemplate,
      diagnostic,
      definition,
      locations
    ),
    detail: detail || undefined,
    severity: diagnostic.severity,
    domain: diagnostic.domain,
    locations,
    evidence: formatEvidence({ diagnostic, template }),
    sections: (template.sections ?? []).map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.titleFallback,
      visible: (section.visibleWhen ?? []).every((requirement) =>
        hasRequirement(requirement, diagnostic, locations)
      ),
    })),
    actions: resolveActions({ diagnostic, template, locations, surface }),
    docsUrl: diagnostic.docsUrl ?? definition?.docsUrl,
  };
};
