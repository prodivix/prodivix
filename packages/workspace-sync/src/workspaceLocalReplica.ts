import {
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  compareWorkspaceOutboxEntries,
  type WorkspaceOutboxEntry,
} from './workspaceOutbox';
import { applyPersistentWorkspaceOperation } from './workspaceOperationCommit';
import type { WorkspaceSettingsOutboxEntry } from './workspaceSettingsOutbox';

export const WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION = 1 as const;
export const WORKSPACE_LOCAL_REPLICA_ACK_LIMIT = 128;

export type WorkspaceLocalReplica = Readonly<{
  formatVersion: typeof WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION;
  workspaceId: string;
  confirmedSnapshot: WorkspaceSnapshot;
  settings: Readonly<Record<string, unknown>>;
  settingsOpSeq: number;
  savedAt: number;
  acknowledgedEntryIds: readonly string[];
}>;

export type WorkspaceLocalReplicaIssue = Readonly<{
  code:
    | 'WKS_SYNC_REPLICA_INVALID'
    | 'WKS_SYNC_REPLICA_WORKSPACE_MISMATCH'
    | 'WKS_SYNC_REPLICA_OPERATION_REPLAY_FAILED';
  path: string;
  message: string;
}>;

export type WorkspaceLocalReplicaCreateResult =
  | Readonly<{ ok: true; replica: WorkspaceLocalReplica }>
  | Readonly<{ ok: false; issues: readonly WorkspaceLocalReplicaIssue[] }>;

export type WorkspaceLocalReplicaMaterializationResult =
  | Readonly<{
      ok: true;
      snapshot: WorkspaceSnapshot;
      settings: Readonly<Record<string, unknown>>;
      pendingOperationIds: readonly string[];
      pendingSettingsCommitIds: readonly string[];
      hasConflict: boolean;
    }>
  | Readonly<{ ok: false; issues: readonly WorkspaceLocalReplicaIssue[] }>;

const issue = (
  code: WorkspaceLocalReplicaIssue['code'],
  path: string,
  message: string
): WorkspaceLocalReplicaIssue => ({ code, path, message });

const normalizeAcknowledgedEntryIds = (
  values: readonly string[]
): readonly string[] | null => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || value !== value.trim() || !value) {
      return null;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.slice(-WORKSPACE_LOCAL_REPLICA_ACK_LIMIT);
};

const canonicalizeReplicaData = (
  snapshot: WorkspaceSnapshot,
  settings: Readonly<Record<string, unknown>>
) => decodeWorkspaceSnapshot(encodeWorkspaceSnapshot(snapshot, settings));

/** Creates a closed, canonical cache record from a server-confirmed snapshot. */
export const createWorkspaceLocalReplica = (input: {
  snapshot: WorkspaceSnapshot;
  settings: Readonly<Record<string, unknown>>;
  settingsOpSeq?: number;
  savedAt: number;
  acknowledgedEntryIds?: readonly string[];
}): WorkspaceLocalReplicaCreateResult => {
  const acknowledgedEntryIds = normalizeAcknowledgedEntryIds(
    input.acknowledgedEntryIds ?? []
  );
  if (!acknowledgedEntryIds) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_INVALID',
          '/acknowledgedEntryIds',
          'Replica acknowledgement ids must be canonical non-empty strings.'
        ),
      ],
    };
  }
  if (!Number.isFinite(input.savedAt) || input.savedAt < 0) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_INVALID',
          '/savedAt',
          'Replica savedAt must be a finite non-negative timestamp.'
        ),
      ],
    };
  }
  const settingsOpSeq = input.settingsOpSeq ?? input.snapshot.opSeq;
  if (!Number.isSafeInteger(settingsOpSeq) || settingsOpSeq <= 0) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_INVALID',
          '/settingsOpSeq',
          'Replica settingsOpSeq must be a positive safe integer.'
        ),
      ],
    };
  }
  try {
    const canonical = canonicalizeReplicaData(input.snapshot, input.settings);
    return {
      ok: true,
      replica: {
        formatVersion: WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION,
        workspaceId: canonical.workspace.id,
        confirmedSnapshot: canonical.workspace,
        settings: canonical.settings,
        settingsOpSeq,
        savedAt: input.savedAt,
        acknowledgedEntryIds,
      },
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_INVALID',
          '/workspace',
          error instanceof Error
            ? error.message
            : 'Replica data is not a canonical Workspace snapshot.'
        ),
      ],
    };
  }
};

/** Advances independent snapshot/settings watermarks without allowing regressions. */
export const advanceWorkspaceLocalReplica = (
  replica: WorkspaceLocalReplica,
  input: {
    snapshot: WorkspaceSnapshot;
    settings?: Readonly<Record<string, unknown>>;
    settingsOpSeq?: number;
    savedAt: number;
    acknowledgedEntryIds?: readonly string[];
  }
): WorkspaceLocalReplicaCreateResult => {
  if (input.snapshot.id !== replica.workspaceId) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_WORKSPACE_MISMATCH',
          '/workspace/id',
          'Replica updates must target the cached workspace.'
        ),
      ],
    };
  }
  const useIncomingSnapshot =
    input.snapshot.opSeq >= replica.confirmedSnapshot.opSeq;
  const incomingSettingsOpSeq = input.settingsOpSeq ?? input.snapshot.opSeq;
  const useIncomingSettings =
    input.settings !== undefined &&
    incomingSettingsOpSeq >= replica.settingsOpSeq;
  return createWorkspaceLocalReplica({
    snapshot: useIncomingSnapshot ? input.snapshot : replica.confirmedSnapshot,
    settings: useIncomingSettings ? input.settings! : replica.settings,
    settingsOpSeq: useIncomingSettings
      ? incomingSettingsOpSeq
      : replica.settingsOpSeq,
    savedAt: Math.max(replica.savedAt, input.savedAt),
    acknowledgedEntryIds: [
      ...replica.acknowledgedEntryIds,
      ...(input.acknowledgedEntryIds ?? []),
    ],
  });
};

/** Rebuilds the offline local view from a confirmed replica plus pending Outbox entries. */
export const materializeWorkspaceLocalReplica = (input: {
  replica: WorkspaceLocalReplica;
  operationEntries: readonly WorkspaceOutboxEntry[];
  settingsEntries: readonly WorkspaceSettingsOutboxEntry[];
}): WorkspaceLocalReplicaMaterializationResult => {
  const acknowledged = new Set(input.replica.acknowledgedEntryIds);
  let snapshot = input.replica.confirmedSnapshot;
  let settings = input.replica.settings;
  let hasConflict = false;
  const pendingOperationIds: string[] = [];
  const pendingSettingsCommitIds: string[] = [];

  for (const entry of [...input.operationEntries].sort(
    compareWorkspaceOutboxEntries
  )) {
    if (entry.workspaceId !== input.replica.workspaceId) {
      return {
        ok: false,
        issues: [
          issue(
            'WKS_SYNC_REPLICA_WORKSPACE_MISMATCH',
            `/operations/${entry.id}/workspaceId`,
            'Pending operation belongs to another workspace.'
          ),
        ],
      };
    }
    if (acknowledged.has(entry.id)) continue;
    pendingOperationIds.push(entry.id);
    if (entry.state.kind === 'conflict') {
      if (
        entry.state.session.workspaceId !== input.replica.workspaceId ||
        entry.state.session.localSnapshot.id !== input.replica.workspaceId
      ) {
        return {
          ok: false,
          issues: [
            issue(
              'WKS_SYNC_REPLICA_WORKSPACE_MISMATCH',
              `/operations/${entry.id}/state/session/workspaceId`,
              'Pending conflict session belongs to another workspace.'
            ),
          ],
        };
      }
      snapshot = entry.state.session.localSnapshot;
      hasConflict = true;
      continue;
    }
    if (entry.baseSnapshot.opSeq > snapshot.opSeq) {
      snapshot = entry.baseSnapshot;
    }
    const applied = applyPersistentWorkspaceOperation(
      snapshot,
      entry.operation
    );
    if (!applied) {
      return {
        ok: false,
        issues: [
          issue(
            'WKS_SYNC_REPLICA_OPERATION_REPLAY_FAILED',
            `/operations/${entry.id}`,
            'Pending operation could not be replayed on the local replica.'
          ),
        ],
      };
    }
    snapshot = applied;
  }

  for (const entry of [...input.settingsEntries].sort(
    compareWorkspaceOutboxEntries
  )) {
    if (entry.workspaceId !== input.replica.workspaceId) {
      return {
        ok: false,
        issues: [
          issue(
            'WKS_SYNC_REPLICA_WORKSPACE_MISMATCH',
            `/settings/${entry.id}/workspaceId`,
            'Pending settings commit belongs to another workspace.'
          ),
        ],
      };
    }
    if (acknowledged.has(entry.id)) continue;
    pendingSettingsCommitIds.push(entry.id);
    settings = entry.request.settings;
  }

  try {
    const canonical = canonicalizeReplicaData(snapshot, settings);
    return {
      ok: true,
      snapshot: canonical.workspace,
      settings: canonical.settings,
      pendingOperationIds,
      pendingSettingsCommitIds,
      hasConflict,
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_REPLICA_INVALID',
          '/materialized',
          error instanceof Error
            ? error.message
            : 'Materialized replica is not canonical.'
        ),
      ],
    };
  }
};
