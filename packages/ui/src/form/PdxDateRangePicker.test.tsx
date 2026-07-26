import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatCalendarDayLabel } from './PdxDatePicker.calendar';
import PdxDateRangePicker from './PdxDateRangePicker';

function RangeHarness({
  initialEnd = '',
  initialStart = '',
  onChange,
}: {
  initialEnd?: string;
  initialStart?: string;
  onChange?: (range: { start: string; end: string }) => void;
}) {
  const [range, setRange] = useState({ end: initialEnd, start: initialStart });

  return (
    <PdxDateRangePicker
      endValue={range.end}
      label="Campaign"
      onChange={(next) => {
        setRange(next);
        onChange?.(next);
      }}
      startValue={range.start}
    />
  );
}

const dayButton = (isoDate: string) =>
  screen.getByRole('button', { name: formatCalendarDayLabel(isoDate) });

describe('PdxDateRangePicker', () => {
  it('builds a range from two keyboard selections in the panel', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeHarness initialStart="2026-01-22" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Choose date range/ }));
    await waitFor(() => expect(dayButton('2026-01-22')).toHaveFocus());

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ end: '', start: '2026-01-22' });

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({
      end: '2026-01-29',
      start: '2026-01-22',
    });
    await waitFor(() =>
      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    );
  });

  it('orders a range picked backwards', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeHarness initialStart="2026-01-22" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Choose date range/ }));
    await waitFor(() => expect(dayButton('2026-01-22')).toHaveFocus());

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith({
      end: '2026-01-22',
      start: '2026-01-15',
    });
  });

  it('marks every day of the range as selected', async () => {
    const user = userEvent.setup();
    render(<RangeHarness initialEnd="2026-01-24" initialStart="2026-01-22" />);

    await user.click(screen.getByRole('button', { name: /Choose date range/ }));
    expect(await screen.findByRole('grid')).toBeVisible();

    expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(3);
  });

  it('accepts typed dates in either field and keeps the range ordered', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeHarness initialStart="2026-01-22" onChange={onChange} />);

    const endField = screen.getByRole('textbox', { name: 'Campaign end date' });
    await user.type(endField, '2026-01-10{Enter}');

    expect(onChange).toHaveBeenLastCalledWith({
      end: '2026-01-22',
      start: '2026-01-10',
    });
  });

  it('reports the current range on the panel toggle', async () => {
    render(<RangeHarness initialEnd="2026-01-24" initialStart="2026-01-22" />);

    const toggle = screen.getByRole('button', { name: /Choose date range/ });
    expect(toggle).toHaveAccessibleName(
      `Choose date range, ${formatCalendarDayLabel('2026-01-22')} to ${formatCalendarDayLabel('2026-01-24')}`
    );
  });
});
