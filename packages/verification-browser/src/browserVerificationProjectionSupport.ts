import {
  compareVerificationText,
  digestVerificationValue,
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  type VerificationCheckReportPayload,
  type VerificationCheckReportTerminal,
  type VerificationEvidenceSourceTrace,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { BrowserVerificationCellInput } from './browserAdapter.types';
import {
  createStructuredBrowserVerificationArtifact,
  type PreparedBrowserVerificationArtifact,
} from './browserVerificationArtifacts';

export type BrowserVerificationProjection = Readonly<{
  terminal: VerificationCheckReportTerminal;
  payload: VerificationCheckReportPayload;
  artifacts: readonly PreparedBrowserVerificationArtifact[];
  diagnosticCodes: readonly string[];
}>;

/**
 * Browser-private DOM and Behavior source identities are projected onto the
 * canonical Scenario document before a report crosses the Evidence boundary.
 * Detailed target traces remain available in bounded artifacts and receipts.
 */
export const createBrowserVerificationEvidenceSourceTrace = (
  input: Pick<BrowserVerificationCellInput, 'scenarioId'>
): VerificationEvidenceSourceTrace =>
  Object.freeze({
    sourceRef: Object.freeze({
      kind: 'behavior-scenario' as const,
      documentId: input.scenarioId,
    }),
  });

export const sourceTraceDigestFor = (
  input: BrowserVerificationCellInput
): string =>
  input.profile.kind === 'visual' &&
  input.profile.sourceTraceDigest !== undefined
    ? input.profile.sourceTraceDigest
    : digestVerificationValue(
        createBrowserVerificationEvidenceSourceTrace(input)
      );

export const browserArtifactId = (
  cell: VerificationPlanCell,
  suffix: string
): string =>
  `artifact:${digestVerificationValue({
    cellId: cell.id,
    suffix,
  }).slice('sha256-'.length)}`;

export const browserDiagnosticCodes = (
  values: readonly (readonly string[])[]
): readonly string[] =>
  Object.freeze([...new Set(values.flat())].sort(compareVerificationText));

export const completedBrowserTerminal = (
  exitCode: number
): VerificationCheckReportTerminal =>
  Object.freeze({ status: 'completed', complete: true, exitCode });

export const blockedBrowserTerminal = (
  failureClass:
    | 'fixture-control'
    | 'environment'
    | 'adapter-infrastructure'
    | 'contract-mismatch'
    | 'security-denial',
  reasonCode: string
): VerificationCheckReportTerminal =>
  Object.freeze({
    status: 'failed',
    complete: true,
    failureClass,
    reasonCode,
  });

export const createBrowserReplayArtifact = (
  input: Readonly<{
    cell: VerificationPlanCell;
    sourceTraceDigest: string;
    eventCount: number;
    assertionCount: number;
    durationMs: number;
    outcome: 'passed' | 'failed' | 'blocked' | 'infrastructure-error';
    diagnosticCodes: readonly string[];
  }>
): PreparedBrowserVerificationArtifact =>
  createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(input.cell, 'replay-record'),
    kind: 'replay-record',
    expectedSourceTraceDigest: input.sourceTraceDigest,
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'replay-record',
      sourceTraceDigest: input.sourceTraceDigest,
      summary: {
        eventCount: input.eventCount,
        assertionCount: input.assertionCount,
        durationMs: input.durationMs,
        outcome: input.outcome,
        diagnosticCodes: input.diagnosticCodes,
      },
    },
  });
