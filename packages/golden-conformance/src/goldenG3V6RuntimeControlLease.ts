import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_LIMITS,
  normalizeExecutionAuthSessionFixtureResponse,
  type DeterministicRuntimeAttemptStartResult,
  type ExecutionAuthSessionFixtureResponse,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import {
  assertBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlAttestation,
  digestBrowserVerificationBytes,
  type BrowserRuntimeControlFixtureRequest,
  type BrowserRuntimeControlLease,
} from '@prodivix/verification-browser';
import {
  assertFixtureRuntimeApplication,
  assertFixtureRuntimeProjection,
  cleanupUnexpectedRuntimeStart,
  runtimeResidualCanaryIds,
  wrapRuntimeControlSession,
  type GoldenG3V6RuntimeControlAttemptState,
} from './goldenG3V6RuntimeControlAttemptState';
import {
  createGoldenG3V6ExpectedControlWitness,
  createGoldenG3V6NoFixtureDispatchEvidence,
  dispatchGoldenG3V6AuthFixture,
  readGoldenG3V6LiveControlWitness,
} from './goldenG3V6RuntimeControlProvider';

export const createGoldenG3V6RuntimeControlLease = (
  state: GoldenG3V6RuntimeControlAttemptState,
  plan: BrowserRuntimeControlLease['plan']
): BrowserRuntimeControlLease => {
  const leaseId = `runtime-control:${digestVerificationValue({
    attemptId: state.input.attemptId,
    generation: state.input.generation,
    providerKind: state.input.providerKind,
    targetLeaseBindingDigest: state.input.targetLease.bindingDigest,
    controlDigest: plan.controlDigest,
  }).slice('sha256-'.length)}`;
  const sessionState = () => {
    if (
      !state.host ||
      !state.exposedSession ||
      !state.witness ||
      state.blocked ||
      state.releaseAttempted
    ) {
      throw new Error(
        `Golden V6 runtime control lease "${leaseId}" is not ready.`
      );
    }
    return {
      host: state.host,
      session: state.exposedSession,
      witness: state.witness,
    } as const;
  };
  const evidenceState = () => {
    const ready = sessionState();
    if (!state.fixtureRuntimeDispatch) {
      throw new Error(
        `Golden V6 runtime control lease "${leaseId}" has not consumed its runtime fixture.`
      );
    }
    return ready;
  };
  const lease: BrowserRuntimeControlLease = Object.freeze({
    leaseId,
    attemptId: state.input.attemptId,
    generation: state.input.generation,
    providerKind: state.input.providerKind,
    targetLeaseBindingDigest: state.input.targetLease.bindingDigest,
    originDigest: state.input.targetLease.binding.originDigest,
    controlHostUrl: state.bindings.controlHostUrl,
    executableSnapshotDigest: state.input.snapshot.contentDigest,
    resourceManifest: state.bindings.resourceManifest,
    fixtureBinding: state.bindings.fixtureBinding,
    plan,
    expectedControlDigest: plan.controlDigest,
    expectedCapabilitySnapshot: state.capabilitySnapshot,
    controlCapabilityIds: state.controlCapabilityIds,
    ...(state.bindings.remoteBinding
      ? { remoteBinding: state.bindings.remoteBinding }
      : {}),
    async start(host): Promise<DeterministicRuntimeAttemptStartResult> {
      if (
        !state.acquired ||
        state.started ||
        state.releaseAttempted ||
        state.host
      ) {
        throw new Error(
          `Golden V6 runtime control lease "${leaseId}" start is single-use.`
        );
      }
      state.started = true;
      state.host = host;
      state.deferredHost.bind(host);
      let result: DeterministicRuntimeAttemptStartResult;
      try {
        result = await state.provider.startAttempt({
          attemptId: state.input.attemptId,
          plan,
        });
      } catch (error) {
        await cleanupUnexpectedRuntimeStart(state);
        throw error;
      }
      if (result.status !== 'ready') {
        state.blocked = true;
        if (result.code === 'control-preflight-failed') {
          state.startFailedCleanly = true;
        } else {
          try {
            const residual = await host.probe({
              namespace: `${state.provider.descriptor.id}:${state.input.attemptId}`,
              phase: 'after-cleanup',
            });
            state.startFailedCleanly =
              runtimeResidualCanaryIds(residual, state.input.attemptId)
                .length === 0;
          } catch {
            state.startFailedCleanly = false;
          }
        }
        return result;
      }
      state.coreSession = result.session;
      state.exposedSession = wrapRuntimeControlSession(state, result.session);
      try {
        state.witness = createGoldenG3V6ExpectedControlWitness(
          result.session,
          plan
        );
        if (plan.network.fixtures.length === 0) {
          state.fixtureRuntimeDispatch =
            createGoldenG3V6NoFixtureDispatchEvidence(result.session, plan);
          assertFixtureRuntimeProjection(state);
        }
      } catch (error) {
        const canary = await state.exposedSession.cleanup();
        state.startFailedCleanly = canary.clean;
        throw error;
      }
      return Object.freeze({
        status: 'ready',
        session: state.exposedSession,
      });
    },
    expectedWitness() {
      return sessionState().witness;
    },
    liveWitness() {
      sessionState();
      return readGoldenG3V6LiveControlWitness(
        state.exposedSession!,
        state.input.attemptId
      );
    },
    ...(state.bindings.authFixtureProjection
      ? {
          async resolveRuntimeFixture(
            request: BrowserRuntimeControlFixtureRequest
          ): Promise<ExecutionAuthSessionFixtureResponse> {
            const ready = sessionState();
            const projection = state.bindings.authFixtureProjection;
            if (
              !projection ||
              state.bindings.productionNoFixtureProjection ||
              state.fixtureRuntimeRequest ||
              state.fixtureRuntimeTransport ||
              state.fixtureRuntimeResolution ||
              state.fixtureRuntimeDispatch ||
              ready.session.network.events().length !== 0
            ) {
              throw new Error(
                `Golden V6 runtime fixture resolver for "${leaseId}" is single-use.`
              );
            }
            const transport = projection.authSessionTransport;
            const expectedAttempt = plan.network.fixtures[0]?.attempt ?? 1;
            const expectedUrl = new URL(
              EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
              `${state.input.targetLease.origin}/`
            ).href;
            const parsedUrl = new URL(request.url);
            if (
              transport.endpointPath !==
                EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH ||
              request.method !== transport.method ||
              request.url !== expectedUrl ||
              parsedUrl.href !== expectedUrl ||
              parsedUrl.origin !==
                new URL(state.input.targetLease.origin).origin ||
              parsedUrl.username ||
              parsedUrl.password ||
              parsedUrl.search ||
              parsedUrl.hash ||
              request.attempt !== expectedAttempt ||
              !Number.isSafeInteger(request.attempt) ||
              request.attempt < 1 ||
              request.attempt > 10 ||
              !request.invocationId ||
              request.invocationId !== request.invocationId.trim() ||
              request.invocationId !== request.invocationId.normalize('NFC') ||
              !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(request.invocationId) ||
              new TextEncoder().encode(request.invocationId).byteLength >
                EXECUTION_AUTH_SESSION_FIXTURE_LIMITS.maximumInvocationIdentifierBytes
            ) {
              throw new TypeError(
                'Golden V6 runtime fixture request drifted from the Compiler endpoint.'
              );
            }
            const canonicalRequest = Object.freeze({
              method: 'GET' as const,
              url: expectedUrl,
              invocationId: request.invocationId,
              attempt: request.attempt,
            });
            state.fixtureRuntimeRequest = canonicalRequest;
            const dispatched = await dispatchGoldenG3V6AuthFixture(
              ready.session,
              plan
            );
            state.fixtureRuntimeResolution = dispatched.resolution;
            state.fixtureRuntimeDispatch = dispatched.evidence;
            assertFixtureRuntimeProjection(state);
            const actualValue = dispatched.resolution.value;
            const actualOutcomeDigest = digestVerificationValue({
              kind: 'result',
              value: actualValue,
            });
            if (
              !isPlainObject(actualValue) ||
              typeof actualValue.principalId !== 'string' ||
              !Array.isArray(actualValue.permissionIds) ||
              actualOutcomeDigest !== dispatched.resolution.outcomeDigest ||
              actualOutcomeDigest !== transport.outcomeDigest
            ) {
              throw new TypeError(
                'Golden V6 runtime fixture response cannot be derived from the live Core outcome.'
              );
            }
            const response = normalizeExecutionAuthSessionFixtureResponse({
              format: transport.responseFormat,
              version: transport.responseVersion,
              fixtureSetId: transport.fixtureSetId,
              fixtureSetDigest: transport.fixtureSetDigest,
              fixtureId: dispatched.resolution.fixtureId,
              resourceId: dispatched.resolution.resourceId,
              inputDigest: dispatched.resolution.inputDigest,
              outcomeDigest: actualOutcomeDigest,
              projectionDigest: transport.projectionDigest,
              providerId: dispatched.resolution.resourceId,
              principalId: actualValue.principalId,
              permissionIds: actualValue.permissionIds,
              invocationId: canonicalRequest.invocationId,
              attempt: canonicalRequest.attempt,
            });
            const dispatchEvents = ready.session.network.events();
            const dispatchEvent = dispatchEvents[0];
            if (!dispatchEvent || dispatchEvents.length !== 1) {
              throw new TypeError(
                'Golden V6 runtime fixture has no unique live Core dispatch event.'
              );
            }
            const responseDigest = digestBrowserVerificationBytes(
              new TextEncoder().encode(canonicalJsonText(response))
            );
            const resolutionIdentity = Object.freeze({
              request: canonicalRequest,
              dispatchEvent,
              response,
              responseDigest,
            });
            const resolutionDigest =
              digestVerificationValue(resolutionIdentity);
            state.fixtureRuntimeTransport = Object.freeze({
              request: canonicalRequest,
              response,
              dispatchLedgerDigest: digestVerificationValue(dispatchEvents),
              responseDigest,
              resolutionDigest,
              consumptionLedgerDigest: digestVerificationValue([
                Object.freeze({
                  ...resolutionIdentity,
                  resolutionDigest,
                }),
              ]),
            });
            return response;
          },
        }
      : {}),
    async attest(phase) {
      const ready = sessionState();
      const issued = [...state.issued.values()];
      if (
        (phase === 'initial' &&
          issued.some((candidate) => candidate.phase === 'initial')) ||
        (phase === 'terminal' &&
          (!issued.some((candidate) => candidate.phase === 'initial') ||
            issued.some((candidate) => candidate.phase === 'terminal') ||
            state.terminalAttestationAttempted))
      ) {
        throw new Error(
          `Golden V6 runtime control ${phase} attestation is out of order.`
        );
      }
      if (phase === 'terminal') {
        state.terminalAttestationAttempted = true;
      }
      const application = await ready.host.observe(ready.session, phase);
      if (state.fixtureRuntimeDispatch) {
        evidenceState();
        assertFixtureRuntimeProjection(state);
      } else if (
        phase !== 'initial' ||
        !state.bindings.authFixtureProjection ||
        state.bindings.productionNoFixtureProjection
      ) {
        throw new Error(
          `Golden V6 runtime control ${phase} attestation has no consumed fixture evidence.`
        );
      }
      assertFixtureRuntimeApplication(state, application, phase);
      const attestation = createBrowserRuntimeControlAttestation({
        lease,
        phase,
        providerId: state.provider.descriptor.id,
        namespace: ready.session.applied.namespace,
        capabilitySnapshotDigest:
          ready.session.applied.capabilitySnapshotDigest,
        application,
      });
      state.issued.set(attestation.attestationDigest, attestation);
      return attestation;
    },
    assertIssued(attestation) {
      const asserted = assertBrowserRuntimeControlAttestation(
        attestation,
        lease
      );
      const issued = state.issued.get(asserted.attestationDigest);
      if (!issued || !sameCanonicalJson(issued, asserted)) {
        throw new TypeError(
          'Golden V6 runtime control attestation was not issued by this lease.'
        );
      }
      return asserted;
    },
    sealTerminal(attestation) {
      const asserted = lease.assertIssued(attestation);
      if (
        asserted.phase !== 'terminal' ||
        state.terminal ||
        state.releaseAttempted
      ) {
        throw new Error(
          'Golden V6 runtime control terminal attestation cannot be sealed.'
        );
      }
      state.terminal = asserted;
    },
    terminalSealed: () => state.terminal !== undefined,
  });
  return lease;
};
