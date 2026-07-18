import {
  canTransitionExecutionJob,
  type ExecutableProjectSnapshot,
  type ExecutionJobEvent,
  type ExecutionJobStatus,
} from '@prodivix/runtime-core';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  RemoteExecutionCancelMutationResult,
  RemoteExecutionClaimResult,
  RemoteExecutionCreateMutationResult,
  RemoteExecutionLease,
  RemoteExecutionRepository,
  RemoteExecutionSnapshotStore,
  RemoteExecutionStoredRecord,
  RemoteExecutionStoredSnapshot,
} from './remoteExecutionControlPlane.types';
import { projectRemoteExecutionArtifact } from './remoteExecutionArtifact';
import { createRemoteExecutionServerAuthorityLease } from './remoteExecutionServerAuthority';

const terminalStatuses = new Set<ExecutionJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);

const snapshotKey = (snapshotId: string, digest: string): string =>
  `${snapshotId}\u0000${digest}`;

const utf8ByteLength = (value: string): number => {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    length +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return length;
};

const freezeStored = (
  input: Omit<
    RemoteExecutionStoredRecord,
    'events' | 'artifacts' | 'cancellationIds'
  > & {
    events: RemoteExecutionStoredRecord['events'];
    artifacts?: RemoteExecutionStoredRecord['artifacts'];
    cancellationIds?: RemoteExecutionStoredRecord['cancellationIds'];
  }
): RemoteExecutionStoredRecord =>
  Object.freeze({
    ...input,
    events: Object.freeze([...input.events]),
    artifacts: Object.freeze([...(input.artifacts ?? [])]),
    cancellationIds: Object.freeze([...(input.cancellationIds ?? [])]),
  });

export const createMemoryRemoteExecutionSnapshotStore =
  (): RemoteExecutionSnapshotStore => {
    const snapshots = new Map<string, RemoteExecutionStoredSnapshot>();
    const ownersBySnapshot = new Map<string, Set<string>>();
    return Object.freeze({
      async put(
        ownerId: string,
        snapshot: ExecutableProjectSnapshot,
        storedAt: number
      ) {
        const key = snapshotKey(
          snapshot.workspace.snapshotId,
          snapshot.contentDigest
        );
        const existing = snapshots.get(key);
        if (existing) {
          ownersBySnapshot.get(key)!.add(ownerId);
          return existing;
        }
        const stored = Object.freeze({
          snapshotId: snapshot.workspace.snapshotId,
          contentDigest: snapshot.contentDigest,
          snapshot,
          storedAt,
        });
        snapshots.set(key, stored);
        ownersBySnapshot.set(key, new Set([ownerId]));
        return stored;
      },
      async get(ownerId: string, snapshotId: string, contentDigest: string) {
        const key = snapshotKey(snapshotId, contentDigest);
        return ownersBySnapshot.get(key)?.has(ownerId)
          ? snapshots.get(key)
          : undefined;
      },
    });
  };

/** Atomic reference adapter used by conformance and embedders; durable adapters implement the same repository contract. */
export const createMemoryRemoteExecutionRepository =
  (): RemoteExecutionRepository => {
    const byId = new Map<string, RemoteExecutionStoredRecord>();
    const idByOwnerRequest = new Map<string, string>();
    const artifactContentsByDigest = new Map<string, Uint8Array>();
    const serverAuthorityByExecution = new Map<
      string,
      NonNullable<
        Parameters<
          RemoteExecutionRepository['createOrGet']
        >[0]['serverAuthority']
      >
    >();

    const put = (
      record: RemoteExecutionStoredRecord
    ): RemoteExecutionStoredRecord => {
      byId.set(record.record.executionId, record);
      return record;
    };
    const ownerRequestKey = (ownerId: string, requestId: string): string =>
      `${ownerId}\u0000${requestId}`;
    const stateEvent = (
      execution: RemoteExecutionStoredRecord,
      status: ExecutionJobStatus,
      now: number,
      reason?: string
    ): ExecutionJobEvent => {
      const sequence = execution.events.length + 1;
      return Object.freeze({
        kind: 'state',
        jobId: execution.record.executionId,
        sequence,
        emittedAt: now,
        previousStatus: execution.record.status,
        snapshot: Object.freeze({
          jobId: execution.record.executionId,
          requestId: execution.record.requestId,
          providerId: execution.record.provider.id,
          status,
          latestEventSequence: sequence,
          createdAt: execution.record.createdAt,
          ...(execution.record.startedAt === undefined
            ? {}
            : { startedAt: execution.record.startedAt }),
          ...(status === 'cancelling' ? { cancellationRequestedAt: now } : {}),
          ...(terminalStatuses.has(status) ? { completedAt: now } : {}),
        }),
        ...(reason === undefined ? {} : { reason }),
      });
    };
    const applyStatus = (
      execution: RemoteExecutionStoredRecord,
      status: ExecutionJobStatus,
      now: number,
      reason?: string
    ): RemoteExecutionStoredRecord => {
      if (!canTransitionExecutionJob(execution.record.status, status)) {
        throw new TypeError(
          `Remote execution cannot transition from ${execution.record.status} to ${status}.`
        );
      }
      const event = stateEvent(execution, status, now, reason);
      const updated = put(
        freezeStored({
          ...execution,
          record: Object.freeze({
            ...execution.record,
            status,
            latestCursor: event.sequence,
            ...(status === 'starting' &&
            execution.record.startedAt === undefined
              ? { startedAt: now }
              : {}),
            ...(terminalStatuses.has(status) ? { completedAt: now } : {}),
          }),
          events: [...execution.events, { cursor: event.sequence, event }],
        })
      );
      if (terminalStatuses.has(status))
        serverAuthorityByExecution.delete(execution.record.executionId);
      return updated;
    };

    return Object.freeze({
      async createOrGet(input): Promise<RemoteExecutionCreateMutationResult> {
        const key = ownerRequestKey(input.ownerId, input.request.requestId);
        const existingId = idByOwnerRequest.get(key);
        if (existingId) {
          const existing = byId.get(existingId)!;
          return existing.identityKey === input.identityKey
            ? Object.freeze({ kind: 'existing', execution: existing })
            : Object.freeze({ kind: 'identity-conflict' });
        }
        const activeCount = [...byId.values()].filter(
          (execution) =>
            execution.ownerId === input.ownerId &&
            !terminalStatuses.has(execution.record.status)
        ).length;
        if (activeCount >= input.maximumActiveExecutions) {
          return Object.freeze({ kind: 'quota-exceeded' });
        }
        const event: ExecutionJobEvent = Object.freeze({
          kind: 'state',
          jobId: input.executionId,
          sequence: 1,
          emittedAt: input.createdAt,
          snapshot: Object.freeze({
            jobId: input.executionId,
            requestId: input.request.requestId,
            providerId: input.provider.id,
            status: 'queued',
            latestEventSequence: 1,
            createdAt: input.createdAt,
          }),
        });
        const execution = freezeStored({
          ownerId: input.ownerId,
          identityKey: input.identityKey,
          request: input.request,
          snapshotId: input.snapshotId,
          record: Object.freeze({
            executionId: input.executionId,
            requestId: input.request.requestId,
            snapshotDigest: input.snapshotDigest,
            provider: input.provider,
            status: 'queued',
            latestCursor: 1,
            createdAt: input.createdAt,
          }),
          events: [{ cursor: 1, event }],
        });
        idByOwnerRequest.set(key, input.executionId);
        put(execution);
        if (input.serverAuthority)
          serverAuthorityByExecution.set(
            input.executionId,
            input.serverAuthority
          );
        return Object.freeze({ kind: 'created', execution });
      },
      async get(executionId) {
        return byId.get(executionId);
      },
      async getByOwnerRequest(ownerId, requestId) {
        const executionId = idByOwnerRequest.get(
          ownerRequestKey(ownerId, requestId)
        );
        return executionId ? byId.get(executionId) : undefined;
      },
      async countActive(ownerId) {
        return [...byId.values()].filter(
          (execution) =>
            execution.ownerId === ownerId &&
            !terminalStatuses.has(execution.record.status)
        ).length;
      },
      async cancel(input): Promise<RemoteExecutionCancelMutationResult> {
        const execution = byId.get(input.executionId);
        if (!execution) return Object.freeze({ kind: 'not-found' });
        if (execution.ownerId !== input.ownerId)
          return Object.freeze({ kind: 'forbidden' });
        if (execution.cancellationIds.includes(input.cancellationId)) {
          return Object.freeze({
            kind: 'cancelled',
            result: 'already-requested',
            execution,
          });
        }
        const withCancellation = freezeStored({
          ...execution,
          events: execution.events,
          cancellationIds: [...execution.cancellationIds, input.cancellationId],
        });
        put(withCancellation);
        if (terminalStatuses.has(execution.record.status)) {
          return Object.freeze({
            kind: 'cancelled',
            result: 'already-terminal',
            execution: withCancellation,
          });
        }
        const cancelled = applyStatus(
          withCancellation,
          execution.record.status === 'queued' ? 'cancelled' : 'cancelling',
          input.cancelledAt,
          input.reason
        );
        return Object.freeze({
          kind: 'cancelled',
          result: 'accepted',
          execution: cancelled,
        });
      },
      async claimNext(input): Promise<RemoteExecutionClaimResult | undefined> {
        const candidate = [...byId.values()]
          .filter(
            (execution) =>
              execution.record.provider.id === input.providerId &&
              (execution.record.status === 'queued' ||
                (execution.lease !== undefined &&
                  execution.lease.expiresAt <= input.now &&
                  ['starting', 'running', 'cancelling'].includes(
                    execution.record.status
                  )))
          )
          .sort(
            (left, right) =>
              left.record.createdAt - right.record.createdAt ||
              left.record.executionId.localeCompare(right.record.executionId)
          )[0];
        if (!candidate) return undefined;
        const lease = Object.freeze({
          workerId: input.workerId,
          token: input.leaseToken,
          attempt: (candidate.lease?.attempt ?? 0) + 1,
          acquiredAt: input.now,
          expiresAt: input.now + input.leaseDurationMs,
        });
        const starting =
          candidate.record.status === 'queued'
            ? applyStatus(candidate, 'starting', input.now)
            : candidate;
        const claimed = put(
          freezeStored({ ...starting, lease, events: starting.events })
        );
        const serverAuthority = serverAuthorityByExecution.get(
          claimed.record.executionId
        );
        if (serverAuthority && serverAuthority.expiresAt <= input.now)
          serverAuthorityByExecution.delete(claimed.record.executionId);
        return Object.freeze({
          execution: claimed,
          lease,
          ...(serverAuthority && serverAuthority.expiresAt > input.now
            ? {
                authority: createRemoteExecutionServerAuthorityLease({
                  authority: serverAuthority,
                  executionId: claimed.record.executionId,
                  workerId: input.workerId,
                  workerAttempt: lease.attempt,
                }),
              }
            : {}),
        });
      },
      async renewLease(input): Promise<RemoteExecutionLease | undefined> {
        const execution = byId.get(input.executionId);
        if (
          !execution?.lease ||
          execution.lease.workerId !== input.workerId ||
          execution.lease.token !== input.leaseToken ||
          execution.lease.expiresAt <= input.now ||
          terminalStatuses.has(execution.record.status)
        ) {
          return undefined;
        }
        const lease = Object.freeze({
          ...execution.lease,
          expiresAt: input.now + input.leaseDurationMs,
        });
        put(freezeStored({ ...execution, lease, events: execution.events }));
        return lease;
      },
      async transition(
        input
      ): Promise<RemoteExecutionStoredRecord | undefined> {
        const execution = byId.get(input.executionId);
        if (
          !execution?.lease ||
          execution.lease.workerId !== input.workerId ||
          execution.lease.token !== input.leaseToken ||
          execution.lease.expiresAt <= input.now
        ) {
          return undefined;
        }
        const transitioned = applyStatus(
          execution,
          input.status,
          input.now,
          input.reason
        );
        return terminalStatuses.has(input.status)
          ? put(
              freezeStored({
                ...transitioned,
                lease: undefined,
                events: transitioned.events,
              })
            )
          : transitioned;
      },
      async appendWorkerEvent(input) {
        const execution = byId.get(input.executionId);
        if (
          !execution?.lease ||
          execution.lease.workerId !== input.workerId ||
          execution.lease.token !== input.leaseToken ||
          execution.lease.expiresAt <= input.emittedAt ||
          terminalStatuses.has(execution.record.status)
        )
          return Object.freeze({ kind: 'lease-rejected' });
        const identity = JSON.stringify(input.event);
        const existing = execution.events.find(
          (stored) => stored.workerEventId === input.workerEventId
        );
        if (existing)
          return existing.workerEventIdentity === identity
            ? Object.freeze({ kind: 'existing', execution })
            : Object.freeze({ kind: 'identity-conflict' });
        const sequence = execution.events.length + 1;
        const event = Object.freeze({
          jobId: execution.record.executionId,
          sequence,
          emittedAt: input.emittedAt,
          ...input.event,
        });
        const eventBytes = utf8ByteLength(JSON.stringify(event));
        const totalEventBytes = execution.events.reduce(
          (sum, stored) => sum + utf8ByteLength(JSON.stringify(stored.event)),
          0
        );
        const totalLogBytes = execution.events.reduce(
          (sum, stored) =>
            stored.event.kind === 'log'
              ? sum + utf8ByteLength(stored.event.log.message)
              : sum,
          0
        );
        const incomingLogBytes =
          input.event.kind === 'log'
            ? utf8ByteLength(input.event.log.message)
            : 0;
        if (
          execution.events.length >= input.limits.maximumEvents ||
          totalEventBytes + eventBytes > input.limits.maximumEventBytes ||
          totalLogBytes + incomingLogBytes > input.limits.maximumLogBytes
        )
          return Object.freeze({ kind: 'budget-exceeded' });
        const stored = put(
          freezeStored({
            ...execution,
            record: Object.freeze({
              ...execution.record,
              latestCursor: sequence,
            }),
            events: [
              ...execution.events,
              {
                cursor: sequence,
                event,
                workerEventId: input.workerEventId,
                workerEventIdentity: identity,
              },
            ],
            artifacts: execution.artifacts,
          })
        );
        return Object.freeze({ kind: 'stored', execution: stored });
      },
      async putArtifact(input) {
        const execution = byId.get(input.executionId);
        if (
          !execution?.lease ||
          execution.lease.workerId !== input.workerId ||
          execution.lease.token !== input.leaseToken ||
          execution.lease.expiresAt <= input.emittedAt ||
          terminalStatuses.has(execution.record.status)
        )
          return Object.freeze({ kind: 'lease-rejected' });
        const identity = JSON.stringify(input.descriptor);
        const existingEvent = execution.events.find(
          (stored) => stored.workerEventId === input.workerEventId
        );
        if (existingEvent)
          return existingEvent.workerEventIdentity === identity
            ? Object.freeze({ kind: 'existing', execution })
            : Object.freeze({ kind: 'identity-conflict' });
        const existingArtifact = execution.artifacts.find(
          (artifact) => artifact.artifactId === input.descriptor.artifactId
        );
        if (existingArtifact)
          return JSON.stringify(existingArtifact) === identity
            ? Object.freeze({ kind: 'existing', execution })
            : Object.freeze({ kind: 'identity-conflict' });
        const totalArtifactBytes = execution.artifacts.reduce(
          (sum, artifact) => sum + artifact.size,
          0
        );
        const sequence = execution.events.length + 1;
        const event = Object.freeze({
          kind: 'artifact' as const,
          jobId: execution.record.executionId,
          sequence,
          emittedAt: input.emittedAt,
          artifact: projectRemoteExecutionArtifact(input.descriptor),
        });
        const totalEventBytes = execution.events.reduce(
          (sum, stored) => sum + utf8ByteLength(JSON.stringify(stored.event)),
          0
        );
        if (
          input.descriptor.authorizationScope !==
            `execution:${input.executionId}` ||
          input.descriptor.expiresAt <= input.emittedAt ||
          input.descriptor.expiresAt - input.emittedAt >
            input.limits.maximumArtifactRetentionMs ||
          input.contents.byteLength !== input.descriptor.size ||
          input.contents.byteLength > input.limits.maximumSingleArtifactBytes ||
          execution.artifacts.length >= input.limits.maximumArtifacts ||
          totalArtifactBytes + input.contents.byteLength >
            input.limits.maximumArtifactBytes ||
          execution.events.length >= input.limits.maximumEvents ||
          totalEventBytes + utf8ByteLength(JSON.stringify(event)) >
            input.limits.maximumEventBytes
        )
          return Object.freeze({ kind: 'budget-exceeded' });
        const digest = `sha256-${bytesToHex(sha256(input.contents))}`;
        if (digest !== input.descriptor.digest)
          return Object.freeze({ kind: 'identity-conflict' });
        artifactContentsByDigest.set(digest, new Uint8Array(input.contents));
        const stored = put(
          freezeStored({
            ...execution,
            record: Object.freeze({
              ...execution.record,
              latestCursor: sequence,
            }),
            events: [
              ...execution.events,
              {
                cursor: sequence,
                event,
                workerEventId: input.workerEventId,
                workerEventIdentity: identity,
              },
            ],
            artifacts: [...execution.artifacts, input.descriptor],
          })
        );
        return Object.freeze({ kind: 'stored', execution: stored });
      },
      async getArtifact(input) {
        const execution = byId.get(input.executionId);
        if (execution?.ownerId !== input.ownerId) return undefined;
        const descriptor = execution.artifacts.find(
          (artifact) =>
            artifact.artifactId === input.artifactId &&
            artifact.expiresAt > input.now
        );
        const contents = descriptor
          ? artifactContentsByDigest.get(descriptor.digest)
          : undefined;
        return descriptor && contents
          ? Object.freeze({
              descriptor,
              contents: new Uint8Array(contents),
            })
          : undefined;
      },
      async sweepExpiredArtifacts(input) {
        let removed = 0;
        for (const [digest] of artifactContentsByDigest) {
          const referenced = [...byId.values()].some((execution) =>
            execution.artifacts.some(
              (artifact) =>
                artifact.digest === digest && artifact.expiresAt > input.now
            )
          );
          if (!referenced && removed < input.limit) {
            artifactContentsByDigest.delete(digest);
            removed += 1;
          }
        }
        return removed;
      },
    });
  };
