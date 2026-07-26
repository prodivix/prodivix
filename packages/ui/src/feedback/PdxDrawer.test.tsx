import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PdxOverlayCloseReason } from './OverlayDialog';
import PdxDrawer from './PdxDrawer';
import type { PdxDrawerPlacement } from './PdxDrawer';

function DrawerHarness({
  onClose,
  placement,
}: {
  onClose?: (reason: PdxOverlayCloseReason) => void;
  placement?: PdxDrawerPlacement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open drawer
      </button>
      <PdxDrawer
        footer={<button type="button">Apply</button>}
        onClose={(reason) => {
          setOpen(false);
          onClose?.(reason);
        }}
        onOpenChange={setOpen}
        open={open}
        placement={placement}
        title="Layer settings"
      >
        <button type="button">Reset</button>
      </PdxDrawer>
    </>
  );
}

const openDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Open drawer' }));
  return screen.findByRole('dialog', { name: 'Layer settings' });
};

describe('PdxDrawer', () => {
  it('moves focus into the drawer when it opens', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const drawer = await openDrawer(user);

    await waitFor(() => expect(drawer).toHaveFocus());
  });

  it('keeps Tab inside the drawer while it is open', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await openDrawer(user);
    screen.getByRole('button', { name: 'Apply' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Close drawer' })).toHaveFocus();
  });

  it('returns focus to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    await openDrawer(user);
    await user.click(screen.getByRole('button', { name: 'Close drawer' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open drawer' })).toHaveFocus()
    );
  });

  it('distinguishes Escape from the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DrawerHarness onClose={onClose} />);

    await openDrawer(user);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenLastCalledWith('Escape');

    await openDrawer(user);
    await user.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenLastCalledWith('CloseButton');
  });

  it('keeps the same dialog semantics on every edge', async () => {
    const user = userEvent.setup();
    const placements: PdxDrawerPlacement[] = ['Left', 'Right', 'Top', 'Bottom'];

    for (const placement of placements) {
      const view = render(<DrawerHarness placement={placement} />);
      const drawer = await openDrawer(user);

      expect(drawer).toHaveAccessibleName('Layer settings');
      await waitFor(() => expect(drawer).toHaveFocus());

      view.unmount();
    }
  });
});
