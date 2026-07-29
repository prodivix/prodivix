import type {
  DeterministicIsolationCanary,
  DeterministicRuntimeCapabilitySnapshot,
} from '@prodivix/runtime-core';
import { digestVerificationValue } from '@prodivix/verification';
import {
  createBrowserRuntimeFixtureConsumptionBindingDigest,
  type BrowserRuntimeControlAttestation,
  type BrowserRuntimeControlLease,
} from '@prodivix/verification-browser';
import type {
  GoldenG3V6RuntimeControlEvidence,
  GoldenG3V6RuntimeControlRegistrationInput,
} from './goldenG3V6RuntimeControlEvidence';
import type { GoldenG3V6FixtureRuntimeDispatchEvidence } from './goldenG3V6RuntimeControlProvider';

const exactBinaryCount = (value: number, label: string): 0 | 1 => {
  if (value !== 0 && value !== 1) {
    throw new TypeError(`${label} must be exactly zero or one.`);
  }
  return value;
};

/** Projects only authority-issued terminal facts into stable matrix evidence. */
export const projectGoldenG3V6RuntimeControlEvidence = (input: {
  registration: GoldenG3V6RuntimeControlRegistrationInput;
  providerId: string;
  capabilitySnapshot: DeterministicRuntimeCapabilitySnapshot;
  lease: BrowserRuntimeControlLease;
  issuedAttestations: readonly BrowserRuntimeControlAttestation[];
  terminalAttestation: BrowserRuntimeControlAttestation;
  cleanupCanary: DeterministicIsolationCanary | undefined;
  fixtureRuntimeDispatch: GoldenG3V6FixtureRuntimeDispatchEvidence;
}): GoldenG3V6RuntimeControlEvidence => {
  const initial = input.issuedAttestations.find(
    ({ phase }) => phase === 'initial'
  );
  if (!initial || !input.cleanupCanary?.clean) {
    throw new Error(
      `Golden V6 runtime control "${input.registration.attemptId}" has incomplete evidence.`
    );
  }
  const cleanupCanaryDigest = digestVerificationValue(input.cleanupCanary);
  const terminalNetwork = input.terminalAttestation.application.network;
  const fixtureRequestCount = exactBinaryCount(
    terminalNetwork.fixtureRequestCount,
    'Golden V6 fixture request count'
  );
  const fixtureDispatchCount = exactBinaryCount(
    terminalNetwork.fixtureDispatchCount,
    'Golden V6 fixture dispatch count'
  );
  const fixtureResponseCount = exactBinaryCount(
    terminalNetwork.fixtureResponseCount,
    'Golden V6 fixture response count'
  );
  const fixtureRuntimeConsumptionBindingDigest =
    createBrowserRuntimeFixtureConsumptionBindingDigest({
      attestation: input.terminalAttestation,
      fixtureSetDigests: input.lease.plan.fixtureSetDigests,
    });
  const releaseReceiptDigest = digestVerificationValue({
    status: 'clean',
    attemptId: input.registration.attemptId,
    generation: input.registration.generation,
    leaseId: input.lease.leaseId,
    initialAttestationDigest: initial.attestationDigest,
    terminalAttestationDigest: input.terminalAttestation.attestationDigest,
    cleanupCanaryDigest,
    residualCanaryIds: Object.freeze([]),
  });
  const retirementEvidenceDigest = digestVerificationValue({
    owner: '@prodivix/golden-conformance',
    status: 'retired',
    attemptId: input.registration.attemptId,
    generation: input.registration.generation,
    leaseId: input.lease.leaseId,
    releaseReceiptDigest,
    registryEntryPresentAfterRetirement: false,
    activeRuntimeSessionCount: 0,
    residualCanaryCount: 0,
  });
  const identity = Object.freeze({
    attemptId: input.registration.attemptId,
    generation: input.registration.generation,
    providerKind: input.registration.providerKind,
    providerId: input.providerId,
    leaseId: input.lease.leaseId,
    targetLeaseBindingDigest: input.lease.targetLeaseBindingDigest,
    executableSnapshotDigest: input.lease.executableSnapshotDigest,
    originDigest: input.lease.originDigest,
    controlCapabilitySnapshotDigest: input.capabilitySnapshot.snapshotDigest,
    appliedControlDigest: input.lease.expectedControlDigest,
    resourceManifestDigest: input.lease.resourceManifest.manifestDigest,
    fixtureBindingDigest: input.lease.fixtureBinding.bindingDigest,
    fixtureProjectionMode:
      input.fixtureRuntimeDispatch.mode === 'auth-session'
        ? ('compiler-auth-fixture' as const)
        : ('production-no-fixture' as const),
    fixtureProjectionAuthorityDigest:
      input.lease.fixtureBinding.projectionAuthorityDigest,
    fixtureRuntimeDispatchCount: input.fixtureRuntimeDispatch.dispatchCount,
    fixtureRuntimeDispatchDigest: input.fixtureRuntimeDispatch.dispatchDigest,
    fixtureRequestCount,
    fixtureDispatchCount,
    fixtureResponseCount,
    fixtureDispatchLedgerDigest: terminalNetwork.fixtureDispatchLedgerDigest,
    fixtureResponseDigest: terminalNetwork.fixtureResponseDigest,
    fixtureResolutionDigest: terminalNetwork.fixtureResolutionDigest,
    fixtureConsumptionLedgerDigest:
      terminalNetwork.fixtureConsumptionLedgerDigest,
    fixtureRuntimeConsumptionBindingDigest,
    ...(input.lease.remoteBinding
      ? {
          remoteBindingDigest: input.lease.remoteBinding.bindingDigest,
        }
      : {}),
    initialAttestationDigest: initial.attestationDigest,
    terminalAttestationDigest: input.terminalAttestation.attestationDigest,
    cleanupCanaryDigest,
    releaseReceiptDigest,
    retirementEvidenceDigest,
  });
  return Object.freeze({
    ...identity,
    evidenceDigest: digestVerificationValue(identity),
  });
};
