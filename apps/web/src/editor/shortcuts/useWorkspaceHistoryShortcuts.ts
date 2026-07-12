import { useMemo } from 'react';
import {
  selectRedoWorkspaceHistoryEntry,
  selectUndoWorkspaceHistoryEntry,
  type WorkspaceHistoryDocumentDomain,
  type WorkspaceHistoryScope,
} from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import type { EditorShortcutScope } from './shortcutTypes';
import { useEditorShortcut } from './useShortcut';

export type WorkspaceHistoryShortcutContext = {
  workspaceId?: string;
  documentId?: string;
  domain: WorkspaceHistoryDocumentDomain;
  includeRoute?: boolean;
  suspended?: boolean;
  shortcutScope?: EditorShortcutScope;
};

export const resolveWorkspaceHistoryShortcutScopes = (
  context: Pick<
    WorkspaceHistoryShortcutContext,
    'workspaceId' | 'documentId' | 'domain' | 'includeRoute'
  >
): readonly WorkspaceHistoryScope[] => {
  const workspaceId = context.workspaceId?.trim();
  if (!workspaceId) return [];

  const scopes: WorkspaceHistoryScope[] = [];
  const documentId = context.documentId?.trim();
  if (documentId) {
    scopes.push({
      kind: 'document',
      workspaceId,
      documentId,
      domain: context.domain,
    });
  }
  if (context.includeRoute) scopes.push({ kind: 'route', workspaceId });
  scopes.push({ kind: 'workspace', workspaceId });
  return scopes;
};

/**
 * Connects one mounted editor surface to scoped Workspace History. Code and
 * text editors keep their native undo because these registrations never opt
 * into editable targets, and a failed replay never consumes the key event.
 */
export const useWorkspaceHistoryShortcuts = (
  context: WorkspaceHistoryShortcutContext
) => {
  const workspaceHistory = useEditorStore((state) => state.workspaceHistory);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const undoHistory = useEditorStore((state) => state.undoWorkspaceHistory);
  const redoHistory = useEditorStore((state) => state.redoWorkspaceHistory);
  const scopes = useMemo(
    () => resolveWorkspaceHistoryShortcutScopes(context),
    [
      context.documentId,
      context.domain,
      context.includeRoute,
      context.workspaceId,
    ]
  );
  const undoEntry = scopes.length
    ? selectUndoWorkspaceHistoryEntry(workspaceHistory, scopes)
    : undefined;
  const redoEntry = scopes.length
    ? selectRedoWorkspaceHistoryEntry(workspaceHistory, scopes)
    : undefined;
  const isSuspended = Boolean(context.suspended || workspaceReadonly);

  const handleUndo = (event: KeyboardEvent) => {
    const result = undoHistory(scopes);
    if (result?.ok) event.preventDefault();
  };
  const handleRedo = (event: KeyboardEvent) => {
    const result = redoHistory(scopes);
    if (result?.ok) event.preventDefault();
  };

  useEditorShortcut('Mod+Z', handleUndo, {
    enabled: Boolean(undoEntry) && !isSuspended,
    scope: context.shortcutScope,
    priority: 30,
    preventDefault: false,
    allowInEditable: false,
  });
  useEditorShortcut('Mod+Shift+Z', handleRedo, {
    enabled: Boolean(redoEntry) && !isSuspended,
    scope: context.shortcutScope,
    priority: 30,
    preventDefault: false,
    allowInEditable: false,
  });
  useEditorShortcut('Ctrl+Y', handleRedo, {
    enabled: Boolean(redoEntry) && !isSuspended,
    scope: context.shortcutScope,
    priority: 30,
    preventDefault: false,
    allowInEditable: false,
  });

  return {
    canUndo: Boolean(undoEntry) && !isSuspended,
    canRedo: Boolean(redoEntry) && !isSuspended,
    undoEntry,
    redoEntry,
  };
};
