import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintTreeNode } from './BlueprintTreeNode';
import type { TreeNodeProps } from './componentTreeTypes';

describe('Blueprint tree keyboard action ownership', () => {
  it.each(['{Enter}', ' '])(
    'executes a child action without selecting its node for %s',
    async (key) => {
      const user = userEvent.setup();
      const location = {
        documentId: 'page',
        nodeId: 'child',
        instancePath: 'page/child',
        role: 'source' as const,
      };
      const props: TreeNodeProps = {
        item: {
          location,
          node: { id: 'child', kind: 'element', type: 'div', props: {} },
          children: [],
        },
        depth: 0,
        expandedKeys: [],
        outletRoutePaths: {},
        hiddenLocations: [],
        onToggle: vi.fn(),
        onSelect: vi.fn(),
        onDelete: vi.fn(),
        onCopy: vi.fn(),
        onMove: vi.fn(),
        onToggleHidden: vi.fn(),
        onOpenRoutePath: vi.fn(),
        onOpenContextMenu: vi.fn(),
      };
      render(
        <DndContext>
          <BlueprintTreeNode {...props} />
        </DndContext>
      );
      screen.getByRole('button', { name: 'Delete' }).focus();
      await user.keyboard(key);
      expect(props.onDelete).toHaveBeenCalledExactlyOnceWith(location);
      expect(props.onSelect).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole('button', { name: 'div (child)' }), {
        key: 'Enter',
      });
      expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(location);
    }
  );
});
