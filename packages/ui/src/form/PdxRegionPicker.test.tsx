import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PdxRegionPicker, {
  type PdxRegionOption,
  type PdxRegionValue,
} from './PdxRegionPicker';

const regionOptions: PdxRegionOption[] = [
  {
    children: [
      {
        children: [
          { label: 'Xihu', value: 'xihu' },
          { label: 'Yuhang', value: 'yuhang' },
        ],
        label: 'Hangzhou',
        value: 'hangzhou',
      },
      {
        children: [{ label: 'Haishu', value: 'haishu' }],
        label: 'Ningbo',
        value: 'ningbo',
      },
    ],
    label: 'Zhejiang',
    value: 'zhejiang',
  },
  {
    children: [{ children: [], label: 'Nanjing', value: 'nanjing' }],
    label: 'Jiangsu',
    value: 'jiangsu',
  },
];

function RegionHarness({
  onChange,
}: {
  onChange?: (value: PdxRegionValue, labels: PdxRegionValue) => void;
}) {
  const [value, setValue] = useState<PdxRegionValue>({});

  return (
    <PdxRegionPicker
      label="Region"
      onChange={(next, labels) => {
        setValue(next);
        onChange?.(next, labels);
      }}
      options={regionOptions}
      value={value}
    />
  );
}

describe('PdxRegionPicker', () => {
  it('unlocks each level only once the level above it is chosen', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RegionHarness onChange={onChange} />);

    const province = screen.getByRole('combobox', { name: 'Region province' });
    const city = screen.getByRole('combobox', { name: 'Region city' });
    const district = screen.getByRole('combobox', { name: 'Region district' });

    expect(city).toBeDisabled();
    expect(district).toBeDisabled();

    await user.click(province);
    await user.click(screen.getByRole('option', { name: 'Zhejiang' }));

    await waitFor(() => expect(city).toBeEnabled());
    expect(district).toBeDisabled();
    expect(onChange).toHaveBeenLastCalledWith(
      { city: undefined, district: undefined, province: 'zhejiang' },
      { city: undefined, district: undefined, province: 'Zhejiang' }
    );
  });

  it('reports the whole chain of values and labels', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RegionHarness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Region province' }));
    await user.click(screen.getByRole('option', { name: 'Zhejiang' }));

    await user.click(screen.getByRole('combobox', { name: 'Region city' }));
    await user.click(screen.getByRole('option', { name: 'Hangzhou' }));

    await user.click(screen.getByRole('combobox', { name: 'Region district' }));
    await user.click(screen.getByRole('option', { name: 'Xihu' }));

    expect(onChange).toHaveBeenLastCalledWith(
      { city: 'hangzhou', district: 'xihu', province: 'zhejiang' },
      { city: 'Hangzhou', district: 'Xihu', province: 'Zhejiang' }
    );
  });

  it('clears the levels below when a higher level changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RegionHarness onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Region province' }));
    await user.click(screen.getByRole('option', { name: 'Zhejiang' }));
    await user.click(screen.getByRole('combobox', { name: 'Region city' }));
    await user.click(screen.getByRole('option', { name: 'Hangzhou' }));

    await user.click(screen.getByRole('combobox', { name: 'Region province' }));
    await user.click(screen.getByRole('option', { name: 'Jiangsu' }));

    expect(onChange).toHaveBeenLastCalledWith(
      { city: undefined, district: undefined, province: 'jiangsu' },
      { city: undefined, district: undefined, province: 'Jiangsu' }
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Region district' })
      ).toBeDisabled()
    );
  });

  it('selects a province by typing into the closed field', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RegionHarness onChange={onChange} />);

    screen.getByRole('combobox', { name: 'Region province' }).focus();
    await user.keyboard('jiangs');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(
      { city: undefined, district: undefined, province: 'jiangsu' },
      { city: undefined, district: undefined, province: 'Jiangsu' }
    );
  });
});
