import { useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { mergeWorkspaceSettings } from '@prodivix/workspace-sync';
import type { WorkspaceSettingsOutboxExecutionResult } from './workspaceSettingsOutboxExecutor';
import { adoptWorkspaceRemoteSnapshot } from './workspaceRemoteSnapshotAdoption';

export const readCurrentWorkspaceSettings = (): Record<string, unknown> => {
  const settings = useSettingsStore.getState();
  return {
    global: settings.global,
    projectGlobalById: settings.projectGlobalById,
  };
};

export const adoptWorkspaceSettingsOutboxResult = (
  result: WorkspaceSettingsOutboxExecutionResult
): void => {
  if (result.kind === 'queued') return;
  const editor = useEditorStore.getState();
  const currentWorkspace = editor.workspace;
  if (!currentWorkspace) return;
  if (result.kind === 'acknowledged') {
    editor.applyWorkspaceMutation(result.mutation);
  } else {
    adoptWorkspaceRemoteSnapshot(result.baseSnapshot, result.snapshot);
  }
  const currentSettings = readCurrentWorkspaceSettings();
  useSettingsStore
    .getState()
    .hydrateWorkspaceSettings(
      mergeWorkspaceSettings(
        result.baseSettings,
        currentSettings,
        result.settings
      )
    );
};
