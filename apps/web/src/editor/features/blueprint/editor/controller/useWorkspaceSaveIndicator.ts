import { useEffect, useState } from 'react';
import type { WorkspaceOutboxEntry } from '@prodivix/workspace-sync';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { listWorkspaceOutboxEntries } from '@/editor/workspaceSync/workspaceOutboxExecutor';
import { subscribeWorkspaceOutbox } from '@/editor/workspaceSync/workspaceOutboxSignals';
import type {
  SaveIndicatorTone,
  SaveStatus,
  SaveTransport,
} from '../saveIndicator/saveIndicator.types';

export type WorkspaceSaveIndicatorState = Readonly<{
  saveStatus: SaveStatus;
  saveTransport: SaveTransport;
  saveIndicatorLabel: string;
  saveIndicatorTone: SaveIndicatorTone;
  isWorkspaceSaveDisabled: boolean;
  hasPendingChanges: boolean;
  isManualSave: false;
}>;

const EMPTY_ENTRIES: readonly WorkspaceOutboxEntry[] = Object.freeze([]);

/** Projects the durable Workspace outbox into the Blueprint status indicator. */
export const useWorkspaceSaveIndicator = (input: {
  readonly: boolean;
  workspaceId?: string;
}): WorkspaceSaveIndicatorState => {
  const [entries, setEntries] =
    useState<readonly WorkspaceOutboxEntry[]>(EMPTY_ENTRIES);
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    const workspaceId = input.workspaceId;
    let disposed = false;
    if (!workspaceId || isLocalProjectId(workspaceId)) {
      setEntries(EMPTY_ENTRIES);
      setReadFailed(false);
      return;
    }

    const refresh = async () => {
      try {
        const next = await listWorkspaceOutboxEntries(workspaceId);
        if (disposed) return;
        setEntries(next);
        setReadFailed(false);
      } catch {
        if (disposed) return;
        setReadFailed(true);
      }
    };

    void refresh();
    const unsubscribe = subscribeWorkspaceOutbox((changedWorkspaceId) => {
      if (changedWorkspaceId === workspaceId) void refresh();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [input.workspaceId]);

  if (!input.workspaceId) {
    return {
      saveStatus: 'idle',
      saveTransport: null,
      saveIndicatorLabel: 'No Workspace is loaded.',
      saveIndicatorTone: 'neutral',
      isWorkspaceSaveDisabled: true,
      hasPendingChanges: false,
      isManualSave: false,
    };
  }
  if (input.readonly) {
    return {
      saveStatus: 'idle',
      saveTransport: isLocalProjectId(input.workspaceId)
        ? 'local'
        : 'workspace',
      saveIndicatorLabel: 'This Workspace is read-only.',
      saveIndicatorTone: 'warning',
      isWorkspaceSaveDisabled: true,
      hasPendingChanges: false,
      isManualSave: false,
    };
  }
  if (isLocalProjectId(input.workspaceId)) {
    return {
      saveStatus: 'saved',
      saveTransport: 'local',
      saveIndicatorLabel: 'Saved to the local Workspace replica.',
      saveIndicatorTone: 'success',
      isWorkspaceSaveDisabled: false,
      hasPendingChanges: false,
      isManualSave: false,
    };
  }

  const terminalEntry = entries.find(
    (entry) => entry.state.kind === 'failed' || entry.state.kind === 'conflict'
  );
  if (terminalEntry) {
    const label =
      terminalEntry.state.kind === 'failed'
        ? terminalEntry.state.failure.message
        : 'Workspace changes require revision-conflict review.';
    return {
      saveStatus: 'error',
      saveTransport: 'workspace',
      saveIndicatorLabel: label,
      saveIndicatorTone: 'error',
      isWorkspaceSaveDisabled: false,
      hasPendingChanges: true,
      isManualSave: false,
    };
  }

  const retryEntry = entries.find((entry) => entry.state.kind === 'retry-wait');
  if (retryEntry?.state.kind === 'retry-wait') {
    return {
      saveStatus: 'error',
      saveTransport: 'workspace',
      saveIndicatorLabel: retryEntry.state.failure.message,
      saveIndicatorTone: 'warning',
      isWorkspaceSaveDisabled: false,
      hasPendingChanges: true,
      isManualSave: false,
    };
  }

  if (readFailed) {
    return {
      saveStatus: 'error',
      saveTransport: 'workspace',
      saveIndicatorLabel: 'The durable Workspace outbox is unavailable.',
      saveIndicatorTone: 'warning',
      isWorkspaceSaveDisabled: false,
      hasPendingChanges: false,
      isManualSave: false,
    };
  }

  if (entries.length > 0) {
    return {
      saveStatus: 'saving',
      saveTransport: 'workspace',
      saveIndicatorLabel: 'Persisting Workspace operations.',
      saveIndicatorTone: 'neutral',
      isWorkspaceSaveDisabled: false,
      hasPendingChanges: true,
      isManualSave: false,
    };
  }

  return {
    saveStatus: 'saved',
    saveTransport: 'workspace',
    saveIndicatorLabel: 'Workspace operations are confirmed.',
    saveIndicatorTone: 'success',
    isWorkspaceSaveDisabled: false,
    hasPendingChanges: false,
    isManualSave: false,
  };
};
