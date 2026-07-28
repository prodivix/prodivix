import type { VerificationArtifactKind } from './verification.types';

export const VERIFICATION_ARTIFACT_ENVELOPE_FORMAT =
  'prodivix.verification-artifact' as const;
export const VERIFICATION_ARTIFACT_ENVELOPE_VERSION = 1 as const;

export const VERIFICATION_STRUCTURED_ARTIFACT_KINDS = Object.freeze([
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'replay-record',
] as const satisfies readonly VerificationArtifactKind[]);

export type VerificationStructuredArtifactKind =
  (typeof VERIFICATION_STRUCTURED_ARTIFACT_KINDS)[number];

export const VERIFICATION_STRUCTURED_ARTIFACT_LIMITS = Object.freeze({
  maximumFieldBytes: 512,
  maximumPathTemplateBytes: 1_024,
  maximumDiagnosticRefs: 128,
  maximumDiagnosticsPerEntry: 16,
  maximumTraceEvents: 4_096,
  maximumConsoleEvents: 2_048,
  maximumNetworkOperations: 2_048,
  maximumAccessibilityViolations: 1_024,
  maximumSecurityFindings: 1_024,
  maximumCount: 1_000_000_000,
  maximumDurationMs: 86_400_000,
});

export type VerificationArtifactDiagnosticCodes = readonly string[];

export type VerificationArtifactEnvelopeBase<
  K extends VerificationStructuredArtifactKind,
> = Readonly<{
  format: typeof VERIFICATION_ARTIFACT_ENVELOPE_FORMAT;
  version: typeof VERIFICATION_ARTIFACT_ENVELOPE_VERSION;
  kind: K;
}>;

export type VerificationArtifactAccessibilityViolation = Readonly<{
  ruleId: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  nodeCount: number;
  diagnosticCodes: VerificationArtifactDiagnosticCodes;
  sourceTraceDigest?: string;
}>;

export type VerificationAccessibilityReportArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'accessibility-report'> &
    Readonly<{
      summary: Readonly<{
        passed: number;
        failed: number;
        incomplete: number;
        violations: readonly VerificationArtifactAccessibilityViolation[];
      }>;
    }>;

export type VerificationArtifactTraceEvent = Readonly<{
  sequence: number;
  eventId: string;
  category: string;
  timestampOffsetMs: number;
  durationMs: number;
  diagnosticCodes: VerificationArtifactDiagnosticCodes;
  sourceTraceDigest?: string;
}>;

export type VerificationTraceArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'trace'> &
    Readonly<{
      sourceTraceDigest: string;
      events: readonly VerificationArtifactTraceEvent[];
    }>;

export type VerificationArtifactNetworkMethod =
  'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type VerificationArtifactNetworkOperation = Readonly<{
  method: VerificationArtifactNetworkMethod;
  host: string;
  pathTemplate: string;
  status: number;
  timing: Readonly<{
    startOffsetMs: number;
    durationMs: number;
  }>;
  operationId: string;
}>;

export type VerificationNetworkSummaryArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'network-summary'> &
    Readonly<{
      operations: readonly VerificationArtifactNetworkOperation[];
    }>;

export type VerificationArtifactConsoleEvent = Readonly<{
  sequence: number;
  eventId: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  timestampOffsetMs: number;
  diagnosticCodes: VerificationArtifactDiagnosticCodes;
  sourceTraceDigest?: string;
}>;

export type VerificationConsoleSummaryArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'console-summary'> &
    Readonly<{
      sourceTraceDigest: string;
      events: readonly VerificationArtifactConsoleEvent[];
    }>;

export type VerificationArtifactCoverageMetric = Readonly<{
  covered: number;
  total: number;
}>;

export type VerificationCoverageSummaryArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'coverage-summary'> &
    Readonly<{
      summary: Readonly<{
        lines: VerificationArtifactCoverageMetric;
        functions: VerificationArtifactCoverageMetric;
        branches: VerificationArtifactCoverageMetric;
        statements: VerificationArtifactCoverageMetric;
      }>;
    }>;

export type VerificationPerformanceProfileArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'performance-profile'> &
    Readonly<{
      summary: Readonly<{
        durationMs: number;
        sampleCount: number;
        largestContentfulPaintMs: number | null;
        cumulativeLayoutShift: number | null;
        interactionToNextPaintMs: number | null;
        totalBlockingTimeMs: number | null;
      }>;
    }>;

export type VerificationArtifactSecurityFinding = Readonly<{
  ruleId: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  count: number;
  diagnosticCodes: VerificationArtifactDiagnosticCodes;
  sourceTraceDigest?: string;
}>;

export type VerificationSecurityReportArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'security-report'> &
    Readonly<{
      summary: Readonly<{
        passed: number;
        failed: number;
        findings: readonly VerificationArtifactSecurityFinding[];
      }>;
    }>;

export type VerificationReplayRecordArtifactEnvelope =
  VerificationArtifactEnvelopeBase<'replay-record'> &
    Readonly<{
      sourceTraceDigest: string;
      summary: Readonly<{
        eventCount: number;
        assertionCount: number;
        durationMs: number;
        outcome:
          | 'passed'
          | 'failed'
          | 'blocked'
          | 'cancelled'
          | 'infrastructure-error';
        diagnosticCodes: VerificationArtifactDiagnosticCodes;
      }>;
    }>;

export type VerificationStructuredArtifactEnvelope =
  | VerificationAccessibilityReportArtifactEnvelope
  | VerificationTraceArtifactEnvelope
  | VerificationNetworkSummaryArtifactEnvelope
  | VerificationConsoleSummaryArtifactEnvelope
  | VerificationCoverageSummaryArtifactEnvelope
  | VerificationPerformanceProfileArtifactEnvelope
  | VerificationSecurityReportArtifactEnvelope
  | VerificationReplayRecordArtifactEnvelope;

export type VerificationStructuredArtifactEnvelopeForKind<
  K extends VerificationStructuredArtifactKind,
> = Extract<VerificationStructuredArtifactEnvelope, Readonly<{ kind: K }>>;

export type VerificationArtifactEnvelopeIssue = Readonly<{
  code: 'VER-5005';
  path: string;
  message: string;
}>;

export type VerificationArtifactEnvelopeDecodeResult<
  K extends VerificationStructuredArtifactKind,
> =
  | Readonly<{
      ok: true;
      value: VerificationStructuredArtifactEnvelopeForKind<K>;
    }>
  | Readonly<{
      ok: false;
      issues: readonly VerificationArtifactEnvelopeIssue[];
    }>;

export type VerificationArtifactEnvelopeDecodeContext = Readonly<{
  expectedSourceTraceDigest?: string;
}>;
