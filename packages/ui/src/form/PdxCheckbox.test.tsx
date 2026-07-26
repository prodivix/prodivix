import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxCheckbox from './PdxCheckbox';

describe('PdxCheckbox', () => {
  it('toggles uncontrolled state from the label and reports the next value', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxCheckbox label="Include drafts" onCheckedChange={onCheckedChange} />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Include drafts' });
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByText('Include drafts'));
    expect(checkbox).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup();

    render(<PdxCheckbox label="Snap to grid" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Snap to grid' });
    await user.tab();
    expect(checkbox).toHaveFocus();

    await user.keyboard(' ');
    expect(checkbox).toBeChecked();

    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
  });

  it('stays owned by the caller when controlled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    const { rerender } = render(
      <PdxCheckbox
        checked={false}
        label="Auto commit"
        onCheckedChange={onCheckedChange}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Auto commit' });
    await user.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(checkbox).not.toBeChecked();

    rerender(
      <PdxCheckbox
        checked
        label="Auto commit"
        onCheckedChange={onCheckedChange}
      />
    );
    expect(checkbox).toBeChecked();
  });

  it('writes indeterminate to the DOM property and keeps it across activation', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <PdxCheckbox checked={false} indeterminate label="All targets" />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'All targets' });
    expect(checkbox).toBePartiallyChecked();

    // A controlled owner that ignores the change keeps the mixed state; the
    // browser's activation behaviour must not silently resolve it.
    await user.click(checkbox);
    expect(checkbox).toBePartiallyChecked();

    rerender(<PdxCheckbox checked indeterminate={false} label="All targets" />);
    expect(checkbox).not.toBePartiallyChecked();
    expect(checkbox).toBeChecked();
  });

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxCheckbox disabled label="Locked" onCheckedChange={onCheckedChange} />
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Locked' });
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('exposes description and message text as the accessible description', () => {
    render(
      <PdxCheckbox
        description="Applied to every export target."
        label="Minify output"
        message="Increases build time."
        state="Error"
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Minify output/ });
    expect(checkbox).toHaveAccessibleDescription(
      'Applied to every export target. Increases build time.'
    );
    expect(checkbox).toBeInvalid();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Increases build time.'
    );
  });

  it('renders a bare control that an external label can own', () => {
    render(
      <label>
        Verbose logs
        <PdxCheckbox defaultChecked />
      </label>
    );

    expect(
      screen.getByRole('checkbox', { name: 'Verbose logs' })
    ).toBeChecked();
  });
});
