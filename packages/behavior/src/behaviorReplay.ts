import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  createExecutionSecretLeakGuard,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeProvider,
  type DeterministicSchedulerEvent,
} from '@prodivix/runtime-core';
import { digestBehaviorValue } from './behaviorCanonical';
import {
  executeBehaviorScenarioProgram,
  type BehaviorRuntimeCancellationSignal,
  type BehaviorRuntimeCapabilityRegistry,
  type BehaviorRuntimeDebugPort,
  type BehaviorRuntimeResult,
} from './behaviorRuntime';
import type {
  BehaviorJsonValue,
  BehaviorScenarioProgram,
  BehaviorSourceRef,
} from './behavior.types';

export type BehaviorReplayEvent = Readonly<{
  sequence: number;
  kind:
    | 'control-applied'
    | 'scheduler-task'
    | 'instruction-started'
    | 'instruction-completed'
    | 'instruction-failed'
    | 'instruction-cancelled'
    | 'fixture-matched'
    | 'fixture-fault'
    | 'fixture-blocked'
    | 'cleanup-completed'
    | 'cleanup-failed';
  logicalTime: number;
  lane?: string;
  instructionId?: string;
  stepId?: string;
  capabilityId?: string;
  source?: BehaviorSourceRef;
  valueDigest?: string;
  errorCode?: string;
  fixtureId?: string;
  detailDigest?: string;
}>;

export type BehaviorReplayRecord = Readonly<{
  attemptId: string;
  provider: Readonly<{
    id: string;
    version: string;
    surface: 'browser' | 'remote' | 'export' | 'ci';
  }>;
  identity: Readonly<{
    scenarioId: string;
    scenarioDigest: string;
    programDigest: string;
    controlProfileDigest: string;
    appliedControlDigest: string;
    capabilitySnapshotDigest: string;
    fixtureSetDigests: readonly string[];
    executableSnapshotDigest: string;
    compilerDigest: string;
    registryDigest: string;
    toolchainDigest: string;
    cellId: string;
  }>;
  initialStateManifestDigest: string;
  events: readonly BehaviorReplayEvent[];
  outcome: BehaviorRuntimeResult['status'] | 'infrastructure-error';
  issueCode?: string;
  cleanup: Readonly<{
    status: 'clean' | 'residual';
    residualDigest: string;
  }>;
  nonDeterminismFlags: readonly string[];
  truncatedEventCount: number;
  semanticDigest: string;
  recordDigest: string;
}>;

export type BehaviorReplayRecordWire = BehaviorReplayRecord &
  Readonly<{ wireVersion: 1 }>;

export type BehaviorReplayRecordBudget = Readonly<{
  maximumEvents?: number;
  maximumUtf8Bytes?: number;
}>;

export type BehaviorReplayAttemptResult =
  | Readonly<{
      status: 'completed' | 'failed' | 'cancelled';
      runtime: BehaviorRuntimeResult;
      record: BehaviorReplayRecord;
    }>
  | Readonly<{
      status: 'blocked' | 'infrastructure-error';
      code: 'BHV-4003' | 'BHV-4004' | 'BHV-4005' | 'BHV-4006' | 'BHV-9001';
      reason: string;
      runtime?: BehaviorRuntimeResult;
      record?: BehaviorReplayRecord;
    }>;

export type ExecuteBehaviorReplayAttemptInput = Readonly<{
  program: BehaviorScenarioProgram;
  plan: DeterministicRuntimeControlPlan;
  provider: DeterministicRuntimeProvider;
  registry: BehaviorRuntimeCapabilityRegistry;
  attemptId: string;
  toolchainDigest: string;
  signal?: BehaviorRuntimeCancellationSignal;
  debugger?: BehaviorRuntimeDebugPort;
  protectedSecretValues?: readonly string[];
  recordBudget?: BehaviorReplayRecordBudget;
}>;

export type BehaviorReplayDivergenceKind =
  | 'input-drift'
  | 'capability-drift'
  | 'schedule-divergence'
  | 'observation-divergence'
  | 'effect-divergence'
  | 'render-divergence'
  | 'truncated';

export type BehaviorReplayDivergence = Readonly<{
  kind: BehaviorReplayDivergenceKind;
  eventIndex?: number;
  expected?: BehaviorReplayEvent;
  actual?: BehaviorReplayEvent;
  preceding: readonly Readonly<{
    expected?: BehaviorReplayEvent;
    actual?: BehaviorReplayEvent;
  }>[];
  reason: string;
}>;

export type CompareBehaviorReplayRecordsResult =
  | Readonly<{
      status: 'consistent';
      semanticDigest: string;
    }>
  | Readonly<{
      status: 'diverged';
      divergence: BehaviorReplayDivergence;
    }>;

export type BehaviorReplaySeriesResult =
  | Readonly<{
      status: 'consistent';
      records: readonly BehaviorReplayRecord[];
      semanticDigest: string;
    }>
  | Readonly<{
      status: 'diverged';
      records: readonly BehaviorReplayRecord[];
      divergence: BehaviorReplayDivergence;
    }>
  | Readonly<{
      status: 'blocked' | 'infrastructure-error';
      records: readonly BehaviorReplayRecord[];
      attempt: BehaviorReplayAttemptResult;
    }>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
export const DEFAULT_REPLAY_MAXIMUM_EVENTS = 10_000;
export const HARD_REPLAY_MAXIMUM_EVENTS = 100_000;
export const DEFAULT_REPLAY_MAXIMUM_UTF8_BYTES = 2_097_152;
export const HARD_REPLAY_MAXIMUM_UTF8_BYTES = 16_777_216;

export const readBehaviorReplayBudget = (
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new TypeError(
      `${label} must be a positive safe integer no greater than ${maximum}.`
    );
  }
  return resolved;
};

const safeRecordIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new TypeError(`${label} must be a bounded canonical identity.`);
  }
  return normalized;
};

const eventWithoutSequence = (
  event: BehaviorReplayEvent
): Omit<BehaviorReplayEvent, 'sequence'> => {
  const { sequence: _sequence, ...value } = event;
  return value;
};

const semanticEvents = (
  events: readonly BehaviorReplayEvent[]
): readonly Omit<BehaviorReplayEvent, 'sequence'>[] =>
  Object.freeze(
    events
      .filter(
        ({ kind }) =>
          kind !== 'control-applied' &&
          kind !== 'cleanup-completed' &&
          kind !== 'cleanup-failed'
      )
      .map(eventWithoutSequence)
  );

const replaySemanticIdentity = (
  record: Pick<BehaviorReplayRecord, 'identity'>
) =>
  Object.freeze({
    scenarioDigest: record.identity.scenarioDigest,
    programDigest: record.identity.programDigest,
    controlProfileDigest: record.identity.controlProfileDigest,
    fixtureSetDigests: record.identity.fixtureSetDigests,
    executableSnapshotDigest: record.identity.executableSnapshotDigest,
    compilerDigest: record.identity.compilerDigest,
    registryDigest: record.identity.registryDigest,
    toolchainDigest: record.identity.toolchainDigest,
  });

export const calculateBehaviorReplaySemanticDigest = (
  record: Pick<
    BehaviorReplayRecord,
    | 'identity'
    | 'initialStateManifestDigest'
    | 'events'
    | 'outcome'
    | 'issueCode'
    | 'cleanup'
    | 'nonDeterminismFlags'
  >
): string =>
  digestBehaviorValue({
    identity: replaySemanticIdentity(record),
    initialStateManifestDigest: record.initialStateManifestDigest,
    events: semanticEvents(record.events),
    outcome: record.outcome,
    issueCode: record.issueCode ?? null,
    cleanup: record.cleanup.status,
    nonDeterminismFlags: record.nonDeterminismFlags,
  });

const issueCode = (runtime: BehaviorRuntimeResult): string | undefined =>
  runtime.status === 'blocked' || runtime.status === 'failed'
    ? runtime.issue.code
    : undefined;

const makeRecord = (
  input: Readonly<{
    attemptId: string;
    provider: BehaviorReplayRecord['provider'];
    identity: BehaviorReplayRecord['identity'];
    initialStateManifestDigest: string;
    events: readonly BehaviorReplayEvent[];
    outcome: BehaviorReplayRecord['outcome'];
    issueCode?: string;
    cleanup: BehaviorReplayRecord['cleanup'];
    truncatedEventCount: number;
  }>
): BehaviorReplayRecord => {
  const nonDeterminismFlags = Object.freeze(
    input.truncatedEventCount ? ['record-truncated'] : []
  );
  const semanticDigest = calculateBehaviorReplaySemanticDigest({
    ...input,
    nonDeterminismFlags,
  });
  const withoutDigest = Object.freeze({
    ...input,
    events: Object.freeze([...input.events]),
    nonDeterminismFlags,
    semanticDigest,
  });
  return Object.freeze({
    ...withoutDigest,
    recordDigest: digestBehaviorValue(withoutDigest),
  });
};

const buildReplayEvents = (
  input: Readonly<{
    runtime: BehaviorRuntimeResult;
    controlDigest: string;
    capabilitySnapshotDigest: string;
    schedulerEvents: readonly DeterministicSchedulerEvent[];
    networkEvents: readonly Readonly<{
      sequence: number;
      logicalTime: number;
      outcome: 'matched' | 'fault' | 'blocked';
      fixtureId?: string;
      reason?: string;
      requestKind: string;
      resourceId: string;
      inputDigest: string;
    }>[];
    cleanupStatus: 'clean' | 'residual';
    cleanupDigest: string;
    maximumEvents: number;
  }>
): Readonly<{
  events: readonly BehaviorReplayEvent[];
  truncatedEventCount: number;
}> => {
  type OrderedReplayEvent = Readonly<{
    event: Omit<BehaviorReplayEvent, 'sequence'>;
    sourceSequence: number;
  }>;
  const body: OrderedReplayEvent[] = [
    ...input.runtime.trace.map((event) => ({
      event: {
        kind: event.kind,
        logicalTime: event.logicalTime ?? event.sequence,
        instructionId: event.instructionId,
        stepId: event.stepId,
        ...(event.capabilityId ? { capabilityId: event.capabilityId } : {}),
        source: event.source,
        ...(event.outputDigest ? { valueDigest: event.outputDigest } : {}),
        ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      },
      sourceSequence: event.sequence,
    })),
    ...input.schedulerEvents
      .filter(
        ({ kind }) =>
          kind === 'task-started' ||
          kind === 'barrier-released' ||
          kind === 'deadlock' ||
          kind === 'task-flood'
      )
      .map((event) => ({
        event: {
          kind: 'scheduler-task' as const,
          logicalTime: event.logicalTime,
          ...(event.lane ? { lane: event.lane } : {}),
          ...(event.taskId ? { instructionId: event.taskId } : {}),
          detailDigest: digestBehaviorValue({
            kind: event.kind,
            barrierId: event.barrierId ?? null,
            detail: event.detail ?? null,
          }),
        },
        sourceSequence: event.sequence,
      })),
    ...input.networkEvents.map((event) => ({
      event: {
        kind:
          event.outcome === 'matched'
            ? ('fixture-matched' as const)
            : event.outcome === 'fault'
              ? ('fixture-fault' as const)
              : ('fixture-blocked' as const),
        logicalTime: event.logicalTime,
        ...(event.fixtureId ? { fixtureId: event.fixtureId } : {}),
        detailDigest: digestBehaviorValue({
          requestKind: event.requestKind,
          resourceId: event.resourceId,
          inputDigest: event.inputDigest,
          reason: event.reason ?? null,
        }),
      },
      sourceSequence: event.sequence,
    })),
  ];
  const eventPriority = (
    event: Omit<BehaviorReplayEvent, 'sequence'>
  ): number => {
    if (event.kind === 'scheduler-task') return 0;
    if (event.kind === 'instruction-started') return 1;
    if (event.kind.startsWith('fixture-')) return 2;
    return 3;
  };
  body.sort(
    (left, right) =>
      left.event.logicalTime - right.event.logicalTime ||
      eventPriority(left.event) - eventPriority(right.event) ||
      left.sourceSequence - right.sourceSequence ||
      compareUnicodeCodePoints(
        left.event.instructionId ?? left.event.fixtureId ?? left.event.kind,
        right.event.instructionId ?? right.event.fixtureId ?? right.event.kind
      )
  );
  const candidates: Omit<BehaviorReplayEvent, 'sequence'>[] = [
    {
      kind: 'control-applied',
      logicalTime: 0,
      detailDigest: digestBehaviorValue({
        controlDigest: input.controlDigest,
        capabilitySnapshotDigest: input.capabilitySnapshotDigest,
      }),
    },
    ...body.map(({ event }) => event),
    {
      kind:
        input.cleanupStatus === 'clean'
          ? 'cleanup-completed'
          : 'cleanup-failed',
      logicalTime:
        input.schedulerEvents.at(-1)?.logicalTime ??
        input.runtime.trace.at(-1)?.logicalTime ??
        input.runtime.trace.length,
      detailDigest: input.cleanupDigest,
    },
  ];
  const retained = candidates.slice(0, input.maximumEvents);
  return Object.freeze({
    events: Object.freeze(
      retained.map((event, index) =>
        Object.freeze({ sequence: index + 1, ...event })
      )
    ),
    truncatedEventCount: candidates.length - retained.length,
  });
};

/**
 * Runs one fresh, preflighted attempt and emits only bounded normalized state.
 * Provider/session state is always cleaned before a result is returned.
 */
export const executeBehaviorReplayAttempt = async (
  input: ExecuteBehaviorReplayAttemptInput
): Promise<BehaviorReplayAttemptResult> => {
  const maximumEvents = readBehaviorReplayBudget(
    input.recordBudget?.maximumEvents,
    DEFAULT_REPLAY_MAXIMUM_EVENTS,
    HARD_REPLAY_MAXIMUM_EVENTS,
    'ReplayRecord event budget'
  );
  const maximumUtf8Bytes = readBehaviorReplayBudget(
    input.recordBudget?.maximumUtf8Bytes,
    DEFAULT_REPLAY_MAXIMUM_UTF8_BYTES,
    HARD_REPLAY_MAXIMUM_UTF8_BYTES,
    'ReplayRecord byte budget'
  );
  if (
    input.program.controlProfileDigest !== input.plan.profileDigest ||
    input.program.fixtureSetDigests.length !==
      input.plan.fixtureSetDigests.length ||
    input.program.fixtureSetDigests.some(
      (digest, index) => digest !== input.plan.fixtureSetDigests[index]
    )
  ) {
    return Object.freeze({
      status: 'blocked',
      code: 'BHV-4005',
      reason:
        'Behavior Program identity does not match the resolved control plan.',
    });
  }
  if (!DIGEST_PATTERN.test(input.toolchainDigest)) {
    return Object.freeze({
      status: 'blocked',
      code: 'BHV-4005',
      reason: 'Behavior replay requires an exact toolchain digest.',
    });
  }
  const started = await input.provider.startAttempt({
    attemptId: input.attemptId,
    plan: input.plan,
  });
  if (started.status === 'blocked') {
    return Object.freeze({
      status: 'blocked',
      code:
        started.code === 'isolation-canary-failed' ? 'BHV-4006' : 'BHV-4005',
      reason: started.code,
    });
  }

  const { session } = started;
  const initialStateManifestDigest = digestBehaviorValue({
    bootstrapFixtureIds: input.plan.storage.bootstrapFixtureIds,
    serviceWorker: input.plan.serviceWorker,
    namespaceClass: 'fresh-attempt',
  });
  let runtime: BehaviorRuntimeResult;
  try {
    runtime = await executeBehaviorScenarioProgram({
      program: input.program,
      attemptId: input.attemptId,
      runtimeZone: input.plan.cell.surface === 'ci' ? 'test' : 'client',
      registry: input.registry,
      signal: input.signal,
      maximumConcurrency: input.plan.scheduler.maximumConcurrency,
      controls: session,
      debugger: input.debugger,
    });
    input.debugger?.finish?.({
      attemptId: input.attemptId,
      status: runtime.status,
    });
  } catch {
    try {
      input.debugger?.finish?.({
        attemptId: input.attemptId,
        status: 'failed',
      });
    } catch {
      // Cleanup remains mandatory even when a debugger projection fails.
    }
    const cleanup = await session.cleanup();
    if (!cleanup.clean) {
      return Object.freeze({
        status: 'blocked',
        code: 'BHV-4006',
        reason: 'Behavior replay cleanup canary found residual runtime state.',
      });
    }
    return Object.freeze({
      status: 'infrastructure-error',
      code: 'BHV-9001',
      reason:
        'Behavior replay failed before producing a safe normalized outcome.',
    });
  }

  const cleanupCanary = await session.cleanup();
  const cleanup = Object.freeze({
    status: cleanupCanary.clean ? ('clean' as const) : ('residual' as const),
    residualDigest: digestBehaviorValue(cleanupCanary.residual),
  });
  const built = buildReplayEvents({
    runtime,
    controlDigest: session.applied.controlDigest,
    capabilitySnapshotDigest: session.applied.capabilitySnapshotDigest,
    schedulerEvents: session.scheduler.snapshot().events,
    networkEvents: session.network.events(),
    cleanupStatus: cleanup.status,
    cleanupDigest: cleanup.residualDigest,
    maximumEvents,
  });
  const record = makeRecord({
    attemptId: safeRecordIdentity(input.attemptId, 'Replay attempt id'),
    provider: Object.freeze({ ...input.provider.descriptor }),
    identity: Object.freeze({
      scenarioId: input.program.scenarioId,
      scenarioDigest: input.program.scenarioDigest,
      programDigest: input.program.programDigest,
      controlProfileDigest: input.program.controlProfileDigest,
      appliedControlDigest: session.applied.controlDigest,
      capabilitySnapshotDigest: session.applied.capabilitySnapshotDigest,
      fixtureSetDigests: Object.freeze([...input.program.fixtureSetDigests]),
      executableSnapshotDigest: input.program.executableSnapshotDigest,
      compilerDigest: input.program.compilerDigest,
      registryDigest: input.program.registryDigest,
      toolchainDigest: input.toolchainDigest,
      cellId: input.plan.cell.id,
    }),
    initialStateManifestDigest,
    events: built.events,
    outcome: runtime.status,
    ...(issueCode(runtime) ? { issueCode: issueCode(runtime) } : {}),
    cleanup,
    truncatedEventCount: built.truncatedEventCount,
  });

  const secretGuard = createExecutionSecretLeakGuard({
    secretValues: input.protectedSecretValues ?? [],
  });
  if (!secretGuard.inspectValue('trace', record).safe) {
    return Object.freeze({
      status: 'blocked',
      code: 'BHV-4004',
      reason: 'Behavior ReplayRecord contained protected material.',
      runtime,
    });
  }
  if (
    utf8ToBytes(canonicalJsonText(record)).byteLength > maximumUtf8Bytes ||
    record.truncatedEventCount > 0
  ) {
    return Object.freeze({
      status: 'infrastructure-error',
      code: 'BHV-9001',
      reason: 'Behavior ReplayRecord exceeded its hard budget.',
      runtime,
      record,
    });
  }
  if (!cleanupCanary.clean) {
    return Object.freeze({
      status: 'blocked',
      code: 'BHV-4006',
      reason: 'Behavior replay cleanup canary found residual runtime state.',
      runtime,
      record,
    });
  }
  return Object.freeze({
    status:
      runtime.status === 'completed'
        ? 'completed'
        : runtime.status === 'cancelled'
          ? 'cancelled'
          : 'failed',
    runtime,
    record,
  });
};

export type BehaviorReplaySafeProjection = BehaviorJsonValue;
