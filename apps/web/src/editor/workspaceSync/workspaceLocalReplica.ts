import { ApiError } from '@/infra/api';
import type { ProjectSummary } from '@/editor/editorApi';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { materializeWorkspaceLocalReplica } from '@prodivix/workspace-sync';
import {
  readWorkspaceLocalReplicaPersistenceState,
  saveWorkspaceLocalReplica,
} from './indexedDbWorkspaceLocalReplicaStore';

export type MaterializedWorkspaceLocalReplica = Readonly<{
  project: ProjectSummary;
  capabilities: Readonly<Record<string, boolean>>;
  workspace: WorkspaceSnapshot;
  settings: Readonly<Record<string, unknown>>;
  pendingOperationIds: readonly string[];
  pendingSettingsCommitIds: readonly string[];
  hasConflict: boolean;
}>;

export type WorkspaceLocalReplicaWriterInput = Readonly<{
  workspace: WorkspaceSnapshot;
  settings?: Readonly<Record<string, unknown>>;
  settingsOpSeq?: number;
  acknowledgedEntryId: string;
}>;

export type WorkspaceLocalReplicaWriter = (
  input: WorkspaceLocalReplicaWriterInput
) => Promise<void>;

export class WorkspaceLocalReplicaMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceLocalReplicaMaterializationError';
  }
}

export const loadMaterializedWorkspaceLocalReplica = async (
  workspaceId: string
): Promise<MaterializedWorkspaceLocalReplica | null> => {
  const persistenceState =
    await readWorkspaceLocalReplicaPersistenceState(workspaceId);
  if (!persistenceState) return null;
  const { envelope, operationEntries, settingsEntries } = persistenceState;
  const materialized = materializeWorkspaceLocalReplica({
    replica: envelope.replica,
    operationEntries,
    settingsEntries,
  });
  if (materialized.ok === false) {
    throw new WorkspaceLocalReplicaMaterializationError(
      materialized.issues[0]?.message ||
        'Could not materialize the local Workspace replica.'
    );
  }
  return {
    project: envelope.project,
    capabilities: envelope.capabilities,
    workspace: materialized.snapshot,
    settings: materialized.settings,
    pendingOperationIds: materialized.pendingOperationIds,
    pendingSettingsCommitIds: materialized.pendingSettingsCommitIds,
    hasConflict: materialized.hasConflict,
  };
};

export const persistAcknowledgedWorkspaceLocalReplica: WorkspaceLocalReplicaWriter =
  async (input) => {
    await saveWorkspaceLocalReplica({
      workspace: input.workspace,
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
      ...(input.settingsOpSeq !== undefined
        ? { settingsOpSeq: input.settingsOpSeq }
        : {}),
      acknowledgedEntryIds: [input.acknowledgedEntryId],
    });
  };

export const canOpenWorkspaceLocalReplicaAfter = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return (
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500
    );
  }
  return (
    error instanceof TypeError ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
};
