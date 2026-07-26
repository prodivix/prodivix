import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdxSwitch from './PdxSwitch';

describe('PdxSwitch', () => {
  it('exposes the switch role and reports its checked state', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSwitch label="Live preview" onCheckedChange={onCheckedChange} />
    );

    const control = screen.getByRole('switch', { name: 'Live preview' });
    expect(control).not.toBeChecked();

    await user.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    await user.click(control);
    expect(control).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles with Space and with Enter', async () => {
    const user = userEvent.setup();

    render(<PdxSwitch label="Auto commit" />);

    const control = screen.getByRole('switch', { name: 'Auto commit' });
    await user.tab();
    expect(control).toHaveFocus();

    await user.keyboard(' ');
    expect(control).toBeChecked();

    await user.keyboard('{Enter}');
    expect(control).not.toBeChecked();
  });

  it('stays owned by the caller when controlled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    const { rerender } = render(
      <PdxSwitch
        checked={false}
        label="Snap to grid"
        onCheckedChange={onCheckedChange}
      />
    );

    const control = screen.getByRole('switch', { name: 'Snap to grid' });
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(control).not.toBeChecked();

    rerender(
      <PdxSwitch
        checked
        label="Snap to grid"
        onCheckedChange={onCheckedChange}
      />
    );
    expect(control).toBeChecked();
  });

  it('does not toggle while disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <PdxSwitch disabled label="Locked" onCheckedChange={onCheckedChange} />
    );

    const control = screen.getByRole('switch', { name: 'Locked' });
    expect(control).toBeDisabled();

    await user.click(control);
    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('describes itself with the description text', () => {
    render(
      <PdxSwitch
        defaultChecked
        description="Every accepted transaction is committed immediately."
        label="Auto commit"
      />
    );

    const control = screen.getByRole('switch', { name: 'Auto commit' });
    expect(control).toBeChecked();
    expect(control).toHaveAccessibleDescription(
      'Every accepted transaction is committed immediately.'
    );
  });

  it('lets a caller cancel the toggle from onClick', async () => {
    const user = userEvent.setup();

    render(
      <PdxSwitch
        label="Guarded"
        onClick={(event) => {
          event.preventDefault();
        }}
      />
    );

    const control = screen.getByRole('switch', { name: 'Guarded' });
    await user.click(control);
    expect(control).not.toBeChecked();
  });
});
