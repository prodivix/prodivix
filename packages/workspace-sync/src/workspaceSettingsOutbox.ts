import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  WORKSPACE_OUTBOX_FORMAT_VERSION,
  type WorkspaceOutboxRecord,
} from './workspaceOutbox';

export type WorkspaceSettingsCommitRequest = Readonly<{
  commitId: string;
  issuedAt: string;
  expectedWorkspaceRev: number;
  settings: Readonly<Record<string, unknown>>;
}>;

export type WorkspaceSettingsOutboxEntry = WorkspaceOutboxRecord &
  Readonly<{
    entryKind: 'settings';
    baseSnapshot: WorkspaceSnapshot;
    baseSettings: Readonly<Record<string, unknown>>;
    request: WorkspaceSettingsCommitRequest;
  }>;

export type WorkspaceSettingsOutboxCreateResult =
  | Readonly<{ ok: true; entry: WorkspaceSettingsOutboxEntry }>
  | Readonly<{ ok: false; message: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && valuesEqual(left[key], right[key])
    )
  );
};

export const workspaceSettingsEqual = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>
): boolean => valuesEqual(left, right);

type ValueState =
  Readonly<{ present: false }> | Readonly<{ present: true; value: unknown }>;

const statesEqual = (left: ValueState, right: ValueState): boolean =>
  left.present === right.present &&
  (!left.present || (right.present && valuesEqual(left.value, right.value)));

const mergeValueState = (
  base: ValueState,
  local: ValueState,
  remote: ValueState
): ValueState => {
  if (statesEqual(local, base)) return remote;
  if (statesEqual(remote, base) || statesEqual(local, remote)) return local;
  if (
    base.present &&
    local.present &&
    remote.present &&
    isRecord(base.value) &&
    isRecord(local.value) &&
    isRecord(remote.value)
  ) {
    const baseValue = base.value;
    const localValue = local.value;
    const remoteValue = remote.value;
    const value: Record<string, unknown> = {};
    const keys = new Set([
      ...Object.keys(baseValue),
      ...Object.keys(localValue),
      ...Object.keys(remoteValue),
    ]);
    [...keys].sort().forEach((key) => {
      const merged = mergeValueState(
        Object.hasOwn(baseValue, key)
          ? { present: true, value: baseValue[key] }
          : { present: false },
        Object.hasOwn(localValue, key)
          ? { present: true, value: localValue[key] }
          : { present: false },
        Object.hasOwn(remoteValue, key)
          ? { present: true, value: remoteValue[key] }
          : { present: false }
      );
      if (merged.present) value[key] = merged.value;
    });
    return { present: true, value };
  }
  return local;
};

/** Three-way merge for settings: preserve non-overlap and prefer local overlap. */
export const mergeWorkspaceSettings = (
  base: Readonly<Record<string, unknown>>,
  local: Readonly<Record<string, unknown>>,
  remote: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  const merged = mergeValueState(
    { present: true, value: base },
    { present: true, value: local },
    { present: true, value: remote }
  );
  if (!merged.present || !isRecord(merged.value)) return {};
  return cloneJson(merged.value);
};

export const createWorkspaceSettingsOutboxEntry = (input: {
  baseSnapshot: WorkspaceSnapshot;
  baseSettings: Readonly<Record<string, unknown>>;
  commitId: string;
  issuedAt: string;
  now: number;
  settings: Readonly<Record<string, unknown>>;
}): WorkspaceSettingsOutboxCreateResult => {
  const commitId = input.commitId.trim();
  if (!commitId)
    return { ok: false, message: 'Settings commit id is required.' };
  if (!Number.isSafeInteger(input.baseSnapshot.workspaceRev)) {
    return {
      ok: false,
      message: 'Settings require a safe Workspace revision.',
    };
  }
  try {
    const baseSettings = cloneJson(input.baseSettings);
    const settings = cloneJson(input.settings);
    if (!isRecord(baseSettings) || !isRecord(settings)) {
      return { ok: false, message: 'Workspace settings must be JSON objects.' };
    }
    const now = Number.isFinite(input.now) && input.now >= 0 ? input.now : 0;
    return {
      ok: true,
      entry: {
        formatVersion: WORKSPACE_OUTBOX_FORMAT_VERSION,
        entryKind: 'settings',
        id: commitId,
        workspaceId: input.baseSnapshot.id,
        causalOrderId: commitId,
        baseSnapshot: cloneJson(input.baseSnapshot),
        baseSettings,
        request: {
          commitId,
          issuedAt: input.issuedAt,
          expectedWorkspaceRev: input.baseSnapshot.workspaceRev,
          settings,
        },
        createdAt: now,
        updatedAt: now,
        attemptCount: 0,
        state: { kind: 'queued' },
      },
    };
  } catch {
    return { ok: false, message: 'Workspace settings must be JSON-safe.' };
  }
};
