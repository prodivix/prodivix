import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BlueprintEditorAddressBar } from './BlueprintEditorAddressBar';

describe('Blueprint route menu keyboard action ownership', () => {
  it.each(['{Enter}', ' '])(
    'keeps the route menu open when a child rename action receives %s',
    async (key) => {
      const user = userEvent.setup();
      const onCurrentPathChange = vi.fn();
      const onRenameRoute = vi.fn();
      render(
        <MemoryRouter>
          <BlueprintEditorAddressBar
            currentPath="/"
            newPath=""
            routes={[{ id: 'home', path: '/home', label: 'Home' }]}
            onCurrentPathChange={onCurrentPathChange}
            onNewPathChange={vi.fn()}
            onAddRoute={vi.fn()}
            onAddRouteAtPath={vi.fn()}
            onAddChildRoute={vi.fn()}
            onCreateIndexRoute={vi.fn()}
            onRenameRoute={onRenameRoute}
            onMoveRoute={vi.fn()}
            onDeleteRoute={vi.fn()}
          />
        </MemoryRouter>
      );
      await user.click(screen.getByRole('button', { name: 'Routes' }));
      screen.getByRole('button', { name: 'Rename route' }).focus();
      await user.keyboard(key);
      expect(onRenameRoute).toHaveBeenCalledExactlyOnceWith('home', 'Home');
      expect(onCurrentPathChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Rename route' })).toBeTruthy();
      screen.getByRole('button', { name: '/home' }).focus();
      await user.keyboard('{Enter}');
      expect(onCurrentPathChange).toHaveBeenCalledExactlyOnceWith('/home');
      expect(screen.queryByRole('button', { name: 'Rename route' })).toBeNull();
    }
  );
});
