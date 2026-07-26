import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PdxDatePicker from './PdxDatePicker';
import { formatCalendarDayLabel } from './PdxDatePicker.calendar';

function DatePickerHarness({
  initialValue = '2026-01-22',
  max,
  min,
  onChange,
}: {
  initialValue?: string;
  max?: string;
  min?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <PdxDatePicker
      label="Start date"
      max={max}
      min={min}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      value={value}
    />
  );
}

const dayButton = (isoDate: string) =>
  screen.getByRole('button', { name: formatCalendarDayLabel(isoDate) });

describe('PdxDatePicker', () => {
  it('commits a typed date on Enter and reverts an unfinished edit on Escape', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePickerHarness onChange={onChange} />);

    const field = screen.getByRole('textbox', { name: 'Start date' });
    await user.clear(field);
    await user.type(field, '2026-03-09{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-09');

    await user.type(field, 'nonsense{Escape}');
    expect(field).toHaveValue('2026-03-09');
  });

  it('steps the value from the keyboard without opening the panel', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePickerHarness onChange={onChange} />);

    const field = screen.getByRole('textbox', { name: 'Start date' });
    field.focus();

    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('2026-01-23');

    await user.keyboard('{PageDown}');
    expect(onChange).toHaveBeenLastCalledWith('2025-12-23');

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('opens the calendar with the keyboard and selects a day with the arrow keys', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DatePickerHarness onChange={onChange} />);

    screen.getByRole('textbox', { name: 'Start date' }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(await screen.findByRole('grid')).toBeVisible();
    await waitFor(() => expect(dayButton('2026-01-22')).toHaveFocus());

    await user.keyboard('{ArrowRight}');
    expect(dayButton('2026-01-23')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-01-23');
    await waitFor(() =>
      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    );
  });

  it('moves by week, week edge and month inside the grid', async () => {
    const user = userEvent.setup();
    render(<DatePickerHarness />);

    await user.click(screen.getByRole('button', { name: /Choose date/ }));
    await waitFor(() => expect(dayButton('2026-01-22')).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    expect(dayButton('2026-01-29')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(dayButton('2026-01-26')).toHaveFocus();

    await user.keyboard('{End}');
    expect(dayButton('2026-02-01')).toHaveFocus();

    await user.keyboard('{PageUp}');
    expect(dayButton('2026-01-01')).toHaveFocus();
  });

  it('announces the selected day and keeps out-of-range days unselectable', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DatePickerHarness
        max="2026-01-24"
        min="2026-01-20"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /Choose date/ }));
    expect(await screen.findByRole('grid')).toBeVisible();

    const selected = screen.getAllByRole('gridcell', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('22');

    await user.click(dayButton('2026-01-27'));
    expect(onChange).not.toHaveBeenCalled();

    expect(
      screen.getByRole('button', { name: 'Previous month' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Choose date/ })).toHaveFocus()
    );
  });

  it('clamps keyboard stepping to the allowed range', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DatePickerHarness
        initialValue="2026-01-24"
        max="2026-01-24"
        min="2026-01-20"
        onChange={onChange}
      />
    );

    screen.getByRole('textbox', { name: 'Start date' }).focus();
    await user.keyboard('{ArrowUp}');

    expect(onChange).toHaveBeenLastCalledWith('2026-01-24');
  });
});
