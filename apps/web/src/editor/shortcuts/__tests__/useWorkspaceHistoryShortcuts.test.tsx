import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceCommandEnvelope } from '@prodivix/workspace';
import {
  EditorShortcutProvider,
  resolveWorkspaceHistoryShortcutScopes,
  useWorkspaceHistoryShortcuts,
  type WorkspaceHistoryShortcutContext,
} from '@/editor/shortcuts';
import {
  selectActivePirDocument,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import {
  createEditorWorkspace,
  resetEditorStore,
} from '@/test-utils/editorStore';

const HISTORY_CONTEXT: WorkspaceHistoryShortcutContext = {
  workspaceId: 'workspace-test',
  documentId: 'page-home',
  domain: 'pir',
  includeRoute: true,
  shortcutScope: 'blueprint',
};

const createMetadataCommand = (): WorkspaceCommandEnvelope => ({
  id: 'command-history-shortcut',
  namespace: 'core.pir',
  type: 'metadata.update',
  version: '1.0',
  issuedAt: '2026-07-12T00:00:00.000Z',
  target: {
    workspaceId: 'workspace-test',
    documentId: 'page-home',
  },
  domainHint: 'pir',
  forwardOps: [{ op: 'add', path: '/metadata', value: { name: 'Edited' } }],
  reverseOps: [{ op: 'remove', path: '/metadata' }],
});

const readDocumentName = () =>
  selectActivePirDocument(useEditorStore.getState())?.metadata?.name;

const dispatchShortcut = (
  target: HTMLElement,
  key: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey'> = {}
) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

function ShortcutHarness({
  context,
}: {
  context: WorkspaceHistoryShortcutContext;
}) {
  useWorkspaceHistoryShortcuts(context);
  return (
    <>
      <button type="button">Canvas</button>
      <input aria-label="Code draft" />
    </>
  );
}

const renderHarness = (context: WorkspaceHistoryShortcutContext) =>
  render(
    <EditorShortcutProvider>
      <ShortcutHarness context={context} />
    </EditorShortcutProvider>
  );

beforeEach(() => {
  resetEditorStore();
  useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
});

describe('workspace history shortcuts', () => {
  it('derives document, route, and workspace scopes for Blueprint', () => {
    expect(resolveWorkspaceHistoryShortcutScopes(HISTORY_CONTEXT)).toEqual([
      {
        kind: 'document',
        workspaceId: 'workspace-test',
        documentId: 'page-home',
        domain: 'pir',
      },
      { kind: 'route', workspaceId: 'workspace-test' },
      { kind: 'workspace', workspaceId: 'workspace-test' },
    ]);
  });

  it('supports Mod+Z, Mod+Shift+Z, and Ctrl+Y without consuming failures', async () => {
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    renderHarness(HISTORY_CONTEXT);
    const canvas = screen.getByRole('button', { name: 'Canvas' });

    const undoEvent = dispatchShortcut(canvas, 'z', { ctrlKey: true });
    expect(undoEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(readDocumentName()).toBeUndefined());

    const shiftRedoEvent = dispatchShortcut(canvas, 'z', {
      ctrlKey: true,
      shiftKey: true,
    });
    expect(shiftRedoEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(readDocumentName()).toBe('Edited'));

    dispatchShortcut(canvas, 'z', { ctrlKey: true });
    await waitFor(() => expect(readDocumentName()).toBeUndefined());
    const ctrlYRedoEvent = dispatchShortcut(canvas, 'y', { ctrlKey: true });
    expect(ctrlYRedoEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(readDocumentName()).toBe('Edited'));

    const missingRedoEvent = dispatchShortcut(canvas, 'y', { ctrlKey: true });
    expect(missingRedoEvent.defaultPrevented).toBe(false);
    expect(readDocumentName()).toBe('Edited');
  });

  it('preserves native editable undo and suspends workspace replay', async () => {
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const { rerender } = renderHarness({
      ...HISTORY_CONTEXT,
      suspended: true,
    });
    const canvas = screen.getByRole('button', { name: 'Canvas' });
    const draft = screen.getByRole('textbox', { name: 'Code draft' });

    const suspendedEvent = dispatchShortcut(canvas, 'z', { ctrlKey: true });
    expect(suspendedEvent.defaultPrevented).toBe(false);
    expect(readDocumentName()).toBe('Edited');

    rerender(
      <EditorShortcutProvider>
        <ShortcutHarness context={HISTORY_CONTEXT} />
      </EditorShortcutProvider>
    );
    const editableEvent = dispatchShortcut(draft, 'z', { ctrlKey: true });
    expect(editableEvent.defaultPrevented).toBe(false);
    expect(readDocumentName()).toBe('Edited');

    const workspaceEvent = dispatchShortcut(canvas, 'z', { ctrlKey: true });
    expect(workspaceEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(readDocumentName()).toBeUndefined());
  });
});
