import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PdxOverlayCloseReason } from './OverlayDialog';
import PdxModal from './PdxModal';

function ModalHarness({
  closeOnEscape,
  closeOnOverlayClick,
  onClose,
}: {
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  onClose?: (reason: PdxOverlayCloseReason) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open modal
      </button>
      <PdxModal
        closeOnEscape={closeOnEscape}
        closeOnOverlayClick={closeOnOverlayClick}
        description="Nothing is saved until you confirm."
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Confirm</button>
          </>
        }
        onClose={(reason) => {
          setOpen(false);
          onClose?.(reason);
        }}
        onOpenChange={setOpen}
        open={open}
        title="Review changes"
      >
        Two files changed.
      </PdxModal>
    </>
  );
}

const openModal = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Open modal' }));
  return screen.findByRole('dialog', { name: 'Review changes' });
};

describe('PdxModal', () => {
  it('names and describes itself to assistive technology', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const dialog = await openModal(user);

    expect(dialog).toHaveAccessibleName('Review changes');
    expect(dialog).toHaveAccessibleDescription(
      'Nothing is saved until you confirm.'
    );
  });

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const dialog = await openModal(user);

    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('keeps Tab and Shift+Tab inside the dialog while it is open', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await openModal(user);
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });

    confirm.focus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('returns focus to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await openModal(user);
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open modal' })).toHaveFocus()
    );
  });

  it('reports Escape and the close button as different close reasons', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ModalHarness onClose={onClose} />);

    await openModal(user);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenLastCalledWith('Escape');

    await openModal(user);
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenLastCalledWith('CloseButton');
  });

  it('stays open and keeps focus when Escape is refused', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ModalHarness closeOnEscape={false} onClose={onClose} />);

    const dialog = await openModal(user);
    await user.keyboard('{Escape}');

    expect(dialog).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(dialog).toHaveFocus());
  });
});
