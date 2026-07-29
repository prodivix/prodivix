import type {
  VerificationAdapterIdentity,
  VerificationAdapterToolIdentity,
  VerificationArtifactKind,
  VerificationAttemptOutcome,
  VerificationCheckKind,
  VerificationJsonValue,
} from './verification.types';
import type { VerificationBehaviorAssertionReceipt } from './verificationBehaviorAssertionReceipt';

export type VerificationFailureClass =
  | 'product-assertion-finding'
  | 'product-diagnostic-build'
  | 'unsupported-capability'
  | 'fixture-control'
  | 'environment'
  | 'adapter-infrastructure'
  | 'contract-mismatch'
  | 'security-denial'
  | 'cancelled'
  | 'timeout'
  | 'malformed-unsafe-candidate';

export type VerificationCheckReportTerminal =
  | Readonly<{
      status: 'completed';
      complete: true;
      exitCode: number;
    }>
  | Readonly<{
      status: 'failed';
      complete: true;
      failureClass:
        | 'fixture-control'
        | 'environment'
        | 'adapter-infrastructure'
        | 'contract-mismatch'
        | 'security-denial';
      reasonCode: string;
      exitCode?: number;
    }>
  | Readonly<{
      status: 'cancelled';
      complete: true;
      reasonCode: string;
    }>
  | Readonly<{
      status: 'timed-out';
      complete: true;
      timeoutMs: number;
    }>;

export type VerificationNormalizedFinding = Readonly<{
  ruleId: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  targetId: string;
  messageKey: string;
  count: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type VerificationTestSuiteReport = Readonly<{
  suiteId: string;
  status: 'passed' | 'failed' | 'skipped' | 'todo';
  cases: readonly Readonly<{
    caseId: string;
    status: 'passed' | 'failed' | 'skipped' | 'todo';
    diagnosticCodes: readonly string[];
    sourceTraceDigest?: string;
  }>[];
}>;

export type VerificationScenarioStepReport = Readonly<{
  stepId: string;
  targetId: string;
  assertionCode: string;
  status: 'passed' | 'failed' | 'blocked';
  blackBox: boolean;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type VerificationVisualComparisonReport = Readonly<{
  observationId: string;
  compatibilityKey: string;
  baselineDigest: string;
  currentDigest: string;
  diffDigest?: string;
  changedPixels: number;
  totalPixels: number;
  thresholdPixels: number;
  status: 'passed' | 'failed' | 'incompatible';
  maskIds: readonly string[];
  sourceTraceDigest?: string;
}>;

export type VerificationAccessibilityFindingReport = Readonly<{
  ruleId: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  targetId: string;
  messageKey: string;
  relatedNodeCount: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type VerificationAccessibilityJourneyReport = Readonly<{
  journeyId: string;
  stepId: string;
  targetId: string;
  assertionCode: string;
  status: 'passed' | 'failed' | 'blocked';
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
  announcement?: Readonly<{
    triggerTargetId: string;
    role: 'status' | 'alert' | 'log';
    live: 'polite' | 'assertive';
    beforeTextDigest: string;
    afterTextDigest: string;
  }>;
}>;

export type VerificationPerformanceMetricReport = Readonly<{
  metricId: string;
  unit: 'ms' | 'bytes' | 'count' | 'ratio' | 'fps';
  operator: 'less-than-or-equal' | 'greater-than-or-equal';
  value: number;
  threshold: number;
  sampleCount: number;
}>;

export type VerificationSecurityFindingReport = Readonly<{
  ruleId: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  targetId: string;
  messageKey: string;
  count: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type VerificationCheckReportPayload =
  | Readonly<{
      kind: 'diagnostics';
      findings: readonly VerificationNormalizedFinding[];
    }>
  | Readonly<{
      kind: 'build';
      outputManifestDigest: string;
      findings: readonly VerificationNormalizedFinding[];
    }>
  | Readonly<{
      kind: 'unit' | 'integration';
      suites: readonly VerificationTestSuiteReport[];
    }>
  | (Readonly<{
      kind: 'e2e';
      scenarioId: string;
      steps: readonly VerificationScenarioStepReport[];
    }> &
      VerificationBehaviorAssertionReportBinding)
  | (Readonly<{
      kind: 'visual';
      comparisons: readonly VerificationVisualComparisonReport[];
    }> &
      VerificationBehaviorAssertionReportBinding)
  | (Readonly<{
      kind: 'accessibility';
      findings: readonly VerificationAccessibilityFindingReport[];
      journeys: readonly VerificationAccessibilityJourneyReport[];
    }> &
      VerificationBehaviorAssertionReportBinding)
  | (Readonly<{
      kind: 'performance';
      environmentDigest: string;
      samplingDigest: string;
      comparable: boolean;
      metrics: readonly VerificationPerformanceMetricReport[];
    }> &
      VerificationBehaviorAssertionReportBinding)
  | (Readonly<{
      kind: 'security';
      observedRuleIds: readonly string[];
      findings: readonly VerificationSecurityFindingReport[];
    }> &
      VerificationBehaviorAssertionReportBinding);

export type VerificationBehaviorAssertionReportBinding = Readonly<{
  behaviorAssertionReceipt: VerificationBehaviorAssertionReceipt;
}>;

export type VerificationCheckReportCandidate = Readonly<{
  format: 'prodivix.verification-check-report-candidate';
  version: 1;
  cellId: string;
  attemptId: string;
  checkKind: VerificationCheckKind;
  inputDigest: string;
  adapter: VerificationAdapterIdentity;
  tool: VerificationAdapterToolIdentity;
  terminal: VerificationCheckReportTerminal;
  payload: VerificationCheckReportPayload;
  artifacts: readonly Readonly<{
    id: string;
    kind: VerificationArtifactKind;
    digest: string;
    size: number;
    mediaType: string;
  }>[];
  diagnosticCodes: readonly string[];
}>;

export type VerificationNormalizedCheckReport = Readonly<{
  candidateId: string;
  outcome: VerificationAttemptOutcome;
  verdict: 'passed' | 'failed' | 'blocked';
  failureClass?: VerificationFailureClass;
  summary: VerificationJsonValue;
  artifacts: VerificationCheckReportCandidate['artifacts'];
  diagnosticCodes: readonly string[];
}>;

export type VerificationCheckReportIssue = Readonly<{
  code: 'VER-4001' | 'VER-4002' | 'VER-5002';
  path: string;
  message: string;
  failureClass: VerificationFailureClass;
}>;

export type VerificationCheckReportDecodeResult =
  | Readonly<{
      ok: true;
      value: VerificationCheckReportCandidate;
    }>
  | Readonly<{
      ok: false;
      issues: readonly VerificationCheckReportIssue[];
    }>;
