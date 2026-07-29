import type {
  DeterministicIsolationCanary,
  DeterministicIsolationResidual,
  DeterministicRuntimeCapabilitySnapshot,
  DeterministicRuntimeControlId,
  DeterministicRuntimeProvider,
  DeterministicRuntimeSession,
  ExecutionAuthSessionFixtureResponse,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import type {
  BrowserRuntimeControlApplication,
  BrowserRuntimeControlAttestation,
  BrowserRuntimeControlExpectedWitness,
  BrowserRuntimeControlFixtureRequest,
  BrowserRuntimeControlHost,
  BrowserRuntimeControlLease,
  BrowserRuntimeControlReleaseResult,
} from '@prodivix/verification-browser';
import type { GoldenG3V6RuntimeControlBindings } from './goldenG3V6RuntimeControlBindings';
import type {
  GoldenG3V6AuthFixtureResolution,
  GoldenG3V6DeferredControlHost,
  GoldenG3V6FixtureRuntimeDispatchEvidence,
} from './goldenG3V6RuntimeControlProvider';
import type {
  GoldenG3V6RuntimeControlExpectation,
  GoldenG3V6RuntimeControlRegistrationInput,
} from './goldenG3V6RuntimeControlEvidence';
import { GOLDEN_G3_V6_EMPTY_RUNTIME_RESIDUAL } from './goldenG3V6RuntimeControlProvider';

export type GoldenG3V6RuntimeControlAttemptState = {
  readonly input: GoldenG3V6RuntimeControlRegistrationInput;
  readonly provider: DeterministicRuntimeProvider;
  readonly deferredHost: GoldenG3V6DeferredControlHost;
  readonly capabilitySnapshot: DeterministicRuntimeCapabilitySnapshot;
  readonly controlCapabilityIds: readonly DeterministicRuntimeControlId[];
  readonly expectation: GoldenG3V6RuntimeControlExpectation;
  readonly bindings: GoldenG3V6RuntimeControlBindings;
  lease?: BrowserRuntimeControlLease;
  host?: BrowserRuntimeControlHost;
  acquired: boolean;
  started: boolean;
  blocked: boolean;
  startFailedCleanly: boolean;
  coreSession?: DeterministicRuntimeSession;
  exposedSession?: DeterministicRuntimeSession;
  witness?: BrowserRuntimeControlExpectedWitness;
  fixtureRuntimeRequest?: BrowserRuntimeControlFixtureRequest;
  fixtureRuntimeDispatch?: GoldenG3V6FixtureRuntimeDispatchEvidence;
  fixtureRuntimeResolution?: GoldenG3V6AuthFixtureResolution;
  fixtureRuntimeTransport?: Readonly<{
    request: BrowserRuntimeControlFixtureRequest;
    response: ExecutionAuthSessionFixtureResponse;
    dispatchLedgerDigest: string;
    responseDigest: string;
    resolutionDigest: string;
    consumptionLedgerDigest: string;
  }>;
  cleanupPromise?: Promise<DeterministicIsolationCanary>;
  cleanupCanary?: DeterministicIsolationCanary;
  readonly issued: Map<string, BrowserRuntimeControlAttestation>;
  terminalAttestationAttempted: boolean;
  terminal?: BrowserRuntimeControlAttestation;
  releaseAttempted: boolean;
  releaseResult?: BrowserRuntimeControlReleaseResult;
};

export const emptyRuntimeResidual = (): DeterministicIsolationResidual =>
  Object.freeze({ ...GOLDEN_G3_V6_EMPTY_RUNTIME_RESIDUAL });

export const runtimeResidualCanaryIds = (
  residual: DeterministicIsolationResidual,
  attemptId: string
): readonly string[] =>
  Object.freeze(
    Object.entries(residual)
      .filter(([, count]) => count !== 0)
      .map(([field]) => `canary:${attemptId}:${field}`)
      .sort(compareUnicodeCodePoints)
  );

export const failedRuntimeControlRelease = (
  attemptId: string,
  code: string,
  residual: DeterministicIsolationResidual = emptyRuntimeResidual()
): BrowserRuntimeControlReleaseResult =>
  Object.freeze({
    status: 'failed',
    residualCanaryIds: runtimeResidualCanaryIds(residual, attemptId),
    diagnosticCodes: Object.freeze([code]),
  });

export const assertFixtureRuntimeProjection = (
  state: GoldenG3V6RuntimeControlAttemptState
): void => {
  const dispatch = state.fixtureRuntimeDispatch;
  const resolution = state.fixtureRuntimeResolution;
  const projection = state.bindings.authFixtureProjection;
  const productionProjection = state.bindings.productionNoFixtureProjection;
  if (
    !dispatch ||
    (dispatch.mode === 'auth-session'
      ? !projection ||
        productionProjection !== undefined ||
        !resolution ||
        dispatch.dispatchCount !== 1 ||
        dispatch.fixtureId !== projection.fixtureId ||
        dispatch.targetKind !== projection.targetKind ||
        dispatch.resourceId !== projection.resourceId ||
        dispatch.inputDigest !== projection.inputDigest ||
        dispatch.outcomeDigest !== projection.outcomeDigest ||
        resolution.fixtureId !== projection.fixtureId ||
        resolution.targetKind !== projection.targetKind ||
        resolution.resourceId !== projection.resourceId ||
        resolution.inputDigest !== projection.inputDigest ||
        resolution.outcomeDigest !== projection.outcomeDigest ||
        !sameCanonicalJson(resolution.value, {
          principalId: projection.authSessionTransport.principalId,
          permissionIds: projection.authSessionTransport.permissionIds,
        })
      : projection !== undefined ||
        !productionProjection ||
        resolution !== undefined ||
        state.fixtureRuntimeRequest !== undefined ||
        state.fixtureRuntimeTransport !== undefined ||
        dispatch.dispatchCount !== 0)
  ) {
    throw new TypeError(
      'Golden V6 Core fixture dispatch drifted from its Compiler projection authority.'
    );
  }
};

export const assertFixtureRuntimeApplication = (
  state: GoldenG3V6RuntimeControlAttemptState,
  application: BrowserRuntimeControlApplication,
  phase: BrowserRuntimeControlAttestation['phase']
): void => {
  const projection = state.bindings.authFixtureProjection;
  const transport = state.fixtureRuntimeTransport;
  const dispatch = state.fixtureRuntimeDispatch;
  const session = state.exposedSession;
  const emptyLedgerDigest = digestVerificationValue([]);
  if (phase === 'initial' && projection && !dispatch) {
    if (
      !session ||
      state.fixtureRuntimeRequest !== undefined ||
      state.fixtureRuntimeResolution !== undefined ||
      transport !== undefined ||
      session.network.events().length !== 0 ||
      application.network.fixtureRequestCount !== 0 ||
      application.network.fixtureDispatchCount !== 0 ||
      application.network.fixtureResponseCount !== 0 ||
      application.network.fixtureDispatchLedgerDigest !== emptyLedgerDigest ||
      application.network.fixtureResponseDigest !== null ||
      application.network.fixtureResolutionDigest !== null ||
      application.network.fixtureConsumptionLedgerDigest !== emptyLedgerDigest
    ) {
      throw new TypeError(
        'Golden V6 initial runtime fixture state is partial or non-empty.'
      );
    }
    return;
  }
  const expectedCount = projection ? 1 : 0;
  const dispatchLedgerDigest = session
    ? digestVerificationValue(session.network.events())
    : '';
  if (
    !session ||
    !dispatch ||
    dispatch.dispatchCount !== expectedCount ||
    application.network.fixtureRequestCount !== expectedCount ||
    application.network.fixtureDispatchCount !== expectedCount ||
    application.network.fixtureResponseCount !== expectedCount ||
    application.network.fixtureDispatchLedgerDigest !== dispatchLedgerDigest ||
    (projection
      ? !transport ||
        application.network.fixtureResponseDigest !==
          transport.responseDigest ||
        application.network.fixtureResolutionDigest !==
          transport.resolutionDigest ||
        application.network.fixtureConsumptionLedgerDigest !==
          transport.consumptionLedgerDigest
      : transport !== undefined ||
        application.network.fixtureResponseDigest !== null ||
        application.network.fixtureResolutionDigest !== null ||
        application.network.fixtureDispatchLedgerDigest !== emptyLedgerDigest ||
        application.network.fixtureConsumptionLedgerDigest !==
          emptyLedgerDigest)
  ) {
    throw new TypeError(
      'Golden V6 runtime fixture request, Core dispatch, response, and browser consumption drifted.'
    );
  }
};

export const wrapRuntimeControlSession = (
  state: GoldenG3V6RuntimeControlAttemptState,
  session: DeterministicRuntimeSession
): DeterministicRuntimeSession => {
  const cleanup = (): Promise<DeterministicIsolationCanary> => {
    state.cleanupPromise ??= session.cleanup().then((canary) => {
      state.cleanupCanary = canary;
      return canary;
    });
    return state.cleanupPromise;
  };
  return Object.freeze({
    ...session,
    cleanup,
  });
};

export const cleanupUnexpectedRuntimeStart = async (
  state: GoldenG3V6RuntimeControlAttemptState
): Promise<void> => {
  if (!state.host) {
    state.startFailedCleanly = true;
    return;
  }
  const namespace = `${state.provider.descriptor.id}:${state.input.attemptId}`;
  const errors: unknown[] = [];
  try {
    await state.host.cleanup({ namespace, plan: state.lease!.plan });
  } catch (error) {
    errors.push(error);
  }
  let residual = emptyRuntimeResidual();
  try {
    residual = await state.host.probe({
      namespace,
      phase: 'after-cleanup',
    });
  } catch (error) {
    errors.push(error);
  }
  const residualIds = runtimeResidualCanaryIds(residual, state.input.attemptId);
  if (errors.length || residualIds.length) {
    throw new AggregateError(
      errors,
      `Golden V6 partial-start cleanup left residuals: ${residualIds.join(', ')}.`
    );
  }
  state.startFailedCleanly = true;
};
