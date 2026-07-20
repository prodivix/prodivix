import {
  getWorkspaceOperationId,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { WorkspaceConflictSession } from './workspaceConflictSession';
import {
  planWorkspaceOperationCommit,
  type WorkspaceOperationCommitPlanIssue,
  type WorkspaceOperationCommitRequest,
} from './workspaceOperationCommit';
import { normalizeWorkspaceOperationWire } from './workspaceOperationCommitWire';

export const WORKSPACE_OUTBOX_FORMAT_VERSION = 2 as const;

export type WorkspaceOutboxFailure = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
}>;

export type WorkspaceOutboxState =
  | Readonly<{ kind: 'queued' }>
  | Readonly<{
      kind: 'sending';
      leaseOwnerId: string;
      leaseExpiresAt: number;
    }>
  | Readonly<{
      kind: 'retry-wait';
      nextAttemptAt: number;
      failure: WorkspaceOutboxFailure;
    }>
  | Readonly<{
      kind: 'conflict';
      session: WorkspaceConflictSession;
    }>
  | Readonly<{
      kind: 'failed';
      failure: WorkspaceOutboxFailure;
    }>;

export type WorkspaceOutboxRecord = Readonly<{
  formatVersion: typeof WORKSPACE_OUTBOX_FORMAT_VERSION;
  id: string;
  workspaceId: string;
  causalOrderId: string;
  request: unknown;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  state: WorkspaceOutboxState;
}>;

export type WorkspaceOutboxEntry = WorkspaceOutboxRecord &
  Readonly<{
    entryKind: 'operation';
    operation: WorkspaceOperation;
    baseSnapshot: WorkspaceSnapshot;
    request: WorkspaceOperationCommitRequest;
  }>;

export type WorkspaceOutboxCreateResult =
  | Readonly<{ ok: true; entry: WorkspaceOutboxEntry }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceOperationCommitPlanIssue[];
    }>;

export type WorkspaceOutboxRetryPolicy = Readonly<{
  initialDelayMs: number;
  maximumDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}>;

export type WorkspaceOutboxStore<
  TEntry extends WorkspaceOutboxRecord = WorkspaceOutboxEntry,
> = Readonly<{
  enqueue: (entry: TEntry) => Promise<void>;
  get: (entryId: string) => Promise<TEntry | null>;
  list: (workspaceId?: string) => Promise<readonly TEntry[]>;
  claim: (input: {
    entryId: string;
    leaseOwnerId: string;
    now: number;
    leaseDurationMs: number;
  }) => Promise<TEntry | null>;
  claimNext: (input: {
    workspaceId: string;
    leaseOwnerId: string;
    now: number;
    leaseDurationMs: number;
  }) => Promise<TEntry | null>;
  update: (entry: TEntry, expectedLeaseOwnerId?: string) => Promise<boolean>;
  remove: (entryId: string, expectedLeaseOwnerId?: string) => Promise<boolean>;
  replace: (
    entryId: string,
    replacement: TEntry,
    expectedLeaseOwnerId?: string
  ) => Promise<boolean>;
}>;

export const DEFAULT_WORKSPACE_OUTBOX_RETRY_POLICY: WorkspaceOutboxRetryPolicy =
  Object.freeze({
    initialDelayMs: 1_000,
    maximumDelayMs: 60_000,
    multiplier: 2,
    jitterRatio: 0.2,
  });

const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

const compareEntries = (
  left: WorkspaceOutboxRecord,
  right: WorkspaceOutboxRecord
): number =>
  left.createdAt - right.createdAt ||
  compareUnicodeCodePoints(left.causalOrderId, right.causalOrderId) ||
  compareUnicodeCodePoints(left.id, right.id);

/** Preserves queue position when rebase or conflict resolution replaces an operation. */
export const inheritWorkspaceOutboxCausalOrder = <
  TEntry extends WorkspaceOutboxRecord,
>(
  current: TEntry,
  replacement: TEntry
): TEntry =>
  ({
    ...replacement,
    causalOrderId: current.causalOrderId,
    createdAt: current.createdAt,
    attemptCount: current.attemptCount,
  }) as TEntry;

const isFiniteTimestamp = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const normalizeLeaseDuration = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : 30_000;

const ownsSendingLease = (
  entry: WorkspaceOutboxRecord,
  leaseOwnerId: string
): boolean =>
  entry.state.kind === 'sending' && entry.state.leaseOwnerId === leaseOwnerId;

/** Creates the immutable, exact request that will be retried until ACK or 409. */
export const createWorkspaceOutboxEntry = (input: {
  baseSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  now: number;
}): WorkspaceOutboxCreateResult => {
  const planned = planWorkspaceOperationCommit(
    input.baseSnapshot,
    input.operation
  );
  if (planned.ok === false) {
    return { ok: false, issues: planned.issues };
  }
  const normalizedDomainOperation = normalizeWorkspaceOperationWire(
    input.operation
  );
  if (!normalizedDomainOperation.ok) {
    return { ok: false, issues: [normalizedDomainOperation.issue] };
  }
  const operation = normalizedDomainOperation.operation;
  const operationId = getWorkspaceOperationId(operation);
  if (!operationId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_COMMIT_OPERATION_INVALID',
          path: '/operation',
          message: 'Workspace outbox operations require a stable identity.',
        },
      ],
    };
  }
  const now = isFiniteTimestamp(input.now) ? input.now : 0;
  return {
    ok: true,
    entry: {
      formatVersion: WORKSPACE_OUTBOX_FORMAT_VERSION,
      id: operationId,
      workspaceId: input.baseSnapshot.id,
      causalOrderId: operationId,
      entryKind: 'operation',
      operation,
      baseSnapshot: input.baseSnapshot,
      request: planned.request,
      createdAt: now,
      updatedAt: now,
      attemptCount: 0,
      state: { kind: 'queued' },
    },
  };
};

export const isWorkspaceOutboxEntryClaimable = (
  entry: WorkspaceOutboxRecord,
  now: number
): boolean => {
  if (entry.state.kind === 'queued') return true;
  if (entry.state.kind === 'retry-wait') {
    return entry.state.nextAttemptAt <= now;
  }
  if (entry.state.kind === 'sending') {
    return entry.state.leaseExpiresAt <= now;
  }
  return false;
};

/** Selects only the causal head; later operations never cross a blocked head. */
export const selectWorkspaceOutboxClaimCandidate = <
  TEntry extends WorkspaceOutboxRecord,
>(
  entries: readonly TEntry[],
  workspaceId: string,
  now: number
): TEntry | null => {
  const head = entries
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort(compareEntries)[0];
  return head && isWorkspaceOutboxEntryClaimable(head, now) ? head : null;
};

export const claimWorkspaceOutboxEntry = <TEntry extends WorkspaceOutboxRecord>(
  entry: TEntry,
  input: {
    leaseOwnerId: string;
    now: number;
    leaseDurationMs: number;
  }
): TEntry | null => {
  const leaseOwnerId = input.leaseOwnerId.trim();
  if (!leaseOwnerId || !isWorkspaceOutboxEntryClaimable(entry, input.now)) {
    return null;
  }
  const leaseDurationMs = normalizeLeaseDuration(input.leaseDurationMs);
  return {
    ...entry,
    updatedAt: input.now,
    attemptCount: entry.attemptCount + 1,
    state: {
      kind: 'sending',
      leaseOwnerId,
      leaseExpiresAt: input.now + leaseDurationMs,
    },
  };
};

export const computeWorkspaceOutboxRetryDelay = (
  attemptCount: number,
  entropy: number,
  policy: WorkspaceOutboxRetryPolicy = DEFAULT_WORKSPACE_OUTBOX_RETRY_POLICY
): number => {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const initial = Math.max(0, policy.initialDelayMs);
  const maximum = Math.max(initial, policy.maximumDelayMs);
  const multiplier = Math.max(1, policy.multiplier);
  const jitterRatio = Math.min(1, Math.max(0, policy.jitterRatio));
  const boundedEntropy = Math.min(1, Math.max(0, entropy));
  const exponential = Math.min(
    maximum,
    initial * multiplier ** Math.max(0, attempt - 1)
  );
  const jitter = exponential * jitterRatio * (boundedEntropy * 2 - 1);
  return Math.max(0, Math.min(maximum, Math.round(exponential + jitter)));
};

export const retryWorkspaceOutboxEntry = <TEntry extends WorkspaceOutboxRecord>(
  entry: TEntry,
  input: {
    leaseOwnerId: string;
    now: number;
    failure: WorkspaceOutboxFailure;
    entropy?: number;
    policy?: WorkspaceOutboxRetryPolicy;
  }
): TEntry | null => {
  if (!ownsSendingLease(entry, input.leaseOwnerId)) return null;
  const delay = computeWorkspaceOutboxRetryDelay(
    entry.attemptCount,
    input.entropy ?? 0.5,
    input.policy
  );
  return {
    ...entry,
    updatedAt: input.now,
    state: {
      kind: 'retry-wait',
      nextAttemptAt: input.now + delay,
      failure: input.failure,
    },
  };
};

export const blockWorkspaceOutboxEntry = (
  entry: WorkspaceOutboxEntry,
  input: {
    leaseOwnerId: string;
    now: number;
    session: WorkspaceConflictSession;
  }
): WorkspaceOutboxEntry | null =>
  ownsSendingLease(entry, input.leaseOwnerId)
    ? {
        ...entry,
        updatedAt: input.now,
        state: { kind: 'conflict', session: input.session },
      }
    : null;

export const failWorkspaceOutboxEntry = <TEntry extends WorkspaceOutboxRecord>(
  entry: TEntry,
  input: {
    leaseOwnerId: string;
    now: number;
    failure: WorkspaceOutboxFailure;
  }
): TEntry | null =>
  ownsSendingLease(entry, input.leaseOwnerId)
    ? {
        ...entry,
        updatedAt: input.now,
        state: { kind: 'failed', failure: input.failure },
      }
    : null;

/** Explicitly reopens a terminal failure without changing its exact request. */
export const requeueFailedWorkspaceOutboxEntry = <
  TEntry extends WorkspaceOutboxRecord,
>(
  entry: TEntry,
  input: { now: number }
): TEntry | null =>
  entry.state.kind === 'failed'
    ? {
        ...entry,
        updatedAt: Math.max(entry.updatedAt + 1, input.now),
        state: { kind: 'queued' },
      }
    : null;

export const releaseWorkspaceOutboxEntry = <
  TEntry extends WorkspaceOutboxRecord,
>(
  entry: TEntry,
  input: { leaseOwnerId: string; now: number }
): TEntry | null =>
  ownsSendingLease(entry, input.leaseOwnerId)
    ? {
        ...entry,
        updatedAt: input.now,
        state: { kind: 'queued' },
      }
    : null;

export const canAcknowledgeWorkspaceOutboxEntry = (
  entry: WorkspaceOutboxRecord,
  input: { leaseOwnerId: string; acceptedOperationId: string }
): boolean =>
  ownsSendingLease(entry, input.leaseOwnerId) &&
  entry.id === input.acceptedOperationId;

export const compareWorkspaceOutboxEntries = compareEntries;

/** Deterministic adapter for property tests and non-persistent hosts. */
export const createMemoryWorkspaceOutboxStore = <
  TEntry extends WorkspaceOutboxRecord = WorkspaceOutboxEntry,
>(
  initialEntries: readonly TEntry[] = []
): WorkspaceOutboxStore<TEntry> => {
  const entries = new Map(
    initialEntries.map((entry) => [entry.id, entry] as const)
  );
  const list = async (workspaceId?: string) =>
    [...entries.values()]
      .filter((entry) => !workspaceId || entry.workspaceId === workspaceId)
      .sort(compareEntries);
  const claim = async (input: {
    entryId: string;
    leaseOwnerId: string;
    now: number;
    leaseDurationMs: number;
  }) => {
    const entry = entries.get(input.entryId);
    if (!entry) return null;
    const candidate = selectWorkspaceOutboxClaimCandidate(
      [...entries.values()],
      entry.workspaceId,
      input.now
    );
    if (candidate?.id !== entry.id) return null;
    const claimed = claimWorkspaceOutboxEntry(entry, input);
    if (claimed) entries.set(claimed.id, claimed);
    return claimed;
  };
  return Object.freeze({
    enqueue: async (entry) => {
      const existing = entries.get(entry.id);
      if (
        existing &&
        JSON.stringify(existing.request) !== JSON.stringify(entry.request)
      ) {
        throw new Error('Workspace outbox operation id was reused.');
      }
      if (!existing) entries.set(entry.id, entry);
    },
    get: async (entryId) => entries.get(entryId) ?? null,
    list,
    claim,
    claimNext: async (input) => {
      const candidate = selectWorkspaceOutboxClaimCandidate(
        [...entries.values()],
        input.workspaceId,
        input.now
      );
      return candidate
        ? claim({ ...input, entryId: candidate.id })
        : Promise.resolve(null);
    },
    update: async (entry, expectedLeaseOwnerId) => {
      const current = entries.get(entry.id);
      if (
        !current ||
        (expectedLeaseOwnerId !== undefined &&
          (current.state.kind !== 'sending' ||
            current.state.leaseOwnerId !== expectedLeaseOwnerId)) ||
        current.updatedAt > entry.updatedAt
      ) {
        return false;
      }
      entries.set(entry.id, entry);
      return true;
    },
    remove: async (entryId, expectedLeaseOwnerId) => {
      const current = entries.get(entryId);
      if (
        !current ||
        (expectedLeaseOwnerId !== undefined &&
          (current.state.kind !== 'sending' ||
            current.state.leaseOwnerId !== expectedLeaseOwnerId))
      ) {
        return false;
      }
      entries.delete(entryId);
      return true;
    },
    replace: async (entryId, replacement, expectedLeaseOwnerId) => {
      const current = entries.get(entryId);
      if (
        !current ||
        (replacement.id !== entryId && entries.has(replacement.id)) ||
        (expectedLeaseOwnerId !== undefined &&
          (current.state.kind !== 'sending' ||
            current.state.leaseOwnerId !== expectedLeaseOwnerId))
      ) {
        return false;
      }
      const causallyOrderedReplacement = inheritWorkspaceOutboxCausalOrder(
        current,
        replacement
      );
      entries.delete(entryId);
      entries.set(causallyOrderedReplacement.id, causallyOrderedReplacement);
      return true;
    },
  });
};
