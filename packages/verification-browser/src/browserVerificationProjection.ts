import type { VerificationPlanCell } from '@prodivix/verification';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
} from './browserAdapter.types';
import {
  collectBrowserBehaviorAssertionObservation,
  createBrowserBehaviorAssertionReceipt,
} from './browserBehaviorAssertionReceipt';
import {
  projectBrowserE2e,
  projectBrowserVisual,
} from './browserVerificationFunctionalProjection';
import type { BrowserToolSession } from './browserVerificationPort';
import {
  projectBrowserAccessibility,
  projectBrowserPerformance,
  projectBrowserSecurity,
} from './browserVerificationQualityProjection';
import type { BrowserVerificationProjection } from './browserVerificationProjectionSupport';

export type { BrowserVerificationProjection } from './browserVerificationProjectionSupport';

export const projectBrowserVerificationAttempt = async (
  input: Readonly<{
    cell: VerificationPlanCell;
    profile: BrowserVerificationCellInput;
    policy: BrowserVerificationCellPolicy;
    session: BrowserToolSession;
  }>
): Promise<BrowserVerificationProjection> => {
  if (
    input.profile.checkKind !== input.cell.checkKind ||
    input.profile.profile.kind !== input.policy.kind
  ) {
    throw new TypeError('Browser verification profile/policy family drifted.');
  }
  if (
    input.policy.kind === 'security' &&
    input.profile.fixtureSetDigests.length !== 0
  ) {
    throw new TypeError(
      'Production security verification cannot carry test Fixture Sets.'
    );
  }
  const behavior = await collectBrowserBehaviorAssertionObservation({
    cell: input.cell,
    profile: input.profile,
    program: input.policy.program,
    session: input.session,
  });
  let projection: BrowserVerificationProjection;
  switch (input.policy.kind) {
    case 'e2e':
      projection = await projectBrowserE2e(
        input.cell,
        input.profile,
        input.policy,
        input.session,
        behavior
      );
      break;
    case 'visual':
      projection = await projectBrowserVisual(
        input.cell,
        input.profile,
        input.policy,
        input.session,
        behavior
      );
      break;
    case 'accessibility':
      projection = await projectBrowserAccessibility(
        input.cell,
        input.profile,
        input.policy,
        input.session,
        behavior
      );
      break;
    case 'performance':
      projection = await projectBrowserPerformance(
        input.cell,
        input.profile,
        input.policy,
        input.session,
        behavior
      );
      break;
    case 'security':
      projection = await projectBrowserSecurity(
        input.cell,
        input.profile,
        input.policy,
        input.session,
        behavior
      );
      break;
  }
  // All browser-side collectors have now completed. Bind the report receipt to
  // the terminal causal ledger rather than the pre-behavior initial snapshot.
  const terminalAttestation = await input.session.finalizeRuntimeControls();
  const receipt = createBrowserBehaviorAssertionReceipt({
    cell: input.cell,
    profile: input.profile,
    program: input.policy.program,
    runtimeControlAttestation: terminalAttestation,
    result: behavior.result,
  });
  return Object.freeze({
    ...projection,
    payload: Object.freeze({
      ...projection.payload,
      behaviorAssertionReceipt: receipt,
    }),
  }) as BrowserVerificationProjection;
};
