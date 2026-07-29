import {
  canReachExecutionJobStatus,
  canTransitionExecutionJob,
  isExecutionJobTerminalStatus,
  type ExecutionProviderDescriptor,
} from '@prodivix/runtime-core';
import { RemoteExecutionRecoveryRequiredError } from './remoteExecutionClient';
import {
  digestRemoteExecutionEvent,
  type RemoteExecutionProjectionState,
} from './remoteExecutionProviderProjection';
import type {
  RemoteExecutionClient,
  RemoteExecutionEventRecord,
  RemoteExecutionEventsResult,
  RemoteExecutionRecord,
} from './remoteExecutionProtocol.types';

export const acceptedRemoteExecutionProviderMatches = (
  expected: ExecutionProviderDescriptor,
  actual: ExecutionProviderDescriptor
): boolean =>
  expected.id === actual.id &&
  expected.version === actual.version &&
  expected.displayName === actual.displayName &&
  actual.isolation === 'remote-isolated' &&
  expected.profiles.join('\0') === actual.profiles.join('\0') &&
  expected.runtimeZones.join('\0') === actual.runtimeZones.join('\0') &&
  expected.invocationKinds.join('\0') === actual.invocationKinds.join('\0') &&
  expected.capabilities.join('\0') === actual.capabilities.join('\0');

export const assertRemoteExecutionRecordProgress = (
  state: RemoteExecutionProjectionState,
  next: RemoteExecutionRecord
): void => {
  const previous = state.record;
  if (
    next.executionId !== previous.executionId ||
    next.requestId !== previous.requestId ||
    next.snapshotDigest !== previous.snapshotDigest ||
    !acceptedRemoteExecutionProviderMatches(previous.provider, next.provider) ||
    next.latestCursor < previous.latestCursor ||
    next.latestCursor < state.cursor ||
    !canReachExecutionJobStatus(previous.status, next.status) ||
    (isExecutionJobTerminalStatus(state.remoteStatus) &&
      next.status !== state.remoteStatus) ||
    (next.latestCursor === state.cursor && next.status !== state.remoteStatus)
  ) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote execution identity, cursor, or terminal state regressed.',
      'get'
    );
  }
};

export const assertRemoteExecutionEventPage = (
  state: RemoteExecutionProjectionState,
  page: RemoteExecutionEventsResult
): readonly RemoteExecutionEventRecord[] => {
  if (
    page.executionId !== state.record.executionId ||
    page.providerId !== state.record.provider.id ||
    page.afterCursor !== state.cursor ||
    page.latestCursor < state.cursor
  ) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote event page identity or cursor regressed.',
      'events.read'
    );
  }
  let events = page.events;
  const possibleDuplicate = events[0];
  if (possibleDuplicate?.cursor === state.cursor) {
    if (
      state.cursor === 0 ||
      possibleDuplicate.event.sequence !== possibleDuplicate.cursor ||
      possibleDuplicate.event.jobId !== state.record.executionId ||
      digestRemoteExecutionEvent(possibleDuplicate.event) !==
        state.confirmedEventDigest
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote event duplicate changed its confirmed payload.',
        'events.read'
      );
    }
    events = events.slice(1);
  }
  let expectedCursor = state.cursor + 1;
  let projectedStatus = state.remoteStatus;
  for (const { cursor, event } of events) {
    if (
      cursor !== expectedCursor ||
      event.sequence !== cursor ||
      event.jobId !== state.record.executionId
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote event stream contains a duplicate, gap, or out-of-order event.',
        'events.read'
      );
    }
    if (isExecutionJobTerminalStatus(projectedStatus)) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote event stream continued after a terminal state.',
        'events.read'
      );
    }
    if (event.kind === 'state') {
      const nextStatus = event.snapshot.status;
      const repeatedInitialQueuedState =
        cursor === 1 &&
        state.cursor === 0 &&
        projectedStatus === 'queued' &&
        nextStatus === 'queued' &&
        event.previousStatus === undefined;
      if (
        event.snapshot.jobId !== state.record.executionId ||
        event.snapshot.requestId !== state.record.requestId ||
        event.snapshot.providerId !== state.record.provider.id ||
        event.snapshot.latestEventSequence !== event.sequence ||
        (event.previousStatus !== undefined &&
          event.previousStatus !== projectedStatus) ||
        (!repeatedInitialQueuedState &&
          (nextStatus === projectedStatus ||
            !canTransitionExecutionJob(projectedStatus, nextStatus)))
      ) {
        throw new RemoteExecutionRecoveryRequiredError(
          'Remote state event regressed or drifted from its execution identity.',
          'events.read'
        );
      }
      projectedStatus = nextStatus;
    }
    expectedCursor += 1;
  }
  const finalCursor = events.at(-1)?.cursor ?? state.cursor;
  if (
    page.latestCursor < finalCursor ||
    (!events.length && page.latestCursor > state.cursor) ||
    (!events.length && page.hasMore) ||
    (!page.hasMore && page.latestCursor > finalCursor) ||
    (isExecutionJobTerminalStatus(projectedStatus) &&
      (page.hasMore || page.latestCursor > finalCursor))
  ) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote event page did not advance to its advertised cursor.',
      'events.read'
    );
  }
  return events;
};

export const validateRemoteExecutionResumeAnchor = async (
  input: Readonly<{
    client: RemoteExecutionClient;
    state: RemoteExecutionProjectionState;
    eventPageSize: number;
    generation: number;
  }>
): Promise<void> => {
  if (input.state.cursor === 0 || input.state.generation !== input.generation)
    return;
  const page = await input.client.readEvents({
    executionId: input.state.record.executionId,
    afterCursor: input.state.cursor - 1,
    limit: Math.min(2, input.eventPageSize),
  });
  if (input.state.generation !== input.generation) return;
  const anchor = page.events[0];
  if (
    page.executionId !== input.state.record.executionId ||
    page.providerId !== input.state.record.provider.id ||
    page.afterCursor !== input.state.cursor - 1 ||
    !anchor ||
    anchor.cursor !== input.state.cursor ||
    anchor.event.sequence !== anchor.cursor ||
    anchor.event.jobId !== input.state.record.executionId ||
    page.latestCursor < input.state.cursor ||
    digestRemoteExecutionEvent(anchor.event) !==
      input.state.confirmedEventDigest
  ) {
    throw new RemoteExecutionRecoveryRequiredError(
      'Remote resume anchor drifted from the last confirmed event.',
      'events.read'
    );
  }
};
