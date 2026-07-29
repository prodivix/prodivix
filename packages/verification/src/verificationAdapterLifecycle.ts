import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  decodeVerificationAdapterCheckReportCandidate,
  finalizeVerificationAdapterCheckReportCandidate,
} from './verificationCheckReportCodec';
import { createVerificationArtifactStagingController } from './verificationAdapterArtifactStaging';
import { createVerificationEventSinkController } from './verificationAdapterEventSink';
import { createVerificationAdapterInputDigest } from './verificationAdapterInputDigest';
import { createVerificationInputResolverController } from './verificationAdapterInputResolver';
import { createVerificationAdapterLifecycleCoordinator } from './verificationAdapterLifecycleCoordinator';
import {
  addCleanupResidual,
  createOperationTracker,
  createVerificationAbortController,
  runGuarded,
} from './verificationAdapterLifecycleGuards';
import {
  digest,
  errorReasonCode,
  exactRecord,
  failedCleanup,
  normalizeCleanupResult,
  normalizePreflight,
  normalizePreparedInvocation,
  positiveInteger,
  token,
  validateAdapterContext,
  VerificationLifecycleCancelledError,
  VerificationLifecycleContractError,
  VerificationLifecycleTimeoutError,
} from './verificationAdapterLifecycleValidation';
import { matchVerificationAdapterRegistryEntry } from './verificationAdapterRegistry';
import type {
  ExecuteVerificationAdapterLifecycleInput,
  PreparedVerificationInvocation,
  VerificationAdapterCleanupCause,
  VerificationAdapterCleanupResult,
  VerificationAdapterLifecycleResult,
} from './verificationAdapterRuntime.types';
import type { VerificationCheckReportCandidate } from './verificationCheckReport.types';
import type { VerificationAdapterRegistryEntry } from './verification.types';

export { createVerificationAbortController } from './verificationAdapterLifecycleGuards';

type PreliminaryResult =
  | Readonly<{
      status: 'reported';
      report: VerificationCheckReportCandidate;
      invocation: PreparedVerificationInvocation;
    }>
  | Readonly<{
      status: 'unsupported' | 'blocked' | 'failed' | 'cancelled' | 'timed-out';
      reasonCode: string;
      failureClass:
        | 'unsupported-capability'
        | 'fixture-control'
        | 'adapter-infrastructure'
        | 'contract-mismatch'
        | 'security-denial'
        | 'cancelled'
        | 'timeout';
      invocation?: PreparedVerificationInvocation;
    }>;

/**
 * Runs one adapter attempt under Core-owned timeout, event, and cleanup
 * invariants. No report is accepted until strict decoding and clean cleanup
 * both succeed.
 */
const executeVerificationAdapterLifecycleOnce = async (
  input: ExecuteVerificationAdapterLifecycleInput
): Promise<VerificationAdapterLifecycleResult> => {
  digest(input.planDigest, 'Plan digest');
  token(input.cell.id, 'Cell id');
  token(input.attemptId, 'Attempt id');
  positiveInteger(input.generation, 'Attempt generation');
  digest(
    input.context.registrySnapshotDigest,
    'Adapter registry snapshot digest'
  );
  if (
    input.registrySnapshot.snapshotDigest !==
    input.context.registrySnapshotDigest
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter registry snapshot drifted from the Core context.'
    );
  }
  let registryEntry: VerificationAdapterRegistryEntry | undefined;
  try {
    registryEntry = matchVerificationAdapterRegistryEntry(
      input.registrySnapshot,
      input.cell.adapter
    );
  } catch {
    registryEntry = undefined;
  }
  if (!registryEntry) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Plan adapter identity is absent or drifted in the registry snapshot.'
    );
  }
  const descriptor = registryEntry.descriptor;
  token(input.context.runtimeZone, 'Runtime zone');
  validateAdapterContext(input);
  const resolvedInputSetDigest = createVerificationAdapterInputDigest({
    runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
    executableSnapshotDigest: input.context.executableSnapshotDigest,
    ...(input.context.scenarioProgramDigest === undefined
      ? {}
      : { scenarioProgramDigest: input.context.scenarioProgramDigest }),
    controlProfileDigest: input.context.controlProfileDigest,
    fixtureSetDigests: input.context.fixtureSetDigests,
    ...(input.context.baselineSetDigest === undefined
      ? {}
      : { baselineSetDigest: input.context.baselineSetDigest }),
    controlCapabilityIds: input.context.controlCapabilityIds,
    controlCapabilitySnapshotDigest:
      input.context.controlCapabilitySnapshotDigest,
    appliedControlDigest: input.context.appliedControlDigest,
    inputRefs: input.context.inputRefs,
  });
  const unsupported =
    !descriptor.checkKinds.includes(input.cell.checkKind) ||
    !descriptor.surfaces.includes(input.cell.surface) ||
    !descriptor.targets.includes(input.cell.frameworkTarget) ||
    (input.cell.browserEngine !== undefined &&
      !descriptor.browserEngines.includes(input.cell.browserEngine)) ||
    !input.cell.inputKinds.every((kind) =>
      descriptor.inputKinds.includes(kind)
    ) ||
    !input.cell.artifactKinds.every((kind) =>
      descriptor.artifactKinds.includes(kind)
    ) ||
    !input.context.controlCapabilityIds.every((id) =>
      descriptor.controlCapabilities.includes(id)
    ) ||
    !registryEntry.runtimeZones.includes(input.context.runtimeZone);
  if (unsupported) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Registry descriptor does not support the exact Plan cell context.'
    );
  }
  if (typeof input.factory !== 'function') {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Verification adapter factory is invalid.'
    );
  }
  const adapter = input.factory(
    Object.freeze({
      descriptor,
      identity: input.cell.adapter,
      tool: registryEntry.tool,
      runtimeZone: input.context.runtimeZone,
      registrySnapshotDigest: input.registrySnapshot.snapshotDigest,
    })
  );
  const adapterRecord = exactRecord(adapter, [
    'preflight',
    'prepare',
    'execute',
    'cleanup',
  ]);
  if (
    !['preflight', 'prepare', 'execute', 'cleanup'].every(
      (method) => typeof adapterRecord[method] === 'function'
    )
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Verification adapter factory returned an invalid adapter.'
    );
  }
  const budgets = descriptor.budgets;
  const maximumDurationMs = positiveInteger(
    budgets.maximumDurationMs,
    'Maximum duration'
  );
  const attemptDeadlineAt = Date.now() + maximumDurationMs;
  const maximumEvents = positiveInteger(
    budgets.maximumEvents,
    'Maximum events'
  );
  positiveInteger(budgets.maximumArtifactBytes, 'Maximum artifact bytes');
  digest(
    input.context.controlCapabilitySnapshotDigest,
    'Control capability snapshot digest'
  );
  digest(input.context.appliedControlDigest, 'Applied control digest');
  if (!sameCanonicalJson(input.context.adapter, input.cell.adapter)) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context identity does not match the Plan cell.'
    );
  }
  const retirementPort = exactRecord(input.artifactRetirement, [
    'retireAttempt',
  ]);
  if (typeof retirementPort.retireAttempt !== 'function') {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Artifact attempt retirement port is invalid.'
    );
  }
  const controller = createVerificationAbortController();
  const staging = createVerificationArtifactStagingController({
    planDigest: input.planDigest,
    cellId: input.cell.id,
    attemptId: input.attemptId,
    generation: input.generation,
    maximumArtifactBytes: budgets.maximumArtifactBytes,
    artifactKinds: input.cell.artifactKinds,
    signal: controller.signal,
    port: input.context.artifactStaging,
    retirementPort: input.artifactRetirement,
  });
  const resolver = createVerificationInputResolverController({
    refs: input.context.inputRefs,
    maximumBytes: input.context.inputRefs.reduce(
      (total, reference) => total + reference.size,
      0
    ),
    resolver: input.context.inputResolver,
    signal: controller.signal,
  });

  let externalSignalContractViolation = false;
  let externalSignalReleased = false;
  let unsubscribeExternal = (): void => undefined;
  try {
    const unsubscribe = input.context.abortSignal.subscribe((reason) =>
      controller.abort(reason)
    );
    if (typeof unsubscribe !== 'function') {
      externalSignalContractViolation = true;
    } else {
      unsubscribeExternal = unsubscribe;
    }
  } catch {
    externalSignalContractViolation = true;
  }
  if (input.context.abortSignal.aborted) {
    controller.abort(input.context.abortSignal.reason);
  }
  const releaseExternalSignal = (): void => {
    if (externalSignalReleased) return;
    externalSignalReleased = true;
    try {
      unsubscribeExternal();
    } catch {
      externalSignalContractViolation = true;
    }
  };
  const context = Object.freeze({
    ...input.context,
    resolvedInputSetDigest,
    inputResolver: resolver.resolver,
    artifactStaging: staging.port,
    abortSignal: controller.signal,
  });
  let invocation: PreparedVerificationInvocation | undefined;
  let events = createVerificationEventSinkController(
    Object.freeze({
      invocationId: 'pending',
      planDigest: input.planDigest,
      cellId: input.cell.id,
      adapterId: input.cell.adapter.adapterId,
      attemptId: input.attemptId,
      generation: input.generation,
      providerKind: input.providerKind,
      inputDigest: input.cell.inputDigest,
      resolvedInputSetDigest,
      controlCapabilitySnapshotDigest:
        input.context.controlCapabilitySnapshotDigest,
      appliedControlDigest: input.context.appliedControlDigest,
      confirmedCursor: 0,
      state: 'preparing',
    }),
    maximumEvents
  );
  let cleanupCause: VerificationAdapterCleanupCause = 'preflight-failed';
  let preliminary: PreliminaryResult;
  const operations = createOperationTracker();

  if (externalSignalContractViolation) {
    preliminary = Object.freeze({
      status: 'failed',
      reasonCode: 'VER-4001',
      failureClass: 'contract-mismatch',
    });
  } else {
    try {
      if (controller.signal.aborted) {
        throw new VerificationLifecycleCancelledError();
      }
      const preflight = normalizePreflight(
        await runGuarded(
          () => adapter.preflight(input.cell, context),
          controller.signal,
          controller,
          attemptDeadlineAt,
          (operation) => operations.track(operation)
        )
      );
      if (preflight.status !== 'supported') {
        preliminary = Object.freeze({
          status: preflight.status,
          reasonCode: preflight.reasonCode,
          failureClass:
            preflight.status === 'unsupported'
              ? 'unsupported-capability'
              : 'fixture-control',
        });
      } else {
        cleanupCause = 'prepare-failed';
        invocation = normalizePreparedInvocation(
          await runGuarded(
            () =>
              adapter.prepare(
                Object.freeze({
                  planDigest: input.planDigest,
                  cell: input.cell,
                  attemptId: input.attemptId,
                  generation: input.generation,
                  providerKind: input.providerKind,
                  controlCapabilitySnapshotDigest:
                    input.context.controlCapabilitySnapshotDigest,
                  appliedControlDigest: input.context.appliedControlDigest,
                  context,
                })
              ),
            controller.signal,
            controller,
            attemptDeadlineAt,
            (operation) => operations.track(operation)
          ),
          input,
          resolvedInputSetDigest
        );
        events = createVerificationEventSinkController(
          invocation,
          maximumEvents
        );
        cleanupCause = 'execute-failed';
        const decoded = decodeVerificationAdapterCheckReportCandidate(
          await runGuarded(
            () => adapter.execute(invocation!, events.sink),
            controller.signal,
            controller,
            attemptDeadlineAt,
            (operation) => operations.track(operation)
          )
        );
        await runGuarded(
          () =>
            Promise.all([
              staging.closeAndDrain(),
              resolver.closeAndDrain(),
            ]).then(() => undefined),
          controller.signal,
          controller,
          attemptDeadlineAt
        );
        events.close();
        if (events.violation() || staging.violation() || resolver.violation()) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Adapter event or staging stream violated Core policy.'
          );
        }
        if (!decoded.ok) {
          throw new VerificationLifecycleContractError(
            decoded.issues[0]?.code ?? 'VER-4002',
            'Adapter returned an invalid check report candidate.'
          );
        }
        const report = decoded.value;
        const stagedArtifacts = staging.snapshot();
        if (
          report.cellId !== input.cell.id ||
          report.attemptId !== input.attemptId ||
          report.checkKind !== input.cell.checkKind ||
          report.inputDigest !== input.cell.inputDigest ||
          !sameCanonicalJson(report.adapter, input.cell.adapter) ||
          !sameCanonicalJson(report.tool, registryEntry.tool)
        ) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Adapter report drifted from its Core-bound coordinates.'
          );
        }
        if (
          'behaviorAssertionReceipt' in report.payload &&
          (report.payload.behaviorAssertionReceipt.attemptId !==
            input.attemptId ||
            report.payload.behaviorAssertionReceipt.cellId !== input.cell.id ||
            report.payload.behaviorAssertionReceipt.scenarioId !==
              input.cell.scenarioId ||
            report.payload.behaviorAssertionReceipt.executableSnapshotDigest !==
              input.context.executableSnapshotDigest ||
            report.payload.behaviorAssertionReceipt.scenarioProgramDigest !==
              input.context.scenarioProgramDigest ||
            report.payload.behaviorAssertionReceipt.controlProfileDigest !==
              input.context.controlProfileDigest ||
            !sameCanonicalJson(
              report.payload.behaviorAssertionReceipt.fixtureSetDigests,
              input.context.fixtureSetDigests
            ))
        ) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Behavior assertion receipt drifted from its Core-bound Scenario, Snapshot, Control, or Fixture coordinates.'
          );
        }
        const reportArtifactsById = new Map(
          report.artifacts.map((artifact) => [artifact.id, artifact])
        );
        if (
          reportArtifactsById.size !== report.artifacts.length ||
          report.artifacts.length !== stagedArtifacts.length ||
          stagedArtifacts.some((artifact) => {
            const reported = reportArtifactsById.get(artifact.id);
            return (
              !reported ||
              reported.kind !== artifact.kind ||
              reported.digest !== artifact.digest ||
              reported.size !== artifact.size ||
              reported.mediaType !== artifact.mediaType
            );
          })
        ) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Check report artifacts do not exactly match Core-staged artifacts.'
          );
        }
        const artifactEvents = events.snapshot().filter(
          (
            envelope
          ): envelope is typeof envelope & {
            event: Extract<typeof envelope.event, { kind: 'artifact' }>;
          } => envelope.event.kind === 'artifact'
        );
        if (
          artifactEvents.length !== stagedArtifacts.length ||
          new Set(artifactEvents.map(({ event }) => event.artifactId)).size !==
            artifactEvents.length ||
          stagedArtifacts.some(
            (artifact) =>
              !artifactEvents.some(
                ({ event }) =>
                  event.artifactId === artifact.id &&
                  event.digest === artifact.digest
              )
          )
        ) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Artifact events do not exactly match Core-staged artifacts.'
          );
        }
        const artifactBytes = report.artifacts.reduce(
          (total, artifact) => total + artifact.size,
          0
        );
        if (
          !Number.isSafeInteger(artifactBytes) ||
          artifactBytes > budgets.maximumArtifactBytes
        ) {
          throw new VerificationLifecycleContractError(
            'VER-4001',
            'Adapter report exceeded its artifact byte budget.'
          );
        }
        cleanupCause = 'success';
        preliminary = Object.freeze({
          status: 'reported',
          report,
          invocation,
        });
      }
    } catch (error) {
      if (error instanceof VerificationLifecycleTimeoutError) {
        cleanupCause = 'timed-out';
        preliminary = Object.freeze({
          status: 'timed-out',
          reasonCode: 'verification-adapter-timeout',
          failureClass: 'timeout',
          ...(invocation ? { invocation } : {}),
        });
      } else if (
        error instanceof VerificationLifecycleCancelledError ||
        (controller.signal.aborted &&
          controller.signal.reason !== 'verification-adapter-timeout')
      ) {
        cleanupCause = 'cancelled';
        preliminary = Object.freeze({
          status: 'cancelled',
          reasonCode: controller.signal.reason ?? 'verification-aborted',
          failureClass: 'cancelled',
          ...(invocation ? { invocation } : {}),
        });
      } else {
        const reasonCode = errorReasonCode(error);
        preliminary = Object.freeze({
          status: 'failed',
          reasonCode,
          failureClass:
            reasonCode === 'VER-4001' || reasonCode === 'VER-4002'
              ? 'contract-mismatch'
              : 'adapter-infrastructure',
          ...(invocation ? { invocation } : {}),
        });
      }
    }
  }

  staging.close();
  resolver.close();
  events.close();
  releaseExternalSignal();

  let retirementTask: Promise<boolean> | undefined;
  const retireAttempt = (): Promise<boolean> => {
    if (retirementTask) return retirementTask;
    controller.abort('verification-attempt-retired');
    retirementTask = (async () => {
      const retirementController = createVerificationAbortController();
      try {
        const result = await runGuarded(
          () => staging.retire(retirementController.signal),
          retirementController.signal,
          retirementController,
          Date.now() + maximumDurationMs
        );
        return result.status === 'retired';
      } catch {
        return false;
      }
    })();
    return retirementTask;
  };
  let retirementSucceeded: boolean | undefined;
  if (preliminary.status !== 'reported' || externalSignalContractViolation) {
    retirementSucceeded = await retireAttempt();
  }

  let cleanup: VerificationAdapterCleanupResult;
  const drainController = createVerificationAbortController();
  let transportDrainFailed = false;
  try {
    await runGuarded(
      () =>
        Promise.all([
          operations.drain(),
          staging.closeAndDrain(),
          resolver.closeAndDrain(),
        ]).then(() => undefined),
      drainController.signal,
      drainController,
      Date.now() + maximumDurationMs
    );
  } catch {
    transportDrainFailed = true;
  }
  if (transportDrainFailed) {
    retirementSucceeded = await retireAttempt();
  }
  const cleanupController = createVerificationAbortController();
  const cleanupDeadlineAt = Date.now() + maximumDurationMs;
  try {
    cleanup = normalizeCleanupResult(
      await runGuarded(
        () =>
          adapter.cleanup(
            Object.freeze({
              planDigest: input.planDigest,
              cellId: input.cell.id,
              attemptId: input.attemptId,
              generation: input.generation,
              cause: cleanupCause,
              ...(invocation ? { invocation } : {}),
              abortSignal: cleanupController.signal,
            })
          ),
        cleanupController.signal,
        cleanupController,
        cleanupDeadlineAt
      )
    );
  } catch {
    cleanup = failedCleanup();
  }

  // A timed-out continuation can attempt a terminal write while cleanup runs.
  // Recheck every Core-owned port only after cleanup has settled.
  await Promise.resolve();
  const terminalPortContractViolation =
    events.violation() !== undefined ||
    staging.violation() !== undefined ||
    resolver.violation() !== undefined;
  let finalizedReport: VerificationCheckReportCandidate | undefined;
  let finalReportContractViolation = false;
  if (
    preliminary.status === 'reported' &&
    cleanup.status === 'clean' &&
    !externalSignalContractViolation &&
    !terminalPortContractViolation &&
    !transportDrainFailed
  ) {
    const finalized = finalizeVerificationAdapterCheckReportCandidate(
      preliminary.report
    );
    if (finalized.ok) {
      finalizedReport = finalized.value;
    } else {
      finalReportContractViolation = true;
    }
  }
  const lifecycleContractViolation =
    externalSignalContractViolation ||
    terminalPortContractViolation ||
    finalReportContractViolation;
  if (
    preliminary.status !== 'reported' ||
    cleanup.status !== 'clean' ||
    lifecycleContractViolation ||
    transportDrainFailed
  ) {
    retirementSucceeded ??= await retireAttempt();
  }

  if (transportDrainFailed) {
    cleanup = addCleanupResidual(cleanup, 'canary:attempt-quiescence');
  }
  if (retirementSucceeded === false) {
    cleanup = addCleanupResidual(cleanup, 'canary:artifact-attempt-retirement');
  }

  const eventSnapshot = events.snapshot();
  if (cleanup.status !== 'clean') {
    return Object.freeze({
      status: 'failed',
      reasonCode:
        cleanup.status === 'residual'
          ? 'security.cleanup-residual'
          : 'verification-cleanup-failed',
      failureClass:
        cleanup.status === 'residual'
          ? 'security-denial'
          : 'adapter-infrastructure',
      ...(invocation ? { invocation } : {}),
      events: eventSnapshot,
      resolvedInputSetDigest,
      cleanup,
    });
  }
  if (lifecycleContractViolation) {
    return Object.freeze({
      status: 'failed',
      reasonCode: 'VER-4001',
      failureClass: 'contract-mismatch',
      ...(invocation ? { invocation } : {}),
      events: eventSnapshot,
      resolvedInputSetDigest,
      cleanup,
    });
  }
  return preliminary.status === 'reported'
    ? Object.freeze({
        ...preliminary,
        report: finalizedReport!,
        events: eventSnapshot,
        stagedArtifacts: staging.snapshot(),
        resolvedInputSetDigest,
        cleanup,
      })
    : Object.freeze({
        ...preliminary,
        events: eventSnapshot,
        resolvedInputSetDigest,
        cleanup,
      });
};

export const executeVerificationAdapterLifecycle =
  createVerificationAdapterLifecycleCoordinator(
    executeVerificationAdapterLifecycleOnce
  );
