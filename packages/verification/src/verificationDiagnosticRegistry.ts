import {
  copyReportAction,
  createDefinition,
  createExemptionAction,
  openDocsAction,
  openTargetAction,
  retryAction,
  type DiagnosticDefinition,
} from '@prodivix/diagnostics';

const entries = [
  [
    'VER-1001',
    'VerificationImpactSet is stale or mismatched',
    'impact',
    'error',
    true,
    false,
  ],
  [
    'VER-1002',
    'Impact providers are incomplete; scope was broadened',
    'impact',
    'warning',
    false,
    false,
  ],
  [
    'VER-2001',
    'VerificationPolicy is invalid',
    'policy',
    'error',
    false,
    false,
  ],
  [
    'VER-2002',
    'Verification exemption is expired or inapplicable',
    'policy',
    'error',
    false,
    true,
  ],
  [
    'VER-3001',
    'Required Scenario or check is missing',
    'plan',
    'error',
    false,
    false,
  ],
  [
    'VER-3002',
    'Required matrix cell is unsupported',
    'plan',
    'error',
    false,
    false,
  ],
  [
    'VER-3003',
    'Required cell dependency is unavailable',
    'plan',
    'error',
    true,
    false,
  ],
  [
    'VER-3004',
    'VerificationPlan exceeds its budget',
    'plan',
    'error',
    false,
    true,
  ],
  ['VER-4001', 'Verification adapter failed', 'execute', 'error', true, false],
  [
    'VER-4002',
    'EvidenceCandidate is invalid or over budget',
    'execute',
    'error',
    false,
    false,
  ],
  [
    'VER-5001',
    'Evidence identity or digest chain mismatched',
    'promote',
    'fatal',
    false,
    false,
  ],
  [
    'VER-5002',
    'Evidence contains secret or sensitive data',
    'promote',
    'fatal',
    false,
    false,
  ],
  [
    'VER-5003',
    'Evidence attestation is invalid',
    'promote',
    'error',
    false,
    false,
  ],
  [
    'VER-5004',
    'Evidence or baseline is incompatible',
    'compare',
    'warning',
    false,
    false,
  ],
  [
    'VER-5005',
    'Artifact promotion or safety validation failed',
    'promote',
    'error',
    true,
    false,
  ],
  [
    'VER-6001',
    'Evidence retention operation is blocked',
    'retain',
    'warning',
    false,
    false,
  ],
  [
    'VER-6002',
    'VerificationClosure is incomplete or stale',
    'close',
    'error',
    false,
    true,
  ],
  [
    'VER-9001',
    'Unclassified Verification failure',
    'runtime-selected',
    'error',
    false,
    false,
  ],
] as const;

export type VerificationDiagnosticCode = (typeof entries)[number][0];

export const VERIFICATION_DIAGNOSTIC_CODES = Object.freeze(
  entries.map(([code]) => code)
);

export const VERIFICATION_DIAGNOSTIC_REGISTRY = Object.freeze(
  Object.fromEntries(
    entries.map(([code, title, stage, severity, retryable, exemptable]) => [
      code,
      createDefinition({
        code,
        title,
        domain: 'verification',
        severity,
        stage,
        retryable,
        exemptable,
        defaultPlacement: ['issues-panel', 'operation-status'],
        primaryLocation: 'target-then-source',
        actions: [
          openTargetAction,
          ...(retryable ? [retryAction] : []),
          ...(exemptable ? [createExemptionAction] : []),
          openDocsAction,
          copyReportAction,
        ],
      }),
    ])
  )
) as Readonly<Record<VerificationDiagnosticCode, DiagnosticDefinition>>;
