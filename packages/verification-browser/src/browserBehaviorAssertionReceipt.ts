import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  createVerificationBehaviorAssertionReceipt,
  digestVerificationValue,
  type VerificationBehaviorAssertionReceipt,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { BrowserVerificationCellInput } from './browserAdapter.types';
import type { BrowserRuntimeControlAttestation } from './browserRuntimeControlPort';
import type { BrowserToolSession } from './browserVerificationPort';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
  type PlaywrightBehaviorResult,
} from './playwrightPrivatePayload';

export type BrowserBehaviorAssertionObservation = Readonly<{
  result: PlaywrightBehaviorResult;
  receipt: VerificationBehaviorAssertionReceipt;
}>;

const canonicalDigestPattern = /^sha256-[a-f0-9]{64}$/u;

export const createBrowserRuntimeFixtureConsumptionBindingDigest = (input: {
  attestation: BrowserRuntimeControlAttestation;
  fixtureSetDigests: readonly string[];
}): string => {
  const network = input.attestation.application.network;
  const fixtureSetDigests = Object.freeze(
    [...input.fixtureSetDigests].sort(compareUnicodeCodePoints)
  );
  const observedConsumptionCount = network.fixtureDispatchCount;
  const emptyLedgerDigest = digestVerificationValue([]);
  const requiredDigests = [
    network.fixtureDispatchLedgerDigest,
    network.fixtureConsumptionLedgerDigest,
  ];
  if (
    network.fixtureBindingDigest !== input.attestation.fixtureBindingDigest ||
    fixtureSetDigests.some((value) => !canonicalDigestPattern.test(value)) ||
    new Set(fixtureSetDigests).size !== fixtureSetDigests.length ||
    !Number.isSafeInteger(observedConsumptionCount) ||
    observedConsumptionCount < 0 ||
    observedConsumptionCount > 1 ||
    (fixtureSetDigests.length === 0 && observedConsumptionCount !== 0) ||
    ![
      network.fixtureRequestCount,
      network.fixtureDispatchCount,
      network.fixtureResponseCount,
    ].every(
      (value) =>
        Number.isSafeInteger(value) && value === observedConsumptionCount
    ) ||
    requiredDigests.some((value) => !canonicalDigestPattern.test(value)) ||
    (observedConsumptionCount === 0
      ? network.fixtureResponseDigest !== null ||
        network.fixtureResolutionDigest !== null ||
        network.fixtureDispatchLedgerDigest !== emptyLedgerDigest ||
        network.fixtureConsumptionLedgerDigest !== emptyLedgerDigest
      : network.fixtureResponseDigest === null ||
        network.fixtureResolutionDigest === null ||
        !canonicalDigestPattern.test(network.fixtureResponseDigest) ||
        !canonicalDigestPattern.test(network.fixtureResolutionDigest))
  ) {
    throw new TypeError(
      'Behavior assertion receipt requires one exact causal runtime Fixture request, Core dispatch, and response, or an exact fixtureless observation.'
    );
  }
  return digestVerificationValue({
    format: 'prodivix.browser-runtime-fixture-consumption-binding',
    version: 1,
    fixtureSetDigests,
    fixtureBindingDigest: network.fixtureBindingDigest,
    fixtureRequestCount: network.fixtureRequestCount,
    fixtureDispatchCount: network.fixtureDispatchCount,
    fixtureResponseCount: network.fixtureResponseCount,
    fixtureDispatchLedgerDigest: network.fixtureDispatchLedgerDigest,
    fixtureResponseDigest: network.fixtureResponseDigest,
    fixtureResolutionDigest: network.fixtureResolutionDigest,
    fixtureConsumptionLedgerDigest: network.fixtureConsumptionLedgerDigest,
  });
};

const assertRuntimeControlAttestationIntegrity = (
  attestation: BrowserRuntimeControlAttestation
): void => {
  const { attestationDigest, ...identity } = attestation;
  if (
    attestation.applicationDigest !==
      digestVerificationValue(attestation.application) ||
    attestationDigest !== digestVerificationValue(identity)
  ) {
    throw new TypeError(
      'Behavior assertion receipt requires an intact authority-issued runtime control attestation.'
    );
  }
};

const actualBlackBoxAssertionSetDigest = (
  result: PlaywrightBehaviorResult,
  program: BehaviorScenarioProgram
): string => {
  const allowedSourceTraceDigests = new Set(
    [
      ...program.sourceTrace.map(({ source }) => source),
      ...program.targetManifest.map(({ source }) => source),
    ].map(digestVerificationValue)
  );
  const structurallyPassed = result.checks.every(
    ({ status }) => status === 'passed'
  );
  const expectedVerdict = result.checks.some(
    ({ status }) => status === 'failed'
  )
    ? 'failed'
    : result.checks.some(({ status }) => status === 'blocked')
      ? 'blocked'
      : 'passed';
  if (
    result.checks.length === 0 ||
    result.verdict !== expectedVerdict ||
    (result.exitCode === 0) !== structurallyPassed ||
    result.checks.some(
      ({ blackBox, sourceTraceDigest }) =>
        !blackBox ||
        (sourceTraceDigest !== undefined &&
          !allowedSourceTraceDigests.has(sourceTraceDigest))
    )
  ) {
    throw new TypeError(
      'Behavior assertion receipt requires a non-empty internally consistent black-box result from this browser session.'
    );
  }
  const assertions = result.checks
    .map((check) =>
      Object.freeze({
        checkId: check.checkId,
        stepId: check.stepId,
        targetId: check.targetId,
        assertionCode: check.assertionCode,
        status: check.status,
        blackBox: check.blackBox,
        diagnosticCodes: check.diagnosticCodes,
        ...(check.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: check.sourceTraceDigest }),
      })
    )
    .sort((left, right) =>
      compareUnicodeCodePoints(left.checkId, right.checkId)
    );
  if (
    new Set(assertions.map(({ checkId }) => checkId)).size !== assertions.length
  ) {
    throw new TypeError(
      'Behavior assertion receipt requires unique observed check identities.'
    );
  }
  return digestVerificationValue({
    format: 'prodivix.browser-black-box-assertion-set',
    version: 1,
    scenarioId: result.scenarioId,
    tool: result.tool,
    assertions,
  });
};

/**
 * Binds only actual decoded Playwright checks from the live attempt. Expected
 * Program observations are never hashed as if they had been observed.
 */
export const createBrowserBehaviorAssertionReceipt = (input: {
  cell: VerificationPlanCell;
  profile: BrowserVerificationCellInput;
  program: BehaviorScenarioProgram;
  runtimeControlAttestation: BrowserRuntimeControlAttestation;
  result: PlaywrightBehaviorResult;
}): VerificationBehaviorAssertionReceipt => {
  const attestation = input.runtimeControlAttestation;
  const fixtureSetDigests = Object.freeze(
    [...input.profile.fixtureSetDigests].sort(compareUnicodeCodePoints)
  );
  if (
    input.cell.id !== input.profile.cellId ||
    input.cell.scenarioId !== input.profile.scenarioId ||
    input.program.scenarioId !== input.profile.scenarioId ||
    input.program.programDigest !== input.profile.scenarioProgramDigest ||
    input.program.executableSnapshotDigest !==
      input.profile.executableSnapshotDigest ||
    input.program.controlProfileDigest !== input.profile.controlProfileDigest ||
    !sameCanonicalJson(input.program.fixtureSetDigests, fixtureSetDigests) ||
    input.result.scenarioId !== input.program.scenarioId ||
    (attestation.phase !== 'initial' && attestation.phase !== 'terminal') ||
    attestation.attemptId.length === 0 ||
    attestation.executableSnapshotDigest !==
      input.profile.executableSnapshotDigest ||
    attestation.targetLeaseBindingDigest !==
      input.profile.targetLeaseBindingDigest ||
    !canonicalDigestPattern.test(attestation.fixtureBindingDigest)
  ) {
    throw new TypeError(
      'Behavior assertion receipt drifted from its live attempt, Scenario, Snapshot, Control, Fixture, or target lease binding.'
    );
  }
  assertRuntimeControlAttestationIntegrity(attestation);
  return createVerificationBehaviorAssertionReceipt({
    attemptId: attestation.attemptId,
    cellId: input.cell.id,
    scenarioId: input.result.scenarioId,
    executableSnapshotDigest: input.profile.executableSnapshotDigest,
    scenarioProgramDigest: input.profile.scenarioProgramDigest,
    controlProfileDigest: input.profile.controlProfileDigest,
    fixtureSetDigests,
    targetLeaseBindingDigest: input.profile.targetLeaseBindingDigest,
    runtimeFixtureBindingDigest:
      createBrowserRuntimeFixtureConsumptionBindingDigest({
        attestation,
        fixtureSetDigests,
      }),
    blackBoxAssertionSetDigest: actualBlackBoxAssertionSetDigest(
      input.result,
      input.program
    ),
  });
};

export const collectBrowserBehaviorAssertionObservation = async (input: {
  cell: VerificationPlanCell;
  profile: BrowserVerificationCellInput;
  program: BehaviorScenarioProgram;
  session: BrowserToolSession;
}): Promise<BrowserBehaviorAssertionObservation> => {
  const result = evaluatePlaywrightBehavior(
    decodePlaywrightBehaviorPayload(
      await input.session.executeBehavior(input.program)
    )
  );
  return Object.freeze({
    result,
    receipt: createBrowserBehaviorAssertionReceipt({
      cell: input.cell,
      profile: input.profile,
      program: input.program,
      runtimeControlAttestation: input.session.runtimeControlAttestation,
      result,
    }),
  });
};
