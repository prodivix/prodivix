import type {
  DiagnosticActionTemplate,
  DiagnosticEvidenceTemplate,
  DiagnosticLocationPreference,
  DiagnosticPresentationTemplate,
  ProdivixDiagnosticDomain,
  ProdivixDiagnosticSeverity,
} from './diagnostic.types';

export type { ProdivixDiagnosticSeverity } from './diagnostic.types';

export type DiagnosticRegistryEntry = {
  code: string;
  domain: ProdivixDiagnosticDomain;
  severity: ProdivixDiagnosticSeverity;
  docsUrl?: string;
};

export type DiagnosticPlacement =
  | 'code-editor'
  | 'inspector'
  | 'blueprint-canvas'
  | 'nodegraph'
  | 'animation-timeline'
  | 'issues-panel'
  | 'operation-status';

export type DiagnosticDefinition = DiagnosticRegistryEntry & {
  stage: string;
  retryable: boolean;
  docsPath: string;
  defaultPlacement?: DiagnosticPlacement[];
  presentation?: DiagnosticPresentationTemplate;
};

export const openTargetAction: DiagnosticActionTemplate = {
  id: 'open-target',
  kind: 'navigate',
  labelFallback: 'Open target',
  requires: ['targetRef'],
  placement: 'primary',
};

export const openSourceAction: DiagnosticActionTemplate = {
  id: 'open-source',
  kind: 'navigate',
  labelFallback: 'Open source',
  requires: ['sourceSpan'],
  placement: 'primary',
};

export const openDocsAction: DiagnosticActionTemplate = {
  id: 'open-docs',
  kind: 'open-docs',
  labelFallback: 'Open docs',
  requires: ['docsUrl'],
  placement: 'overflow',
};

export const retryAction: DiagnosticActionTemplate = {
  id: 'retry',
  kind: 'retry',
  labelFallback: 'Retry',
  requires: ['retryable'],
  placement: 'secondary',
};

export const createExemptionAction: DiagnosticActionTemplate = {
  id: 'create-exemption',
  kind: 'create-exemption',
  labelFallback: 'Create exemption',
  requires: ['exemptable', 'targetRef'],
  placement: 'overflow',
};

export const copyReportAction: DiagnosticActionTemplate = {
  id: 'copy-report',
  kind: 'copy-report',
  labelFallback: 'Copy report',
  placement: 'overflow',
};

export const upstreamEvidence: DiagnosticEvidenceTemplate = {
  id: 'upstream',
  labelFallback: 'Upstream',
  source: { kind: 'meta', path: 'upstream' },
  format: 'json',
  redaction: 'summary',
};

export const uxStandardEvidence: DiagnosticEvidenceTemplate = {
  id: 'standard-ref',
  labelFallback: 'Standard',
  source: { kind: 'meta', path: 'standardRef' },
  format: 'json',
};

export const uxEvidence: DiagnosticEvidenceTemplate = {
  id: 'evidence',
  labelFallback: 'Evidence',
  source: { kind: 'meta', path: 'evidence' },
  format: 'json',
};

const createPresentation = ({
  code,
  title,
  summary,
  primaryLocation,
  evidence = [],
  actions,
}: {
  code: string;
  title: string;
  summary: string;
  primaryLocation: DiagnosticLocationPreference;
  evidence?: DiagnosticEvidenceTemplate[];
  actions: DiagnosticActionTemplate[];
}): DiagnosticPresentationTemplate => ({
  code,
  titleFallback: `${code} ${title}`,
  summaryTemplate: {
    defaultText: '{message}',
    variables: [
      {
        name: 'message',
        source: { kind: 'diagnostic', path: 'message' },
        fallback: summary,
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
  primaryLocation,
  evidence,
  sections: [
    {
      id: 'what-happened',
      kind: 'what-happened',
      titleFallback: 'What happened',
    },
    {
      id: 'how-to-fix',
      kind: 'how-to-fix',
      titleFallback: 'How to fix',
    },
    {
      id: 'location',
      kind: 'location',
      titleFallback: 'Location',
    },
    {
      id: 'evidence',
      kind: 'evidence',
      titleFallback: 'Evidence',
    },
  ],
  actions,
});

export const createDefinition = ({
  code,
  title,
  domain,
  severity,
  stage,
  retryable,
  defaultPlacement,
  primaryLocation,
  evidence,
  actions,
}: {
  code: string;
  title: string;
  domain: ProdivixDiagnosticDomain;
  severity: ProdivixDiagnosticSeverity;
  stage: string;
  retryable: boolean;
  defaultPlacement: DiagnosticPlacement[];
  primaryLocation: DiagnosticLocationPreference;
  evidence?: DiagnosticEvidenceTemplate[];
  actions: DiagnosticActionTemplate[];
}): DiagnosticDefinition => ({
  code,
  domain,
  severity,
  stage,
  retryable,
  docsPath: `/reference/diagnostics/${code.toLowerCase()}`,
  docsUrl: `/reference/diagnostics/${code.toLowerCase()}`,
  defaultPlacement,
  presentation: createPresentation({
    code,
    title,
    summary: title,
    primaryLocation,
    evidence,
    actions,
  }),
});
