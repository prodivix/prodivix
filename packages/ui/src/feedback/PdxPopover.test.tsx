import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PdxPopover from './PdxPopover';

function PopoverHarness() {
  return (
    <PdxPopover
      content={<button type="button">Duplicate</button>}
      panelLabel="Node actions"
      title="Node actions"
    >
      <button type="button">More</button>
    </PdxPopover>
  );
}

describe('PdxPopover', () => {
  it('opens from the keyboard and moves focus into the panel', async () => {
    const user = userEvent.setup();
    render(<PopoverHarness />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();

    await user.keyboard('{Enter}');
    const panel = await screen.findByRole('dialog', { name: 'Node actions' });

    await waitFor(() =>
      expect(panel.contains(document.activeElement)).toBe(true)
    );
  });

  it('returns focus to its trigger when Escape closes it', async () => {
    const user = userEvent.setup();
    render(<PopoverHarness />);

    const trigger = screen.getByRole('button', { name: 'More' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Node actions' });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Node actions' })).toBeNull()
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('marks its trigger as expanded only while the panel is open', async () => {
    const user = userEvent.setup();
    render(<PopoverHarness />);

    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Node actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    );
  });

  it('names the panel from its own label when it has no title', async () => {
    const user = userEvent.setup();
    render(
      <PdxPopover content="Nothing selected" panelLabel="Selection details">
        <button type="button">Details</button>
      </PdxPopover>
    );

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(
      await screen.findByRole('dialog', { name: 'Selection details' })
    ).toBeVisible();
  });
});
