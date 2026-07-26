import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PdxTimePicker from './PdxTimePicker';
import { formatTimeLabel } from './PdxTimePicker.clock';

function TimeHarness({
  initialValue = '09:30',
  max,
  min,
  onChange,
  step,
}: {
  initialValue?: string;
  max?: string;
  min?: string;
  onChange?: (value: string) => void;
  step?: number;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <PdxTimePicker
      label="Start time"
      max={max}
      min={min}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      step={step}
      value={value}
    />
  );
}

describe('PdxTimePicker', () => {
  it('steps the value with the arrow keys while the list is closed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeHarness onChange={onChange} />);

    screen.getByRole('combobox', { name: 'Start time' }).focus();

    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('10:00');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('09:00');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the list from the keyboard and selects an option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeHarness onChange={onChange} />);

    const field = screen.getByRole('combobox', { name: 'Start time' });
    field.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(field).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('10:00');
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );
  });

  it('narrows the list to what has been typed', async () => {
    const user = userEvent.setup();
    render(<TimeHarness step={30} />);

    const field = screen.getByRole('combobox', { name: 'Start time' });
    await user.clear(field);
    await user.type(field, '14');

    expect(await screen.findByRole('listbox')).toBeVisible();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(
      screen.getByRole('option', { name: formatTimeLabel('14:30') })
    ).toBeVisible();
  });

  it('jumps to the ends of the list with Home and End', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TimeHarness max="12:00" min="08:00" onChange={onChange} step={60} />
    );

    screen.getByRole('combobox', { name: 'Start time' }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await screen.findByRole('listbox');

    await user.keyboard('{End}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('12:00');
  });

  it('reverts an unparseable edit on Escape and clamps a typed time to the bounds', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimeHarness max="17:00" min="08:00" onChange={onChange} />);

    const field = screen.getByRole('combobox', { name: 'Start time' });
    await user.clear(field);
    await user.type(field, 'later{Escape}');
    expect(field).toHaveValue('09:30');

    await user.clear(field);
    await user.type(field, '19:45{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('17:00');
  });

  it('reports the selected time on the list toggle', () => {
    render(<TimeHarness />);

    expect(
      screen.getByRole('button', { name: /Choose time/ })
    ).toHaveAccessibleName(`Choose time, ${formatTimeLabel('09:30')} selected`);
  });
});
