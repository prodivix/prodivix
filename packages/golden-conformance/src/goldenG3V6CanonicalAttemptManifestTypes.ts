import type {
  VerificationArtifactKind,
  VerificationBrowserEngine,
  VerificationCheckKind,
  VerificationMotion,
  VerificationSurface,
} from '@prodivix/verification';
import type {
  GoldenG3V6AttemptProvider,
  GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';

export type GoldenG3V6ProviderKind = 'browser' | 'remote' | 'export' | 'ci';

export type GoldenG3V6CanonicalAttemptControlEvidence = Readonly<{
  kind: 'deterministic-runtime' | 'static-no-runtime-controls';
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  targetLeaseBindingDigest: string | null;
  resourceManifestDigest: string | null;
  fixtureBindingDigest: string | null;
  fixtureProjectionMode:
    'compiler-auth-fixture' | 'production-no-fixture' | null;
  fixtureProjectionAuthorityDigest: string | null;
  fixtureRuntimeDispatchCount: 0 | 1 | null;
  fixtureRuntimeDispatchDigest: string | null;
  fixtureRequestCount: 0 | 1 | null;
  fixtureDispatchCount: 0 | 1 | null;
  fixtureResponseCount: 0 | 1 | null;
  fixtureDispatchLedgerDigest: string | null;
  fixtureResponseDigest: string | null;
  fixtureResolutionDigest: string | null;
  fixtureConsumptionLedgerDigest: string | null;
  fixtureRuntimeConsumptionBindingDigest: string | null;
  remoteBindingDigest: string | null;
  initialAttestationDigest: string | null;
  terminalAttestationDigest: string | null;
  cleanupCanaryDigest: string | null;
  releaseReceiptDigest: string | null;
  retirementEvidenceDigest: string | null;
  evidenceDigest: string | null;
}>;

export type GoldenG3V6CanonicalAttemptEvidence = Readonly<{
  attemptId: string;
  executionBoundary: 'browser' | 'node';
  rowId: GoldenG3V6MatrixRowManifest['id'];
  cellId: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  surface: VerificationSurface;
  frameworkTarget: string;
  browserEngine: VerificationBrowserEngine | null;
  motion: VerificationMotion;
  adapterId: string;
  adapterFactorySlotId: string;
  providerKind: GoldenG3V6ProviderKind;
  providerId: string;
  providerOrigin: GoldenG3V6AttemptProvider['origin'];
  executableSnapshotDigest: string;
  scenarioProgramDigest: string | null;
  runtimeEnvironmentDigest: string;
  controlledEnvironmentDigest: string;
  lifecycleStatus: 'reported';
  terminalStatus: 'completed';
  terminalExitCode: 0;
  cleanupStatus: 'clean';
  verdict: 'passed';
  outcome: 'passed';
  reportDigest: string;
  resolvedInputSetDigest: string;
  workspaceDiagnosticProjectionReceiptDigest: string | null;
  toolchainProjectionAuthorityReceiptDigest: string | null;
  stagedArtifactSetDigest: string;
  artifactKinds: readonly VerificationArtifactKind[];
  artifactRetirementReceiptDigest: string;
  control: GoldenG3V6CanonicalAttemptControlEvidence;
  behaviorAssertionReceiptDigest: string | null;
  blackBoxAssertionSetDigest: string | null;
  behaviorCrossBindingDigest: string | null;
  remoteEvidenceDigest: string | null;
  remoteCleanupEvidenceDigest: string | null;
  securityBundleEvidenceDigest: string | null;
  securityResolutionAuditDigest: string | null;
  securityResolutionEvidenceDigest: string | null;
  productionFixtureAbsenceReceiptDigest: string | null;
  entryDigest: string;
}>;

export type GoldenG3V6CanonicalAttemptManifest = Readonly<{
  format: 'prodivix.golden-g3-v6-canonical-attempt-manifest';
  version: 1;
  planDigest: string;
  matrixManifestDigest: string;
  attemptAuthorityDigest: string;
  controlledEnvironmentDigest: string;
  requiredCellCount: 66;
  attemptCount: 80;
  browserAttemptCount: 72;
  staticAttemptCount: 8;
  entries: readonly GoldenG3V6CanonicalAttemptEvidence[];
  manifestDigest: string;
}>;

export type GoldenG3V6CanonicalAttemptAuthorityEntry = Readonly<{
  attemptId: string;
  cellId: string;
  providerId: string;
  executionBoundary: 'browser' | 'node';
  executableSnapshotDigest: string;
  reportDigest: string;
  runtimeEnvironmentDigest: string;
  controlledEnvironmentDigest: string;
  scenarioProgramDigest: string | null;
  resolvedInputSetDigest: string;
  workspaceDiagnosticProjectionReceiptDigest: string | null;
  toolchainProjectionAuthorityReceiptDigest: string | null;
  stagedArtifactSetDigest: string;
  artifactKinds: readonly VerificationArtifactKind[];
  artifactRetirementReceiptDigest: string;
  behaviorAssertionReceiptDigest: string | null;
  blackBoxAssertionSetDigest: string | null;
  controlDigest: string;
  runtimeControlEvidenceDigest: string | null;
  fixtureProjectionMode:
    'compiler-auth-fixture' | 'production-no-fixture' | null;
  fixtureProjectionAuthorityDigest: string | null;
  fixtureRuntimeDispatchCount: 0 | 1 | null;
  fixtureRuntimeDispatchDigest: string | null;
  fixtureRequestCount: 0 | 1 | null;
  fixtureDispatchCount: 0 | 1 | null;
  fixtureResponseCount: 0 | 1 | null;
  fixtureDispatchLedgerDigest: string | null;
  fixtureResponseDigest: string | null;
  fixtureResolutionDigest: string | null;
  fixtureConsumptionLedgerDigest: string | null;
  fixtureRuntimeConsumptionBindingDigest: string | null;
  remoteEvidenceDigest: string | null;
  remoteCleanupEvidenceDigest: string | null;
  securityBundleEvidenceDigest: string | null;
  securityResolutionAuditDigest: string | null;
  securityResolutionEvidenceDigest: string | null;
  productionFixtureAbsenceReceiptDigest: string | null;
}>;

export type GoldenG3V6CanonicalAttemptAuthority = Readonly<{
  format: 'prodivix.golden-g3-v6-canonical-attempt-authority';
  version: 1;
  attemptCount: 80;
  controlledEnvironmentDigest: string;
  entries: readonly GoldenG3V6CanonicalAttemptAuthorityEntry[];
  authorityDigest: string;
}>;

export type GoldenG3V6CanonicalAttemptDimension = Pick<
  GoldenG3V6CanonicalAttemptEvidence,
  | 'attemptId'
  | 'executionBoundary'
  | 'rowId'
  | 'cellId'
  | 'checkId'
  | 'checkKind'
  | 'surface'
  | 'frameworkTarget'
  | 'browserEngine'
  | 'motion'
  | 'adapterId'
  | 'adapterFactorySlotId'
  | 'providerKind'
  | 'providerId'
  | 'providerOrigin'
>;
