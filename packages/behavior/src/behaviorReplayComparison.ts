import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  executeBehaviorReplayAttempt,
  type BehaviorReplayDivergenceKind,
  type BehaviorReplayEvent,
  type BehaviorReplayRecord,
  type BehaviorReplaySeriesResult,
  type CompareBehaviorReplayRecordsResult,
  type ExecuteBehaviorReplayAttemptInput,
} from './behaviorReplay';

const eventWithoutSequence = (
  event: BehaviorReplayEvent
): Omit<BehaviorReplayEvent, 'sequence'> => {
  const { sequence: _sequence, ...value } = event;
  return value;
};

const semanticIdentity = (record: BehaviorReplayRecord) =>
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

const exactInputIdentity = (record: BehaviorReplayRecord) =>
  Object.freeze({
    ...semanticIdentity(record),
    appliedControlDigest: record.identity.appliedControlDigest,
    cellId: record.identity.cellId,
  });

const divergenceKindForEvent = (
  event: BehaviorReplayEvent | undefined
): BehaviorReplayDivergenceKind => {
  if (!event) return 'observation-divergence';
  if (event.kind === 'scheduler-task') return 'schedule-divergence';
  if (
    event.kind === 'fixture-matched' ||
    event.kind === 'fixture-fault' ||
    event.kind === 'fixture-blocked'
  ) {
    return 'effect-divergence';
  }
  if (event.kind.includes('instruction')) return 'observation-divergence';
  return 'render-divergence';
};

const divergent = (
  kind: BehaviorReplayDivergenceKind,
  reason: string,
  input: Readonly<{
    expectedEvents?: readonly BehaviorReplayEvent[];
    actualEvents?: readonly BehaviorReplayEvent[];
    eventIndex?: number;
  }> = {}
): CompareBehaviorReplayRecordsResult => {
  const index = input.eventIndex;
  const expected =
    index === undefined ? undefined : input.expectedEvents?.[index];
  const actual = index === undefined ? undefined : input.actualEvents?.[index];
  const start = Math.max(0, (index ?? 0) - 5);
  const preceding =
    index === undefined
      ? []
      : Array.from({ length: index - start }, (_, offset) => {
          const eventIndex = start + offset;
          return Object.freeze({
            ...(input.expectedEvents?.[eventIndex]
              ? { expected: input.expectedEvents[eventIndex] }
              : {}),
            ...(input.actualEvents?.[eventIndex]
              ? { actual: input.actualEvents[eventIndex] }
              : {}),
          });
        });
  return Object.freeze({
    status: 'diverged',
    divergence: Object.freeze({
      kind,
      ...(index === undefined ? {} : { eventIndex: index }),
      ...(expected ? { expected } : {}),
      ...(actual ? { actual } : {}),
      preceding: Object.freeze(preceding),
      reason,
    }),
  });
};

export const compareBehaviorReplayRecords = (
  expected: BehaviorReplayRecord,
  actual: BehaviorReplayRecord,
  options: Readonly<{
    allowProviderCapabilityDifference?: boolean;
    allowPlanCellDifference?: boolean;
  }> = {}
): CompareBehaviorReplayRecordsResult => {
  if (
    expected.truncatedEventCount ||
    actual.truncatedEventCount ||
    expected.nonDeterminismFlags.includes('record-truncated') ||
    actual.nonDeterminismFlags.includes('record-truncated')
  ) {
    return divergent(
      'truncated',
      'An over-budget ReplayRecord cannot establish exact replay.'
    );
  }
  if (
    canonicalJsonText(
      options.allowPlanCellDifference
        ? semanticIdentity(expected)
        : exactInputIdentity(expected)
    ) !==
    canonicalJsonText(
      options.allowPlanCellDifference
        ? semanticIdentity(actual)
        : exactInputIdentity(actual)
    )
  ) {
    return divergent(
      'input-drift',
      'Program, control, fixture, toolchain, or cell identity changed.'
    );
  }
  if (
    !options.allowProviderCapabilityDifference &&
    expected.identity.capabilitySnapshotDigest !==
      actual.identity.capabilitySnapshotDigest
  ) {
    return divergent(
      'capability-drift',
      'Provider control capability identity changed.'
    );
  }
  const expectedEvents = expected.events.filter(
    ({ kind }) => kind !== 'control-applied'
  );
  const actualEvents = actual.events.filter(
    ({ kind }) => kind !== 'control-applied'
  );
  const length = Math.max(expectedEvents.length, actualEvents.length);
  for (let index = 0; index < length; index += 1) {
    const expectedEvent = expectedEvents[index];
    const actualEvent = actualEvents[index];
    if (
      canonicalJsonText(
        expectedEvent ? eventWithoutSequence(expectedEvent) : null
      ) !==
      canonicalJsonText(actualEvent ? eventWithoutSequence(actualEvent) : null)
    ) {
      return divergent(
        divergenceKindForEvent(actualEvent ?? expectedEvent),
        'The first normalized replay event differs.',
        {
          expectedEvents,
          actualEvents,
          eventIndex: index,
        }
      );
    }
  }
  if (
    expected.outcome !== actual.outcome ||
    expected.issueCode !== actual.issueCode ||
    expected.cleanup.status !== actual.cleanup.status
  ) {
    return divergent(
      'observation-divergence',
      'Replay terminal outcome or cleanup status differs.'
    );
  }
  return Object.freeze({
    status: 'consistent',
    semanticDigest: expected.semanticDigest,
  });
};

export const runBehaviorReplaySeries = async (
  input: Omit<ExecuteBehaviorReplayAttemptInput, 'attemptId'> &
    Readonly<{
      attempts: number;
      createAttemptId(index: number): string;
      allowProviderCapabilityDifference?: boolean;
      allowPlanCellDifference?: boolean;
    }>
): Promise<BehaviorReplaySeriesResult> => {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1) {
    throw new TypeError(
      'Behavior replay series requires at least one attempt.'
    );
  }
  const records: BehaviorReplayRecord[] = [];
  for (let index = 0; index < input.attempts; index += 1) {
    const attempt = await executeBehaviorReplayAttempt({
      ...input,
      attemptId: input.createAttemptId(index),
    });
    if (
      attempt.status === 'blocked' ||
      attempt.status === 'infrastructure-error'
    ) {
      return Object.freeze({
        status: attempt.status,
        records: Object.freeze(records),
        attempt,
      });
    }
    const record = attempt.record;
    if (!record) {
      return Object.freeze({
        status: 'infrastructure-error',
        records: Object.freeze(records),
        attempt: Object.freeze({
          status: 'infrastructure-error',
          code: 'BHV-9001',
          reason: 'Behavior replay completed without a ReplayRecord.',
        }),
      });
    }
    records.push(record);
    if (records.length > 1) {
      const comparison = compareBehaviorReplayRecords(records[0]!, record, {
        allowProviderCapabilityDifference:
          input.allowProviderCapabilityDifference,
        allowPlanCellDifference: input.allowPlanCellDifference,
      });
      if (comparison.status === 'diverged') {
        return Object.freeze({
          status: 'diverged',
          records: Object.freeze(records),
          divergence: comparison.divergence,
        });
      }
    }
  }
  return Object.freeze({
    status: 'consistent',
    records: Object.freeze(records),
    semanticDigest: records[0]!.semanticDigest,
  });
};
