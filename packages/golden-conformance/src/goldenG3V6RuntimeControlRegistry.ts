import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  createBehaviorDeterministicControlPlan,
  digestBehaviorControlProfile,
  digestBehaviorValue,
  type BehaviorFixtureSet,
} from '@prodivix/behavior';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { BrowserRuntimeControlPort } from '@prodivix/verification-browser';
import { createGoldenG3V6RuntimeControlBindings } from './goldenG3V6RuntimeControlBindings';
import {
  cleanupUnexpectedRuntimeStart,
  emptyRuntimeResidual,
  failedRuntimeControlRelease,
  runtimeResidualCanaryIds,
  type GoldenG3V6RuntimeControlAttemptState,
} from './goldenG3V6RuntimeControlAttemptState';
import type {
  GoldenG3V6RuntimeControlEvidence,
  GoldenG3V6RuntimeControlExpectation,
  GoldenG3V6RuntimeControlRegistration,
  GoldenG3V6RuntimeControlRegistry,
} from './goldenG3V6RuntimeControlEvidence';
import { projectGoldenG3V6RuntimeControlEvidence } from './goldenG3V6RuntimeControlEvidenceProjection';
import { createGoldenG3V6RuntimeControlLease } from './goldenG3V6RuntimeControlLease';
import {
  createGoldenG3V6RuntimeControlProvider,
  createGoldenG3V6RuntimePlanCell,
  exactGoldenG3V6ExpectedControlIds,
} from './goldenG3V6RuntimeControlProvider';
import { validateGoldenG3V6RuntimeControlRegistration } from './goldenG3V6RuntimeControlRegistrationValidation';
import { GOLDEN_G3_LOGIN_FIXTURE_SET } from './goldenG3ScenarioFixture';

export const createGoldenG3V6RuntimeControlRegistryImplementation = (
  options: Readonly<{
    /**
     * Same-package browser causality tests may issue a fully Compiler-bound
     * variant. The public production composition never exposes this seam.
     */
    authFixtureSet?: BehaviorFixtureSet;
  }> = {}
): GoldenG3V6RuntimeControlRegistry => {
  const authFixtureSet = options.authFixtureSet ?? GOLDEN_G3_LOGIN_FIXTURE_SET;
  const authFixtureSetDigest = digestBehaviorValue(authFixtureSet);
  const attempts = new Map<string, GoldenG3V6RuntimeControlAttemptState>();
  const retiredEvidence = new Map<string, GoldenG3V6RuntimeControlEvidence>();
  const assertReleased = (
    attemptId: string
  ): GoldenG3V6RuntimeControlEvidence => {
    const evidence = retiredEvidence.get(attemptId);
    if (!evidence) {
      throw new Error(
        `Golden V6 runtime control "${attemptId}" was not cleanly released and retired.`
      );
    }
    return evidence;
  };
  return Object.freeze({
    async register(input): Promise<GoldenG3V6RuntimeControlRegistration> {
      if (attempts.has(input.attemptId)) {
        throw new Error(
          `Golden V6 runtime control "${input.attemptId}" is already registered.`
        );
      }
      validateGoldenG3V6RuntimeControlRegistration(input, authFixtureSetDigest);
      const planned = createBehaviorDeterministicControlPlan({
        program: input.program,
        profile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
        fixtureSets:
          input.cell.checkKind === 'security'
            ? Object.freeze([])
            : Object.freeze([authFixtureSet]),
        cell: createGoldenG3V6RuntimePlanCell(input),
        maximumConcurrency: 1,
      });
      if (planned.status !== 'ready') {
        throw new Error(
          `Golden V6 deterministic controls are blocked (program=${input.program.controlProfileDigest}, resolved=${digestBehaviorControlProfile(BEHAVIOR_DETERMINISTIC_CONTROL_PRESET)}): ${JSON.stringify(planned.issues)}`
        );
      }
      const bindings = await createGoldenG3V6RuntimeControlBindings({
        providerKind: input.providerKind,
        attemptId: input.attemptId,
        program: input.program,
        plan: planned.plan,
        targetLease: input.targetLease,
        snapshot: input.snapshot,
        buildBundle: input.buildBundle,
        authFixtureSet,
        ...(input.fixtureProjectionReceipt
          ? {
              fixtureProjectionReceipt: input.fixtureProjectionReceipt,
            }
          : {}),
        ...(input.productionSecurityAuthority
          ? {
              productionSecurityAuthority: input.productionSecurityAuthority,
            }
          : {}),
        ...(input.remoteEvidence
          ? { remoteEvidence: input.remoteEvidence }
          : {}),
      });
      const {
        deferredHost,
        provider,
        capabilitySnapshot,
        controlCapabilityIds,
      } = createGoldenG3V6RuntimeControlProvider({
        registration: input,
        plan: planned.plan,
      });
      const expectation: GoldenG3V6RuntimeControlExpectation = Object.freeze({
        providerKind: input.providerKind,
        providerId: provider.descriptor.id,
        controlCapabilityIds,
        controlCapabilitySnapshotDigest: capabilitySnapshot.snapshotDigest,
        expectedControlDigest: planned.plan.controlDigest,
        appliedControlDigest: planned.plan.controlDigest,
        resourceManifestDigest: bindings.resourceManifest.manifestDigest,
        fixtureBindingDigest: bindings.fixtureBinding.bindingDigest,
        fixtureProjectionAuthorityDigest:
          bindings.fixtureBinding.projectionAuthorityDigest,
        ...(bindings.remoteBinding
          ? {
              remoteBindingDigest: bindings.remoteBinding.bindingDigest,
            }
          : {}),
      });
      const state: GoldenG3V6RuntimeControlAttemptState = {
        input,
        provider,
        deferredHost,
        capabilitySnapshot,
        controlCapabilityIds,
        expectation,
        bindings,
        acquired: false,
        started: false,
        blocked: false,
        startFailedCleanly: false,
        issued: new Map(),
        terminalAttestationAttempted: false,
        releaseAttempted: false,
      };
      state.lease = createGoldenG3V6RuntimeControlLease(state, planned.plan);
      attempts.set(input.attemptId, state);
      return Object.freeze({
        expectation,
        assertReleased: () => assertReleased(input.attemptId),
      });
    },
    port: Object.freeze({
      async acquire(
        input: Parameters<BrowserRuntimeControlPort['acquire']>[0],
        signal: Parameters<BrowserRuntimeControlPort['acquire']>[1]
      ) {
        const state = attempts.get(input.attemptId);
        if (
          signal.aborted ||
          !state ||
          state.acquired ||
          state.releaseAttempted ||
          input.generation !== state.input.generation ||
          input.providerKind !== state.input.providerKind ||
          input.executableSnapshotDigest !==
            state.input.snapshot.contentDigest ||
          input.expectedControlDigest !==
            state.expectation.expectedControlDigest ||
          input.expectedCapabilitySnapshotDigest !==
            state.capabilitySnapshot.snapshotDigest ||
          !sameCanonicalJson(input.cell, state.input.cell) ||
          !sameCanonicalJson(input.targetLease, state.input.targetLease) ||
          !sameCanonicalJson(
            exactGoldenG3V6ExpectedControlIds(
              input.expectedControlCapabilityIds
            ),
            state.controlCapabilityIds
          )
        ) {
          throw new Error(
            `Golden V6 runtime control "${input.attemptId}" is unavailable or drifted.`
          );
        }
        state.acquired = true;
        return state.lease!;
      },
      async release(
        lease: Parameters<BrowserRuntimeControlPort['release']>[0],
        terminalAttestation: Parameters<
          BrowserRuntimeControlPort['release']
        >[1],
        _signal: Parameters<BrowserRuntimeControlPort['release']>[2]
      ) {
        const state = attempts.get(lease.attemptId);
        if (
          !state ||
          !state.acquired ||
          state.releaseAttempted ||
          state.lease !== lease
        ) {
          return failedRuntimeControlRelease(
            lease.attemptId,
            'GOLDEN_RUNTIME_CONTROL_RELEASE_REPLAY'
          );
        }
        if (!state.started || state.blocked || state.startFailedCleanly) {
          state.releaseAttempted = true;
          state.releaseResult =
            !state.started || state.startFailedCleanly
              ? Object.freeze({
                  status: 'clean',
                  residualCanaryIds: Object.freeze([]),
                  diagnosticCodes: Object.freeze([]),
                })
              : failedRuntimeControlRelease(
                  lease.attemptId,
                  'GOLDEN_RUNTIME_CONTROL_BLOCKED_CLEANUP_UNATTESTED'
                );
          return state.releaseResult;
        }
        let terminalValid = false;
        try {
          terminalValid =
            terminalAttestation !== undefined &&
            state.terminal !== undefined &&
            lease.terminalSealed() &&
            sameCanonicalJson(
              lease.assertIssued(terminalAttestation),
              state.terminal
            );
        } finally {
          state.releaseAttempted = true;
        }
        if (!terminalValid) {
          const cleanFailureRetirement =
            terminalAttestation === undefined &&
            state.terminal === undefined &&
            !lease.terminalSealed() &&
            state.cleanupCanary?.clean === true &&
            (state.fixtureRuntimeDispatch !== undefined ||
              ([...state.issued.values()].some(
                ({ phase }) => phase === 'initial'
              ) &&
                !state.terminalAttestationAttempted));
          state.releaseResult = cleanFailureRetirement
            ? Object.freeze({
                status: 'clean',
                residualCanaryIds: Object.freeze([]),
                diagnosticCodes: Object.freeze([]),
              })
            : failedRuntimeControlRelease(
                lease.attemptId,
                'GOLDEN_RUNTIME_CONTROL_TERMINAL_ATTESTATION_MISSING'
              );
          return state.releaseResult;
        }
        if (!state.cleanupCanary?.clean) {
          state.releaseResult = failedRuntimeControlRelease(
            lease.attemptId,
            'GOLDEN_RUNTIME_CONTROL_CLEANUP_RESIDUAL',
            state.cleanupCanary?.residual ?? {
              ...emptyRuntimeResidual(),
              effects: 1,
            }
          );
          return state.releaseResult;
        }
        state.releaseResult = Object.freeze({
          status: 'clean',
          residualCanaryIds: Object.freeze([]),
          diagnosticCodes: Object.freeze([]),
        });
        return state.releaseResult;
      },
    }),
    assertReleased,
    async forceRetire(attemptId) {
      const state = attempts.get(attemptId);
      if (!state) return retiredEvidence.get(attemptId);
      let canary = state.cleanupCanary;
      if (state.exposedSession && !canary) {
        canary = await state.exposedSession.cleanup();
      } else if (
        state.started &&
        state.host &&
        !state.blocked &&
        !state.startFailedCleanly &&
        !state.coreSession
      ) {
        await cleanupUnexpectedRuntimeStart(state);
      }
      attempts.delete(attemptId);
      if (canary && !canary.clean) {
        const residualIds = runtimeResidualCanaryIds(
          canary.residual,
          attemptId
        );
        throw new Error(
          `Golden V6 forced retirement for "${attemptId}" left residual state: ${residualIds.join(', ')}.`
        );
      }
      if (
        state.releaseResult?.status === 'clean' &&
        state.terminal &&
        state.cleanupCanary?.clean &&
        state.fixtureRuntimeDispatch
      ) {
        const evidence = projectGoldenG3V6RuntimeControlEvidence({
          registration: state.input,
          providerId: state.provider.descriptor.id,
          capabilitySnapshot: state.capabilitySnapshot,
          lease: state.lease!,
          issuedAttestations: Object.freeze([...state.issued.values()]),
          terminalAttestation: state.terminal,
          cleanupCanary: state.cleanupCanary,
          fixtureRuntimeDispatch: state.fixtureRuntimeDispatch,
        });
        retiredEvidence.set(attemptId, evidence);
        return evidence;
      }
      return undefined;
    },
    snapshot: () => {
      const values = [...attempts.values()];
      return Object.freeze({
        registered: values.length,
        acquired: values.filter(({ acquired }) => acquired).length,
        started: values.filter(({ started }) => started).length,
        released: values.filter(
          ({ releaseResult }) => releaseResult?.status === 'clean'
        ).length,
        active: values.filter(
          ({ releaseResult }) => releaseResult?.status !== 'clean'
        ).length,
      });
    },
  });
};
