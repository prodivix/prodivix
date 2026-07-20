import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CodeEditorContextMenu,
  CodeLanguageLocationsOverlay,
  CodeLanguageRenameOverlay,
} from './CodeEditorActionOverlays';

const anchor = { left: 24, top: 36 } as const;

describe('Code editor action overlays', () => {
  it('exposes VS Code-style language actions with their shortcuts', () => {
    const onDismiss = vi.fn();
    const onGoToDefinition = vi.fn();
    const onFindReferences = vi.fn();
    const onRename = vi.fn();

    render(
      <CodeEditorContextMenu
        anchor={anchor}
        canNavigate
        canRename
        onGoToDefinition={onGoToDefinition}
        onFindReferences={onFindReferences}
        onRename={onRename}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('F12')).toBeTruthy();
    expect(screen.getByText('Shift+F12')).toBeTruthy();
    expect(screen.getByText('F2')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: /resourceManager.code.language.actions.findReferences/,
      })
    );

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onFindReferences).toHaveBeenCalledOnce();
    expect(onGoToDefinition).not.toHaveBeenCalled();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('keeps rename editing and impact confirmation at the cursor overlay', () => {
    const onNameChange = vi.fn();
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onOpenAffectedOwner = vi.fn();
    const commonProps = {
      anchor,
      busy: false,
      onNameChange,
      onPreview,
      onApply,
      onBack: vi.fn(),
      onCancel: vi.fn(),
      onOpenAffectedOwner,
    } as const;
    const view = render(
      <CodeLanguageRenameOverlay
        {...commonProps}
        rename={{
          status: 'editing',
          currentName: 'before',
          nextName: 'before',
        }}
      />
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'after' },
    });
    expect(onNameChange).toHaveBeenCalledWith('after');

    view.rerender(
      <CodeLanguageRenameOverlay
        {...commonProps}
        rename={{
          status: 'editing',
          currentName: 'before',
          nextName: 'after',
        }}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.code.refactor.preview',
      })
    );
    expect(onPreview).toHaveBeenCalledOnce();

    view.rerender(
      <CodeLanguageRenameOverlay
        {...commonProps}
        rename={{
          status: 'preview',
          currentName: 'before',
          nextName: 'after',
          editCount: 3,
          artifactCount: 2,
          affectedOwners: [{ slotId: 'slot-1', label: 'Blueprint · Hero' }],
        }}
      />
    );
    const applyButton = screen.getByRole('button', {
      name: 'resourceManager.code.refactor.applyRename',
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Blueprint · Hero' }));
    expect(onOpenAffectedOwner).toHaveBeenCalledWith('slot-1');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('opens a reference from an in-editor location result', () => {
    const onOpen = vi.fn();
    render(
      <CodeLanguageLocationsOverlay
        anchor={anchor}
        statusText="2 references"
        locations={[
          { id: '0', label: 'code/main.ts:3:5' },
          { id: '1', label: 'code/view.tsx:8:2' },
        ]}
        onOpen={onOpen}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'code/view.tsx:8:2' }));
    expect(onOpen).toHaveBeenCalledWith('1');
  });
});
