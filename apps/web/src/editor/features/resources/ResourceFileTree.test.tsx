import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicResourceNode } from './publicTree';
import { ResourceFileTree } from './ResourceFileTree';

const tree = (): PublicResourceNode => ({
  id: 'public-root',
  name: 'public',
  type: 'folder',
  path: '/public',
  parentId: null,
  children: [
    {
      id: 'dir_public_new',
      name: 'new-folder',
      type: 'folder',
      path: '/public/new-folder',
      parentId: 'public-root',
      children: [],
    },
  ],
});

/**
 * The owner declares its handlers inline, so every parent render hands the tree
 * new callback identities while the rename request itself stays set.
 */
const renderTree = () => {
  const view = render(
    <ResourceFileTree
      tree={tree()}
      mode="editable"
      selectedId="dir_public_new"
      requestRenameNodeId="dir_public_new"
      onSelect={vi.fn()}
      onRename={vi.fn()}
    />
  );
  return {
    replayOwnerRender: () =>
      view.rerender(
        <ResourceFileTree
          tree={tree()}
          mode="editable"
          selectedId="dir_public_new"
          requestRenameNodeId="dir_public_new"
          onSelect={vi.fn()}
          onRename={vi.fn()}
        />
      ),
  };
};

const renameField = () =>
  screen.getByDisplayValue(/new-folder|images/) as HTMLInputElement;

describe('ResourceFileTree rename requests', () => {
  it('keeps the typed name when the owner re-renders', () => {
    const { replayOwnerRender } = renderTree();

    fireEvent.change(renameField(), { target: { value: 'images' } });
    replayOwnerRender();

    expect(renameField().value).toBe('images');
  });

  it('does not reopen a cancelled rename on the next owner render', () => {
    const { replayOwnerRender } = renderTree();

    fireEvent.keyDown(renameField(), { key: 'Escape' });
    expect(screen.queryByDisplayValue('new-folder')).toBeNull();

    replayOwnerRender();

    expect(screen.queryByDisplayValue('new-folder')).toBeNull();
  });
});
