import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PdxTooltip from './PdxTooltip';

describe('PdxTooltip', () => {
  it('describes its trigger once it is open', async () => {
    const user = userEvent.setup();
    render(
      <PdxTooltip content="Removes the file permanently" delayDuration={0}>
        <button type="button">Delete</button>
      </PdxTooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Delete' });
    expect(trigger).not.toHaveAccessibleDescription();

    await user.tab();
    expect(trigger).toHaveFocus();

    await waitFor(() =>
      expect(trigger).toHaveAccessibleDescription(
        'Removes the file permanently'
      )
    );
  });

  it('never takes focus away from its trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <PdxTooltip content="Saves the current draft" delayDuration={0}>
          <button type="button">Save</button>
        </PdxTooltip>
        <button type="button">After</button>
      </>
    );

    const trigger = screen.getByRole('button', { name: 'Save' });
    await user.tab();
    await screen.findByRole('tooltip');

    expect(trigger).toHaveFocus();

    // The tooltip adds nothing to the tab sequence: the next Tab reaches the
    // control that follows the trigger, not anything inside the tooltip.
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('dismisses on Escape and leaves focus where it was', async () => {
    const user = userEvent.setup();
    render(
      <PdxTooltip content="Publishes to production" delayDuration={0}>
        <button type="button">Publish</button>
      </PdxTooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Publish' });
    await user.tab();
    await screen.findByRole('tooltip');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAccessibleDescription();
  });

  it('stays closed and adds no description while disabled', async () => {
    const user = userEvent.setup();
    render(
      <PdxTooltip content="Unavailable here" delayDuration={0} disabled>
        <button type="button">Export</button>
      </PdxTooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Export' });
    await user.tab();
    await user.hover(trigger);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAccessibleDescription();
  });
});
