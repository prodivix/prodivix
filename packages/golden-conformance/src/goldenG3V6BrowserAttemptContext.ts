import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  encodeExecutableProjectSnapshotArtifact,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createVerificationAdapterRegistrySnapshot,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleContext,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createBrowserScenarioProgramInputRef,
  createBrowserVerificationProfileInputRef,
  type BrowserVerificationCellInput,
  type BrowserVerificationCellProfile,
  type BrowserVerificationRuntimeIdentity,
} from '@prodivix/verification-browser';
import { GOLDEN_G3_V6_ADAPTERS } from './goldenG3V6AdapterRegistryFixture';
import { GOLDEN_G3_V6_INACTIVE_SIGNAL } from './goldenG3V6BrowserMatrixPorts';
import { createGoldenG3V6BrowserCellProfile } from './goldenG3V6BrowserProfiles';
import type { GoldenG3V6ProductionSecurityAuthority } from './goldenG3V6ProductionSecurityAuthority';
import type { GoldenG3V6RuntimeControlExpectation } from './goldenG3V6RuntimeControlEvidence';
import { GOLDEN_G3_V6_VISUAL_BASELINE_SET_INPUT } from './goldenG3V6VisualBaseline';

const executableSnapshotInput = (
  snapshot: ExecutableProjectSnapshot,
  attemptId: string
): Readonly<{ ref: VerificationAdapterInputRef; bytes: Uint8Array }> => {
  const artifact = encodeExecutableProjectSnapshotArtifact(snapshot);
  return Object.freeze({
    ref: Object.freeze({
      id: `input:executable:${attemptId.slice('attempt:g3-v6:'.length)}`,
      kind: 'executable-snapshot',
      digest: artifact.artifactDigest,
      size: artifact.size,
      mediaType: artifact.mediaType,
    }),
    bytes: artifact.bytes,
  });
};

export type GoldenG3V6BrowserAttemptContextMaterial = Readonly<{
  context: VerificationAdapterLifecycleContext;
  profile: BrowserVerificationCellProfile;
}>;

export const createGoldenG3V6BrowserAttemptContext = (input: {
  cell: VerificationPlanCell;
  snapshot: ExecutableProjectSnapshot;
  program: BehaviorScenarioProgram;
  runtimeIdentity: BrowserVerificationRuntimeIdentity;
  targetBinding: Readonly<{
    bindingDigest: string;
    runtimeEnvironmentDigest: string;
  }>;
  origin: string;
  runtimeControl: GoldenG3V6RuntimeControlExpectation;
  attemptId: string;
  artifactStaging: VerificationAdapterLifecycleContext['artifactStaging'];
  securityAuthority?: GoldenG3V6ProductionSecurityAuthority;
}): GoldenG3V6BrowserAttemptContextMaterial => {
  const executableInput = executableSnapshotInput(
    input.snapshot,
    input.attemptId
  );
  const programInput = createBrowserScenarioProgramInputRef(
    `input:program:${input.attemptId.slice('attempt:g3-v6:'.length)}`,
    input.program
  );
  const profile = createGoldenG3V6BrowserCellProfile({
    cell: input.cell,
    program: input.program,
    runtimeIdentity: input.runtimeIdentity,
    ...(input.securityAuthority
      ? {
          security: {
            origin: input.origin,
            observationSetDigest: input.securityAuthority.input.ref.digest,
            coreExpectedChecks: input.securityAuthority.coreExpectedChecks,
            productionProbeMarkers:
              input.securityAuthority.productionProbeMarkers,
          },
        }
      : {}),
  });
  const profileInput = createBrowserVerificationProfileInputRef(
    `input:profile:${input.attemptId.slice('attempt:g3-v6:'.length)}`,
    Object.freeze({
      format: 'prodivix.browser-verification-cell-input',
      version: 1,
      cellId: input.cell.id,
      checkKind: profile.kind,
      scenarioId: input.program.scenarioId,
      targetId: input.cell.targetId,
      frameworkTarget: input.cell.frameworkTarget,
      surface: input.cell.surface,
      browserEngine: input.cell.browserEngine!,
      viewport: Object.freeze({
        width: input.cell.viewport.width,
        height: input.cell.viewport.height,
      }),
      colorScheme: input.cell.colorScheme,
      motion: input.cell.motion,
      locale: input.cell.locale,
      executableSnapshotDigest: input.snapshot.contentDigest,
      scenarioProgramDigest: input.program.programDigest,
      controlProfileDigest: input.cell.controlProfileRef.digest!,
      fixtureSetDigests: Object.freeze(
        input.cell.fixtureSetRef?.digest
          ? [input.cell.fixtureSetRef.digest]
          : []
      ),
      ...(input.cell.baselineSetRef?.digest
        ? { baselineSetDigest: input.cell.baselineSetRef.digest }
        : {}),
      targetLeaseBindingDigest: input.targetBinding.bindingDigest,
      profile,
    } satisfies BrowserVerificationCellInput)
  );
  const byteEntries: Array<readonly [VerificationAdapterInputRef, Uint8Array]> =
    [
      [executableInput.ref, executableInput.bytes],
      [programInput.ref, programInput.bytes],
      [profileInput.ref, profileInput.bytes],
    ];
  if (input.cell.checkKind === 'visual') {
    byteEntries.push([
      GOLDEN_G3_V6_VISUAL_BASELINE_SET_INPUT.ref,
      GOLDEN_G3_V6_VISUAL_BASELINE_SET_INPUT.bytes,
    ]);
  }
  if (input.securityAuthority) {
    byteEntries.push([
      input.securityAuthority.input.ref,
      input.securityAuthority.input.bytes,
    ]);
  }
  const byId = new Map(
    byteEntries.map(([ref, bytes]) => [ref.id, bytes] as const)
  );
  const context: VerificationAdapterLifecycleContext = Object.freeze({
    registrySnapshotDigest: createVerificationAdapterRegistrySnapshot(
      GOLDEN_G3_V6_ADAPTERS
    ).snapshotDigest,
    adapter: input.cell.adapter,
    runtimeZone: 'browser',
    runtimeEnvironmentDigest: input.targetBinding.runtimeEnvironmentDigest,
    inputDigest: input.cell.inputDigest,
    executableSnapshotDigest: input.snapshot.contentDigest,
    scenarioProgramDigest: input.program.programDigest,
    controlProfileDigest: input.cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze(
      input.cell.fixtureSetRef?.digest ? [input.cell.fixtureSetRef.digest] : []
    ),
    ...(input.cell.baselineSetRef?.digest
      ? { baselineSetDigest: input.cell.baselineSetRef.digest }
      : {}),
    controlCapabilityIds: input.runtimeControl.controlCapabilityIds,
    controlCapabilitySnapshotDigest:
      input.runtimeControl.controlCapabilitySnapshotDigest,
    appliedControlDigest: input.runtimeControl.appliedControlDigest,
    inputRefs: Object.freeze([
      ...byteEntries.map(([ref]) => ref),
    ]),
    inputResolver: Object.freeze({
      read: async (ref: VerificationAdapterInputRef) => {
        const bytes = byId.get(ref.id);
        if (!bytes) {
          throw new Error(
            `Golden V6 input "${ref.id}" is target-lease-owned or unavailable.`
          );
        }
        return new Uint8Array(bytes);
      },
    }),
    artifactStaging: input.artifactStaging,
    abortSignal: GOLDEN_G3_V6_INACTIVE_SIGNAL,
  });
  return Object.freeze({ context, profile });
};
