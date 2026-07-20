import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeFileTree } from './CodeFileTree';
import type { CodeResourceNode } from './codeAuthoringModel';

const tree: CodeResourceNode = {
  id: 'code-root',
  name: 'code',
  type: 'folder',
  path: 'code',
  parentId: null,
  updatedAt: '2026-07-20T00:00:00.000Z',
  children: [
    {
      id: 'code-main',
      name: 'main.ts',
      type: 'file',
      path: 'code/main.ts',
      parentId: 'code-root',
      mime: 'text/typescript',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
  ],
};

describe('CodeFileTree context actions', () => {
  it('starts artifact relocation from the file context menu', () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onApplyRelocation = vi.fn();
    const onRelocationPathChange = vi.fn();
    const view = render(
      <CodeFileTree
        tree={tree}
        selectedId="code-main"
        onSelect={onSelect}
        onMove={onMove}
        canMove
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: /main\.ts/ }), {
      clientX: 120,
      clientY: 80,
    });

    expect(onSelect).toHaveBeenCalledWith('code-main');
    expect(
      screen.getByRole('button', {
        name: /resourceManager\.tree\.menu\.rename.*F2/,
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'resourceManager.tree.menu.delete',
      })
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.code.refactor.move',
      })
    );
    expect(onMove).toHaveBeenCalledWith('code-main');

    view.rerender(
      <CodeFileTree
        tree={tree}
        selectedId="code-main"
        onSelect={onSelect}
        onMove={onMove}
        canMove={false}
        relocation={{
          currentPath: 'code/main.ts',
          nextPath: 'code/main.ts',
          bindingCount: 1,
          referenceCount: 2,
          impactCount: 3,
        }}
        onRelocationPathChange={onRelocationPathChange}
        onApplyRelocation={onApplyRelocation}
        onCancelRelocation={vi.fn()}
      />
    );

    const pathInput = screen.getByRole('textbox', {
      name: 'resourceManager.code.refactor.pathLabel',
    });
    fireEvent.change(pathInput, {
      target: { value: 'code/lib/main.ts' },
    });
    expect(onRelocationPathChange).toHaveBeenCalledWith('code/lib/main.ts');

    view.rerender(
      <CodeFileTree
        tree={tree}
        selectedId="code-main"
        onMove={onMove}
        canMove={false}
        relocation={{
          currentPath: 'code/main.ts',
          nextPath: 'code/lib/main.ts',
          bindingCount: 1,
          referenceCount: 2,
          impactCount: 3,
        }}
        onRelocationPathChange={onRelocationPathChange}
        onApplyRelocation={onApplyRelocation}
        onCancelRelocation={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.code.refactor.applyMove',
      })
    );
    expect(onApplyRelocation).toHaveBeenCalledOnce();
  });
});
