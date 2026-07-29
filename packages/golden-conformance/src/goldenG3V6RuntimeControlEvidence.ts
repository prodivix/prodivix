import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { CompilerFixtureProjectionReceipt } from '@prodivix/prodivix-compiler';
import type {
  DeterministicRuntimeControlId,
  ExecutableProjectSnapshot,
  ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import type {
  VerificationAdapterPrepareInput,
  VerificationPlanCell,
} from '@prodivix/verification';
import type {
  BrowserRuntimeControlPort,
  BrowserVerificationTargetLease,
} from '@prodivix/verification-browser';
import { GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT } from './goldenG3V6RuntimeControlBindings';
import type { GoldenG3V6ProductionSecurityAuthority } from './goldenG3V6ProductionSecurityAuthority';
import { createGoldenG3V6RuntimeControlRegistryImplementation } from './goldenG3V6RuntimeControlRegistry';
import type { GoldenG3V6RemotePreviewEvidence } from './goldenG3V6RemotePreviewHarness';

export { GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT };

export type GoldenG3V6ControlledProviderKind = Exclude<
  VerificationAdapterPrepareInput['providerKind'],
  'local'
>;

export type GoldenG3V6RuntimeControlExpectation = Readonly<{
  providerKind: GoldenG3V6ControlledProviderKind;
  providerId: string;
  controlCapabilityIds: readonly DeterministicRuntimeControlId[];
  controlCapabilitySnapshotDigest: string;
  expectedControlDigest: string;
  /** Core lifecycle still names this pre-execution field appliedControlDigest. */
  appliedControlDigest: string;
  resourceManifestDigest: string;
  fixtureBindingDigest: string;
  fixtureProjectionAuthorityDigest: string;
  remoteBindingDigest?: string;
}>;

export type GoldenG3V6RuntimeControlEvidence = Readonly<{
  attemptId: string;
  generation: number;
  providerKind: GoldenG3V6ControlledProviderKind;
  providerId: string;
  leaseId: string;
  targetLeaseBindingDigest: string;
  executableSnapshotDigest: string;
  originDigest: string;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  resourceManifestDigest: string;
  fixtureBindingDigest: string;
  fixtureProjectionMode: 'compiler-auth-fixture' | 'production-no-fixture';
  fixtureProjectionAuthorityDigest: string;
  fixtureRuntimeDispatchCount: 0 | 1;
  fixtureRuntimeDispatchDigest: string;
  fixtureRequestCount: 0 | 1;
  fixtureDispatchCount: 0 | 1;
  fixtureResponseCount: 0 | 1;
  fixtureDispatchLedgerDigest: string;
  fixtureResponseDigest: string | null;
  fixtureResolutionDigest: string | null;
  fixtureConsumptionLedgerDigest: string;
  fixtureRuntimeConsumptionBindingDigest: string;
  remoteBindingDigest?: string;
  initialAttestationDigest: string;
  terminalAttestationDigest: string;
  cleanupCanaryDigest: string;
  releaseReceiptDigest: string;
  retirementEvidenceDigest: string;
  evidenceDigest: string;
}>;

export type GoldenG3V6RuntimeControlRegistration = Readonly<{
  expectation: GoldenG3V6RuntimeControlExpectation;
  assertReleased(): GoldenG3V6RuntimeControlEvidence;
}>;

export type GoldenG3V6RuntimeControlRegistrationInput = Readonly<{
  cell: VerificationPlanCell;
  providerKind: GoldenG3V6ControlledProviderKind;
  attemptId: string;
  generation: number;
  program: BehaviorScenarioProgram;
  targetLease: BrowserVerificationTargetLease;
  snapshot: ExecutableProjectSnapshot;
  buildBundle: ExecutionBuildBundle;
  fixtureProjectionReceipt?: CompilerFixtureProjectionReceipt;
  productionSecurityAuthority?: GoldenG3V6ProductionSecurityAuthority;
  remoteEvidence?: GoldenG3V6RemotePreviewEvidence;
}>;

export type GoldenG3V6RuntimeControlRegistry = Readonly<{
  port: BrowserRuntimeControlPort;
  register(
    input: GoldenG3V6RuntimeControlRegistrationInput
  ): Promise<GoldenG3V6RuntimeControlRegistration>;
  assertReleased(attemptId: string): GoldenG3V6RuntimeControlEvidence;
  forceRetire(
    attemptId: string
  ): Promise<GoldenG3V6RuntimeControlEvidence | undefined>;
  snapshot(): Readonly<{
    registered: number;
    acquired: number;
    started: number;
    released: number;
    active: number;
  }>;
}>;

/**
 * Creates the Golden composition authority. Real runtime observations remain
 * owned by the adapter's same-context BrowserRuntimeControlHost.
 */
export const createGoldenG3V6RuntimeControlRegistry =
  (): GoldenG3V6RuntimeControlRegistry =>
    createGoldenG3V6RuntimeControlRegistryImplementation();
