import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  digestVerificationValue,
  type VerificationAbortSignal,
} from '@prodivix/verification';
import type {
  BrowserVerificationTargetLease,
  BrowserVerificationTargetLeasePort,
} from './browserAdapter.types';
import type {
  BrowserRuntimeControlAttestation,
  BrowserRuntimeControlLease,
  BrowserRuntimeControlPort,
} from './browserRuntimeControlPort';
import {
  createBrowserVerificationTargetBinding,
  createBrowserVerificationRuntimeEnvironmentDigest,
} from './browserRuntimeIdentity';
import { createFirstPartyBrowserVerificationAdapterFactory } from './firstPartyBrowserVerificationAdapterFactory';
import {
  decodeBrowserSecurityObservationSet,
  encodeBrowserSecurityObservationSet,
  type BrowserSecurityObservationAuthorityPort,
  type BrowserSecurityObservationSet,
} from './securityObservationSet';
import type {
  ProductionBrowserPreviewHostLease,
  ProductionBrowserPreviewHostReleaseResult,
  ProductionBrowserExecutableSnapshotReceipt,
  ProductionChromiumBrowserRuntimeReceipt,
  ProductionChromiumBrowserAuthority,
  ProductionChromiumBrowserAuthorityOptions,
  ProductionChromiumBrowserRegistration,
  ProductionChromiumBrowserRegistrationInput,
} from './productionChromiumBrowserAuthority.types';
import {
  PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_FORMAT,
  PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_VERSION,
} from './productionChromiumBrowserAuthority.types';
import {
  createProductionBrowserRuntimeAttemptState,
  createProductionBrowserRuntimeControlLease,
  forceCleanupProductionBrowserRuntimeState,
  releaseProductionBrowserRuntimeState,
  type ProductionBrowserRuntimeAttemptState,
} from './productionChromiumBrowserRuntime';
import {
  createProductionBrowserRuntimeIdentity,
  createProductionChromiumRuntimeAuthority,
  createRemoteRuntimeControlBinding,
  assertProductionBrowserExecutableSnapshotReceipt,
  normalizeProductionBrowserRemoteExecution,
  sameProductionChromiumRuntimeAuthority,
  scanProductionBrowserInputs,
  validateProductionBrowserInputs,
  verifyProductionBrowserResources,
} from './productionChromiumBrowserAuthorityResources';

const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const inactiveAbortSignal: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

type RegistrationState = {
  input: ProductionChromiumBrowserRegistrationInput;
  executableSnapshotReceipt: ProductionBrowserExecutableSnapshotReceipt;
  previewLease: ProductionBrowserPreviewHostLease;
  targetLease: BrowserVerificationTargetLease;
  runtimeState: ProductionBrowserRuntimeAttemptState;
  runtimeLease: BrowserRuntimeControlLease;
  securityObservationSet?: BrowserSecurityObservationSet;
  canaryScanReceiptSetDigest: string;
  targetAcquired: boolean;
  targetReleased: boolean;
  retirePromise?: Promise<ProductionBrowserPreviewHostReleaseResult>;
};

const assertDigest = (value: string, label: string): void => {
  if (!digestPattern.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
};

const assertIdentifier = (value: string, label: string): void => {
  if (
    !identifierPattern.test(value) ||
    value !== value.trim() ||
    value !== value.normalize('NFC')
  ) {
    throw new TypeError(`${label} must be a bounded canonical identifier.`);
  }
};

const createProductionChromiumBrowserRuntimeReceipt = (input: {
  attemptId: string;
  generation: number;
  cellId: string;
  executableSnapshotReceipt: ProductionBrowserExecutableSnapshotReceipt;
  browserImageDigest: string;
  runtimeAuthorityDigest: string;
  targetBindingDigest: string;
  remoteBindingDigest: string;
  runtimeEnvironmentDigest: string;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  canaryScanReceiptSetDigest: string;
}): ProductionChromiumBrowserRuntimeReceipt => {
  const identity = Object.freeze({
    format: PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_FORMAT,
    version: PRODUCTION_CHROMIUM_BROWSER_RUNTIME_RECEIPT_VERSION,
    attemptId: input.attemptId,
    generation: input.generation,
    cellId: input.cellId,
    executableSnapshotReceiptDigest:
      input.executableSnapshotReceipt.receiptDigest,
    browserImageDigest: input.browserImageDigest,
    runtimeAuthorityDigest: input.runtimeAuthorityDigest,
    targetBindingDigest: input.targetBindingDigest,
    remoteBindingDigest: input.remoteBindingDigest,
    runtimeEnvironmentDigest: input.runtimeEnvironmentDigest,
    controlCapabilitySnapshotDigest: input.controlCapabilitySnapshotDigest,
    appliedControlDigest: input.appliedControlDigest,
    canaryScanReceiptSetDigest: input.canaryScanReceiptSetDigest,
  });
  return Object.freeze({
    ...identity,
    receiptDigest: digestVerificationValue(identity),
  });
};

const normalizeReleaseResult = (
  value: ProductionBrowserPreviewHostReleaseResult,
  label: string
): ProductionBrowserPreviewHostReleaseResult => {
  if (
    value.status !== 'clean' &&
    value.status !== 'residual' &&
    value.status !== 'failed'
  ) {
    throw new TypeError(`${label} status is invalid.`);
  }
  const normalizeIds = (
    values: readonly string[],
    field: string
  ): readonly string[] => {
    if (!Array.isArray(values) || values.length > 256) {
      throw new TypeError(`${label} ${field} exceeds its budget.`);
    }
    for (const entry of values) assertIdentifier(entry, `${label} ${field}`);
    const normalized = [...values].sort(compareVerificationText);
    if (
      new Set(normalized).size !== normalized.length ||
      normalized.some((entry, index) => entry !== values[index])
    ) {
      throw new TypeError(`${label} ${field} must be unique and canonical.`);
    }
    return Object.freeze(normalized);
  };
  const residualCanaryIds = normalizeIds(
    value.residualCanaryIds,
    'residual canary ids'
  );
  const diagnosticCodes = normalizeIds(
    value.diagnosticCodes,
    'diagnostic codes'
  );
  if (
    (value.status === 'clean' && residualCanaryIds.length > 0) ||
    (value.status === 'residual' && residualCanaryIds.length === 0)
  ) {
    throw new TypeError(
      `${label} status does not match its residual canaries.`
    );
  }
  return Object.freeze({
    status: value.status,
    residualCanaryIds,
    diagnosticCodes,
  });
};

const mergeReleaseResults = (
  values: readonly ProductionBrowserPreviewHostReleaseResult[]
): ProductionBrowserPreviewHostReleaseResult => {
  const residualCanaryIds = Object.freeze(
    [
      ...new Set(values.flatMap(({ residualCanaryIds }) => residualCanaryIds)),
    ].sort(compareVerificationText)
  );
  const diagnosticCodes = Object.freeze(
    [...new Set(values.flatMap(({ diagnosticCodes }) => diagnosticCodes))].sort(
      compareVerificationText
    )
  );
  return Object.freeze({
    status: values.some(({ status }) => status === 'failed')
      ? ('failed' as const)
      : residualCanaryIds.length > 0 ||
          values.some(({ status }) => status === 'residual')
        ? ('residual' as const)
        : ('clean' as const),
    residualCanaryIds,
    diagnosticCodes,
  });
};

const validateSecurityObservationSet = (
  value: BrowserSecurityObservationSet | undefined,
  input: Readonly<{
    cellId: string;
    attemptId: string;
    generation: number;
    executableSnapshotDigest: string;
    runtimeEnvironmentDigest: string;
    controlProfileDigest: string;
  }>
): Readonly<{
  value?: BrowserSecurityObservationSet;
  bytes?: Uint8Array;
}> => {
  if (!value) return Object.freeze({});
  const normalized = decodeBrowserSecurityObservationSet(value);
  if (!sameCanonicalJson(normalized.binding, input)) {
    throw new TypeError(
      'Production security observations drifted from cell, attempt, runtime, or control profile.'
    );
  }
  return Object.freeze({
    value: normalized,
    bytes: encodeBrowserSecurityObservationSet(normalized),
  });
};

/**
 * Creates the production Chromium authority around injected source-owner
 * ports. No preview server, remote provider semantics, Secret scanner, or G2
 * security observation is synthesized inside this package.
 */
export const createProductionChromiumBrowserAuthority = async (
  options: ProductionChromiumBrowserAuthorityOptions
): Promise<ProductionChromiumBrowserAuthority> => {
  if (
    !options?.runtimeAuthority ||
    !options.previewHost ||
    typeof options.previewHost.materialize !== 'function' ||
    !options.runtimeProvider ||
    typeof options.runtimeProvider.create !== 'function' ||
    !options.canaryScanner ||
    typeof options.canaryScanner.scan !== 'function'
  ) {
    throw new TypeError(
      'Production Chromium browser authority requires explicit runtime-authority, preview-host, remote-runtime-provider, and canary-scanner owners.'
    );
  }
  assertDigest(options.previewHost.authorityDigest, 'Preview host authority');
  assertDigest(
    options.runtimeProvider.implementationDigest,
    'Remote runtime provider implementation'
  );
  assertDigest(
    options.canaryScanner.authorityDigest,
    'Canary scanner authority'
  );
  assertIdentifier(options.runtimeProvider.providerId, 'Runtime provider id');
  assertIdentifier(
    options.runtimeProvider.providerVersion,
    'Runtime provider version'
  );
  const resourceVerificationTimeoutMs =
    options.resourceVerificationTimeoutMs ?? 5_000;
  if (
    !Number.isSafeInteger(resourceVerificationTimeoutMs) ||
    resourceVerificationTimeoutMs < 100 ||
    resourceVerificationTimeoutMs > 30_000
  ) {
    throw new TypeError(
      'Production browser resource timeout must be 100..30000ms.'
    );
  }
  const observedRuntimeAuthority =
    await createProductionChromiumRuntimeAuthority(options.runtimeAuthority);
  const registrations = new Map<string, RegistrationState>();
  const retainedDirtyReleaseResults: ProductionBrowserPreviewHostReleaseResult[] =
    [];
  let lifecycle: 'accepting' | 'draining' | 'closed' = 'accepting';
  let drainPromise:
    Promise<ProductionBrowserPreviewHostReleaseResult> | undefined;

  const retireState = (
    state: RegistrationState
  ): Promise<ProductionBrowserPreviewHostReleaseResult> => {
    state.retirePromise ??= (async () => {
      let runtimeCleanupFailed = false;
      let residualCanaryIds: readonly string[] = Object.freeze([]);
      if (state.runtimeState.acquired && !state.runtimeState.released) {
        try {
          residualCanaryIds = await forceCleanupProductionBrowserRuntimeState(
            state.runtimeState
          );
        } catch {
          runtimeCleanupFailed = true;
          residualCanaryIds = Object.freeze([
            `canary:browser:${state.input.attemptId}:runtime-force-cleanup`,
          ]);
        }
      }
      let previewResult: ProductionBrowserPreviewHostReleaseResult;
      try {
        previewResult = normalizeReleaseResult(
          await state.previewLease.retire(inactiveAbortSignal),
          'Production preview host retirement'
        );
      } catch {
        previewResult = Object.freeze({
          status: 'failed',
          residualCanaryIds: Object.freeze([
            `canary:browser:${state.input.attemptId}:preview-host`,
          ]),
          diagnosticCodes: Object.freeze([
            'VER-PRODUCTION-BROWSER-PREVIEW-RETIRE',
          ]),
        });
      }
      registrations.delete(state.input.attemptId);
      const runtimeResult: ProductionBrowserPreviewHostReleaseResult =
        runtimeCleanupFailed
          ? Object.freeze({
              status: 'failed',
              residualCanaryIds,
              diagnosticCodes: Object.freeze([
                'VER-PRODUCTION-BROWSER-RUNTIME-FORCE-DRAIN-FAILED',
              ]),
            })
          : residualCanaryIds.length > 0
            ? Object.freeze({
                status: 'residual',
                residualCanaryIds,
                diagnosticCodes: Object.freeze([
                  'VER-PRODUCTION-BROWSER-RUNTIME-FORCE-DRAIN-RESIDUAL',
                ]),
              })
            : Object.freeze({
                status: 'clean',
                residualCanaryIds: Object.freeze([]),
                diagnosticCodes: Object.freeze([]),
              });
      const result = mergeReleaseResults([runtimeResult, previewResult]);
      if (result.status !== 'clean') retainedDirtyReleaseResults.push(result);
      return result;
    })();
    return state.retirePromise;
  };

  const targetLease: BrowserVerificationTargetLeasePort = Object.freeze({
    async acquire(input, signal) {
      const state = registrations.get(input.attemptId);
      if (
        lifecycle !== 'accepting' ||
        signal.aborted ||
        !state ||
        state.targetAcquired ||
        state.targetReleased ||
        input.generation !== state.input.generation ||
        input.executableSnapshotDigest !== state.input.snapshot.contentDigest ||
        input.executableSnapshotArtifactDigest !==
          state.executableSnapshotReceipt.artifactDigest ||
        input.expectedBindingDigest !== state.targetLease.bindingDigest ||
        !sameCanonicalJson(input.cell, state.input.cell)
      ) {
        throw new Error(
          'Production Chromium target lease is unavailable, stale, or drifted.'
        );
      }
      state.targetAcquired = true;
      return state.targetLease;
    },
    async release(lease) {
      const state = registrations.get(lease.binding.attemptId);
      if (
        !state ||
        !state.targetAcquired ||
        state.targetReleased ||
        !sameCanonicalJson(lease, state.targetLease)
      ) {
        return Object.freeze({
          status: 'failed',
          residualCanaryIds: Object.freeze([
            `canary:browser:${lease.binding.attemptId}:target-lease`,
          ]),
          diagnosticCodes: Object.freeze([
            'VER-PRODUCTION-BROWSER-TARGET-RELEASE-DRIFT',
          ]),
        });
      }
      state.targetReleased = true;
      return retireState(state);
    },
  });

  const runtimeControls: BrowserRuntimeControlPort = Object.freeze({
    async acquire(input, signal) {
      const state = registrations.get(input.attemptId);
      const expectedIds = state
        ? [...state.runtimeState.controlCapabilityIds].sort(
            compareVerificationText
          )
        : [];
      const actualIds = [...input.expectedControlCapabilityIds].sort(
        compareVerificationText
      );
      if (
        lifecycle !== 'accepting' ||
        signal.aborted ||
        !state ||
        !state.targetAcquired ||
        state.runtimeState.acquired ||
        state.runtimeState.released ||
        input.generation !== state.input.generation ||
        input.providerKind !== 'remote' ||
        input.executableSnapshotDigest !== state.input.snapshot.contentDigest ||
        input.expectedControlDigest !== state.runtimeState.plan.controlDigest ||
        input.expectedCapabilitySnapshotDigest !==
          state.runtimeState.capabilitySnapshot.snapshotDigest ||
        !sameCanonicalJson(input.cell, state.input.cell) ||
        !sameCanonicalJson(input.targetLease, state.targetLease) ||
        !sameCanonicalJson(actualIds, expectedIds)
      ) {
        throw new Error(
          'Production Chromium runtime control lease is unavailable, stale, or drifted.'
        );
      }
      state.runtimeState.acquired = true;
      return state.runtimeLease;
    },
    async release(
      lease: BrowserRuntimeControlLease,
      terminalAttestation: BrowserRuntimeControlAttestation | undefined
    ) {
      const state = registrations.get(lease.attemptId);
      if (!state) {
        return Object.freeze({
          status: 'failed',
          residualCanaryIds: Object.freeze([
            `canary:browser:${lease.attemptId}:runtime-lease`,
          ]),
          diagnosticCodes: Object.freeze([
            'VER-PRODUCTION-BROWSER-RUNTIME-RELEASE-MISSING',
          ]),
        });
      }
      return releaseProductionBrowserRuntimeState(
        state.runtimeState,
        lease,
        terminalAttestation
      );
    },
  });

  const securityObservationAuthority: BrowserSecurityObservationAuthorityPort =
    Object.freeze({
      async resolve(request, signal) {
        const state = registrations.get(request.binding.attemptId);
        if (signal.aborted || !state?.securityObservationSet) return undefined;
        if (
          !sameCanonicalJson(
            request.binding,
            state.securityObservationSet.binding
          )
        ) {
          throw new TypeError(
            'Production browser security observation binding drifted.'
          );
        }
        const observed = state.securityObservationSet.observations.find(
          ({ observation }) => observation.ruleId === request.ruleId
        );
        if (!observed || !sameCanonicalJson(observed.source, request.source)) {
          return undefined;
        }
        return observed;
      },
    });

  const adapterFactory = createFirstPartyBrowserVerificationAdapterFactory({
    targetLease,
    runtimeControls,
    securityObservationAuthority,
    chromiumExecutablePath: observedRuntimeAuthority.executablePath,
  });

  const authority: ProductionChromiumBrowserAuthority = Object.freeze({
    runtimeAuthority: observedRuntimeAuthority.authority,
    targetLease,
    runtimeControls,
    securityObservationAuthority,
    adapterFactory,
    async register(
      input,
      signal
    ): Promise<ProductionChromiumBrowserRegistration> {
      assertIdentifier(input.attemptId, 'Production browser attempt id');
      if (
        lifecycle !== 'accepting' ||
        signal.aborted ||
        input.providerKind !== 'remote' ||
        !Number.isSafeInteger(input.generation) ||
        input.generation < 1 ||
        registrations.has(input.attemptId) ||
        !sameProductionChromiumRuntimeAuthority(
          input.runtimeAuthority,
          observedRuntimeAuthority.authority
        )
      ) {
        throw new TypeError(
          'Production Chromium registration is closed, duplicated, aborted, or runtime-authority drifted.'
        );
      }
      assertDigest(
        input.projectionAuthorityDigest,
        'Production projection authority'
      );
      assertIdentifier(input.remoteExecution.requestId, 'Remote request id');
      assertIdentifier(
        input.remoteExecution.executionId,
        'Remote execution id'
      );
      const validated = validateProductionBrowserInputs(input);
      const executableSnapshotReceipt =
        assertProductionBrowserExecutableSnapshotReceipt(
          input.executableSnapshotReceipt,
          {
            snapshot: validated.snapshot,
            compilerProjectionReceiptDigest: input.projectionAuthorityDigest,
          }
        );
      const runtimeIdentity = createProductionBrowserRuntimeIdentity(
        observedRuntimeAuthority.authority,
        input.cell
      );
      const runtimeEnvironmentDigest =
        createBrowserVerificationRuntimeEnvironmentDigest(runtimeIdentity);
      const security = validateSecurityObservationSet(
        input.securityObservationSet,
        {
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          executableSnapshotDigest: input.snapshot.contentDigest,
          runtimeEnvironmentDigest,
          controlProfileDigest: validated.plan.profileDigest,
        }
      );
      const canaryScanReceiptSetDigest = await scanProductionBrowserInputs({
        scanner: options.canaryScanner,
        snapshot: validated.snapshot,
        buildBundle: input.buildBundle,
        program: input.program,
        ...(security.bytes ? { securityObservationBytes: security.bytes } : {}),
        signal,
      });
      let previewLease: ProductionBrowserPreviewHostLease | undefined;
      try {
        previewLease = await options.previewHost.materialize(
          {
            attemptId: input.attemptId,
            generation: input.generation,
            snapshotDigest: validated.snapshot.contentDigest,
            buildBundleDigest: validated.buildBundleDigest,
            requestId: input.remoteExecution.requestId,
            executionId: input.remoteExecution.executionId,
            entryFilePath: validated.snapshot.previewPlan.entryFilePath,
            entryDigest: validated.entry.digest,
            buildFileCount: input.buildBundle.files.length,
            entryRoutes: validated.entryRoutes,
            resources: validated.resources,
          },
          signal
        );
        assertIdentifier(previewLease.leaseId, 'Preview host lease id');
        if (previewLease.servingMode !== 'route-verified-content-addressed') {
          throw new TypeError(
            'Production preview host must declare route-verified content-addressed serving.'
          );
        }
        const expectedRemoteExecution =
          normalizeProductionBrowserRemoteExecution(input.remoteExecution, {
            attemptId: input.attemptId,
            generation: input.generation,
            snapshotDigest: validated.snapshot.contentDigest,
            buildBundleDigest: validated.buildBundleDigest,
            entryFilePath: validated.snapshot.previewPlan.entryFilePath,
            entryDigest: validated.entry.digest,
            fileCount: input.buildBundle.files.length,
            origin: previewLease.origin,
          });
        const observedRemoteExecution =
          normalizeProductionBrowserRemoteExecution(
            previewLease.remoteExecution,
            {
              attemptId: input.attemptId,
              generation: input.generation,
              snapshotDigest: validated.snapshot.contentDigest,
              buildBundleDigest: validated.buildBundleDigest,
              entryFilePath: validated.snapshot.previewPlan.entryFilePath,
              entryDigest: validated.entry.digest,
              fileCount: input.buildBundle.files.length,
              origin: previewLease.origin,
            }
          );
        if (
          !sameCanonicalJson(expectedRemoteExecution, observedRemoteExecution)
        ) {
          throw new TypeError(
            'Preview host materialization drifted from expected remote execution evidence.'
          );
        }
        const resourceManifest = await verifyProductionBrowserResources({
          origin: previewLease.origin,
          snapshotDigest: validated.snapshot.contentDigest,
          resources: validated.resources,
          timeoutMs: resourceVerificationTimeoutMs,
          signal,
        });
        const targetBinding = createBrowserVerificationTargetBinding({
          origin: previewLease.origin,
          attemptId: input.attemptId,
          generation: input.generation,
          executableSnapshotDigest: validated.snapshot.contentDigest,
          cell: input.cell,
          runtimeIdentity,
        });
        const target: BrowserVerificationTargetLease = Object.freeze({
          leaseId: `target:${digestVerificationValue({
            previewLeaseId: previewLease.leaseId,
            bindingDigest: targetBinding.bindingDigest,
          }).slice('sha256-'.length)}`,
          origin: previewLease.origin,
          binding: targetBinding.binding,
          bindingDigest: targetBinding.bindingDigest,
          runtimeIdentity,
        });
        const remoteBinding = createRemoteRuntimeControlBinding(
          observedRemoteExecution
        );
        const runtimeState = createProductionBrowserRuntimeAttemptState({
          registration: input,
          targetLease: target,
          plan: validated.plan,
          resourceManifest,
          remoteBinding,
          providerAuthority: options.runtimeProvider,
        });
        const runtimeLease =
          createProductionBrowserRuntimeControlLease(runtimeState);
        const runtimeReceipt = createProductionChromiumBrowserRuntimeReceipt({
          attemptId: input.attemptId,
          generation: input.generation,
          cellId: input.cell.id,
          executableSnapshotReceipt,
          browserImageDigest:
            observedRuntimeAuthority.authority.browserImageAuthority
              .imageDigest,
          runtimeAuthorityDigest:
            observedRuntimeAuthority.authority.authorityDigest,
          targetBindingDigest: target.bindingDigest,
          remoteBindingDigest: remoteBinding.bindingDigest,
          runtimeEnvironmentDigest,
          controlCapabilitySnapshotDigest:
            runtimeState.capabilitySnapshot.snapshotDigest,
          appliedControlDigest: validated.plan.controlDigest,
          canaryScanReceiptSetDigest,
        });
        const state: RegistrationState = {
          input,
          executableSnapshotReceipt,
          previewLease,
          targetLease: target,
          runtimeState,
          runtimeLease,
          ...(security.value ? { securityObservationSet: security.value } : {}),
          canaryScanReceiptSetDigest,
          targetAcquired: false,
          targetReleased: false,
        };
        registrations.set(input.attemptId, state);
        return Object.freeze({
          lease: target,
          runtimeIdentity,
          runtimeAuthority: observedRuntimeAuthority.authority,
          runtimeEnvironmentDigest,
          controlCapabilitySnapshotDigest:
            runtimeState.capabilitySnapshot.snapshotDigest,
          appliedControlDigest: validated.plan.controlDigest,
          controlCapabilityIds: runtimeState.controlCapabilityIds,
          origin: previewLease.origin,
          remoteBinding,
          browserImageAuthority:
            observedRuntimeAuthority.authority.browserImageAuthority,
          executableSnapshotReceipt,
          runtimeReceipt,
          canaryScanReceiptSetDigest: state.canaryScanReceiptSetDigest,
          retire: () => retireState(state),
        });
      } catch (error) {
        if (previewLease) {
          const retired = await previewLease
            .retire(inactiveAbortSignal)
            .then((result) =>
              normalizeReleaseResult(
                result,
                'Failed registration preview retirement'
              )
            )
            .catch(() => undefined);
          if (!retired || retired.status !== 'clean') {
            throw new Error(
              'Production browser registration failed and preview retirement was not clean.',
              { cause: error }
            );
          }
        }
        throw error;
      }
    },
    snapshot() {
      const values = [...registrations.values()];
      return Object.freeze({
        state: lifecycle,
        registered: values.length,
        acquiredTargetLeases: values.filter(({ targetAcquired }) =>
          Boolean(targetAcquired)
        ).length,
        acquiredRuntimeLeases: values.filter(
          ({ runtimeState }) => runtimeState.acquired
        ).length,
        activeRuntimeSessions: values.filter(
          ({ runtimeState }) =>
            runtimeState.exposedSession !== undefined &&
            runtimeState.cleanupCanary === undefined
        ).length,
      });
    },
    drainAndDispose() {
      drainPromise ??= (async () => {
        if (lifecycle === 'closed') {
          return Object.freeze({
            status: 'clean',
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze([]),
          });
        }
        lifecycle = 'draining';
        const adapterResult = await adapterFactory.drainAndDispose();
        const retirementResults = await Promise.all(
          [...registrations.values()].map(retireState)
        );
        lifecycle = 'closed';
        const result = mergeReleaseResults([
          normalizeReleaseResult(adapterResult, 'Browser adapter drain'),
          ...retirementResults,
          ...retainedDirtyReleaseResults,
        ]);
        if (registrations.size !== 0) {
          return mergeReleaseResults([
            result,
            Object.freeze({
              status: 'failed',
              residualCanaryIds: Object.freeze([
                'canary:browser:authority:registrations',
              ]),
              diagnosticCodes: Object.freeze([
                'VER-PRODUCTION-BROWSER-DRAIN-RESIDUAL',
              ]),
            }),
          ]);
        }
        return result;
      })();
      return drainPromise;
    },
  });
  return authority;
};
