import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  digestVerificationValue,
  normalizeVerificationAdapterDescriptor,
  type VerificationAdapter,
  type VerificationAdapterFactory,
} from '@prodivix/verification';
import type { FirstPartyBrowserVerificationAdapterOptions } from './browserAdapter.types';
import {
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL,
} from './browserVerificationAdapterDescriptor';
import {
  assertBrowserVerificationCellInputCoordinates,
  decodeBrowserVerificationCellInput,
} from './browserVerificationCellInput';
import {
  browserEventId,
  browserInvocationMatches,
  browserStateCoordinatesMatch,
  cleanupBrowserState,
  emitBrowserEvent,
  stageBrowserArtifacts,
  type BrowserInvocationState,
} from './browserVerificationAdapterLifecycleSupport';
import {
  assertBrowserDigest,
  assertBrowserNotAborted,
  assertBrowserToken,
  browserContractError,
  browserInfrastructureError,
  browserProviderSupportsSurface,
  preflightBrowserCell,
  readBrowserInputBytes,
  resolveBrowserCellPolicy,
  validateBrowserInputRefs,
} from './browserVerificationAdapterPreparation';
import { projectBrowserVerificationAttempt } from './browserVerificationProjection';
import {
  assertBrowserRuntimeControlAttestation,
  type BrowserRuntimeControlLease,
  type BrowserRuntimeControlProviderKind,
} from './browserRuntimeControlPort';
import type {
  BrowserToolPool,
  BrowserToolPoolFactory,
} from './browserVerificationPort';
import {
  assertBrowserVerificationTargetLease,
  createBrowserVerificationRuntimeEnvironmentDigest,
} from './browserRuntimeIdentity';
import { createPlaywrightBrowserToolPool } from './internal/playwrightBrowserTool';

export type FirstPartyBrowserVerificationAdapterFactory =
  VerificationAdapterFactory &
    Readonly<{
      dispose(): Promise<void>;
      drainAndDispose(): Promise<
        Readonly<{
          status: 'clean' | 'residual' | 'failed';
          residualCanaryIds: readonly string[];
          diagnosticCodes: readonly string[];
        }>
      >;
    }>;

const inactiveAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const assertRuntimeControlLease = (
  lease: BrowserRuntimeControlLease,
  input: Parameters<VerificationAdapter['prepare']>[0],
  targetBindingDigest: string,
  targetOriginDigest: string
): BrowserRuntimeControlLease => {
  const expectedControlIds = [...input.context.controlCapabilityIds].sort(
    compareVerificationText
  );
  const observedControlIds = [...lease.controlCapabilityIds].sort(
    compareVerificationText
  );
  const mismatches = [
    lease.attemptId === input.attemptId ? undefined : 'attempt-id',
    lease.generation === input.generation ? undefined : 'generation',
    lease.providerKind === input.providerKind ? undefined : 'provider-kind',
    lease.targetLeaseBindingDigest === targetBindingDigest
      ? undefined
      : 'target-binding',
    lease.originDigest === targetOriginDigest ? undefined : 'origin',
    lease.executableSnapshotDigest === input.context.executableSnapshotDigest
      ? undefined
      : 'executable-snapshot',
    lease.expectedControlDigest === input.context.appliedControlDigest
      ? undefined
      : 'expected-control',
    lease.plan.controlDigest === input.context.appliedControlDigest
      ? undefined
      : 'plan-control',
    lease.expectedCapabilitySnapshot.snapshotDigest ===
    input.context.controlCapabilitySnapshotDigest
      ? undefined
      : 'capability-snapshot',
    lease.resourceManifest.executableSnapshotDigest ===
    input.context.executableSnapshotDigest
      ? undefined
      : 'resource-manifest-snapshot',
    lease.fixtureBinding.executableSnapshotDigest ===
    input.context.executableSnapshotDigest
      ? undefined
      : 'fixture-binding-snapshot',
    lease.plan.cell.frameworkTarget === input.cell.frameworkTarget
      ? undefined
      : 'framework-target',
    lease.plan.cell.surface === input.providerKind ? undefined : 'plan-surface',
    lease.plan.cell.browserEngine === input.cell.browserEngine
      ? undefined
      : 'browser-engine',
    lease.plan.cell.viewport.width === input.cell.viewport.width &&
    lease.plan.cell.viewport.height === input.cell.viewport.height
      ? undefined
      : 'viewport',
    lease.plan.cell.colorScheme === input.cell.colorScheme
      ? undefined
      : 'color-scheme',
    lease.plan.cell.motion === input.cell.motion ? undefined : 'motion',
    lease.plan.cell.locale === input.cell.locale ? undefined : 'locale',
    expectedControlIds.length === observedControlIds.length &&
    expectedControlIds.every(
      (controlId, index) => controlId === observedControlIds[index]
    )
      ? undefined
      : 'control-capabilities',
    (input.providerKind === 'remote') === (lease.remoteBinding !== undefined)
      ? undefined
      : 'remote-binding',
  ].filter((value): value is string => value !== undefined);
  if (mismatches.length > 0) {
    throw browserContractError(
      `Browser runtime control lease drifted from attempt, target, Plan, or capability coordinates (${mismatches.join(', ')}).`
    );
  }
  return lease;
};

/**
 * Package-private constructor used by conformance tests to inject a typed
 * controlled pool. Production callers use the Playwright-bound constructor.
 */
export const createFirstPartyBrowserVerificationAdapterFactoryInternal = (
  options: FirstPartyBrowserVerificationAdapterOptions,
  poolFactory: BrowserToolPoolFactory
): FirstPartyBrowserVerificationAdapterFactory => {
  let pool: BrowserToolPool | undefined;
  let disposed = false;
  const activeStateSets = new Set<Map<string, BrowserInvocationState>>();

  const factory = ((factoryContext): VerificationAdapter => {
    if (disposed) {
      throw browserInfrastructureError('Browser adapter factory is disposed.');
    }
    const descriptor = normalizeVerificationAdapterDescriptor(
      factoryContext.descriptor
    );
    if (
      !sameCanonicalJson(
        descriptor,
        FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR
      ) ||
      !sameCanonicalJson(
        factoryContext.identity,
        FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity
      ) ||
      !sameCanonicalJson(
        factoryContext.tool,
        FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL
      ) ||
      factoryContext.runtimeZone !== 'browser'
    ) {
      throw browserContractError(
        'Browser factory identity, descriptor, tool, or runtime zone drifted.'
      );
    }
    assertBrowserDigest(
      factoryContext.registrySnapshotDigest,
      'Registry snapshot digest'
    );
    const sharedPool = (pool ??= poolFactory());
    const states = new Map<string, BrowserInvocationState>();
    activeStateSets.add(states);

    return Object.freeze({
      preflight: async (cell, context) =>
        preflightBrowserCell(cell, context, {
          registrySnapshotDigest: factoryContext.registrySnapshotDigest,
          runtimeZone: factoryContext.runtimeZone,
        }),

      prepare: async (input) => {
        assertBrowserDigest(input.planDigest, 'Plan digest');
        assertBrowserToken(input.attemptId, 'Attempt id');
        if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
          throw browserContractError(
            'Attempt generation must be a positive integer.'
          );
        }
        if (
          !browserProviderSupportsSurface(
            input.providerKind,
            input.cell.surface
          ) ||
          input.controlCapabilitySnapshotDigest !==
            input.context.controlCapabilitySnapshotDigest ||
          input.appliedControlDigest !== input.context.appliedControlDigest
        ) {
          throw browserContractError(
            'Browser provider surface or applied controls drifted.'
          );
        }
        const preflight = preflightBrowserCell(input.cell, input.context, {
          registrySnapshotDigest: factoryContext.registrySnapshotDigest,
          runtimeZone: factoryContext.runtimeZone,
        });
        if (preflight.status !== 'supported') {
          throw browserContractError(preflight.message);
        }
        assertBrowserNotAborted(input.context.abortSignal);
        const refs = validateBrowserInputRefs(input.cell, input.context);
        const invocationId = `invocation:${digestVerificationValue({
          planDigest: input.planDigest,
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          providerKind: input.providerKind,
          resolvedInputSetDigest: input.context.resolvedInputSetDigest,
          runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
          adapter: input.context.adapter,
          controlCapabilitySnapshotDigest:
            input.controlCapabilitySnapshotDigest,
          appliedControlDigest: input.appliedControlDigest,
        }).slice('sha256-'.length)}`;
        if (states.has(invocationId)) {
          throw browserContractError('Browser invocation is already active.');
        }
        const state: BrowserInvocationState = {
          phase: 'preparing',
          canaryId: `canary:${invocationId.slice('invocation:'.length)}`,
          input,
        };
        activeStateSets.add(states);
        states.set(invocationId, state);
        const entries = await Promise.all(
          [...refs.entries()].map(
            async ([kind, ref]) =>
              [kind, await readBrowserInputBytes(ref, input.context)] as const
          )
        );
        const bytesByKind = new Map(entries);
        const profileBytes = bytesByKind.get('verification-profile');
        if (!profileBytes) {
          throw browserContractError(
            'Browser verification profile is missing.'
          );
        }
        const profile = decodeBrowserVerificationCellInput(profileBytes);
        assertBrowserVerificationCellInputCoordinates(
          profile,
          input.cell,
          input.context
        );
        const policy = await resolveBrowserCellPolicy(
          profile,
          input,
          refs,
          bytesByKind,
          options
        );
        assertBrowserNotAborted(input.context.abortSignal);

        const executableRef = refs.get('executable-snapshot')!;
        const acquiredLease = await options.targetLease.acquire(
          {
            cell: input.cell,
            attemptId: input.attemptId,
            generation: input.generation,
            executableSnapshotDigest: input.context.executableSnapshotDigest,
            executableSnapshotArtifactDigest: executableRef.digest,
            expectedBindingDigest: profile.targetLeaseBindingDigest,
          },
          input.context.abortSignal
        );
        // Register the authority-owned lease before validating its attestation
        // so every post-acquire rejection remains releasable by cleanup.
        state.lease = acquiredLease;
        const lease = assertBrowserVerificationTargetLease(acquiredLease, {
          cell: input.cell,
          attemptId: input.attemptId,
          generation: input.generation,
          executableSnapshotDigest: input.context.executableSnapshotDigest,
          expectedBindingDigest: profile.targetLeaseBindingDigest,
          runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
        });
        if (input.providerKind === 'local') {
          throw browserContractError(
            'Local provider attempts cannot claim controlled Browser/Remote/Export/CI runtime evidence.'
          );
        }
        const acquiredRuntimeControlLease =
          await options.runtimeControls.acquire(
            {
              cell: input.cell,
              targetLease: lease,
              attemptId: input.attemptId,
              generation: input.generation,
              providerKind:
                input.providerKind as BrowserRuntimeControlProviderKind,
              executableSnapshotDigest: input.context.executableSnapshotDigest,
              expectedControlDigest: input.context.appliedControlDigest,
              expectedCapabilitySnapshotDigest:
                input.context.controlCapabilitySnapshotDigest,
              expectedControlCapabilityIds: input.context.controlCapabilityIds,
            },
            input.context.abortSignal
          );
        state.runtimeControlLease = acquiredRuntimeControlLease;
        const runtimeControlLease = assertRuntimeControlLease(
          acquiredRuntimeControlLease,
          input,
          lease.bindingDigest,
          lease.binding.originDigest
        );
        assertBrowserNotAborted(input.context.abortSignal);
        const engine = input.cell.browserEngine;
        if (!engine) {
          throw browserContractError('Browser engine is missing.');
        }
        const session = await sharedPool.acquire({
          engine,
          origin: lease.origin,
          cell: input.cell,
          runtimeIdentity: lease.runtimeIdentity,
          providerKind: input.providerKind as BrowserRuntimeControlProviderKind,
          runtimeControlLease,
          launch: {
            headless: true,
            ...(engine === 'chromium' && options.chromiumExecutablePath
              ? { executablePath: options.chromiumExecutablePath }
              : {}),
          },
        });
        if (
          !sameCanonicalJson(
            session.observedRuntimeIdentity,
            lease.runtimeIdentity
          ) ||
          createBrowserVerificationRuntimeEnvironmentDigest(
            session.observedRuntimeIdentity
          ) !== input.context.runtimeEnvironmentDigest ||
          session.runtimeControlAttestation.phase !== 'initial'
        ) {
          await session.close();
          throw browserContractError(
            'Observed browser runtime identity drifted from lease attestation, or initial controls drifted.'
          );
        }
        runtimeControlLease.assertIssued(
          assertBrowserRuntimeControlAttestation(
            session.runtimeControlAttestation,
            runtimeControlLease
          )
        );
        state.runtimeControlAttestation = session.runtimeControlAttestation;
        state.session = session;
        state.unsubscribeAbort = input.context.abortSignal.subscribe(() => {
          void session.close().catch(() => undefined);
        });
        assertBrowserNotAborted(input.context.abortSignal);
        const invocation = Object.freeze({
          invocationId,
          planDigest: input.planDigest,
          cellId: input.cell.id,
          adapterId: factoryContext.identity.adapterId,
          attemptId: input.attemptId,
          generation: input.generation,
          providerKind: input.providerKind,
          inputDigest: input.context.inputDigest,
          controlCapabilitySnapshotDigest:
            input.controlCapabilitySnapshotDigest,
          appliedControlDigest: input.appliedControlDigest,
          confirmedCursor: 0,
          state: 'running' as const,
        });
        state.profile = profile;
        state.policy = policy;
        state.invocation = invocation;
        state.phase = 'ready';
        return invocation;
      },

      execute: async (invocation, sink) => {
        const state = states.get(invocation.invocationId);
        if (
          !state ||
          state.phase !== 'ready' ||
          !state.profile ||
          !state.policy ||
          !state.session ||
          !state.runtimeControlLease ||
          !browserInvocationMatches(state, invocation)
        ) {
          throw browserContractError(
            'Browser invocation is unknown, stale, drifted, or already executing.'
          );
        }
        state.phase = 'executing';
        try {
          assertBrowserNotAborted(state.input.context.abortSignal);
          emitBrowserEvent(sink, {
            kind: 'progress',
            eventId: browserEventId(invocation, 'started'),
            messageKey: 'verification.browser.started',
            completed: 0,
            total: 1,
          });
          const projection = await projectBrowserVerificationAttempt({
            cell: state.input.cell,
            profile: state.profile,
            policy: state.policy,
            session: state.session,
          });
          assertBrowserNotAborted(state.input.context.abortSignal);
          const terminalAttestation =
            await state.session.finalizeRuntimeControls();
          state.runtimeControlLease!.assertIssued(
            assertBrowserRuntimeControlAttestation(
              terminalAttestation,
              state.runtimeControlLease!
            )
          );
          state.runtimeControlLease!.sealTerminal(terminalAttestation);
          state.runtimeControlAttestation = terminalAttestation;
          assertBrowserNotAborted(state.input.context.abortSignal);
          const artifacts = await stageBrowserArtifacts(
            state,
            invocation,
            sink,
            projection.artifacts
          );
          for (const code of projection.diagnosticCodes) {
            emitBrowserEvent(sink, {
              kind: 'diagnostic',
              eventId: browserEventId(invocation, `diagnostic:${code}`),
              code,
            });
          }
          emitBrowserEvent(sink, {
            kind: 'progress',
            eventId: browserEventId(invocation, 'completed'),
            messageKey: 'verification.browser.completed',
            completed: 1,
            total: 1,
          });
          state.phase = 'collecting';
          return Object.freeze({
            format: 'prodivix.verification-check-report-candidate',
            version: 1,
            cellId: invocation.cellId,
            attemptId: invocation.attemptId,
            checkKind: state.input.cell.checkKind,
            inputDigest: invocation.inputDigest,
            adapter: state.input.context.adapter,
            tool: factoryContext.tool,
            terminal: projection.terminal,
            payload: projection.payload,
            artifacts,
            diagnosticCodes: projection.diagnosticCodes,
          });
        } catch (error) {
          state.phase = 'collecting';
          throw error;
        }
      },

      cleanup: async (input) => {
        try {
          assertBrowserDigest(input.planDigest, 'Cleanup Plan digest');
          assertBrowserToken(input.cellId, 'Cleanup cell id');
          assertBrowserToken(input.attemptId, 'Cleanup attempt id');
          if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
            throw browserContractError(
              'Cleanup generation must be a positive integer.'
            );
          }
          const matching = [...states.entries()].filter(([, state]) =>
            browserStateCoordinatesMatch(state, input)
          );
          if (
            input.invocation &&
            !matching.some(
              ([invocationId, state]) =>
                invocationId === input.invocation!.invocationId &&
                browserInvocationMatches(state, input.invocation!)
            )
          ) {
            return Object.freeze({
              status: 'residual' as const,
              residualCanaryIds: Object.freeze(
                matching.map(([, state]) => state.canaryId)
              ),
              diagnosticCodes: Object.freeze(['VER-BROWSER-STALE-CLEANUP']),
            });
          }
          const cleanupResults = await Promise.all(
            matching.map(async ([invocationId, state]) => {
              states.delete(invocationId);
              return cleanupBrowserState(
                state,
                input.abortSignal,
                options.targetLease,
                options.runtimeControls
              );
            })
          );
          if (states.size === 0) activeStateSets.delete(states);
          const residualCanaryIds = cleanupResults
            .flatMap(({ residualCanaryIds }) => residualCanaryIds)
            .sort(compareVerificationText);
          const codes = cleanupResults
            .flatMap(({ diagnosticCodes }) => diagnosticCodes)
            .sort(compareVerificationText);
          const status = cleanupResults.some(
            ({ status }) => status === 'failed'
          )
            ? ('failed' as const)
            : residualCanaryIds.length > 0
              ? ('residual' as const)
              : ('clean' as const);
          return Object.freeze({
            status,
            residualCanaryIds: Object.freeze(residualCanaryIds),
            diagnosticCodes: Object.freeze([...new Set(codes)]),
          });
        } catch {
          return Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze(['VER-BROWSER-CLEANUP']),
          });
        }
      },
    });
  }) as FirstPartyBrowserVerificationAdapterFactory;

  let drainPromise:
    | Promise<
        Readonly<{
          status: 'clean' | 'residual' | 'failed';
          residualCanaryIds: readonly string[];
          diagnosticCodes: readonly string[];
        }>
      >
    | undefined;
  const drainAndDispose = () => {
    drainPromise ??= (async () => {
      disposed = true;
      const cleanupResults = await Promise.all(
        [...activeStateSets].flatMap((states) =>
          [...states.entries()].map(async ([invocationId, state]) => {
            states.delete(invocationId);
            return cleanupBrowserState(
              state,
              inactiveAbortSignal,
              options.targetLease,
              options.runtimeControls
            );
          })
        )
      );
      activeStateSets.clear();
      let poolFailed = false;
      try {
        await pool?.dispose();
      } catch {
        poolFailed = true;
      }
      pool = undefined;
      const residualCanaryIds = Object.freeze(
        [
          ...new Set(
            cleanupResults.flatMap(({ residualCanaryIds }) => residualCanaryIds)
          ),
        ].sort(compareVerificationText)
      );
      const diagnosticCodes = Object.freeze(
        [
          ...new Set([
            ...cleanupResults.flatMap(({ diagnosticCodes }) => diagnosticCodes),
            ...(poolFailed ? ['VER-BROWSER-POOL-DISPOSE'] : []),
          ]),
        ].sort(compareVerificationText)
      );
      return Object.freeze({
        status:
          poolFailed || cleanupResults.some(({ status }) => status === 'failed')
            ? ('failed' as const)
            : residualCanaryIds.length > 0 ||
                cleanupResults.some(({ status }) => status === 'residual')
              ? ('residual' as const)
              : ('clean' as const),
        residualCanaryIds,
        diagnosticCodes,
      });
    })();
    return drainPromise;
  };

  Object.defineProperty(factory, 'drainAndDispose', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: drainAndDispose,
  });
  Object.defineProperty(factory, 'dispose', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: async (): Promise<void> => {
      if (disposed) return;
      if ([...activeStateSets].some((states) => states.size > 0)) {
        throw browserInfrastructureError(
          'Cannot dispose the browser pool while attempts are active.'
        );
      }
      disposed = true;
      await pool?.dispose();
      pool = undefined;
    },
  });
  return factory;
};

/**
 * Creates the first-party browser verification factory backed by a reusable
 * Playwright browser pool and fresh attempt-scoped browser contexts.
 */
export const createFirstPartyBrowserVerificationAdapterFactory = (
  options: FirstPartyBrowserVerificationAdapterOptions
): FirstPartyBrowserVerificationAdapterFactory =>
  createFirstPartyBrowserVerificationAdapterFactoryInternal(
    options,
    createPlaywrightBrowserToolPool
  );
